import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { command } from "../server/domain";
import { BusinessError } from "../server/integrity";
import { JsonStore } from "../server/store";
import { sid } from "../shared/seed";
import {
  deviation,
  isInitialProductLot,
  meta,
  schemas,
  type Row,
} from "../shared/schema";
import {
  entityValidation,
  remainingFieldErrors,
  validEntityField,
} from "../src/live-validation";

const base = resolve("tests/.tmp");
const delivery = "2026-10-28T12:00:00.000Z";
const later = "2026-11-05T12:00:00.000Z";
async function fixture(t: test.TestContext) {
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, "product-lots-"));
  assert.ok(resolve(dir).startsWith(base + sep));
  t.after(async () => {
    assert.ok(resolve(dir).startsWith(base + sep));
    await rm(dir, { recursive: true, force: true });
  });
  return JsonStore.open(join(dir, "database.json"));
}
const execute = (store: JsonStore, name: string, payload: Row) =>
  store.transaction((db) => command(db, name, payload));
const requestedLine = (): Row => ({
  id_producto: sid(70),
  cantidad_solicitada: 100,
  precio_unitario: "2.50",
});
const product = (lines: Row[] = [requestedLine()]): Row => ({
  tipo_orden: "producto",
  id_proveedor: sid(1),
  fecha_solicitada_entrega: delivery,
  lines,
});
const linesFor = (store: JsonStore, id: string) =>
  store.snapshot().orden_producto.filter((line) => line.id_orden_compra === id);
const lotFor = (store: JsonStore, id: string) =>
  store.snapshot().lote_producto.find((lot) => lot.id_orden_producto === id)!;
async function unchanged(
  store: JsonStore,
  before: ReturnType<JsonStore["snapshot"]>,
) {
  assert.deepEqual(store.snapshot(), before);
  assert.deepEqual(JSON.parse(await readFile(store.file, "utf8")), before);
}
const authorize = (store: JsonStore, id: string) =>
  execute(store, "authorizeOrder", { id, confirm: true });

test("cada uno de los 1–7 renglones se guarda con un único lote inicial sin datos inventados", async (t) => {
  const store = await fixture(t);
  assert.equal(
    Object.hasOwn(
      meta.tables.orden_producto.fields,
      "fecha_estimada_batch_record",
    ),
    false,
  );
  assert.equal(meta.tables.lote_producto.fields.numero_lote.required, false);
  for (const n of [1, 7]) {
    const created = await execute(
      store,
      "createOrder",
      product(Array.from({ length: n }, requestedLine)),
    );
    const lines = linesFor(store, created.orderId);
    assert.equal(lines.length, n);
    for (const line of lines) {
      assert.equal(Object.hasOwn(line, "fecha_estimada_batch_record"), false);
      assert.equal(
        schemas.orden_producto.safeParse({
          ...line,
          fecha_estimada_batch_record: delivery,
        }).success,
        false,
      );
      const lots = store
        .snapshot()
        .lote_producto.filter((lot) => lot.id_orden_producto === line.id);
      assert.equal(lots.length, 1);
      const lot = lots[0];
      assert.ok(isInitialProductLot(lot));
      assert.equal(lot.fecha_estimada_batch_record, delivery);
      for (const [key, value] of Object.entries(lot))
        if (
          ![
            "id",
            "id_orden_producto",
            "fecha_estimada_batch_record",
            "estado",
            "estado_batch_record",
            "estado_inspeccion",
          ].includes(key)
        )
          assert.equal(value, null, key);
      assert.equal(line.estado, "en_seguimiento");
      assert.equal(deviation(store.snapshot(), line), -100);
    }
  }
});

test("editar la entrega sin autorizar propaga la estimación, y agregar un renglón crea solo su lote", async (t) => {
  const store = await fixture(t);
  const created = await execute(
    store,
    "createOrder",
    product([requestedLine(), requestedLine()]),
  );
  const lines = linesFor(store, created.orderId);
  const originalIds = lines.map((line) => lotFor(store, line.id).id);
  await execute(store, "editOrder", {
    ...product([...lines, { ...requestedLine(), id_producto: sid(71) }]),
    id: created.orderId,
    fecha_solicitada_entrega: later,
  });
  const updatedLines = linesFor(store, created.orderId);
  assert.equal(updatedLines.length, 3);
  for (const line of updatedLines) {
    const lots = store
      .snapshot()
      .lote_producto.filter((lot) => lot.id_orden_producto === line.id);
    assert.equal(lots.length, 1);
    assert.equal(lots[0].fecha_estimada_batch_record, later);
  }
  assert.deepEqual(
    updatedLines.slice(0, 2).map((line) => lotFor(store, line.id).id),
    originalIds,
  );
  await execute(store, "editOrder", {
    ...product(updatedLines),
    id: created.orderId,
    fecha_solicitada_entrega: later,
  });
  assert.equal(
    store
      .snapshot()
      .lote_producto.filter((lot) =>
        updatedLines.some((line) => line.id === lot.id_orden_producto),
      ).length,
    3,
  );
});

test("quitar un producto sin autorizar elimina su lote y vínculos, conservando íntegramente los materiales", async (t) => {
  const store = await fixture(t);
  const created = await execute(
    store,
    "createOrder",
    product([requestedLine(), requestedLine()]),
  );
  const lines = linesFor(store, created.orderId);
  const material = await execute(store, "createOrder", {
    tipo_orden: "material",
    id_proveedor: sid(3),
    fecha_solicitada_entrega: delivery,
    lines: [
      {
        id_material: sid(50),
        cantidad_solicitada: 200,
        precio_unitario: "1.00",
      },
    ],
  });
  const materialLine = store
    .snapshot()
    .orden_material.find((line) => line.id_orden_compra === material.orderId)!;
  await store.transaction((db) => {
    db.abastecimiento_material.push(
      ...lines.map((line) => ({
        id_orden_producto: line.id,
        id_orden_material: materialLine.id,
      })),
    );
  });
  const before = store.snapshot();
  assert.ok(
    before.abastecimiento_material.some(
      (link) => link.id_orden_producto === lines[1].id,
    ),
  );
  await execute(store, "editOrder", {
    ...product([lines[0]]),
    id: created.orderId,
  });
  const after = store.snapshot();
  assert.equal(
    after.orden_producto.some((line) => line.id === lines[1].id),
    false,
  );
  assert.equal(
    after.lote_producto.some((lot) => lot.id_orden_producto === lines[1].id),
    false,
  );
  assert.equal(
    after.abastecimiento_material.some(
      (link) => link.id_orden_producto === lines[1].id,
    ),
    false,
  );
  assert.deepEqual(after.orden_material, before.orden_material);
  assert.deepEqual(
    after.orden_compra.filter((order) => order.tipo_orden === "material"),
    before.orden_compra.filter((order) => order.tipo_orden === "material"),
  );
  assert.equal(
    lotFor(store, lines[0].id).id,
    before.lote_producto.find((lot) => lot.id_orden_producto === lines[0].id)!
      .id,
  );
});

test("una orden autorizada rechaza agregar, quitar, sustituir o repetir renglones incluso con la misma cantidad", async (t) => {
  const store = await fixture(t);
  const created = await execute(
    store,
    "createOrder",
    product([requestedLine(), requestedLine()]),
  );
  await authorize(store, created.orderId);
  const lines = linesFor(store, created.orderId);
  const before = store.snapshot();
  for (const proposed of [
    [...lines, requestedLine()],
    [lines[0]],
    [{ ...lines[0], id_producto: sid(71) }, lines[1]],
    [lines[0], requestedLine()],
    [lines[0], lines[0]],
  ]) {
    await assert.rejects(
      execute(store, "editOrder", {
        ...product(proposed),
        id: created.orderId,
        fecha_solicitada_entrega: later,
      }),
      (error: unknown) =>
        error instanceof BusinessError && error.code === "AUTHORIZATION",
    );
    await unchanged(store, before);
  }
  await execute(store, "editOrder", {
    ...product(
      lines.map((line) => ({
        ...line,
        cantidad_solicitada: 200,
        precio_unitario: "3.00",
      })),
    ),
    id: created.orderId,
    fecha_solicitada_entrega: later,
  });
  for (const line of linesFor(store, created.orderId)) {
    assert.equal(line.cantidad_solicitada, 200);
    assert.equal(line.precio_unitario, "3.00");
    assert.equal(lotFor(store, line.id).fecha_estimada_batch_record, delivery);
  }
});

test("modificar o agregar lotes exige autorización; completar el inicial conserva su ID y permite fechas independientes", async (t) => {
  const store = await fixture(t);
  const created = await execute(store, "createOrder", product());
  const line = linesFor(store, created.orderId)[0];
  const initial = lotFor(store, line.id);
  const before = store.snapshot();
  for (const row of [
    { ...initial, fecha_estimada_batch_record: later },
    { id_orden_producto: line.id },
  ]) {
    await assert.rejects(
      execute(store, "saveLot", { row }),
      (error: unknown) =>
        error instanceof BusinessError && error.code === "AUTHORIZATION",
    );
    await unchanged(store, before);
  }
  await authorize(store, created.orderId);
  const completed = await execute(store, "saveLot", {
    row: { ...initial, fecha_estimada_batch_record: later },
  });
  assert.equal(completed.row.id, initial.id);
  assert.equal(completed.row.numero_lote, null);
  const added = await execute(store, "saveLot", {
    row: { id_orden_producto: line.id },
  });
  assert.equal(added.row.fecha_estimada_batch_record, delivery);
  assert.notEqual(added.row.id, initial.id);
  await execute(store, "editOrder", {
    ...product([line]),
    id: created.orderId,
    fecha_solicitada_entrega: "2026-11-20T12:00:00.000Z",
  });
  assert.equal(lotFor(store, line.id).fecha_estimada_batch_record, later);
  const reopened = await JsonStore.open(store.file);
  assert.deepEqual(reopened.snapshot(), store.snapshot());
  assert.equal(
    reopened
      .snapshot()
      .lote_producto.filter((lot) => lot.id_orden_producto === line.id).length,
    2,
  );
});

test("el número es obligatorio para datos de seguimiento y cierre, pero una entrega prevista puede anularse sin número", async (t) => {
  const store = await fixture(t);
  const created = await execute(store, "createOrder", product());
  await authorize(store, created.orderId);
  const line = linesFor(store, created.orderId)[0];
  const lot = lotFor(store, line.id);
  const before = store.snapshot();
  for (const tracking of [
    { cantidad_recibida: 0 },
    { id_factura: sid(150) },
    { ubicacion: "Bodega" },
    ...[
      "fecha_entrega_batch_record",
      "fecha_inspeccion",
      "fecha_recepcion",
      "fecha_confirmacion",
    ].map((field) => ({ [field]: delivery })),
    ...["recibido", "validado", "rechazado"].map((state) => ({
      estado_batch_record: state,
    })),
    ...["aprobada", "rechazada"].map((state) => ({ estado_inspeccion: state })),
    { estado: "cerrado" },
  ]) {
    await assert.rejects(
      execute(store, "saveLot", {
        row: { ...lot, ...tracking, numero_lote: "   " },
      }),
      (error: unknown) =>
        error instanceof BusinessError && Boolean(error.fields.numero_lote),
    );
    await unchanged(store, before);
  }
  await execute(store, "saveLot", { row: { ...lot, estado: "anulado" } });
  assert.equal(lotFor(store, line.id).numero_lote, null);
  assert.equal(lotFor(store, line.id).estado, "anulado");
  await execute(store, "saveLot", {
    row: { ...lot, numero_lote: " LOTE-01 ", cantidad_recibida: 30 },
  });
  assert.equal(lotFor(store, line.id).numero_lote, "LOTE-01");
  assert.equal(linesFor(store, created.orderId)[0].estado, "en_seguimiento");
});

test("asociar una factura a un lote sin número rechaza la operación completa", async (t) => {
  const store = await fixture(t);
  const created = await execute(store, "createOrder", product());
  await authorize(store, created.orderId);
  const lot = lotFor(store, linesFor(store, created.orderId)[0].id);
  const before = store.snapshot();
  await assert.rejects(
    execute(store, "createInvoice", {
      id_proveedor: sid(1),
      numero_factura: "SIN-NUMERO-01",
      receipts: [{ entity: "lote_producto", id: lot.id }],
    }),
    (error: unknown) =>
      error instanceof BusinessError && Boolean(error.fields.numero_lote),
  );
  await unchanged(store, before);
});

test("el número faltante mantiene su error mientras hay seguimiento y lo retira al corregir la causa", async (t) => {
  const store = await fixture(t);
  const created = await execute(store, "createOrder", product());
  const db = store.snapshot();
  const lot = lotFor(store, linesFor(store, created.orderId)[0].id);
  const fields = { numero_lote: "Falta el número." };
  const tracking = { ...lot, cantidad_recibida: 1 };
  assert.equal(
    validEntityField("lote_producto", "numero_lote", tracking, db, lot),
    false,
  );
  assert.deepEqual(
    remainingFieldErrors(
      fields,
      entityValidation("lote_producto", tracking, db, lot),
    ),
    fields,
  );
  for (const corrected of [
    { ...tracking, numero_lote: "LOTE-01" },
    { ...tracking, cantidad_recibida: null },
  ])
    assert.deepEqual(
      remainingFieldErrors(
        fields,
        entityValidation("lote_producto", corrected, db, lot),
      ),
      {},
    );
});
