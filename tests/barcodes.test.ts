import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { makeSeed, sid } from "../shared/seed";
import { assignedBarcode } from "../shared/schema";
import { validateDatabase, BusinessError } from "../server/integrity";
import { JsonStore } from "../server/store";
import { command } from "../server/domain";
import { migrateBarcodes } from "../server/barcode-migration";

async function fixture(input = makeSeed()) {
  await mkdir("tests/.tmp", { recursive: true });
  const dir = await mkdtemp(resolve("tests/.tmp/barcodes-"));
  const file = join(dir, "database.json");
  await writeFile(file, JSON.stringify(input));
  return JsonStore.open(file);
}
const execute = (
  store: JsonStore,
  name: string,
  payload: Record<string, unknown>,
) => store.transaction((db) => command(db, name, payload));
const switchTo = (id: number, expected: number | null = 90) => ({
  id: sid(id),
  id_producto: sid(70),
  expectedAssignedId: expected === null ? null : sid(expected),
  confirm: true,
});
const isError = (code: string) => (error: unknown) =>
  error instanceof BusinessError && error.code === code;

test("semilla: cinco estados, alternativas, producto sin asignado y producto sin códigos", () => {
  const db = validateDatabase(makeSeed());
  assert.deepEqual(
    new Set(db.codigos_barras.map((c) => c.estado)),
    new Set([
      "creado_gs1",
      "verificado_sistema",
      "activo",
      "asignado",
      "inactivo",
    ]),
  );
  assert.equal(
    db.codigos_barras.filter(
      (c) => c.id_producto === sid(70) && c.estado === "activo",
    ).length,
    2,
  );
  assert.equal(assignedBarcode(db, sid(74)), undefined);
  assert.equal(
    db.codigos_barras.some((c) => c.id_producto === sid(75)),
    false,
  );
});
test("integridad: exige producto en Activo/Asignado y un solo asignado por producto", () => {
  for (const estado of ["activo", "asignado"] as const) {
    const db = makeSeed();
    db.codigos_barras.find((c) => c.id === sid(360))!.id_producto = null;
    db.codigos_barras.find((c) => c.id === sid(360))!.estado = estado;
    assert.throws(() => validateDatabase(db), isError("BARCODE"));
  }
  const db = makeSeed();
  db.codigos_barras.find((c) => c.id === sid(360))!.estado = "asignado";
  assert.throws(() => validateDatabase(db), isError("BARCODE"));
});
test("asociar código nuevo lo asigna y convierte el anterior en Activo de forma atómica", async () => {
  const store = await fixture();
  await execute(store, "advanceBarcode", {
    id: sid(96),
    estado: "asignado",
    expectedEstado: "verificado_sistema",
    ...{ id_producto: sid(70), expectedAssignedId: sid(90), confirm: true },
  });
  const db = store.snapshot();
  assert.equal(assignedBarcode(db, sid(70))!.id, sid(96));
  assert.equal(
    db.codigos_barras.find((c) => c.id === sid(90))!.estado,
    "activo",
  );
  assert.equal(
    db.orden_producto.find((line) => line.id === sid(110))!.id_codigo_barras,
    sid(90),
  );
  assert.deepEqual(JSON.parse(await readFile(store.file, "utf8")), db);
});
test("cambiar entre activos permite volver a un código antiguo sin cambiar fechas de creación", async () => {
  const store = await fixture();
  const creation = store
    .snapshot()
    .codigos_barras.find((c) => c.id === sid(90))!.fecha_creacion;
  await execute(store, "setAssignedBarcode", switchTo(360));
  await execute(store, "setAssignedBarcode", switchTo(90, 360));
  assert.equal(assignedBarcode(store.snapshot(), sid(70))!.id, sid(90));
  assert.equal(
    store.snapshot().codigos_barras.find((c) => c.id === sid(90))!
      .fecha_creacion,
    creation,
  );
});
test("selección por ID distingue productos con nombres repetidos y rechaza códigos ajenos/inactivos", async () => {
  const db = makeSeed();
  db.productos[1].nombre_producto = db.productos[0].nombre_producto;
  const store = await fixture(db);
  for (const id of [94, 91]) {
    const before = await readFile(store.file, "utf8");
    await assert.rejects(
      execute(store, "setAssignedBarcode", switchTo(id)),
      isError("BARCODE"),
    );
    assert.equal(await readFile(store.file, "utf8"), before);
  }
  await assert.rejects(
    execute(store, "setAssignedBarcode", { ...switchTo(360), confirm: false }),
  );
});
test("dos cambios simultáneos: uno guarda, otro recibe conflicto y no produce guardado parcial", async () => {
  const store = await fixture();
  const results = await Promise.allSettled([
    execute(store, "setAssignedBarcode", switchTo(360)),
    execute(store, "setAssignedBarcode", switchTo(361)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  assert.ok(isError("BARCODE_CHANGED")(rejected.reason));
  const db = store.snapshot();
  assert.equal(
    db.codigos_barras.filter(
      (c) => c.id_producto === sid(70) && c.estado === "asignado",
    ).length,
    1,
  );
  assert.deepEqual(JSON.parse(await readFile(store.file, "utf8")), db);
});
test("estado o asignación obsoletos impiden asociación y desactivación", async () => {
  const store = await fixture();
  const before = await readFile(store.file, "utf8");
  await assert.rejects(
    execute(store, "advanceBarcode", {
      id: sid(96),
      estado: "asignado",
      id_producto: sid(70),
      expectedEstado: "creado_gs1",
      expectedAssignedId: sid(90),
      confirm: true,
    }),
    isError("BARCODE_CHANGED"),
  );
  await assert.rejects(
    execute(store, "advanceBarcode", {
      id: sid(90),
      estado: "inactivo",
      expectedEstado: "asignado",
      expectedAssignedId: null,
      confirm: true,
    }),
    isError("BARCODE_CHANGED"),
  );
  assert.equal(await readFile(store.file, "utf8"), before);
});
test("sin Asignado, Activo no habilita emisión; desactivación conserva órdenes existentes", async () => {
  const store = await fixture();
  await execute(store, "advanceBarcode", {
    id: sid(90),
    estado: "inactivo",
    expectedEstado: "asignado",
    expectedAssignedId: sid(90),
    confirm: true,
  });
  assert.equal(assignedBarcode(store.snapshot(), sid(70)), undefined);
  const before = await readFile(store.file, "utf8");
  await assert.rejects(
    execute(store, "createOrder", {
      tipo_orden: "producto",
      id_proveedor: sid(1),
      fecha_solicitada_entrega: "2026-11-01T12:00:00.000Z",
      lines: [
        {
          id_producto: sid(70),
          cantidad_solicitada: 5,
          precio_unitario: "1.00",
        },
      ],
    }),
    isError("BARCODE"),
  );
  assert.equal(await readFile(store.file, "utf8"), before);
  const historical = store
    .snapshot()
    .orden_producto.find((line) => line.id === sid(110))!;
  assert.equal(historical.id_codigo_barras, sid(90));
  await execute(store, "setAssignedBarcode", switchTo(360, null));
});
test("una alternativa desactivada mientras estaba abierta la confirmación exige revisar", async () => {
  const store = await fixture();
  await execute(store, "advanceBarcode", {
    id: sid(360),
    estado: "inactivo",
    expectedEstado: "activo",
    expectedAssignedId: sid(90),
    confirm: true,
  });
  const original = await readFile(store.file, "utf8");
  await assert.rejects(
    execute(store, "setAssignedBarcode", {
      ...switchTo(360),
      expectedEstado: "activo",
    }),
    isError("BARCODE_CHANGED"),
  );
  assert.equal(await readFile(store.file, "utf8"), original);
});
test("migración antigua: conserva selección por fecha UTC, otras colecciones e idempotencia", async () => {
  const db = makeSeed();
  const old = db.codigos_barras.find((c) => c.id === sid(90))!;
  const newer = db.codigos_barras.find((c) => c.id === sid(360))!;
  old.fecha_creacion = "2026-10-05T12:00:00+03:00";
  newer.estado = "asignado";
  newer.fecha_creacion = "2026-10-05T11:00:00Z";
  const original = structuredClone(db);
  const migrated = migrateBarcodes(db);
  assert.deepEqual(db, original);
  const checked = validateDatabase(migrated.database as typeof db);
  assert.equal(assignedBarcode(checked, sid(70))!.id, sid(360));
  for (const key of Object.keys(db) as (keyof typeof db)[])
    if (key !== "codigos_barras")
      assert.deepEqual(migrated.database[key], db[key]);
  assert.equal(migrateBarcodes(migrated.database).changed, false);
  const store = await fixture(db);
  assert.ok(store.barcodeMigration?.backup);
  assert.deepEqual(
    JSON.parse(await readFile(store.barcodeMigration!.backup, "utf8")),
    original,
  );
  const reopened = await JsonStore.open(store.file);
  assert.equal(reopened.barcodeMigration, undefined);
});
test("migración ambigua, sin fechas o referencia inválida conserva archivo original", async () => {
  for (const mode of ["tie", "missing", "reference"] as const) {
    const db = makeSeed();
    const other = db.codigos_barras.find((c) => c.id === sid(360))!;
    other.estado = "asignado";
    other.fecha_creacion =
      mode === "missing" ? null : db.codigos_barras[0].fecha_creacion;
    if (mode === "reference") other.id_producto = sid(99999);
    await mkdir("tests/.tmp", { recursive: true });
    const dir = await mkdtemp(resolve("tests/.tmp/barcodes-invalid-"));
    const file = join(dir, "database.json"),
      original = JSON.stringify(db);
    await writeFile(file, original);
    await assert.rejects(JsonStore.open(file), isError("BARCODE_MIGRATION"));
    assert.equal(await readFile(file, "utf8"), original);
  }
});
