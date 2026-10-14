import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { command } from "../server/domain";
import { BusinessError, validateDatabase } from "../server/integrity";
import { JsonStore } from "../server/store";
import { makeSeed, sid } from "../shared/seed";
import {
  blankRow,
  deviation,
  isInitialProductLot,
  nextOrderNumber,
  orderLines,
  type Row,
} from "../shared/schema";

const base = resolve("tests/.tmp");
const delivery = "2026-10-28T12:00:00.000Z";
const newDelivery = "2026-11-06T12:00:00.000Z";
const elaboration = "2026-10-07T12:00:00.000Z";
async function fixture(t: test.TestContext) {
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, "order-lifecycle-"));
  assert.ok(resolve(dir).startsWith(base + sep));
  t.after(async () => {
    assert.ok(resolve(dir).startsWith(base + sep));
    await rm(dir, { recursive: true, force: true });
  });
  return JsonStore.open(join(dir, "database.json"));
}
const execute = (store: JsonStore, name: string, payload: Row) =>
  store.transaction((db) => command(db, name, payload));
const fails = (code: string) => (error: unknown) =>
  error instanceof BusinessError && error.code === code;
const product = (overrides: Row = {}): Row => ({
  tipo_orden: "producto",
  id_proveedor: sid(1),
  fecha_elaboracion: "2026-09-12T12:00:00.000Z",
  fecha_solicitada_entrega: delivery,
  lines: [
    { id_producto: sid(70), cantidad_solicitada: 100, precio_unitario: "2.50" },
  ],
  ...overrides,
});
const replacement = (id: string, overrides: Row = {}): Row =>
  product({
    id,
    id_proveedor: sid(2),
    confirm: true,
    fecha_elaboracion: elaboration,
    fecha_solicitada_entrega: newDelivery,
    lines: [
      {
        id_producto: sid(72),
        cantidad_solicitada: 234,
        precio_unitario: "8.50",
      },
      {
        id_producto: sid(73),
        cantidad_solicitada: 12,
        precio_unitario: "9.00",
      },
    ],
    ...overrides,
  });
const authorize = (store: JsonStore, id: string) =>
  execute(store, "authorizeOrder", { id, confirm: true });

for (const entity of ["orden_material", "orden_otro"] as const) {
  test(`reabrir ${entity} cerrado o anulado conserva recepción, factura, documentos y vínculos`, async (t) => {
    const store = await fixture(t);
    const db = store.snapshot();
    const line = db[entity][0];
    assert.ok(line);
    if (db.orden_compra.find((order) => order.id === line.id_orden_compra)!.estado_autorizacion !== "autorizada")
      await authorize(store, line.id_orden_compra);
    for (const previous of ["cerrada", "anulada"]) {
      await execute(store, "setLineState", {
        entity,
        id: line.id,
        estado: previous,
        confirm: true,
      });
      const expected = store.snapshot();
      expected[entity].find((row) => row.id === line.id)!.estado =
        "en_seguimiento";
      await execute(store, "setLineState", {
        entity,
        id: line.id,
        estado: "en_seguimiento",
      });
      assert.deepEqual(store.snapshot(), expected);
      assert.deepEqual((await JsonStore.open(store.file)).snapshot(), expected);
      // Repeating the request cannot create duplicate receptions or documents.
      await execute(store, "setLineState", {
        entity,
        id: line.id,
        estado: "en_seguimiento",
      });
      assert.deepEqual(store.snapshot(), expected);
    }
  });

  test(`reabrir ${entity} requiere autorización y un rechazo conserva todos los datos`, async (t) => {
    const store = await fixture(t);
    const type = entity === "orden_material" ? "material" : "otro";
    const db = store.snapshot();
    const provider = db.orden_compra.find(
      (order) => order.tipo_orden === type,
    )!.id_proveedor;
    const created = await execute(store, "createOrder", {
      tipo_orden: type,
      id_proveedor: provider,
      fecha_solicitada_entrega: delivery,
      lines: [
        {
          ...(type === "material"
            ? { id_material: db.materiales[0].id }
            : { producto: "Concepto de prueba" }),
          cantidad_solicitada: 10,
          precio_unitario: "2.50",
        },
      ],
    });
    const line = store
      .snapshot()
      [entity].find((row) => row.id_orden_compra === created.orderId)!;
    await rejectedUnchanged(
      store,
      "setLineState",
      {
        entity,
        id: line.id,
        estado: "en_seguimiento",
        confirm: true,
      },
      "AUTHORIZATION",
    );
  });
}
const lotFor = (store: JsonStore, lineId: string) =>
  store
    .snapshot()
    .lote_producto.find((lot) => lot.id_orden_producto === lineId)!;
async function rejectedUnchanged(
  store: JsonStore,
  name: string,
  payload: Row,
  code: string,
) {
  const before = store.snapshot();
  const file = await readFile(store.file, "utf8");
  await assert.rejects(execute(store, name, payload), fails(code));
  assert.deepEqual(store.snapshot(), before);
  assert.equal(await readFile(store.file, "utf8"), file);
}
async function richOrder(store: JsonStore) {
  const created = await execute(
    store,
    "createOrder",
    product({
      lines: [
        {
          id_producto: sid(70),
          cantidad_solicitada: 150,
          precio_unitario: "123.45",
          cantidad_corrugado: 999,
          cantidad_sticker: 888,
        },
        {
          id_producto: sid(71),
          cantidad_solicitada: 200,
          precio_unitario: "987.65",
          cantidad_cinta: 777,
        },
      ],
    }),
  );
  const other = await execute(store, "createOrder", product());
  const lines = orderLines(store.snapshot(), created.orderId);
  const materialOrders: { id: string }[] = [];
  for (const [provider, materialIds] of [
    [sid(3), [sid(50), sid(51)]],
    [sid(4), [sid(56)]],
  ] as [string, string[]][]) {
    const order = await execute(store, "createOrder", {
      tipo_orden: "material",
      id_proveedor: provider,
      fecha_elaboracion: product().fecha_elaboracion,
      fecha_solicitada_entrega: delivery,
      lines: materialIds.map((id_material) => ({
        id_material,
        cantidad_solicitada: 200,
        precio_unitario: "5.00",
      })),
    });
    materialOrders.push({ id: order.orderId });
  }
  const shared = orderLines(store.snapshot(), materialOrders[0].id)[0];
  await store.transaction((db) => {
    const existingLot = db.lote_producto.find(
      (lot) => lot.id_orden_producto === lines[0].id,
    )!;
    Object.assign(existingLot, {
      numero_lote: "OLD-CLOSED",
      id_factura: sid(150),
      cantidad_recibida: 150,
      fecha_recepcion: elaboration,
      fecha_entrega_batch_record: elaboration,
      estado_batch_record: "validado",
      fecha_inspeccion: elaboration,
      estado_inspeccion: "aprobada",
      fecha_confirmacion: elaboration,
      ubicacion: "Información anterior",
      estado: "cerrado",
    });
    db.lote_producto.push({
      ...existingLot,
      id: sid(4001),
      numero_lote: "OLD-EXTRA",
      estado: "anulado",
    });
    db.abastecimiento_material.push(
      ...orderLines(db, materialOrders[0].id).map((material) => ({
        id_orden_producto: lines[0].id,
        id_orden_material: material.id,
      })),
      {
        id_orden_producto: lines[1].id,
        id_orden_material: orderLines(db, materialOrders[1].id)[0].id,
      },
      {
        id_orden_producto: orderLines(db, other.orderId)[0].id,
        id_orden_material: shared.id,
      },
      { id_orden_producto: lines[1].id, id_orden_material: sid(140) },
    );
  });
  for (const order of materialOrders) {
    await authorize(store, order.id);
    for (const line of orderLines(store.snapshot(), order.id))
      await execute(store, "saveReceipt", {
        entity: "orden_material",
        id: line.id,
        row: {
          cantidad_recibida: 45,
          fecha_entrega: elaboration,
          ubicacion: "Bodega conservada",
          ...(store.snapshot().orden_compra.find((o) => o.id === order.id)!
            .id_proveedor === sid(3)
            ? { id_factura: sid(151), id_lote_material: sid(130) }
            : {}),
        },
      });
    await execute(store, "saveDocument", {
      tipo_entidad: "orden_compra",
      id_entidad: order.id,
      tipo_documento: "orden_compra_escaneada",
      nombre_archivo: "OCM-conservada.html",
    });
  }
  await execute(store, "saveDocument", {
    tipo_entidad: "orden_compra",
    id_entidad: created.orderId,
    tipo_documento: "orden_compra_escaneada",
    nombre_archivo: "OC-anterior.html",
  });
  return created;
}

test("número automático e inmutable en creación y edición, antes y después de autorizar, para los tres tipos", async (t) => {
  const store = await fixture(t);
  for (const type of ["producto", "material", "otro"]) {
    const payload =
      type === "producto"
        ? product()
        : {
            tipo_orden: type,
            id_proveedor: sid(type === "material" ? 3 : 5),
            fecha_solicitada_entrega: delivery,
            lines: [
              type === "material"
                ? {
                    id_material: sid(50),
                    cantidad_solicitada: 10,
                    precio_unitario: "2.00",
                  }
                : {
                    producto: "Servicio",
                    cantidad_solicitada: 1,
                    precio_unitario: "3.00",
                  },
            ],
          };
    await rejectedUnchanged(
      store,
      "createOrder",
      { ...payload, no_orden: "9000" },
      "VALIDATION",
    );
    const number = nextOrderNumber(store.snapshot(), type);
    const { orderId } = await execute(store, "createOrder", {
      ...payload,
      expected_no_orden: number,
    });
    assert.equal(
      store.snapshot().orden_compra.find((o) => o.id === orderId)!.no_orden,
      number,
    );
    const edit = {
      ...payload,
      id: orderId,
      lines: orderLines(store.snapshot(), orderId),
    };
    for (const auth of [false, true]) {
      if (auth) await authorize(store, orderId);
      await rejectedUnchanged(
        store,
        "editOrder",
        { ...edit, no_orden: "9000" },
        "VALIDATION",
      );
      await execute(store, "editOrder", { ...edit, no_orden: number });
      assert.equal(
        store.snapshot().orden_compra.find((o) => o.id === orderId)!.no_orden,
        number,
      );
    }
  }
});

test("proveedor bloqueado después de autorizar en producto, material y otros, incluso con confirmación", async (t) => {
  const store = await fixture(t);
  await execute(store, "saveEntity", {
    entity: "proveedor",
    row: {
      ...store.snapshot().proveedor.find((p) => p.id === sid(5))!,
      id: undefined,
      nombre_corto: "Otro",
      nombre_largo: "Otro proveedor",
      nit: "990000000",
    },
  });
  const otherProvider = store.snapshot().proveedor.at(-1)!.id;
  for (const type of ["producto", "material", "otro"]) {
    const payload =
      type === "producto"
        ? product()
        : {
            tipo_orden: type,
            id_proveedor: sid(type === "material" ? 3 : 5),
            fecha_solicitada_entrega: delivery,
            lines: [
              type === "material"
                ? {
                    id_material: sid(50),
                    cantidad_solicitada: 10,
                    precio_unitario: "2.00",
                  }
                : {
                    producto: "Servicio",
                    cantidad_solicitada: 1,
                    precio_unitario: "3.00",
                  },
            ],
          };
    const { orderId } = await execute(store, "createOrder", payload);
    await authorize(store, orderId);
    await rejectedUnchanged(
      store,
      "editOrder",
      {
        ...payload,
        id: orderId,
        confirm: true,
        id_proveedor:
          type === "producto"
            ? sid(2)
            : type === "material"
              ? sid(4)
              : otherProvider,
        lines: orderLines(store.snapshot(), orderId),
      },
      "AUTHORIZATION",
    );
  }
});

test("reemplazo completo: elimina todos los registros anteriores de la OC y conserva OCM, recepciones, documentos y enlaces compartidos íntegramente", async (t) => {
  const store = await fixture(t);
  const { orderId } = await richOrder(store);
  const before = store.snapshot();
  const oldHeader = before.orden_compra.find((o) => o.id === orderId)!;
  const oldLines = orderLines(before, orderId);
  const oldIds = new Set(oldLines.map((line) => line.id));
  const oldLots = before.lote_producto.filter((lot) =>
    oldIds.has(lot.id_orden_producto),
  );
  const ownDocs = before.documento.filter(
    (doc) => doc.tipo_entidad === "orden_compra" && doc.id_entidad === orderId,
  );
  assert.equal(oldLines.length, 2);
  assert.equal(oldLots.length, 3);
  assert.equal(ownDocs.length, 1);
  const previousOCMs = before.orden_compra.filter(
    (o) => o.tipo_orden === "material",
  );
  const result = await execute(store, "editOrder", replacement(orderId));
  const after = store.snapshot();
  assert.equal(result.orderId, orderId);
  assert.deepEqual(Object.keys(result), ["orderId"]);
  assert.deepEqual(after.consecutivo_orden, before.consecutivo_orden);
  assert.deepEqual(
    after.orden_compra.find((o) => o.id === orderId),
    {
      ...blankRow("orden_compra"),
      id: orderId,
      no_orden: oldHeader.no_orden,
      tipo_orden: oldHeader.tipo_orden,
      id_proveedor: sid(2),
      fecha_elaboracion: elaboration,
      fecha_solicitada_entrega: newDelivery,
      estado_autorizacion: "no_autorizada",
      fecha_autorizacion: null,
    },
  );
  assert.ok(!after.orden_producto.some((line) => oldIds.has(line.id)));
  assert.ok(
    !after.lote_producto.some(
      (lot) =>
        oldIds.has(lot.id_orden_producto) ||
        oldLots.some((old) => old.id === lot.id),
    ),
  );
  assert.ok(
    !after.abastecimiento_material.some((link) =>
      oldIds.has(link.id_orden_producto),
    ),
  );
  assert.ok(
    !after.documento.some(
      (doc) =>
        ownDocs.some((old) => old.id === doc.id) ||
        (doc.tipo_entidad === "orden_compra" && doc.id_entidad === orderId),
    ),
  );
  const newLines = orderLines(after, orderId);
  assert.deepEqual(
    newLines.map((line) => line.id_producto),
    [sid(72), sid(73)],
  );
  assert.deepEqual(
    newLines.map((line) => line.cantidad_solicitada),
    [234, 12],
  );
  assert.deepEqual(
    newLines.map((line) => line.precio_unitario),
    ["8.50", "9.00"],
  );
  for (const line of newLines) {
    assert.ok(!oldIds.has(line.id));
    assert.equal(line.estado, "en_seguimiento");
    const lots = after.lote_producto.filter(
      (lot) => lot.id_orden_producto === line.id,
    );
    assert.equal(lots.length, 1);
    assert.ok(isInitialProductLot(lots[0]));
    assert.equal(lots[0].fecha_estimada_batch_record, newDelivery);
    for (const [key, value] of Object.entries(lots[0]))
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
  }
  for (const oldOCM of previousOCMs) {
    assert.deepEqual(
      after.orden_compra.find((o) => o.id === oldOCM.id),
      oldOCM,
    );
    assert.deepEqual(
      orderLines(after, oldOCM.id),
      orderLines(before, oldOCM.id),
    );
  }
  assert.deepEqual(after.orden_material, before.orden_material);
  assert.deepEqual(
    after.orden_producto.filter((line) => line.id_orden_compra !== orderId),
    before.orden_producto.filter((line) => line.id_orden_compra !== orderId),
  );
  assert.deepEqual(
    after.lote_producto.filter(
      (lot) => !newLines.some((line) => line.id === lot.id_orden_producto),
    ),
    before.lote_producto.filter((lot) => !oldIds.has(lot.id_orden_producto)),
  );
  assert.deepEqual(
    after.documento,
    before.documento.filter((doc) => !ownDocs.some((old) => old.id === doc.id)),
  );
  assert.deepEqual(
    after.abastecimiento_material.filter(
      (link) => !newLines.some((line) => line.id === link.id_orden_producto),
    ),
    before.abastecimiento_material.filter(
      (link) => !oldIds.has(link.id_orden_producto),
    ),
  );
  assert.equal(
    after.abastecimiento_material.filter((link) =>
      newLines.some((line) => line.id === link.id_orden_producto),
    ).length,
    0,
  );
  assert.deepEqual(
    after.orden_compra.filter((order) => order.id !== orderId),
    before.orden_compra.filter((order) => order.id !== orderId),
  );
  for (const table of [
    "factura",
    "lote_material",
    "productos",
    "materiales",
    "correo_enviado",
    "correo_enviado_destinatario",
    "proveedor",
  ] as const)
    assert.deepEqual(after[table], before[table], table);
  assert.deepEqual((await JsonStore.open(store.file)).snapshot(), after);
});

test("reemplazo rechazado sin confirmación, con productos de A, renglones antiguos, proveedor incorrecto o fecha vacía: archivo y consecutivos intactos", async (t) => {
  const store = await fixture(t);
  const { orderId } = await richOrder(store);
  const oldLine = orderLines(store.snapshot(), orderId)[0];
  for (const [overrides, code] of [
    [{ confirm: false }, "CONFIRMATION"],
    [{ lines: [oldLine] }, "VALIDATION"],
    [
      { lines: [{ ...replacement(orderId).lines[0], id: oldLine.id }] },
      "VALIDATION",
    ],
    [{ lines: product().lines }, "VALIDATION"],
    [{ id_proveedor: sid(3) }, "VALIDATION"],
    [{ fecha_solicitada_entrega: null }, "VALIDATION"],
    [{ lines: [] }, "R02"],
  ] as [Row, string][])
    await rejectedUnchanged(
      store,
      "editOrder",
      replacement(orderId, overrides),
      code,
    );
});

test("fallo tras crear el primer renglón de reemplazo revierte borrados, lotes, archivo y consecutivos", async (t) => {
  const store = await fixture(t);
  const { orderId } = await richOrder(store);
  const bad = replacement(orderId, {
    lines: replacement(orderId).lines.map((line: Row, i: number) =>
      i === 1 ? { ...line, cantidad_corrugado: 0.5 } : line,
    ),
  });
  const working = store.snapshot();
  const oldIds = orderLines(working, orderId).map((line) => line.id);
  const counters = structuredClone(working.consecutivo_orden);
  await assert.rejects(command(working, "editOrder", bad), fails("TYPE"));
  const partial = orderLines(working, orderId);
  assert.equal(
    partial.length,
    1,
    "el fallo ocurre después de crear el primer renglón",
  );
  assert.ok(!oldIds.includes(partial[0].id));
  assert.equal(
    working.lote_producto.filter(
      (lot) => lot.id_orden_producto === partial[0].id,
    ).length,
    1,
  );
  assert.deepEqual(working.consecutivo_orden, counters);
  await rejectedUnchanged(store, "editOrder", bad, "TYPE");
});

test("autorizar durante la revisión impide reemplazar al guardar, aun con confirmación, sin eliminar información", async (t) => {
  const store = await fixture(t);
  const { orderId } = await richOrder(store);
  const draft = replacement(orderId);
  await authorize(store, orderId);
  await rejectedUnchanged(store, "editOrder", draft, "AUTHORIZATION");
});

test("deleteLot exige autorización y confirmación; permite eliminar lotes cerrados, recibidos, facturados, anulados y sin número conservando las facturas", async (t) => {
  const store = await fixture(t);
  const { orderId } = await execute(store, "createOrder", product());
  const line = orderLines(store.snapshot(), orderId)[0];
  const initial = lotFor(store, line.id);
  await rejectedUnchanged(
    store,
    "deleteLot",
    { id: initial.id, confirm: true },
    "AUTHORIZATION",
  );
  await authorize(store, orderId);
  await rejectedUnchanged(
    store,
    "deleteLot",
    { id: initial.id },
    "CONFIRMATION",
  );
  const invoice = await execute(store, "createInvoice", {
    id_proveedor: sid(1),
    numero_factura: "DELETE-001",
  });
  await execute(store, "saveDocument", {
    tipo_entidad: "factura",
    id_entidad: invoice.row.id,
    tipo_documento: "factura_fisica",
  });
  for (const state of ["cerrado", "anulado", "en_seguimiento"]) {
    const lot = await execute(store, "saveLot", {
      row: {
        id_orden_producto: line.id,
        numero_lote: `DELETE-${state}`,
        cantidad_recibida: 100,
        fecha_recepcion: delivery,
        estado: state,
        id_factura: invoice.row.id,
      },
    });
    const before = store.snapshot();
    await execute(store, "deleteLot", { id: lot.row.id, confirm: true });
    assert.ok(
      !store.snapshot().lote_producto.some((row) => row.id === lot.row.id),
    );
    assert.equal(
      store.snapshot().orden_producto.find((row) => row.id === line.id)!.estado,
      "en_seguimiento",
    );
    assert.deepEqual(store.snapshot().factura, before.factura);
    assert.deepEqual(store.snapshot().documento, before.documento);
  }
  const links = store.snapshot().abastecimiento_material;
  await execute(store, "deleteLot", { id: initial.id, confirm: true });
  assert.deepEqual(
    store.snapshot().orden_producto.find((row) => row.id === line.id),
    { ...line, estado: "anulada" },
  );
  assert.deepEqual(store.snapshot().abastecimiento_material, links);
  assert.equal(
    store
      .snapshot()
      .lote_producto.filter((row) => row.id_orden_producto === line.id).length,
    0,
  );
  assert.equal(deviation(store.snapshot(), line), -100);
});

test("borrar un lote conserva el estado cerrado del producto mientras queden otros; borrar el último lo anula", async (t) => {
  const store = await fixture(t);
  const line = store
    .snapshot()
    .orden_producto.find((row) => row.id === sid(115))!;
  const old = lotFor(store, line.id);
  const extra = await execute(store, "saveLot", {
    row: { id_orden_producto: line.id },
  });
  await execute(store, "deleteLot", { id: old.id, confirm: true });
  assert.equal(
    store.snapshot().orden_producto.find((row) => row.id === line.id)!.estado,
    "cerrada",
  );
  assert.equal(deviation(store.snapshot(), line), -100);
  await execute(store, "deleteLot", { id: extra.row.id, confirm: true });
  assert.equal(
    store.snapshot().orden_producto.find((row) => row.id === line.id)!.estado,
    "anulada",
  );
});

test("anular elimina todos los lotes con confirmación, conserva renglón y abastecimiento; reabrir crea un único lote nuevo con fecha actual", async (t) => {
  const store = await fixture(t);
  const line = store
    .snapshot()
    .orden_producto.find((row) => row.id === sid(110))!;
  const before = store.snapshot();
  await rejectedUnchanged(
    store,
    "setLineState",
    { entity: "orden_producto", id: line.id, estado: "anulada" },
    "CONFIRMATION",
  );
  await execute(store, "setLineState", {
    entity: "orden_producto",
    id: line.id,
    estado: "anulada",
    confirm: true,
  });
  assert.equal(
    store
      .snapshot()
      .lote_producto.filter((lot) => lot.id_orden_producto === line.id).length,
    0,
  );
  assert.deepEqual(
    store.snapshot().orden_producto.find((row) => row.id === line.id),
    { ...line, estado: "anulada" },
  );
  assert.deepEqual(
    store.snapshot().abastecimiento_material,
    before.abastecimiento_material,
  );
  assert.deepEqual(store.snapshot().factura, before.factura);
  assert.deepEqual(store.snapshot().documento, before.documento);
  await rejectedUnchanged(
    store,
    "saveLot",
    { row: { id_orden_producto: line.id } },
    "VALIDATION",
  );
  await rejectedUnchanged(
    store,
    "setLineState",
    { entity: "orden_producto", id: line.id, estado: "cerrada", confirm: true },
    "VALIDATION",
  );
  await execute(
    store,
    "editOrder",
    product({
      id: line.id_orden_compra,
      fecha_solicitada_entrega: newDelivery,
      lines: orderLines(store.snapshot(), line.id_orden_compra),
    }),
  );
  await execute(store, "setLineState", {
    entity: "orden_producto",
    id: line.id,
    estado: "en_seguimiento",
  });
  const newLot = lotFor(store, line.id);
  assert.ok(isInitialProductLot(newLot));
  assert.equal(newLot.fecha_estimada_batch_record, newDelivery);
  assert.ok(!before.lote_producto.some((lot) => lot.id === newLot.id));
  await execute(store, "setLineState", {
    entity: "orden_producto",
    id: line.id,
    estado: "en_seguimiento",
  });
  assert.deepEqual(
    store
      .snapshot()
      .lote_producto.filter((lot) => lot.id_orden_producto === line.id),
    [newLot],
  );
});

test("reabrir un producto anulado heredado exige confirmación para reemplazar sus lotes; reabrir cerrado conserva sus lotes", async (t) => {
  const store = await fixture(t);
  const line = store
    .snapshot()
    .orden_producto.find((row) => row.id === sid(113))!;
  await store.transaction((db) => {
    db.lote_producto.push({
      ...db.lote_producto[0],
      id: sid(5001),
      id_orden_producto: line.id,
      numero_lote: "LEGACY",
    });
  });
  await rejectedUnchanged(
    store,
    "setLineState",
    { entity: "orden_producto", id: line.id, estado: "en_seguimiento" },
    "CONFIRMATION",
  );
  const independent = store
    .snapshot()
    .lote_producto.filter((lot) => lot.id_orden_producto !== line.id);
  await execute(store, "setLineState", {
    entity: "orden_producto",
    id: line.id,
    estado: "en_seguimiento",
    confirm: true,
  });
  assert.ok(
    !store.snapshot().lote_producto.some((lot) => lot.id === sid(5001)),
  );
  assert.equal(
    store
      .snapshot()
      .lote_producto.filter((lot) => lot.id_orden_producto === line.id).length,
    1,
  );
  assert.ok(isInitialProductLot(lotFor(store, line.id)));
  assert.deepEqual(
    store
      .snapshot()
      .lote_producto.filter((lot) => lot.id_orden_producto !== line.id),
    independent,
  );
  const closedLots = store
    .snapshot()
    .lote_producto.filter((lot) => lot.id_orden_producto === sid(115));
  await execute(store, "setLineState", {
    entity: "orden_producto",
    id: sid(115),
    estado: "en_seguimiento",
  });
  assert.deepEqual(
    store
      .snapshot()
      .lote_producto.filter((lot) => lot.id_orden_producto === sid(115)),
    closedLots,
  );
});

test("semilla: productos anulados sin lotes; cargar datos heredados conserva todos los registros hasta una operación confirmada", async (t) => {
  const seed = validateDatabase(makeSeed());
  assert.ok(seed.orden_producto.some((line) => line.estado === "anulada"));
  for (const line of seed.orden_producto.filter(
    (row) => row.estado === "anulada",
  ))
    assert.equal(
      seed.lote_producto.filter((lot) => lot.id_orden_producto === line.id)
        .length,
      0,
    );
  const store = await fixture(t);
  await store.transaction((db) => {
    db.lote_producto.push({
      ...db.lote_producto[0],
      id: sid(5002),
      id_orden_producto: sid(113),
      numero_lote: "PRESERVED",
    });
  });
  const file = await readFile(store.file, "utf8");
  assert.deepEqual(
    (await JsonStore.open(store.file)).snapshot(),
    store.snapshot(),
  );
  assert.equal(await readFile(store.file, "utf8"), file);
});
