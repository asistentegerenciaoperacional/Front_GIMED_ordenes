import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { makeSeed, sid } from "../shared/seed";
import { migrateFavoriteSuppliers } from "../server/favorite-migration";
import { JsonStore } from "../server/store";
import { command } from "../server/domain";
import { BusinessError, validateDatabase } from "../server/integrity";
import {
  materialSupplierGroups,
  suggestedMaterial,
  favoriteSupplierIds,
  supplierOptionLabel,
} from "../shared/favorite-suppliers";

function legacy() {
  const db = makeSeed();
  return {
    ...db,
    proveedores_favoritos: [
      [50, 3],
      [51, 3],
      [52, 4],
      [53, 4],
      [54, 4],
      [55, 4],
      [56, 3],
      [56, 4],
    ].map(([m, p]) => ({ id_material: sid(m), id_proveedor: sid(p) })),
  };
}
async function file(input: unknown) {
  await mkdir("tests/.tmp", { recursive: true });
  const dir = await mkdtemp(resolve("tests/.tmp/favorites-"));
  const path = join(dir, "database.json");
  const raw = JSON.stringify(input, null, 2) + "\n";
  await writeFile(path, raw);
  return { dir, path, raw };
}
const code = (expected: string) => (e: unknown) =>
  e instanceof BusinessError && e.code === expected;
test("favoritos: ocho relaciones por material se convierten en siete por tipo sin mutar la entrada", () => {
  const db = legacy();
  const before = structuredClone(db);
  const result = migrateFavoriteSuppliers(db);
  assert.deepEqual(db, before);
  assert.equal(result.before, 8);
  assert.equal(result.after, 7);
  assert.equal(result.changed, true);
  assert.deepEqual(
    validateDatabase(result.database as any).proveedores_favoritos,
    makeSeed().proveedores_favoritos,
  );
  for (const table of Object.keys(db).filter(
    (t) => t !== "proveedores_favoritos",
  ))
    assert.deepEqual(result.database[table], (db as any)[table]);
});
test("favoritos: conversión idempotente y colecciones vacías válidas", () => {
  const converted = migrateFavoriteSuppliers(legacy()).database;
  assert.equal(migrateFavoriteSuppliers(converted).changed, false);
  assert.equal(
    migrateFavoriteSuppliers({ ...makeSeed(), proveedores_favoritos: [] })
      .changed,
    false,
  );
});
test("favoritos: formato mixto reúne pares anteriores y nuevos y elimina duplicados", () => {
  const db: any = legacy();
  db.proveedores_favoritos.push(
    { id_tipo_material: sid(40), id_proveedor: sid(3) },
    { id_tipo_material: sid(41), id_proveedor: sid(4) },
  );
  assert.equal(migrateFavoriteSuppliers(db).after, 8);
});
for (const [name, row] of [
  ["material inexistente", { id_material: sid(999), id_proveedor: sid(3) }],
  ["tipo inexistente", { id_tipo_material: sid(999), id_proveedor: sid(3) }],
  ["proveedor inexistente", { id_material: sid(50), id_proveedor: sid(999) }],
  [
    "campos contradictorios",
    { id_material: sid(50), id_tipo_material: sid(41), id_proveedor: sid(3) },
  ],
] as const)
  test(`favoritos: ${name} aborta sin modificar el archivo`, async () => {
    const db: any = legacy();
    db.proveedores_favoritos.push(row);
    const f = await file(db);
    await assert.rejects(JsonStore.open(f.path), code("FAVORITES_MIGRATION"));
    assert.equal(await readFile(f.path, "utf8"), f.raw);
    assert.equal((await readdir(f.dir)).length, 1);
  });
test("favoritos: migración persistida con copia exacta, segunda apertura sin escritura ni segundo respaldo", async () => {
  const f = await file(legacy());
  const store = await JsonStore.open(f.path);
  assert.equal(await readFile(store.migration!.backup, "utf8"), f.raw);
  assert.equal(store.snapshot().proveedores_favoritos.length, 7);
  const persisted = await readFile(f.path, "utf8");
  const reopened = await JsonStore.open(f.path);
  assert.equal(reopened.migration, undefined);
  assert.equal(await readFile(f.path, "utf8"), persisted);
  assert.equal((await readdir(f.dir)).length, 2);
});
test("favoritos: un error en otra colección impide persistir la migración", async () => {
  const db = legacy();
  db.materiales[0].id_tipo_material = sid(999);
  const f = await file(db);
  await assert.rejects(JsonStore.open(f.path));
  assert.equal(await readFile(f.path, "utf8"), f.raw);
});
test("favoritos: fallo al escribir el respaldo no recrea ni sustituye los datos", async () => {
  await mkdir("tests/.tmp", { recursive: true });
  const dir = await mkdtemp(resolve("tests/.tmp/favorites-backup-failure-"));
  // The original fits a filesystem component; its suffixed backup exceeds 255 characters.
  const path = join(dir, "d".repeat(240) + ".json");
  const original = JSON.stringify(legacy());
  await writeFile(path, original);
  let seedCalls = 0;
  await assert.rejects(
    JsonStore.open(path, () => {
      seedCalls++;
      return makeSeed();
    }),
  );
  assert.equal(seedCalls, 0);
  assert.equal(await readFile(path, "utf8"), original);
});
test("favoritos: selección conjunta normaliza duplicados y conserva los demás tipos", async () => {
  const db = makeSeed();
  db.proveedor.find((p) => p.id === sid(5))!.Es_materiales = true;
  const other = db.proveedores_favoritos.filter(
    (r) => r.id_tipo_material !== sid(40),
  );
  await command(db, "setFavoriteSuppliers", {
    id_tipo_material: sid(40),
    id_proveedores: [sid(5), sid(5), sid(3)],
    expected_id_proveedores: [sid(3), sid(4)],
  });
  assert.deepEqual(
    db.proveedores_favoritos.filter((r) => r.id_tipo_material !== sid(40)),
    other,
  );
  assert.deepEqual(
    db.proveedores_favoritos
      .filter((r) => r.id_tipo_material === sid(40))
      .map((r) => r.id_proveedor),
    [sid(3), sid(5)],
  );
  validateDatabase(db);
});
test("favoritos: selección vacía elimina relaciones, no elimina el tipo", async () => {
  const db = makeSeed();
  await command(db, "setFavoriteSuppliers", {
    id_tipo_material: sid(40),
    id_proveedores: [],
    expected_id_proveedores: [sid(3), sid(4)],
  });
  assert.equal(db.tipos_materiales.length, 6);
  assert.equal(
    db.proveedores_favoritos.some((r) => r.id_tipo_material === sid(40)),
    false,
  );
});
test("favoritos: conflictos conservan la selección guardada y los reintentos idénticos son idempotentes", async () => {
  const db = makeSeed();
  const before = structuredClone(db);
  await assert.rejects(
    command(db, "setFavoriteSuppliers", {
      id_tipo_material: sid(40),
      id_proveedores: [],
      expected_id_proveedores: [],
    }),
    code("FAVORITES_CHANGED"),
  );
  assert.deepEqual(db, before);
  await command(db, "setFavoriteSuppliers", {
    id_tipo_material: sid(40),
    id_proveedores: [sid(4), sid(3)],
    expected_id_proveedores: [],
  });
  assert.deepEqual(db, before);
});
test("favoritos: fallo de un proveedor revierte todo el guardado y el archivo", async () => {
  const f = await file(makeSeed());
  const store = await JsonStore.open(f.path);
  await assert.rejects(
    store.transaction((db) =>
      command(db, "setFavoriteSuppliers", {
        id_tipo_material: sid(40),
        id_proveedores: [sid(3), sid(999)],
        expected_id_proveedores: [sid(3), sid(4)],
      }),
    ),
    code("NOT_FOUND"),
  );
  assert.equal(await readFile(f.path, "utf8"), f.raw);
});
test("favoritos: no admite cambios individuales por la API genérica", async () => {
  const db = makeSeed();
  await assert.rejects(
    command(db, "saveEntity", {
      entity: "proveedores_favoritos",
      row: { id_tipo_material: sid(40), id_proveedor: sid(3) },
    }),
  );
  await assert.rejects(
    command(db, "deleteEntity", {
      entity: "proveedores_favoritos",
      key: { id_tipo_material: sid(40), id_proveedor: sid(3) },
    }),
  );
});
test("favoritos: tipos y proveedores referenciados quedan protegidos por integridad", async () => {
  for (const entity of ["tipos_materiales", "proveedor"] as const) {
    const db = makeSeed();
    const previous = structuredClone(db);
    await command(db, "deleteEntity", {
      entity,
      key: { id: sid(entity === "proveedor" ? 3 : 40) },
    });
    assert.throws(() => validateDatabase(db, previous));
  }
});
test("favoritos: agrupación por IDs conserva homónimos, unión de tipos y otros proveedores elegibles", () => {
  const db = makeSeed();
  db.proveedor[2].nombre_largo = db.proveedor[3].nombre_largo;
  db.proveedor[4].Es_materiales = true;
  const groups = materialSupplierGroups(db, [sid(50), sid(51)]);
  assert.equal(groups.favorites.length, 2);
  assert.notEqual(groups.favorites[0].id, groups.favorites[1].id);
  assert.notEqual(
    supplierOptionLabel(groups.favorites[0], db.proveedor),
    supplierOptionLabel(groups.favorites[1], db.proveedor),
  );
  assert.ok(
    supplierOptionLabel(groups.favorites[0], db.proveedor).includes("NIT"),
  );
  assert.deepEqual(
    groups.others.map((p) => p.id),
    [sid(5)],
  );
  assert.equal(favoriteSupplierIds(db, [sid(50), sid(56), sid(51)]).size, 2);
  assert.equal(suggestedMaterial(db, sid(3))?.id_tipo_material, sid(40));
  assert.equal(suggestedMaterial(db, sid(999))?.id, db.materiales[0].id);
});

test("favoritos: rechaza proveedores de maquila, otros y bandera sin informar sin modificar la base", async () => {
  for (const [id, flag] of [
    [sid(1), false],
    [sid(5), false],
    [sid(5), null],
  ] as const) {
    const db = makeSeed();
    db.proveedor.find((p) => p.id === id)!.Es_materiales = flag;
    const f = await file(db);
    const store = await JsonStore.open(f.path);
    await assert.rejects(
      store.transaction((next) =>
        command(next, "setFavoriteSuppliers", {
          id_tipo_material: sid(40),
          id_proveedores: [sid(3), id],
          expected_id_proveedores: [sid(3), sid(4)],
        }),
      ),
      (error: unknown) => {
        assert.ok(error instanceof BusinessError);
        assert.equal(error.code, "VALIDATION");
        assert.match(error.message, /proveedores de materiales/);
        assert.ok(error.fields.id_proveedores);
        return true;
      },
    );
    assert.deepEqual(store.snapshot(), db);
    assert.equal(await readFile(f.path, "utf8"), f.raw);
  }
});

test("favoritos: materiales true admite proveedores mixtos e inactivos sin exigir otra bandera", async () => {
  const db = makeSeed();
  db.proveedor.find((p) => p.id === sid(1))!.Es_materiales = true;
  db.proveedor.find((p) => p.id === sid(3))!.activo = false;
  await command(db, "setFavoriteSuppliers", {
    id_tipo_material: sid(40),
    id_proveedores: [sid(1), sid(3)],
    expected_id_proveedores: [sid(3), sid(4)],
  });
  assert.deepEqual([...favoriteSupplierIds(db, [sid(50)])].sort(), [
    sid(1),
    sid(3),
  ]);
});

test("favoritos: repetir una selección heredada no omite la validación de materiales", async () => {
  const db = makeSeed();
  db.proveedor.find((p) => p.id === sid(3))!.Es_materiales = false;
  const before = structuredClone(db);
  await assert.rejects(
    command(db, "setFavoriteSuppliers", {
      id_tipo_material: sid(40),
      id_proveedores: [sid(3), sid(4)],
      expected_id_proveedores: [sid(3), sid(4)],
    }),
    code("VALIDATION"),
  );
  assert.deepEqual(db, before);
  assert.deepEqual([...favoriteSupplierIds(db, [sid(50)])], [sid(4)]);
  assert.ok(
    !materialSupplierGroups(db, [sid(50)]).favorites.some(
      (p) => p.id === sid(3),
    ),
  );
  await command(db, "setFavoriteSuppliers", {
    id_tipo_material: sid(40),
    id_proveedores: [sid(4)],
    expected_id_proveedores: [sid(3), sid(4)],
  });
  assert.deepEqual(
    db.proveedores_favoritos
      .filter((r) => r.id_tipo_material === sid(40))
      .map((r) => r.id_proveedor),
    [sid(4)],
  );
});

test("favoritos: vuelve a validar la bandera si cambia después de abrir el editor", async () => {
  const f = await file(makeSeed());
  const store = await JsonStore.open(f.path);
  await store.transaction((db) =>
    command(db, "saveEntity", {
      entity: "proveedor",
      key: { id: sid(4) },
      row: {
        ...db.proveedor.find((p) => p.id === sid(4)),
        Es_materiales: null,
      },
    }),
  );
  const before = store.snapshot();
  const raw = await readFile(f.path, "utf8");
  await assert.rejects(
    store.transaction((db) =>
      command(db, "setFavoriteSuppliers", {
        id_tipo_material: sid(40),
        id_proveedores: [sid(3), sid(4)],
        expected_id_proveedores: [sid(3), sid(4)],
      }),
    ),
    code("VALIDATION"),
  );
  assert.deepEqual(store.snapshot(), before);
  assert.equal(await readFile(f.path, "utf8"), raw);
});
