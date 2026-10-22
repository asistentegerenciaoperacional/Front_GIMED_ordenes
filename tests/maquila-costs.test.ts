import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { makeSeed, sid } from "../shared/seed";
import { currentCost, schemas, meta, type Row } from "../shared/schema";
import { costDay, costIssue, costScheduleIssue } from "../shared/maquila-costs";
import { validateDatabase } from "../server/integrity";
import { JsonStore } from "../server/store";
import { command } from "../server/domain";
import { validEntityField } from "../src/live-validation";
import {
  correctCostFile,
  removeAuthorizedCost,
} from "../scripts/correct-maquila-cost";

const product = sid(70);
const iso = (date: string) => `${date}T12:00:00.000Z`;
const cost = (
  start: string,
  end: string | null,
  id = sid(800),
  productId = product,
) => ({
  id,
  id_producto: productId,
  costo: 3500,
  fecha_inicio: iso(start),
  fecha_fin: end ? iso(end) : null,
});
const closed = cost("2025-01-01", "2025-12-31");
async function temporary(t: TestContext) {
  const parent = resolve("tests/.tmp");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "gimed-maquila-"));
  assert.ok(resolve(directory).startsWith(parent + sep));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const execute = (store: JsonStore, name: string, payload: Row) =>
  store.transaction((db) => command(db, name, payload));
test("maquila: costo e inicio obligatorios; importe entero positivo y seguro", () => {
  assert.equal(meta.tables.costos_maquila.fields.costo.required, true);
  assert.equal(meta.tables.costos_maquila.fields.fecha_inicio.required, true);
  const row = cost("2026-01-01", null);
  for (const value of [
    undefined,
    null,
    "",
    0,
    -1,
    1.1,
    Infinity,
    NaN,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.equal(
      schemas.costos_maquila.safeParse({ ...row, costo: value }).success,
      false,
      String(value),
    );
  for (const value of [undefined, null, "", "2026-02-30T12:00:00Z"])
    assert.equal(
      schemas.costos_maquila.safeParse({ ...row, fecha_inicio: value }).success,
      false,
    );
  assert.equal(schemas.costos_maquila.safeParse(row).success, true);
});
test("maquila: días de Bogotá y fechas de calendario inválidas", () => {
  assert.equal(costDay("2026-01-02T04:59:59Z"), "2026-01-01");
  assert.equal(costDay("2026-01-02T05:00:00Z"), "2026-01-02");
  assert.equal(costDay("2024-02-29"), "2024-02-29");
  assert.equal(costDay("0001-01-01T12:00:00Z"), "0001-01-01");
  for (const value of [
    "2026-02-29",
    "2026-13-01",
    "0000-01-01",
    "2026-02-30T12:00:00Z",
    "01/",
    "01/01/202",
    "2026-1",
    "texto",
    "",
    null,
  ])
    assert.equal(costDay(value), null);
});
test("maquila: todas las formas de solapamiento y extremos inclusivos", () => {
  for (const [start, end] of [
    ["2025-02-01", "2025-03-01"],
    ["2024-01-01", "2026-01-01"],
    ["2025-01-01", "2025-12-31"],
    ["2024-12-31", "2025-01-01"],
    ["2025-12-31", "2026-01-01"],
    ["2025-06-01", "2026-01-01"],
  ]) {
    const issue = costIssue(cost(start, end, sid(801)), [closed]);
    assert.equal(issue?.conflictingId, closed.id);
    assert.match(issue!.fields.fecha_inicio, /3.500.*01\/01\/2025/);
  }
});
test("maquila: periodos adyacentes, huecos, un día y exclusión del mismo registro", () => {
  assert.equal(costIssue(cost("2026-01-01", null, sid(801)), [closed]), null);
  assert.equal(
    costIssue(cost("2026-02-01", "2026-02-01", sid(801)), [closed]),
    null,
  );
  assert.equal(costIssue(closed, [closed]), null);
  assert.ok(costIssue(cost("2026-01-02", "2026-01-01"), [])?.fields.fecha_fin);
});
test("maquila: solo un periodo abierto, después de todos los cerrados", () => {
  const open = cost("2026-01-01", null);
  assert.match(
    costIssue(cost("2026-01-02", null, sid(801)), [open])!.fields.fecha_fin,
    /Cierra el costo abierto/,
  );
  assert.ok(costIssue(cost("2024-01-01", null, sid(801)), [closed]));
  assert.ok(costScheduleIssue([cost("2024-01-01", null, sid(801)), closed]));
  assert.equal(costScheduleIssue([closed, open]), null);
});
test("maquila: productos independientes y validación completa de bases antiguas", () => {
  assert.equal(
    costIssue({ ...closed, id: sid(801), id_producto: sid(71) }, [closed]),
    null,
  );
  const db = makeSeed();
  db.costos_maquila.push(cost("2026-02-01", "2026-03-01"));
  assert.throws(() => validateDatabase(db), { code: "COST_PERIOD_CONFLICT" });
});
test("maquila: el costo cerrado cubre todo su último día y el futuro no se anticipa", () => {
  const db = makeSeed();
  const old = db.costos_maquila.find(
    (row) => row.id_producto === product && !row.fecha_fin,
  )!;
  old.fecha_fin = iso("2026-10-31");
  const future = cost("2026-11-01", null);
  db.costos_maquila.push(future);
  validateDatabase(db);
  for (const at of [
    "2026-10-31T00:00:00-05:00",
    "2026-10-31T23:59:59-05:00",
    "2026-11-01T02:00:00Z",
  ])
    assert.equal(currentCost(db, product, at)?.id, old.id);
  assert.equal(currentCost(db, product, "2026-11-01T05:00:00Z")?.id, future.id);
  assert.equal(currentCost(db, product, "2024-01-01"), undefined);
});
test("maquila: corregir dependencias limpia errores locales sin ocultar otros", () => {
  const db = makeSeed();
  const row = { ...cost("2026-01-02", null), id: undefined };
  assert.equal(validEntityField("costos_maquila", "fecha_fin", row, db), false);
  row.fecha_fin = iso("2026-01-03");
  assert.equal(
    validEntityField("costos_maquila", "fecha_inicio", row, db),
    false,
  );
  const historical = { ...cost("2024-01-01", "2024-12-31"), id: undefined };
  assert.equal(
    validEntityField("costos_maquila", "fecha_inicio", historical, db),
    true,
  );
  assert.equal(
    validEntityField(
      "costos_maquila",
      "costo",
      { ...historical, costo: "0" },
      db,
    ),
    false,
  );
});
test("maquila: API rechaza vacíos, solapamientos y segundo abierto sin escribir parcialmente", async (t) => {
  const directory = await temporary(t);
  const file = join(directory, "database.json");
  const store = await JsonStore.open(file);
  const before = await readFile(file, "utf8");
  for (const row of [
    { ...cost("2026-01-01", null), costo: null },
    cost("2026-02-01", null),
    cost("2025-11-01", "2026-11-01"),
  ]) {
    await assert.rejects(
      execute(store, "saveEntity", { entity: "costos_maquila", row }),
    );
    assert.equal(await readFile(file, "utf8"), before);
  }
});
test("maquila: cerrar antes de otro abierto, editar y eliminar conserva precios históricos", async (t) => {
  const directory = await temporary(t);
  const store = await JsonStore.open(join(directory, "database.json"));
  const before = store.snapshot();
  const old = before.costos_maquila.find(
    (row) => row.id_producto === product && !row.fecha_fin,
  )!;
  await execute(store, "saveEntity", {
    entity: "costos_maquila",
    key: { id: old.id },
    row: { ...old, fecha_fin: iso("2026-10-31") },
  });
  await execute(store, "saveEntity", {
    entity: "costos_maquila",
    row: cost("2026-11-01", null),
  });
  await execute(store, "deleteEntity", {
    entity: "costos_maquila",
    key: { id: old.id },
  });
  assert.deepEqual(store.snapshot().orden_producto, before.orden_producto);
  const reopened = await JsonStore.open(store.file);
  assert.deepEqual(reopened.snapshot(), store.snapshot());
});
test("maquila: dos solicitudes concurrentes no crean dos periodos abiertos", async (t) => {
  const directory = await temporary(t);
  const store = await JsonStore.open(join(directory, "database.json"));
  const old = store
    .snapshot()
    .costos_maquila.find(
      (row) => row.id_producto === product && !row.fecha_fin,
    )!;
  await execute(store, "saveEntity", {
    entity: "costos_maquila",
    key: { id: old.id },
    row: { ...old, fecha_fin: iso("2026-10-31") },
  });
  const results = await Promise.allSettled(
    [cost("2026-11-01", null), cost("2026-12-01", null, sid(801))].map((row) =>
      execute(store, "saveEntity", { entity: "costos_maquila", row }),
    ),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    store
      .snapshot()
      .costos_maquila.filter(
        (row) => row.id_producto === product && !row.fecha_fin,
      ).length,
    1,
  );
});
const legacy = () => {
  const db = makeSeed();
  db.costos_maquila.push({
    ...cost("2025-11-01", "2026-11-01", "e86e766ec339006bdbb45239"),
    costo: 2000,
  });
  return db;
};
test("maquila: corrección autorizada retira solo el registro identificado", () => {
  const previous = legacy();
  const next = removeAuthorizedCost(previous);
  assert.equal(next.costos_maquila.length, previous.costos_maquila.length - 1);
  assert.deepEqual(next, makeSeed());
  assert.equal(previous.costos_maquila.length, next.costos_maquila.length + 1);
  assert.throws(() => removeAuthorizedCost(next));
  previous.costos_maquila.at(-1)!.costo = 2100;
  assert.throws(() => removeAuthorizedCost(previous));
});
test("maquila: corrección de archivo exige respaldo exacto y valida antes del reemplazo", async (t) => {
  const directory = await temporary(t),
    file = join(directory, "database.json"),
    backup = join(directory, "backup.json"),
    report = join(directory, "report.json");
  const original = JSON.stringify(legacy());
  await writeFile(file, original);
  await writeFile(backup, original);
  await correctCostFile(file, backup, report);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), makeSeed());
  assert.equal(await readFile(backup, "utf8"), original);
  const corrected = await readFile(file, "utf8");
  await assert.rejects(correctCostFile(file, backup, report));
  assert.equal(await readFile(file, "utf8"), corrected);
  const invalid = legacy();
  invalid.costos_maquila[0].costo = -1;
  await writeFile(file, JSON.stringify(invalid));
  await writeFile(backup, JSON.stringify(invalid));
  await assert.rejects(correctCostFile(file, backup, report));
  assert.equal(await readFile(file, "utf8"), JSON.stringify(invalid));
});
