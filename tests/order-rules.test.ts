import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { command } from "../server/domain";
import { BusinessError } from "../server/integrity";
import { JsonStore } from "../server/store";
import { sid } from "../shared/seed";
import { type Row } from "../shared/schema";

const base = resolve("tests/.tmp");
const delivery = "2026-10-28T12:00:00.000Z";
async function fixture(t: test.TestContext) {
  // These rule scenarios predate creation-date validation and use fixed delivery dates.
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-27T12:00:00.000Z") });
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, "order-rules-"));
  assert.ok(resolve(dir).startsWith(base + sep));
  t.after(async () => {
    assert.ok(resolve(dir).startsWith(base + sep));
    await rm(dir, { recursive: true, force: true });
  });
  return JsonStore.open(join(dir, "database.json"));
}
const execute = (store: JsonStore, name: string, payload: Row) =>
  store.transaction((db) => command(db, name, payload));
const product = (overrides: Row = {}): Row => ({
  tipo_orden: "producto",
  id_proveedor: sid(1),
  fecha_solicitada_entrega: delivery,
  lines: [
    { id_producto: sid(70), cantidad_solicitada: 100, precio_unitario: "2.50" },
  ],
  ...overrides,
});
const orderCases: {
  entity: "orden_producto" | "orden_material" | "orden_otro";
  payload: Row;
}[] = [
  { entity: "orden_producto", payload: product() },
  {
    entity: "orden_material",
    payload: {
      tipo_orden: "material",
      id_proveedor: sid(3),
      fecha_solicitada_entrega: delivery,
      lines: [
        {
          id_material: sid(50),
          cantidad_solicitada: 100,
          precio_unitario: "1.00",
        },
      ],
    },
  },
  {
    entity: "orden_otro",
    payload: {
      tipo_orden: "otro",
      id_proveedor: sid(5),
      fecha_solicitada_entrega: delivery,
      lines: [
        {
          producto: "Servicio de prueba",
          cantidad_solicitada: 1,
          precio_unitario: "5.00",
        },
      ],
    },
  },
];
async function unchanged(
  store: JsonStore,
  before: ReturnType<JsonStore["snapshot"]>,
) {
  assert.deepEqual(store.snapshot(), before);
  assert.deepEqual(JSON.parse(await readFile(store.file, "utf8")), before);
}
const fieldError = (field: string) => (error: unknown) =>
  error instanceof BusinessError &&
  error.code === "VALIDATION" &&
  Boolean(error.fields[field]);
const authorizationError = (error: unknown) =>
  error instanceof BusinessError && error.code === "AUTHORIZATION";

test("emisión: productos inactivos o sin estado activo rechazan la operación completa, incluso tras una fila válida", async (t) => {
  const store = await fixture(t);
  for (const active of [false, null]) {
    await store.transaction((db) => {
      db.productos.find((row) => row.id === sid(71))!.activo = active;
    });
    const before = store.snapshot();
    await assert.rejects(
      execute(
        store,
        "createOrder",
        product({
          lines: [
            ...product().lines,
            {
              id_producto: sid(71),
              cantidad_solicitada: 10,
              precio_unitario: "1.00",
            },
          ],
        }),
      ),
      fieldError("lines.1.id_producto"),
    );
    await unchanged(store, before);
  }
});

test("edición: no permite agregar ni sustituir por un producto inactivo; conserva el producto histórico que se desactivó", async (t) => {
  const store = await fixture(t);
  const created = await execute(store, "createOrder", product());
  await store.transaction((db) => {
    for (const id of [sid(70), sid(71)])
      db.productos.find((row) => row.id === id)!.activo = false;
  });
  const db = store.snapshot();
  const header = db.orden_compra.find((row) => row.id === created.orderId)!;
  const original = db.orden_producto.find(
    (row) => row.id_orden_compra === created.orderId,
  )!;
  await assert.rejects(
    execute(store, "editOrder", {
      ...header,
      lines: [original, { ...original, id: undefined }],
    }),
    fieldError("lines.1.id_producto"),
  );
  await unchanged(store, db);
  await assert.rejects(
    execute(store, "editOrder", {
      ...header,
      lines: [{ ...original, id_producto: sid(71) }],
    }),
    fieldError("lines.0.id_producto"),
  );
  await unchanged(store, db);
  await execute(store, "editOrder", { ...header, lines: [original] });
  assert.deepEqual(
    store.snapshot().orden_producto.find((row) => row.id === original.id),
    original,
  );
  assert.equal(
    store.snapshot().abastecimiento_material.length,
    db.abastecimiento_material.length,
  );
});

test("producto, material y otros exigen fecha solicitada válida antes de reservar números o guardar órdenes", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  for (const { payload } of orderCases) {
    for (const date of [
      undefined,
      null,
      "",
      "  ",
      "2026-02-31T12:00:00.000Z",
      "2026-10-28",
      "texto",
    ]) {
      await assert.rejects(
        execute(store, "createOrder", {
          ...payload,
          fecha_solicitada_entrega: date,
        }),
        fieldError("fecha_solicitada_entrega"),
      );
      await unchanged(store, before);
    }
  }
});

test("editar una orden no permite vaciar la entrega ni modifica las fechas de seguimiento tras un rechazo", async (t) => {
  const store = await fixture(t);
  for (const { entity, payload } of orderCases) {
    const created = await execute(store, "createOrder", payload);
    const before = store.snapshot();
    const header = before.orden_compra.find(
      (row) => row.id === created.orderId,
    )!;
    const line: Row = before[entity].find(
      (row) => row.id_orden_compra === created.orderId,
    )!;
    const dateKey = "fecha_estimada_entrega";
    if (entity === "orden_producto") {
      assert.equal(Object.hasOwn(line, "fecha_estimada_batch_record"), false);
      assert.equal(
        before.lote_producto.find((lot) => lot.id_orden_producto === line.id)!
          .fecha_estimada_batch_record,
        delivery,
      );
    } else assert.equal(line[dateKey], delivery);
    for (const date of [null, ""]) {
      await assert.rejects(
        execute(store, "editOrder", {
          ...header,
          fecha_solicitada_entrega: date,
          lines: [
            entity === "orden_producto"
              ? line
              : { ...line, [dateKey]: "2026-11-01T12:00:00.000Z" },
          ],
        }),
        fieldError("fecha_solicitada_entrega"),
      );
      await unchanged(store, before);
    }
  }
});

test("cerrar, anular y reabrir seguimiento requiere autorización en los tres tipos de orden, incluso con confirmación", async (t) => {
  const store = await fixture(t);
  for (const { entity, payload } of orderCases) {
    const created = await execute(store, "createOrder", payload);
    const before = store.snapshot();
    const line = before[entity].find(
      (row) => row.id_orden_compra === created.orderId,
    )!;
    for (const state of ["cerrada", "anulada", "en_seguimiento"]) {
      await assert.rejects(
        execute(store, "setLineState", {
          entity,
          id: line.id,
          estado: state,
          confirm: true,
        }),
        authorizationError,
      );
      await unchanged(store, before);
    }
    await execute(store, "authorizeOrder", {
      id: created.orderId,
      confirm: true,
    });
    for (const state of ["cerrada", "en_seguimiento", "anulada"]) {
      await execute(store, "setLineState", {
        entity,
        id: line.id,
        estado: state,
        confirm: true,
      });
      assert.equal(
        store.snapshot()[entity].find((row) => row.id === line.id)!.estado,
        state,
      );
    }
  }
});

test("un lote de una orden sin autorizar no puede cerrarse ni anularse mediante guardado directo", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  for (const state of ["cerrada", "anulada"]) {
    await assert.rejects(
      execute(store, "saveLot", {
        row: {
          id_orden_producto: sid(112),
          numero_lote: "SIN-AUTORIZAR",
          estado: state,
        },
      }),
      authorizationError,
    );
    await unchanged(store, before);
  }
});
