import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  buildMaterialNeeds,
  consolidateMaterialSources,
  demandQuantity,
  earliestMaterialDelivery,
  materialDemandDay,
  materialDemandSchema,
  materialOrderDeliveryIssue,
  needsInRange,
  validDemandDay,
  type MaterialDemand,
} from "../shared/material-demand";
import type { Database } from "../shared/models";
import { sid } from "../shared/seed";
import { command } from "../server/domain";
import { BusinessError, validateDatabase } from "../server/integrity";
import { JsonStore } from "../server/store";
import {
  buildDemandRows,
  demandColumns,
  readDemandParams,
  searchDemandRows,
} from "../src/material-demand-table";
import {
  filterTableRows,
  readColumnState,
  sortTableRows,
} from "../src/order-table";
import {
  DEMAND_RANGE,
  addDemandMaterials,
  makeMaterialDemandFixture,
} from "./fixtures/material-demand";

const needs = (db: Database) =>
  needsInRange(buildMaterialNeeds(db), DEMAND_RANGE.desde, DEMAND_RANGE.hasta);
const selection = (db: Database): MaterialDemand => ({
  ...DEMAND_RANGE,
  fuentes: needs(db)
    .filter(
      (need) => need.material.id === sid(50) || need.material.id === sid(51),
    )
    .map((need) => need.source),
});
const payload = (db: Database, demand = selection(db)) => ({
  tipo_orden: "material",
  id_proveedor: sid(3),
  fecha_solicitada_entrega: "2027-01-20T12:00:00.000Z",
  lines: consolidateMaterialSources(demand.fuentes).map(
    ({ id_material, cantidad_solicitada, precio_unitario }) => ({
      id_material,
      cantidad_solicitada,
      precio_unitario,
    }),
  ),
  abastecimiento: demand,
});
const execute = (store: JsonStore, data: object) =>
  store.transaction((db) => command(db, "createOrder", data));
const errorCode = (code: string) => (error: unknown) =>
  error instanceof BusinessError && error.code === code;
async function fixture(t: TestContext, seed = makeMaterialDemandFixture) {
  const root = resolve("tests/.tmp");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "material-demand-"));
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(root + sep));
    await rm(directory, { recursive: true, force: true });
  });
  return JsonStore.open(join(directory, "database.json"), seed);
}

test("pendientes: solo materiales específicos de renglones autorizados en seguimiento, por identidad", () => {
  const db = makeMaterialDemandFixture();
  validateDatabase(db);
  const rows = needs(db);
  assert.equal(rows.length, 5);
  assert.deepEqual(
    [...new Set(rows.map((row) => row.material.id))].sort(),
    [sid(50), sid(51), sid(56)].sort(),
  );
  assert.equal(rows.filter((row) => row.product.id === sid(70)).length, 4);
  assert.equal(new Set(rows.map((row) => row.key)).size, 5);
  assert.equal(
    rows.some((row) => [sid(53), sid(54), sid(55)].includes(row.material.id)),
    false,
  );
});

test("pendientes: una compra cubre solo la pareja producto–material; cerrada y sin autorizar cuentan, anulada no", () => {
  const db = makeMaterialDemandFixture();
  const material = db.orden_material.find(
    (row) => row.id_material === sid(50),
  )!;
  db.abastecimiento_material.push({
    id_orden_producto: sid(2100),
    id_orden_material: material.id,
  });
  assert.equal(needs(db).length, 4);
  assert.ok(
    needs(db).some(
      (row) => row.line.id === sid(2100) && row.material.id === sid(51),
    ),
  );
  assert.ok(
    needs(db).some(
      (row) => row.line.id === sid(2101) && row.material.id === sid(50),
    ),
  );
  material.estado = "cerrada";
  db.orden_compra.find(
    (order) => order.id === material.id_orden_compra,
  )!.estado_autorizacion = "no_autorizada";
  assert.equal(needs(db).length, 4);
  material.estado = "anulada";
  assert.equal(needs(db).length, 5);
  const another = db.orden_material.find(
    (row) => row.id !== material.id && row.id_material === sid(50),
  )!;
  db.abastecimiento_material.push({
    id_orden_producto: sid(2100),
    id_orden_material: another.id,
  });
  assert.equal(
    needs(db).length,
    4,
    "Otra compra vigente conserva la cobertura",
  );
});

test("pendientes: autorización, cierre, anulación y fecha ausente excluyen únicamente sus renglones", () => {
  for (const state of ["cerrada", "anulada"] as const) {
    const db = makeMaterialDemandFixture();
    db.orden_producto.find((row) => row.id === sid(2100))!.estado = state;
    assert.equal(needs(db).length, 3);
  }
  const db = makeMaterialDemandFixture();
  db.orden_compra.find((order) => order.id === sid(2000))!.estado_autorizacion =
    "no_autorizada";
  assert.equal(needs(db).length, 2);
  db.orden_compra.find(
    (order) => order.id === sid(2001),
  )!.fecha_solicitada_entrega = null;
  assert.equal(needs(db).length, 0);
});

test("pendientes: rango inclusivo, mismo día, calendario de Bogotá y fechas inexistentes", () => {
  const db = makeMaterialDemandFixture();
  const all = buildMaterialNeeds(db);
  assert.equal(needsInRange(all, "2027-02-15", "2027-02-15").length, 3);
  assert.equal(needsInRange(all, "2027-02-15", "2027-02-22").length, 5);
  assert.equal(needsInRange(all, "2027-02-16", "2027-02-21").length, 0);
  assert.equal(needsInRange(all, "2027-02-22", "2027-02-15").length, 0);
  assert.equal(validDemandDay("2027-02-29"), false);
  assert.equal(validDemandDay("2028-02-29"), true);
  assert.equal(materialDemandDay("2027-03-01T03:00:00.000Z"), "2027-02-28");
  assert.equal(materialDemandDay("2027-02-15"), "2027-02-15");
  assert.equal(
    materialDemandSchema.safeParse({ ...selection(db), hasta: "2027-02-30" })
      .success,
    false,
  );
});

test("consolidación: suma por material y renglón de origen, adicional exacto y un solo redondeo final", () => {
  const groups = consolidateMaterialSources(
    selection(makeMaterialDemandFixture()).fuentes,
  );
  assert.equal(groups.length, 2);
  assert.ok(
    groups.every(
      (group) =>
        group.cantidad_base === 3000 &&
        group.cantidad_solicitada === 3300 &&
        group.adicional_pct === 10,
    ),
  );
  assert.equal(demandQuantity(100, 10), 110);
  assert.equal(demandQuantity(20, 5), 21);
  assert.equal(demandQuantity(10, 7.5), 11);
  assert.equal(
    demandQuantity(2, 5),
    3,
    "Se aplica el adicional a la suma, no a cada origen por separado",
  );
  for (const percent of [4.99, 10.01, NaN, Infinity])
    assert.throws(() => demandQuantity(100, percent), RangeError);
  assert.throws(() => demandQuantity(Number.MAX_SAFE_INTEGER, 10), RangeError);
  assert.throws(
    () =>
      consolidateMaterialSources([...groups[0].fuentes, groups[0].fuentes[0]]),
    /repetido/,
  );
});

test("consolidación: hasta siete identidades, incluso homónimos, con múltiples orígenes por material", () => {
  const db = addDemandMaterials(makeMaterialDemandFixture());
  const sources = needs(db)
    .filter((need) => need.line.id === sid(2100))
    .map((need) => need.source);
  assert.equal(sources.length, 8);
  assert.equal(consolidateMaterialSources(sources.slice(0, 7)).length, 7);
  assert.throws(() => consolidateMaterialSources(sources), /siete/);
});

test("tabla de pendientes: búsqueda por OC, nombre y MAIA; filtros, orden numérico y parámetros aislados", () => {
  const db = makeMaterialDemandFixture();
  const rows = buildDemandRows(db).filter((row) =>
    row.deliveryDay.startsWith("2027-02"),
  );
  assert.equal(searchDemandRows(rows, "oc2901").length, 3);
  assert.equal(searchDemandRows(rows, "OC 2901 ámbar").length, 1);
  assert.equal(searchDemandRows(rows, "101").length, 2);
  const filtered = filterTableRows(rows, demandColumns, {
    material: { operator: "contains", value: "102" },
  });
  assert.equal(filtered.length, 2);
  assert.equal(
    sortTableRows(rows, demandColumns, {
      column: "orden",
      direction: "desc",
    })[0].order.no_orden,
    "2902",
  );
  const params = new URLSearchParams({
    tab: "pendientes",
    q: "OC 2801",
    ordenar: "estado",
    pendientes_q: "101",
    pendientes_ordenar: "cantidad",
    pendientes_direccion: "desc",
  });
  const own = readDemandParams(params);
  assert.equal(own.get("q"), "101");
  assert.deepEqual(readColumnState(own, demandColumns).sort, {
    column: "cantidad",
    direction: "desc",
  });
  assert.equal(params.get("q"), "OC 2801");
});

test("OCM desde pendientes: cabecera, cantidades finales y vínculos exactos se guardan juntos y persisten", async (t) => {
  const store = await fixture(t),
    before = store.snapshot();
  const data = payload(before);
  data.lines[0].cantidad_solicitada = 3456;
  data.lines[0].precio_unitario = "2.55";
  const result = await execute(store, data);
  const after = store.snapshot();
  const order = after.orden_compra.find((row) => row.id === result.orderId)!;
  const lines = after.orden_material.filter(
    (row) => row.id_orden_compra === order.id,
  );
  assert.equal(order.estado_autorizacion, "no_autorizada");
  assert.equal(lines.length, 2);
  assert.equal(lines[0].cantidad_solicitada, 3456);
  assert.equal(lines[0].precio_unitario, "2.55");
  assert.equal(
    after.abastecimiento_material.length -
      before.abastecimiento_material.length,
    4,
  );
  assert.ok(
    lines.every(
      (line) =>
        after.abastecimiento_material.filter(
          (link) => link.id_orden_material === line.id,
        ).length === 2,
    ),
  );
  assert.equal(
    needs(after).length,
    1,
    "Permanece pendiente el material del producto no seleccionado",
  );
  assert.ok(
    lines.every(
      (line) =>
        !Object.hasOwn(line, "adicional_pct") &&
        !Object.hasOwn(line, "cantidad_base") &&
        !Object.hasOwn(line, "fuentes"),
    ),
  );
  assert.deepEqual((await JsonStore.open(store.file)).snapshot(), after);
});

test("OCM desde pendientes: rechaza fuentes duplicadas, incompatibles y un rango inválido sin consumir consecutivo", async (t) => {
  const store = await fixture(t),
    before = store.snapshot(),
    original = await readFile(store.file, "utf8");
  for (const change of [
    (data: ReturnType<typeof payload>) => {
      data.abastecimiento.fuentes.push(data.abastecimiento.fuentes[0]);
    },
    (data: ReturnType<typeof payload>) => {
      data.abastecimiento.hasta = "2027-01-01";
    },
    (data: ReturnType<typeof payload>) => {
      data.lines[0].id_material = sid(56);
    },
    (data: ReturnType<typeof payload>) => {
      data.lines.push({ ...data.lines[0] });
    },
    (data: ReturnType<typeof payload>) => {
      data.tipo_orden = "producto";
    },
  ]) {
    const data = payload(before);
    change(data);
    await assert.rejects(execute(store, data), errorCode("VALIDATION"));
    assert.deepEqual(store.snapshot(), before);
    assert.equal(await readFile(store.file, "utf8"), original);
  }
});

test("OCM desde pendientes: rechaza ocho materiales aunque las fuentes sean válidas", async (t) => {
  const store = await fixture(t, () =>
    addDemandMaterials(makeMaterialDemandFixture()),
  );
  const before = store.snapshot();
  const fuentes = needs(before)
    .filter((need) => need.line.id === sid(2100))
    .map((need) => need.source);
  const data = {
    tipo_orden: "material",
    id_proveedor: sid(3),
    fecha_solicitada_entrega: "2027-01-20T12:00:00.000Z",
    lines: fuentes.map((source) => ({
      id_material: source.id_material,
      cantidad_solicitada: 1100,
      precio_unitario: "1.00",
    })),
    abastecimiento: { ...DEMAND_RANGE, fuentes },
  };
  await assert.rejects(execute(store, data), errorCode("VALIDATION"));
  assert.deepEqual(store.snapshot(), before);
  data.lines = data.lines.slice(0, 7);
  data.abastecimiento.fuentes = fuentes.slice(0, 7);
  const result = await execute(store, data);
  assert.equal(
    store
      .snapshot()
      .orden_material.filter((line) => line.id_orden_compra === result.orderId)
      .length,
    7,
  );
});

test("OCM desde pendientes: cantidad, entrega, estado o configuración obsoletos exigen revisar", async (t) => {
  const changes: ((db: Database) => void)[] = [
    (db) => {
      db.orden_producto.find(
        (line) => line.id === sid(2100),
      )!.cantidad_solicitada += 1;
    },
    (db) => {
      db.orden_compra.find(
        (order) => order.id === sid(2000),
      )!.fecha_solicitada_entrega = "2027-02-16T12:00:00.000Z";
    },
    (db) => {
      db.orden_producto.find((line) => line.id === sid(2100))!.estado =
        "cerrada";
    },
    (db) => {
      db.materiales_asociados = db.materiales_asociados.filter(
        (link) =>
          !(link.id_producto === sid(70) && link.id_material === sid(50)),
      );
    },
  ];
  for (const change of changes) {
    const store = await fixture(t);
    const data = payload(store.snapshot());
    await store.transaction((db) => {
      change(db);
    });
    const current = store.snapshot();
    await assert.rejects(execute(store, data), errorCode("SUPPLY_CHANGED"));
    assert.deepEqual(store.snapshot(), current);
  }
});

test("OCM desde pendientes: dos solicitudes simultáneas crean una sola compra y no duplican los vínculos", async (t) => {
  const store = await fixture(t),
    before = store.snapshot(),
    data = payload(before);
  const results = await Promise.allSettled([
    execute(store, data),
    execute(store, data),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const failed = results.find(
    (result) => result.status === "rejected",
  ) as PromiseRejectedResult;
  assert.ok(errorCode("SUPPLY_CHANGED")(failed.reason));
  const after = store.snapshot();
  assert.equal(after.orden_compra.length, before.orden_compra.length + 1);
  assert.equal(
    after.abastecimiento_material.length,
    before.abastecimiento_material.length + 4,
  );
  assert.equal(
    after.consecutivo_orden.find((counter) => counter.grupo === "material")!
      .ultimo_numero,
    before.consecutivo_orden.find((counter) => counter.grupo === "material")!
      .ultimo_numero + 1,
  );
});

test("OCM desde pendientes: fallo del último material revierte cabecera, primeros renglones, vínculos y número", async (t) => {
  const store = await fixture(t),
    before = store.snapshot(),
    original = await readFile(store.file, "utf8");
  const data = payload(before);
  data.lines[1].precio_unitario = "inválido";
  await assert.rejects(execute(store, data), errorCode("TYPE"));
  assert.deepEqual(store.snapshot(), before);
  assert.equal(await readFile(store.file, "utf8"), original);
});

test("OCM desde pendientes: una compra anulada permite reemplazo conservando su vínculo histórico", async (t) => {
  const store = await fixture(t),
    first = await execute(store, payload(store.snapshot()));
  const firstLines = store
    .snapshot()
    .orden_material.filter((line) => line.id_orden_compra === first.orderId);
  await store.transaction((db) => {
    for (const line of db.orden_material)
      if (line.id_orden_compra === first.orderId) line.estado = "anulada";
  });
  const before = store.snapshot();
  assert.equal(needs(before).length, 5);
  const second = await execute(store, payload(before));
  const after = store.snapshot();
  assert.notEqual(first.orderId, second.orderId);
  assert.ok(
    firstLines.every(
      (line) =>
        after.abastecimiento_material.filter(
          (link) => link.id_orden_material === line.id,
        ).length === 2,
    ),
  );
  assert.equal(needs(after).length, 1);
});

test("entrega OCM: límite mínimo de los días de Bogotá, con comparación estricta", () => {
  const earliest = earliestMaterialDelivery([
    "2027-02-22T12:00:00Z",
    "2027-02-16T04:30:00Z",
    "2027-02-15T23:59:00-05:00",
    null,
  ]);
  assert.equal(earliest, "2027-02-15");
  assert.equal(
    materialOrderDeliveryIssue("2027-02-15T04:59:59Z", earliest),
    null,
  );
  assert.match(
    materialOrderDeliveryIssue("2027-02-15T05:00:00Z", earliest)!,
    /15\/02\/2027/,
  );
  assert.ok(materialOrderDeliveryIssue("2027-02-20T12:00:00Z", earliest));
  assert.equal(earliestMaterialDelivery([]), null);
});

for (const multiple of [false, true]) {
  test(`entrega OCM: rechaza fecha igual o posterior con ${multiple ? "varias OC" : "una OC"}, sin guardar ni consumir consecutivo`, async (t) => {
    t.mock.timers.enable({
      apis: ["Date"],
      now: new Date("2026-10-26T12:00:00Z"),
    });
    const store = await fixture(t);
    const before = store.snapshot();
    const original = await readFile(store.file, "utf8");
    const demand = selection(before);
    if (!multiple)
      demand.fuentes = demand.fuentes.filter(
        (source) => source.id_orden_producto === sid(2100),
      );
    for (const date of [
      "2027-02-15T05:00:00Z",
      "2027-02-16T04:59:59Z",
      "2027-02-20T12:00:00Z",
      "2027-02-22T12:00:00Z",
    ]) {
      await assert.rejects(
        execute(store, {
          ...payload(before, demand),
          fecha_solicitada_entrega: date,
        }),
        (error: unknown) => {
          assert.ok(error instanceof BusinessError);
          assert.equal(error.code, "VALIDATION");
          assert.match(error.message, /OCM debe ser anterior.*15\/02\/2027/);
          assert.equal(error.fields.fecha_solicitada_entrega, error.message);
          return true;
        },
      );
      assert.deepEqual(store.snapshot(), before);
      assert.equal(await readFile(store.file, "utf8"), original);
    }
    const created = await execute(store, {
      ...payload(before, demand),
      fecha_solicitada_entrega: "2027-02-15T04:59:59Z",
    });
    assert.ok(
      store
        .snapshot()
        .orden_compra.some((order) => order.id === created.orderId),
    );
  });
}

test("entrega OCM: compara solo OC seleccionadas y permite compras sin asociación", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-26T12:00:00Z"),
  });
  const store = await fixture(t);
  const db = store.snapshot();
  const demand = selection(db);
  demand.fuentes = demand.fuentes.filter(
    (source) => source.id_orden_producto === sid(2101),
  );
  const associated = await execute(store, {
    ...payload(db, demand),
    fecha_solicitada_entrega: "2027-02-20T12:00:00Z",
  });
  assert.ok(
    store
      .snapshot()
      .orden_compra.some((order) => order.id === associated.orderId),
  );
  const { abastecimiento: _demand, ...unlinked } = payload(db);
  const free = await execute(store, {
    ...unlinked,
    fecha_solicitada_entrega: "2027-02-22T12:00:00Z",
  });
  assert.ok(
    store.snapshot().orden_compra.some((order) => order.id === free.orderId),
  );
});

test("entrega OCM: la fecha actual de la OC controla el límite y un origen manipulado no lo evita", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-26T12:00:00Z"),
  });
  const store = await fixture(t);
  const stale = payload(store.snapshot());
  await store.transaction((db) => {
    db.orden_compra.find(
      (order) => order.id === sid(2000),
    )!.fecha_solicitada_entrega = "2027-02-10T12:00:00Z";
  });
  const before = store.snapshot();
  await assert.rejects(execute(store, stale), errorCode("SUPPLY_CHANGED"));
  const current = {
    ...payload(before),
    fecha_solicitada_entrega: "2027-02-12T12:00:00Z",
  };
  await assert.rejects(execute(store, current), (error: unknown) => {
    assert.ok(error instanceof BusinessError);
    assert.match(error.fields.fecha_solicitada_entrega, /10\/02\/2027/);
    return true;
  });
  assert.deepEqual(store.snapshot(), before);
});
