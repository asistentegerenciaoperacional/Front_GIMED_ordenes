import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { makeSeed } from "../shared/seed";
import {
  indexLinkedMaterialLines,
  productUnitCost,
} from "../shared/product-unit-cost";
import { blankRow } from "../shared/schema";
import {
  overlaySheetChanges,
  isSheetDraft,
  type SheetChange,
} from "../shared/product-order-sheet";
import {
  buildProductSheet,
  cellPermission,
  columnsForSheet,
  matchesSheetFilter,
  parseSheetClipboard,
  formatSheetClipboard,
  proposeSheetInput,
  productSheetColumns,
  sheetRaw,
  sheetValue,
} from "../src/product-order-sheet-model";
import { command } from "../server/domain";
import { JsonStore } from "../server/store";
const column = (key: string) =>
  productSheetColumns.find((col) => col.key === key)!;
test("las celdas soportan inspección de React sin traps, efectos ni expansión de cachés", () => {
  const { row } = fixture();
  for (const key of [
    "then",
    "toJSON",
    "_debugInfo",
    Symbol.toStringTag,
    Symbol.iterator,
  ])
    assert.equal(Reflect.get(row.cells, key), undefined);
  assert.doesNotThrow(() => JSON.stringify(row));
  const first = row.cells.precio_unitario;
  assert.strictEqual(first, row.cells.precio_unitario);
  assert.deepEqual(Object.keys(row.cells), []);
  assert.doesNotThrow(() =>
    Reflect.ownKeys(row.cells).forEach((key) => Reflect.get(row.cells, key)),
  );
});
test("sin borrador se conserva la identidad de la base y de las columnas", () => {
  const db = makeSeed();
  assert.strictEqual(overlaySheetChanges(db, []), db);
  assert.strictEqual(
    columnsForSheet("no_autorizadas"),
    columnsForSheet("no_autorizadas"),
  );
});
test("copias versionadas rechazan destinos corruptos sin alterar la base", () => {
  const { row } = fixture();
  const valid = {
    version: 1,
    timestamp: new Date().toISOString(),
    changes: [
      {
        entity: "orden_producto",
        id: row.line.id,
        field: "precio_unitario",
        expected: row.line.precio_unitario,
        value: "10.00",
      },
    ],
  };
  assert.equal(isSheetDraft(valid), true);
  for (const value of [
    null,
    {},
    { ...valid, version: 2 },
    { ...valid, changes: [null] },
    { ...valid, timestamp: "invalid" },
    { ...valid, changes: [{ ...valid.changes[0], field: "id" }] },
  ])
    assert.equal(isSheetDraft(value), false);
});
test("la edición posterior conserva un original null y no borra la detección de conflicto", () => {
  const { db, row } = fixture();
  row.lot!.id_direccion = null;
  const first = proposeSheetInput(
    db,
    [],
    [{ row, column: column("ubicacion"), text: db.direccion[0].id }],
  );
  row.lot!.id_direccion = db.direccion[1].id;
  const second = proposeSheetInput(db, first.changes, [
    { row, column: column("ubicacion"), text: db.direccion[2].id },
  ]);
  assert.equal(second.changes[0].expected, null);
});
test("los precios negativos se rechazan en la hoja y en el guardado atómico", async () => {
  const { db, row } = fixture();
  const proposed = proposeSheetInput(
    db,
    [],
    [{ row, column: column("precio_unitario"), text: "-3" }],
  );
  assert.equal(proposed.changes.length, 0);
  assert.match(proposed.issues[0].message, /negativo/);
  await assert.rejects(
    command(db, "saveProductOrderSheet", {
      changes: [
        {
          entity: "orden_producto",
          id: row.line.id,
          field: "precio_unitario",
          expected: row.line.precio_unitario,
          value: "-3.00",
        },
      ],
    }),
  );
  assert.equal(
    db.orden_producto.find((line) => line.id === row.line.id)!.precio_unitario,
    row.line.precio_unitario,
  );
});
test("las fechas y filtros usan el día de Bogotá, incluido el límite UTC", () => {
  const { db, row } = fixture();
  row.order.fecha_elaboracion = "2027-01-11T02:00:00.000Z";
  assert.equal(sheetValue(db, row, column("fecha_elaboracion")), "10/01/2027");
  const current = buildProductSheet(db, "seguimiento").find(
    (item) => item.key === row.key,
  )!;
  assert.equal(current.cells.fecha_elaboracion.sortValue, "2027-01-10");
  row.lot!.estado = "en_seguimiento";
  row.lot!.fecha_estimada_batch_record = "2027-01-10T02:00:00.000Z";
  row.lot!.fecha_entrega_batch_record = null;
  assert.equal(matchesSheetFilter(row, "batch_vencido", "2027-01-10"), true);
});
function fixture() {
  const db = makeSeed();
  const row = buildProductSheet(db, "seguimiento").find(
    (row) => row.line.estado === "en_seguimiento" && row.lot?.numero_lote,
  )!;
  return { db, row };
}
test("columnas exactas, identidad por lote/renglón y clasificación independiente del padre", () => {
  const { db, row } = fixture();
  assert.equal(columnsForSheet("seguimiento").length, 25);
  assert.equal(columnsForSheet("anuladas").length, 25);
  assert.deepEqual(
    columnsForSheet("no_autorizadas").map((col) => col.key),
    [
      "no_orden",
      "codigo",
      "id_producto",
      "cantidad_solicitada",
      "precio_unitario",
      "costo_total_unitario",
      "id_proveedor",
      "fecha_elaboracion",
      "fecha_solicitada_entrega",
      "fecha_estimada_batch_record",
    ],
  );
  assert.match(row.key, /^lot:/);
  row.line.estado = "cerrada";
  assert.ok(
    buildProductSheet(db, "seguimiento").some((item) => item.key === row.key),
  );
  row.lot!.estado = "anulado";
  assert.ok(
    buildProductSheet(db, "anuladas").some((item) => item.key === row.key),
  );
  assert.ok(
    !buildProductSheet(db, "seguimiento").some((item) => item.key === row.key),
  );
  assert.ok(
    buildProductSheet(db, "no_autorizadas").every(
      (item) => item.key === `line:${item.line.id}`,
    ),
  );
});
test("el costo unitario suma renglones de material vigentes con precisión y se replica en los lotes", () => {
  const { db, row } = fixture();
  const price = "3200.01";
  row.line.precio_unitario = price;
  const [container, cap, replacement, cancelled] = db.orden_material;
  container.precio_unitario = "450.02";
  container.estado = "cerrada";
  cap.precio_unitario = "120.03";
  cancelled.precio_unitario = "999.00";
  cancelled.estado = "anulada";
  replacement.precio_unitario = "10.11";
  const link = (productId: string, materialLineId: string) => ({
    id_orden_producto: productId,
    id_orden_material: materialLineId,
  });
  const other = db.orden_producto.find((line) => line.id !== row.line.id)!;
  const unlinked = db.orden_producto.find(
    (line) => line.id !== row.line.id && line.id !== other.id,
  )!;
  db.abastecimiento_material = [
    ...[container, cap, container, cancelled, replacement].map((line) =>
      link(row.line.id, line.id),
    ),
    link(other.id, container.id),
  ];
  const linked = indexLinkedMaterialLines(db);
  const breakdown = productUnitCost(price, linked.get(row.line.id)!);
  assert.equal(breakdown.total, "3780.17");
  assert.deepEqual(
    breakdown.materials.map(({ line }) => line.id),
    [container.id, cap.id, replacement.id],
  );
  assert.equal(productUnitCost("0.01", linked.get(other.id)!).total, "450.03");
  assert.equal(
    productUnitCost(unlinked.precio_unitario, []).total,
    unlinked.precio_unitario,
  );

  const cost = column("costo_total_unitario");
  const lot = row.lot!;
  db.lote_producto.push({ ...lot, id: "second-active-cost-lot" });
  db.lote_producto.push({
    ...lot,
    id: "cancelled-cost-lot",
    estado: "anulado",
  });
  const costs = (database: typeof db, view: "seguimiento" | "anuladas") =>
    buildProductSheet(database, view)
      .filter((item) => item.line.id === row.line.id)
      .map((item) => sheetRaw(item, cost));
  assert.ok(costs(db, "seguimiento").length >= 2);
  assert.deepEqual([...new Set(costs(db, "seguimiento"))], ["3780.17"]);
  assert.deepEqual([...new Set(costs(db, "anuladas"))], ["3780.17"]);
  const current = buildProductSheet(db, "seguimiento").find(
    (item) => item.key === row.key,
  )!;
  assert.equal(sheetValue(db, current, cost), "$ 3.780,17");
  assert.equal(current.cells.costo_total_unitario.sortValue, "3780.17");
  assert.match(cellPermission(db, current, cost)!, /Celda protegida/);

  const draft = overlaySheetChanges(db, [
    {
      entity: "orden_producto",
      id: row.line.id,
      field: "precio_unitario",
      expected: price,
      value: "3300.00",
    },
  ]);
  assert.deepEqual([...new Set(costs(draft, "seguimiento"))], ["3880.16"]);
  assert.deepEqual([...new Set(costs(db, "seguimiento"))], ["3780.17"]);

  replacement.precio_unitario = "10.21";
  assert.deepEqual([...new Set(costs(db, "seguimiento"))], ["3780.27"]);
  replacement.estado = "anulada";
  assert.deepEqual([...new Set(costs(db, "seguimiento"))], ["3770.06"]);
});
test("saldos usan creación estable, incluyen abiertos/cerrados y excluyen anulados y filtros", () => {
  const { db, row } = fixture();
  row.line.cantidad_solicitada = 100;
  db.lote_producto = db.lote_producto.filter(
    (lot) => lot.id_orden_producto !== row.line.id,
  );
  const lot = { ...row.lot!, id_orden_producto: row.line.id };
  db.lote_producto.push(
    { ...lot, id: "lot-z", estado: "cerrado", cantidad_recibida: 60 },
    { ...lot, id: "lot-a", estado: "anulado", cantidad_recibida: 500 },
    { ...lot, id: "lot-c", estado: "en_seguimiento", cantidad_recibida: 50 },
    { ...lot, id: "lot-b", estado: "en_seguimiento", cantidad_recibida: null },
  );
  const values = buildProductSheet(db, "seguimiento").filter(
    (item) => item.line.id === row.line.id,
  );
  assert.deepEqual(
    values.map((item) => [item.lot!.id, item.remaining, item.excess]),
    [
      ["lot-z", 100, 0],
      ["lot-c", 40, 0],
      ["lot-b", 0, 10],
    ],
  );
  assert.equal(values[0].globalRemaining, -10);
  assert.equal(
    cellPermission(db, values[0], column("cantidad_solicitada")),
    null,
  );
  assert.match(
    cellPermission(db, values[1], column("cantidad_solicitada"))!,
    /protegida/,
  );
  assert.equal(
    values
      .slice()
      .reverse()
      .filter((item) => item.lot!.id === "lot-b")[0].remaining,
    0,
  );
});
test("propagación por propietario y superposición sin mutar la base", () => {
  const { db, row } = fixture(),
    before = structuredClone(db);
  const changes: SheetChange[] = [
    {
      entity: "orden_compra",
      id: row.order.id,
      field: "fecha_solicitada_entrega",
      expected: row.order.fecha_solicitada_entrega,
      value: "2028-01-05T12:00:00.000Z",
    },
    {
      entity: "orden_producto",
      id: row.line.id,
      field: "precio_unitario",
      expected: row.line.precio_unitario,
      value: "99.00",
    },
    {
      entity: "lote_producto",
      id: row.lot!.id,
      field: "ubicacion",
      expected: row.lot!.ubicacion,
      value: "Cali",
    },
  ];
  const next = overlaySheetChanges(db, changes),
    rows = buildProductSheet(next, "seguimiento");
  assert.ok(
    rows
      .filter((item) => item.order.id === row.order.id)
      .every(
        (item) => item.order.fecha_solicitada_entrega === changes[0].value,
      ),
  );
  assert.ok(
    rows
      .filter((item) => item.line.id === row.line.id)
      .every((item) => item.line.precio_unitario === "99.00"),
  );
  assert.equal(
    rows.find((item) => item.key === row.key)!.lot!.ubicacion,
    "Cali",
  );
  assert.deepEqual(db, before);
});
test("protegidos se rechazan antes de interpretar y los valores válidos de un bloque permanecen", () => {
  const { db, row } = fixture();
  const poison = {
    trim() {
      throw new Error("NO interpretar");
    },
  } as unknown as string;
  const result = proposeSheetInput(
    db,
    [],
    [
      { row, column: column("codigo"), text: poison },
      { row, column: column("cantidad_recibida"), text: "texto" },
      { row, column: column("precio_unitario"), text: "$ 1.234,50" },
    ],
  );
  assert.equal(result.issues.length, 2);
  assert.equal(result.issues[0].protected, true);
  assert.match(result.issues[0].message, /protegida/);
  assert.deepEqual(
    result.changes.map((change) => [change.field, change.value]),
    [["precio_unitario", "1234.50"]],
  );
});
test("pegado contradictorio de un dato compartido se rechaza sin perder otras celdas", () => {
  const { db, row } = fixture();
  const sibling = {
    ...row.lot!,
    id: "sibling",
    estado: "en_seguimiento" as const,
  };
  db.lote_producto.push(sibling);
  const rows = buildProductSheet(db, "seguimiento").filter(
    (item) => item.line.id === row.line.id,
  );
  const result = proposeSheetInput(
    db,
    [],
    [
      { row: rows[0], column: column("precio_unitario"), text: "7500" },
      { row: rows.at(-1)!, column: column("precio_unitario"), text: "8000" },
      { row: rows[0], column: column("ubicacion"), text: db.direccion[0].id },
    ],
  );
  assert.equal(
    result.issues.filter((issue) => /contradictorios/.test(issue.message))
      .length,
    2,
  );
  assert.deepEqual(
    result.changes.map((change) => change.field),
    ["id_direccion"],
  );
});
test("fechas, enteros, referencias ambiguas y factura de otro proveedor no se aceptan", () => {
  const { db, row } = fixture();
  db.materiales[1].nombre_material = db.materiales[0].nombre_material;
  const result = proposeSheetInput(
    db,
    [],
    [
      { row, column: column("fecha_recepcion"), text: "31/02/2027" },
      { row, column: column("cantidad_recibida"), text: "1,5" },
      {
        row,
        column: column("ref_corrugado"),
        text: db.materiales[0].nombre_material!,
      },
      { row, column: column("id_factura"), text: "No existe" },
    ],
  );
  assert.equal(result.changes.length, 0);
  assert.equal(result.issues.length, 4);
});
test("campos relacionados se validan juntos y un lote vacío conserva su estimada automática", () => {
  const { db, row } = fixture();
  const initial = {
    ...blankRow("lote_producto"),
    id: "new-initial",
    id_orden_producto: row.line.id,
    fecha_estimada_batch_record: row.order.fecha_solicitada_entrega,
  } as typeof row.lot;
  db.lote_producto.push(initial!);
  const current = buildProductSheet(db, "seguimiento").find(
    (item) => item.lot!.id === "new-initial",
  )!;
  assert.equal(
    proposeSheetInput(
      db,
      [],
      [{ row: current, column: column("cantidad_recibida"), text: "10" }],
    ).changes.length,
    0,
  );
  const together = proposeSheetInput(
    db,
    [],
    [
      { row: current, column: column("cantidad_recibida"), text: "10" },
      { row: current, column: column("numero_lote"), text: "NUEVO-10" },
    ],
  );
  assert.equal(together.issues.length, 0);
  assert.equal(together.changes.length, 2);
  const pending = buildProductSheet(db, "no_autorizadas")[0];
  const future = "2099-12-30T12:00:00.000Z";
  const authorized = overlaySheetChanges(db, [
    {
      entity: "orden_compra",
      id: row.order.id,
      field: "fecha_solicitada_entrega",
      expected: row.order.fecha_solicitada_entrega,
      value: future,
    },
  ]);
  assert.equal(
    authorized.lote_producto.find((lot) => lot.id === initial!.id)!
      .fecha_estimada_batch_record,
    initial!.fecha_estimada_batch_record,
  );
  const unauthorized = overlaySheetChanges(db, [
    {
      entity: "orden_compra",
      id: pending.order.id,
      field: "fecha_solicitada_entrega",
      expected: pending.order.fecha_solicitada_entrega,
      value: future,
    },
  ]);
  assert.equal(
    unauthorized.lote_producto.find((lot) => lot.id === pending.initialLot!.id)!
      .fecha_estimada_batch_record,
    future,
  );
  assert.ok(sheetValue(db, pending, column("fecha_estimada_batch_record")));
  assert.match(
    cellPermission(db, pending, column("fecha_estimada_batch_record"))!,
    /protegida/,
  );
});
test("matrices de Excel conservan destinos, tabulaciones y saltos de línea entre comillas", () => {
  assert.deepEqual(parseSheetClipboard('a\t"b\tc"\r\n"d\ne"\t"f""g"\r\n'), [
    ["a", "b\tc"],
    ["d\ne", 'f"g'],
  ]);
  assert.deepEqual(parseSheetClipboard("\t\n"), [["", ""]]);
  const matrix = [
    ["Bogotá\tCali", '"Bodega"'],
    ["Piso 1\nEstante 2", ""],
  ];
  assert.deepEqual(parseSheetClipboard(formatSheetClipboard(matrix)), matrix);
  assert.deepEqual(parseSheetClipboard(formatSheetClipboard([["A"], [""]])), [
    ["A"],
    [""],
  ]);
});
test("las 17 variantes de filtros usan condiciones por lote y vínculos por renglón", () => {
  const { db, row } = fixture(),
    lot = row.lot!,
    today = "2027-01-10";
  lot.estado = "en_seguimiento";
  lot.cantidad_recibida = 10;
  lot.fecha_recepcion = null;
  lot.id_factura = null;
  lot.fecha_estimada_batch_record = "2027-01-09T12:00:00.000Z";
  lot.fecha_entrega_batch_record = null;
  lot.fecha_inspeccion = null;
  lot.fecha_confirmacion = null;
  row.order.fecha_solicitada_entrega = "2027-01-09T12:00:00.000Z";
  row.globalRemaining = 10;
  row.documentId = "doc";
  row.supply = [
    {
      order: row.order,
      material: "Envase",
      quantity: 10,
      state: "en_seguimiento",
      orderCancelled: false,
    },
  ];
  row.line.estado = "en_seguimiento";
  for (const filter of [
    "documento_con",
    "recepciones_sin_factura",
    "entrega_vencida",
    "batch_vencido",
    "recibido_sin_batch",
    "recibidos_sin_inspeccion",
    "confirmacion_pendiente",
    "vinculos_con",
    "ocm_pendientes",
  ] as const)
    assert.equal(matchesSheetFilter(row, filter, today), true, filter);
  row.documentId = undefined;
  assert.equal(matchesSheetFilter(row, "documento_sin", today), true);
  row.supply = [];
  assert.equal(matchesSheetFilter(row, "vinculos_sin", today), true);
  for (const days of [7, 15, 30] as const) {
    row.order.fecha_solicitada_entrega = `2027-01-${days === 7 ? "17" : days === 15 ? "25" : "10"}T12:00:00.000Z`;
    assert.equal(matchesSheetFilter(row, `proximas_${days}`, today), true);
  }
  lot.cantidad_recibida = null;
  assert.equal(matchesSheetFilter(row, "sin_recepciones", today), true);
  lot.fecha_entrega_batch_record = "2027-01-10T12:00:00.000Z";
  assert.equal(matchesSheetFilter(row, "inspeccion_pendiente", today), true);
  lot.estado = "cerrado";
  lot.estado = "anulado";
  assert.equal(matchesSheetFilter(row, "entrega_vencida", today), false);
});
async function storeFixture(t: test.TestContext) {
  const root = resolve("tests/.tmp");
  await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, "sheet-"));
  t.after(async () => {
    assert.ok(resolve(dir).startsWith(root + sep));
    await rm(dir, { recursive: true, force: true });
  });
  return JsonStore.open(join(dir, "database.json"));
}
test("guardado mixto es atómico, verifica originales y preserva la base ante fallos", async (t) => {
  const store = await storeFixture(t),
    db = store.snapshot(),
    row = buildProductSheet(db, "seguimiento").find(
      (item) => item.lot!.numero_lote,
    )!;
  const price: SheetChange = {
    entity: "orden_producto",
    id: row.line.id,
    field: "precio_unitario",
    expected: row.line.precio_unitario,
    value: "112.25",
  };
  const location: SheetChange = {
    entity: "lote_producto",
    id: row.lot!.id,
    field: "ubicacion",
    expected: row.lot!.ubicacion,
    value: "Cali",
  };
  const before = await readFile(store.file, "utf8");
  await assert.rejects(
    store.transaction((db) =>
      command(db, "saveProductOrderSheet", {
        changes: [price, { ...location, expected: "Otro valor" }],
      }),
    ),
    /cambiaron/,
  );
  assert.equal(await readFile(store.file, "utf8"), before);
  await assert.rejects(
    store.transaction((db) =>
      command(db, "saveProductOrderSheet", {
        changes: [
          price,
          {
            ...location,
            field: "cantidad_recibida",
            expected: row.lot!.cantidad_recibida,
            value: "abc",
          },
        ],
      }),
    ),
  );
  assert.equal(await readFile(store.file, "utf8"), before);
  await store.transaction((db) =>
    command(db, "saveProductOrderSheet", { changes: [price, location] }),
  );
  assert.equal(
    store.snapshot().orden_producto.find((line) => line.id === row.line.id)!
      .precio_unitario,
    "112.25",
  );
  assert.equal(
    store.snapshot().lote_producto.find((lot) => lot.id === row.lot!.id)!
      .ubicacion,
    "Cali",
  );
});
test("API rechaza campos protegidos y creación múltiple no escribe lotes parcialmente", async (t) => {
  const store = await storeFixture(t),
    db = store.snapshot(),
    row = buildProductSheet(db, "seguimiento")[0],
    before = await readFile(store.file, "utf8");
  await assert.rejects(
    store.transaction((db) =>
      command(db, "saveProductOrderSheet", {
        changes: [
          {
            entity: "orden_compra",
            id: row.order.id,
            field: "no_orden",
            expected: row.order.no_orden,
            value: "1",
          },
        ],
      }),
    ),
    /protegida/,
  );
  const row2 = buildProductSheet(db, "seguimiento").find(
    (item) => item.line.id !== row.line.id,
  )!;
  await assert.rejects(
    store.transaction((db) =>
      command(db, "createProductLots", {
        rows: [
          {
            ...blankRow("lote_producto"),
            id_orden_producto: row.line.id,
            numero_lote: "BULK-OK",
          },
          {
            ...blankRow("lote_producto"),
            id_orden_producto: row2.line.id,
            cantidad_recibida: "abc",
          },
        ],
      }),
    ),
  );
  assert.equal(await readFile(store.file, "utf8"), before);
});
