import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { makeSeed, sid } from "../shared/seed";
import { blankRow, orderState, totalLines, type Row } from "../shared/schema";
import type { Database } from "../shared/models";
import {
  customFilters,
  readCustomFilter,
  paginateOrders,
  addCalendarDays,
  type CustomFilterId,
} from "../src/order-filters";
import {
  buildOrderReadModel,
  filterCustomOrders,
  matchesCustomFilter,
} from "../src/order-read-model";
import { bogotaDay, millisecondsToBogotaMidnight } from "../src/use-bogota-day";

const day = "2026-10-09";
function fixture() {
  const db = makeSeed();
  for (const table of [
    "orden_compra",
    "orden_producto",
    "orden_material",
    "orden_otro",
    "lote_producto",
    "documento",
    "abastecimiento_material",
  ] as const)
    db[table] = [];
  const order = {
    ...blankRow("orden_compra"),
    id: "oc-a",
    no_orden: "2806",
    id_proveedor: sid(1),
    tipo_orden: "producto",
    estado_autorizacion: "autorizada",
    fecha_elaboracion: day,
    fecha_solicitada_entrega: "2026-10-15",
  } as Database["orden_compra"][number];
  const line = {
    ...blankRow("orden_producto"),
    id: "line-a",
    id_orden_compra: order.id,
    posicion: 1,
    id_producto: sid(70),
    id_codigo_barras: db.codigos_barras[0].id,
    cantidad_solicitada: 10,
    precio_unitario: "1.50",
    estado: "en_seguimiento",
  } as Database["orden_producto"][number];
  const lot = {
    ...blankRow("lote_producto"),
    id: "lot-a",
    id_orden_producto: line.id,
    estado: "en_seguimiento",
    estado_inspeccion: "pendiente",
    estado_batch_record: "pendiente",
    fecha_estimada_batch_record: "2026-10-08",
  } as Database["lote_producto"][number];
  db.orden_compra.push(order);
  db.orden_producto.push(line);
  db.lote_producto.push(lot);
  return { db, order, line, lot };
}
const get = (db: Database) => buildOrderReadModel(db).orders[0];
const matches = (db: Database, filter: CustomFilterId) =>
  matchesCustomFilter(get(db), filter, day);

test("catálogo: trece filtros, diecisiete variantes y descripciones iguales a filtros.md", async () => {
  assert.equal(customFilters.length, 13);
  const ids = customFilters.flatMap((filter) =>
    filter.options.map((option) => option.id),
  );
  assert.equal(ids.length, 17);
  assert.equal(new Set(ids).size, 17);
  const doc = await readFile(
    new URL("../../filtros.md", import.meta.url),
    "utf8",
  );
  const rows = doc
    .split("\n")
    .filter((row) => row.startsWith("| **"))
    .map((row) =>
      row
        .split("|")
        .slice(1, 3)
        .map((cell) => cell.trim().replaceAll("**", "")),
    );
  assert.deepEqual(
    rows,
    customFilters.map((filter) => [filter.name, filter.description]),
  );
});

test("URL: solo variantes conocidas y compatibles con el grupo", () => {
  assert.equal(readCustomFilter("batch_vencido", "productos"), "batch_vencido");
  assert.equal(readCustomFilter("batch_vencido", "materiales"), "");
  assert.equal(readCustomFilter("vinculos_sin", "materiales"), "vinculos_sin");
  for (const value of [null, "inventado", "batch_vencido,inspeccion_pendiente"])
    assert.equal(readCustomFilter(value, "productos"), "");
});

test("documento de orden: propietario y clase exactos, mapa reutilizable y legado más reciente", () => {
  const { db, order } = fixture();
  const doc = {
    ...blankRow("documento"),
    id: "d1",
    tipo_entidad: "factura",
    id_entidad: order.id,
    tipo_documento: "factura_fisica",
    fecha_carga: "2026-10-08",
  } as Database["documento"][number];
  db.documento.push(doc);
  assert.equal(matches(db, "documento_con"), false);
  doc.tipo_entidad = "orden_compra";
  doc.tipo_documento = "orden_compra_escaneada";
  db.documento.push({ ...doc, id: "d2", fecha_carga: "2026-10-09" });
  const model = buildOrderReadModel(db);
  assert.equal(model.documentByOrderId.get(order.id)?.id, "d2");
  assert.equal(
    matchesCustomFilter(model.orders[0], "documento_con", day),
    true,
  );
  assert.equal(
    matchesCustomFilter(model.orders[0], "documento_sin", day),
    false,
  );
});

test("recepción física y cantidad registrada se distinguen en los cinco casos acordados", () => {
  for (const [quantity, date, physical, recorded] of [
    [null, null, false, false],
    [0, null, false, true],
    [null, day, true, false],
    [0, day, true, true],
    [5, null, true, true],
  ] as const) {
    const { db, lot } = fixture();
    lot.cantidad_recibida = quantity;
    lot.fecha_recepcion = date;
    assert.equal(matches(db, "recepciones_sin_factura"), physical);
    assert.equal(matches(db, "recibido_sin_batch"), physical);
    assert.equal(matches(db, "confirmacion_pendiente"), physical);
    assert.equal(matches(db, "recibidos_sin_inspeccion"), physical);
    assert.equal(matches(db, "sin_recepciones"), !recorded);
  }
});

test("recepciones sin factura no confunde lote inicial ni factura de otro lote", () => {
  const { db, lot } = fixture();
  assert.equal(matches(db, "recepciones_sin_factura"), false);
  lot.cantidad_recibida = 2;
  lot.id_factura = "factura";
  db.lote_producto.push({
    ...lot,
    id: "planned",
    cantidad_recibida: null,
    id_factura: null,
  });
  assert.equal(matches(db, "recepciones_sin_factura"), false);
  lot.id_factura = null;
  assert.equal(matches(db, "recepciones_sin_factura"), true);
});

test("vencimientos: día de Bogotá, estrictamente anterior a hoy y sin fechas vacías", () => {
  const { db, lot, order, line } = fixture();
  assert.equal(matches(db, "batch_vencido"), true);
  lot.fecha_estimada_batch_record = day;
  assert.equal(matches(db, "batch_vencido"), false);
  lot.fecha_estimada_batch_record = "2026-10-09T02:00:00.000Z";
  assert.equal(matches(db, "batch_vencido"), true);
  lot.fecha_entrega_batch_record = day;
  assert.equal(matches(db, "batch_vencido"), false);
  lot.fecha_entrega_batch_record = null;
  lot.fecha_estimada_batch_record = null;
  assert.equal(matches(db, "batch_vencido"), false);
  order.fecha_solicitada_entrega = "2026-10-08";
  assert.equal(matches(db, "entrega_vencida"), true);
  line.estado = "cerrada";
  assert.equal(matches(db, "entrega_vencida"), false);
  line.estado = "en_seguimiento";
  order.fecha_solicitada_entrega = day;
  assert.equal(matches(db, "entrega_vencida"), false);
  order.fecha_solicitada_entrega = null;
  assert.equal(matches(db, "entrega_vencida"), false);
});

test("próximas entregas incluyen hoy y los extremos 7/15/30 y respetan cambio de mes", () => {
  const { db, order } = fixture();
  for (const days of [7, 15, 30] as const) {
    const id = `proximas_${days}` as CustomFilterId;
    for (const offset of [0, days]) {
      order.fecha_solicitada_entrega = addCalendarDays(day, offset);
      const model = buildOrderReadModel(db);
      assert.equal(matchesCustomFilter(model.orders[0], id, day), true);
      assert.equal(filterCustomOrders(model.orders, id, day).length, 1);
    }
    order.fecha_solicitada_entrega = addCalendarDays(day, days + 1);
    assert.equal(matches(db, id), false);
  }
  order.fecha_solicitada_entrega = "2026-10-08";
  assert.equal(matches(db, "proximas_30"), false);
  assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01");
});

test("inspecciones usan fechas, admiten solapamiento y son independientes del estado", () => {
  const { db, lot } = fixture();
  lot.cantidad_recibida = 3;
  assert.equal(matches(db, "inspeccion_pendiente"), false);
  assert.equal(matches(db, "recibidos_sin_inspeccion"), true);
  lot.fecha_entrega_batch_record = day;
  lot.estado_inspeccion = "aprobada";
  assert.equal(matches(db, "inspeccion_pendiente"), true);
  lot.fecha_inspeccion = day;
  assert.equal(matches(db, "inspeccion_pendiente"), false);
  assert.equal(matches(db, "recibidos_sin_inspeccion"), false);
});

test("condiciones de recepción y fechas documentales pertenecen al mismo lote", () => {
  const { db, lot } = fixture();
  lot.cantidad_recibida = 5;
  lot.fecha_entrega_batch_record = day;
  lot.fecha_inspeccion = day;
  lot.fecha_confirmacion = day;
  db.lote_producto.push({
    ...lot,
    id: "planned",
    cantidad_recibida: null,
    fecha_entrega_batch_record: null,
    fecha_inspeccion: null,
    fecha_confirmacion: null,
  });
  for (const id of [
    "recibido_sin_batch",
    "recibidos_sin_inspeccion",
    "confirmacion_pendiente",
    "recepciones_sin_factura",
  ] as const) {
    lot.id_factura = "factura";
    assert.equal(matches(db, id), false);
  }
});

test("anulados no generan pendientes; cerrados sí pueden conservar pendientes documentales", () => {
  const { db, lot, line } = fixture();
  lot.cantidad_recibida = 1;
  lot.estado = "cerrado";
  assert.equal(matches(db, "recibido_sin_batch"), true);
  assert.equal(matches(db, "batch_vencido"), true);
  lot.estado = "anulado";
  for (const id of [
    "recibido_sin_batch",
    "batch_vencido",
    "confirmacion_pendiente",
    "recibidos_sin_inspeccion",
  ] as const)
    assert.equal(matches(db, id), false);
  lot.estado = "en_seguimiento";
  line.estado = "anulada";
  for (const id of [
    "sin_recepciones",
    "recibido_sin_batch",
    "batch_vencido",
    "recepciones_sin_factura",
  ] as const)
    assert.equal(matches(db, id), false);
  db.orden_producto = [];
  db.lote_producto = [];
  assert.equal(matches(db, "sin_recepciones"), false);
});

test("seguimiento por cerrar requiere lotes efectivos, todos cerrados en un renglón abierto", () => {
  const { db, lot, line } = fixture();
  assert.equal(matches(db, "seguimiento_por_cerrar"), false);
  lot.estado = "cerrado";
  assert.equal(matches(db, "seguimiento_por_cerrar"), true);
  db.lote_producto.push({ ...lot, id: "ignored", estado: "anulado" });
  assert.equal(matches(db, "seguimiento_por_cerrar"), true);
  line.estado = "cerrada";
  assert.equal(matches(db, "seguimiento_por_cerrar"), false);
  line.estado = "en_seguimiento";
  db.lote_producto = [];
  assert.equal(matches(db, "seguimiento_por_cerrar"), false);
  db.lote_producto = [{ ...lot, estado: "anulado" }];
  assert.equal(matches(db, "seguimiento_por_cerrar"), false);
});

test("OCM compartida: solo aparece la OC cuyo renglón vinculado está pendiente", () => {
  const { db, order, line } = fixture();
  db.orden_compra.push(
    { ...order, id: "oc-b", no_orden: "2807" },
    { ...order, id: "ocm", no_orden: "150", tipo_orden: "material" },
  );
  db.orden_producto.push({ ...line, id: "line-b", id_orden_compra: "oc-b" });
  const material = {
    ...blankRow("orden_material"),
    id: "boxes",
    id_orden_compra: "ocm",
    posicion: 1,
    id_material: db.materiales[0].id,
    cantidad_solicitada: 1,
    precio_unitario: "1.00",
    estado: "cerrada",
  } as Database["orden_material"][number];
  db.orden_material.push(material, {
    ...material,
    id: "labels",
    posicion: 2,
    estado: "en_seguimiento",
  });
  db.abastecimiento_material.push(
    { id_orden_producto: line.id, id_orden_material: "boxes" },
    { id_orden_producto: "line-b", id_orden_material: "labels" },
  );
  const model = buildOrderReadModel(db);
  assert.deepEqual(
    filterCustomOrders(model.orders, "ocm_pendientes", day).map(
      (row) => row.no_orden,
    ),
    ["2807"],
  );
  assert.deepEqual(
    filterCustomOrders(model.orders, "vinculos_con", day).map((row) => row.id),
    ["oc-a", "oc-b", "ocm"],
  );
  line.estado = "anulada";
  material.estado = "anulada";
  assert.equal(matches(db, "vinculos_con"), true);
  assert.equal(matches(db, "ocm_pendientes"), false);
});

test("materiales y otros consultan su recepción directa, nunca el catálogo de lotes de material", () => {
  for (const type of ["material", "otro"] as const) {
    const { db, order } = fixture();
    order.tipo_orden = type;
    db.orden_producto = [];
    db.lote_producto = [];
    const line: Row = {
      ...blankRow(type === "material" ? "orden_material" : "orden_otro"),
      id: "receipt",
      id_orden_compra: order.id,
      posicion: 1,
      id_material: db.materiales[0].id,
      producto: "Servicio",
      cantidad_solicitada: 1,
      precio_unitario: "1.00",
      estado: "en_seguimiento",
      fecha_entrega: day,
    };
    (db[type === "material" ? "orden_material" : "orden_otro"] as Row[]).push(
      line,
    );
    assert.equal(matches(db, "recepciones_sin_factura"), true);
    assert.equal(matches(db, "sin_recepciones"), true);
    line.cantidad_recibida = 0;
    assert.equal(matches(db, "sin_recepciones"), false);
    line.id_factura = "invoice";
    assert.equal(matches(db, "recepciones_sin_factura"), false);
  }
});

test("índices: equivalencia del estado comercial, importes exactos y ninguna mutación del snapshot", () => {
  const db = makeSeed();
  const original = structuredClone(db);
  const model = buildOrderReadModel(db);
  for (const order of model.orders) {
    assert.equal(order.visible, orderState(db, order));
    assert.equal(order.total, totalLines(order.ls));
    assert.equal(
      model.ordersByNumber.get(
        `${order.tipo_orden === "producto" ? "productos" : "materiales"}:${order.no_orden}`,
      )?.id,
      order.id,
    );
  }
  assert.deepEqual(db, original);
});

test("cada actualización de datos recalcula indicadores y los vencimientos cambian sin recorrer lotes", () => {
  const { db, lot } = fixture();
  const before = buildOrderReadModel(db);
  assert.equal(
    matchesCustomFilter(before.orders[0], "batch_vencido", "2026-10-08"),
    false,
  );
  assert.equal(
    matchesCustomFilter(before.orders[0], "batch_vencido", day),
    true,
  );
  lot.fecha_entrega_batch_record = day;
  const after = buildOrderReadModel(db);
  assert.equal(
    matchesCustomFilter(after.orders[0], "batch_vencido", day),
    false,
  );
});

test("paginación de cincuenta: extremos, URL inválida, vacíos y página fuera de rango", () => {
  const rows = Array.from({ length: 121 }, (_, id) => ({ id }));
  assert.equal(paginateOrders(rows, null).rows.length, 50);
  assert.deepEqual(
    paginateOrders(rows, "2").rows.map((row) => row.id),
    rows.slice(50, 100).map((row) => row.id),
  );
  const last = paginateOrders(rows, "999");
  assert.deepEqual(
    [last.page, last.pageCount, last.start, last.end, last.rows.length],
    [3, 3, 101, 121, 21],
  );
  for (const value of ["0", "-1", "1.5", "x", "999999999999999999999"])
    assert.equal(paginateOrders(rows, value).page, 1);
  assert.deepEqual(paginateOrders([], "5"), {
    rows: [],
    page: 1,
    pageCount: 1,
    total: 0,
    start: 0,
    end: 0,
  });
});

test("reloj de Bogotá: cambio de día a las 05 UTC y temporizador hasta medianoche", () => {
  const before = new Date("2026-10-10T04:59:59.000Z");
  assert.equal(bogotaDay(before), "2026-10-09");
  assert.equal(millisecondsToBogotaMidnight(before), 1000);
  const after = new Date("2026-10-10T05:00:00.000Z");
  assert.equal(bogotaDay(after), "2026-10-10");
  assert.equal(millisecondsToBogotaMidnight(after), 86400000);
});
