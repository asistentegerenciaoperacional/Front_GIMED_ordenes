import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { makeSeed, sid } from "../shared/seed";
import type { Database } from "../shared/models";
import type { Row } from "../shared/schema";
import { recommendations } from "../shared/schema";
import {
  materialCatalogIssue,
  materialRole,
  materialTypeRole,
  productMaterialConfig,
  productMaterialConfigIssue,
  productMaterialsDatabaseIssue,
  type ProductMaterialConfig,
} from "../shared/product-materials";
import { command } from "../server/domain";
import { BusinessError, validateDatabase } from "../server/integrity";
import { JsonStore } from "../server/store";
import { validEntityField } from "../src/live-validation";

const productId = sid(70);
const box = { id_material: sid(53), unidades_por_corrugado: 24 };
const empty: ProductMaterialConfig = { id_materiales: [], corrugado: null };
const execute = (store: JsonStore, name: string, payload: Row) =>
  store.transaction((db) => command(db, name, payload));
const failure = (code: string, field?: string) => (error: unknown) =>
  error instanceof BusinessError &&
  error.code === code &&
  (!field || Boolean(error.fields[field]));

async function temporary(t: TestContext) {
  const parent = resolve("tests/.tmp");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "gimed-product-materials-"));
  assert.ok(resolve(directory).startsWith(parent + sep));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function fixture(t: TestContext) {
  return JsonStore.open(join(await temporary(t), "database.json"));
}
function payload(db: Database, config: ProductMaterialConfig, id = productId) {
  return {
    id_producto: id,
    ...config,
    expected: productMaterialConfig(db, id),
  };
}
function extraMaterial(id: number, type = 40) {
  return {
    id: sid(id),
    codigo_material: id % 1000,
    nombre_material: "Material con nombre repetido",
    id_tipo_material: sid(type),
  };
}

test("materiales por producto: roles compartidos y configuración por identificador estable", () => {
  const db = makeSeed();
  assert.equal(materialRole(db, sid(53)), "corrugado");
  assert.equal(materialRole(db, sid(54)), "sticker");
  assert.equal(materialRole(db, sid(55)), "cinta");
  assert.equal(materialRole(db, sid(50)), "general");
  assert.equal(materialTypeRole("  CÍNTA  "), "cinta");
  assert.equal(materialTypeRole("Cinta o sticker"), "ambiguous");
  assert.equal(materialTypeRole("  CORRUGADO  "), "corrugado");
  assert.deepEqual(productMaterialConfig(db, productId), {
    id_materiales: [sid(50), sid(51), sid(54)],
    corrugado: box,
  });
  const config = productMaterialConfig(db, productId);
  config.id_materiales.length = 0;
  config.corrugado!.unidades_por_corrugado = 99;
  assert.deepEqual(productMaterialConfig(db, productId).corrugado, box);
  assert.equal(productMaterialConfig(db, productId).id_materiales.length, 3);
});

test("materiales por producto: guardar ambos bloques es atómico y conserva otras relaciones e historial", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const config = {
    id_materiales: [sid(55), sid(51)],
    corrugado: { ...box, unidades_por_corrugado: 36 },
  };
  const saved = await execute(
    store,
    "setProductMaterials",
    payload(before, config),
  );
  assert.deepEqual(saved.config, {
    ...config,
    id_materiales: [sid(51), sid(55)],
  });
  const after = store.snapshot();
  for (const entity of Object.keys(before) as (keyof Database)[]) {
    if (entity === "materiales_asociados" || entity === "producto_corrugado") {
      assert.deepEqual(
        (after[entity] as Row[]).filter((row) => row.id_producto !== productId),
        (before[entity] as Row[]).filter(
          (row) => row.id_producto !== productId,
        ),
      );
    } else assert.deepEqual(after[entity], before[entity], entity);
  }
  assert.deepEqual((await JsonStore.open(store.file)).snapshot(), after);
});

test("materiales por producto: permite ninguno, sin corrugado, y selecciones vacías", async (t) => {
  const store = await fixture(t);
  await execute(store, "setProductMaterials", payload(store.snapshot(), empty));
  assert.deepEqual(productMaterialConfig(store.snapshot(), productId), empty);
  await execute(
    store,
    "setProductMaterials",
    payload(store.snapshot(), { id_materiales: [sid(54)], corrugado: null }),
  );
  assert.deepEqual(productMaterialConfig(store.snapshot(), productId), {
    id_materiales: [sid(54)],
    corrugado: null,
  });
});

test("materiales por producto: listas repetidas y nombres iguales se resuelven por ID", async (t) => {
  const store = await fixture(t);
  for (const id of [801, 802])
    await execute(store, "saveEntity", {
      entity: "materiales",
      row: extraMaterial(id),
    });
  const before = store.snapshot();
  const selected = [sid(802), sid(801), sid(802)];
  const result = await execute(
    store,
    "setProductMaterials",
    payload(before, { id_materiales: selected, corrugado: null }),
  );
  assert.deepEqual(result.config.id_materiales, [sid(801), sid(802)]);
  assert.equal(
    store
      .snapshot()
      .materiales.filter(
        (row) => row.nombre_material === "Material con nombre repetido",
      ).length,
    2,
  );
});

test("materiales por producto: referencias inexistentes y payload incompleto no escriben parcialmente", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const bytes = await readFile(store.file, "utf8");
  const cases: [Row, string, string?][] = [
    [
      { ...payload(before, empty), id_producto: sid(999) },
      "FOREIGN_KEY",
      "id_producto",
    ],
    [
      payload(before, { ...empty, id_materiales: [sid(999)] }),
      "FOREIGN_KEY",
      "id_materiales",
    ],
    [
      payload(before, {
        ...empty,
        corrugado: { ...box, id_material: sid(999) },
      }),
      "FOREIGN_KEY",
      "corrugado.id_material",
    ],
    [
      { ...payload(before, empty), id_materiales: "no es una lista" },
      "TYPE",
      "id_materiales",
    ],
    [
      { ...payload(before, empty), corrugado: undefined },
      "TYPE",
      "corrugado.id_material",
    ],
    [
      { ...payload(before, empty), expected: undefined },
      "TYPE",
      "id_materiales",
    ],
    [{ ...payload(before, empty), expected: [] }, "TYPE", "id_materiales"],
    [
      { ...payload(before, empty), expected: { id_materiales: [] } },
      "TYPE",
      "corrugado.id_material",
    ],
  ];
  for (const [value, code, field] of cases) {
    await assert.rejects(
      execute(store, "setProductMaterials", value),
      failure(code, field),
    );
    assert.deepEqual(store.snapshot(), before);
    assert.equal(await readFile(store.file, "utf8"), bytes);
  }
});

test("materiales por producto: capacidades positivas, enteras y seguras; corrugado exclusivo de su sección", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  for (const capacity of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    "24",
    null,
  ]) {
    const value = {
      id_materiales: [],
      corrugado: { ...box, unidades_por_corrugado: capacity },
    };
    await assert.rejects(
      execute(store, "setProductMaterials", {
        ...value,
        id_producto: productId,
        expected: productMaterialConfig(before, productId),
      }),
      failure("PRODUCT_MATERIALS", "corrugado.unidades_por_corrugado"),
    );
  }
  for (const id_material of [sid(50), sid(54), sid(55)])
    await assert.rejects(
      execute(
        store,
        "setProductMaterials",
        payload(before, { ...empty, corrugado: { ...box, id_material } }),
      ),
      failure("PRODUCT_MATERIALS", "corrugado.id_material"),
    );
  await assert.rejects(
    execute(
      store,
      "setProductMaterials",
      payload(before, { id_materiales: [sid(53)], corrugado: null }),
    ),
    failure("PRODUCT_MATERIALS", "id_materiales"),
  );
  assert.deepEqual(store.snapshot(), before);
});

test("materiales por producto: sticker y cinta se excluyen también por el comando y API antiguos", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  await assert.rejects(
    execute(
      store,
      "setProductMaterials",
      payload(before, { id_materiales: [sid(54), sid(55)], corrugado: box }),
    ),
    failure("R13", "id_materiales"),
  );
  await assert.rejects(
    execute(store, "saveEntity", {
      entity: "materiales_asociados",
      row: { id_producto: productId, id_material: sid(55) },
    }),
    failure("R13"),
  );
  assert.deepEqual(store.snapshot(), before);
});

test("materiales por producto: conflicto de configuración conserva el borrador y devuelve el estado vigente", async (t) => {
  const store = await fixture(t);
  const first = payload(store.snapshot(), {
    id_materiales: [sid(50)],
    corrugado: box,
  });
  const stale = payload(store.snapshot(), empty);
  await execute(store, "setProductMaterials", first);
  const after = store.snapshot();
  const bytes = await readFile(store.file, "utf8");
  const originalDraft = structuredClone(stale);
  await assert.rejects(
    execute(store, "setProductMaterials", stale),
    (error: unknown) => {
      assert.ok(error instanceof BusinessError);
      assert.equal(error.code, "PRODUCT_MATERIALS_CHANGED");
      assert.deepEqual(
        error.details.current,
        productMaterialConfig(after, productId),
      );
      return true;
    },
  );
  assert.deepEqual(stale, originalDraft);
  assert.deepEqual(store.snapshot(), after);
  assert.equal(await readFile(store.file, "utf8"), bytes);
  await execute(store, "setProductMaterials", payload(after, empty));
});

test("materiales por producto: capacidad concurrente y conjunto original sin orden también se comparan", async (t) => {
  const store = await fixture(t);
  const original = store.snapshot();
  const unchanged = payload(
    original,
    productMaterialConfig(original, productId),
  );
  unchanged.expected.id_materiales.reverse();
  await execute(store, "setProductMaterials", unchanged);
  const oldCapacity = payload(store.snapshot(), empty);
  await execute(
    store,
    "setProductMaterials",
    payload(store.snapshot(), {
      id_materiales: [],
      corrugado: { ...box, unidades_por_corrugado: 48 },
    }),
  );
  await assert.rejects(
    execute(store, "setProductMaterials", oldCapacity),
    failure("PRODUCT_MATERIALS_CHANGED"),
  );
});

test("materiales por producto: solicitudes concurrentes no sobrescriben silenciosamente la selección", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const outcomes = await Promise.allSettled([
    execute(
      store,
      "setProductMaterials",
      payload(before, { id_materiales: [sid(50)], corrugado: null }),
    ),
    execute(
      store,
      "setProductMaterials",
      payload(before, { id_materiales: [sid(51)], corrugado: box }),
    ),
  ]);
  assert.equal(outcomes.filter((row) => row.status === "fulfilled").length, 1);
  const rejected = outcomes.find(
    (row) => row.status === "rejected",
  ) as PromiseRejectedResult;
  assert.equal(rejected.reason.code, "PRODUCT_MATERIALS_CHANGED");
  assert.deepEqual(productMaterialConfig(store.snapshot(), productId), {
    id_materiales: [sid(50)],
    corrugado: null,
  });
  assert.deepEqual(
    (await JsonStore.open(store.file)).snapshot(),
    store.snapshot(),
  );
});

test("materiales por producto: solo un material global de cada tipo adhesivo; editar el mismo sí se permite", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  for (const type of [44, 45])
    await assert.rejects(
      execute(store, "saveEntity", {
        entity: "materiales",
        row: extraMaterial(810 + type, type),
      }),
      failure("MATERIAL_SINGLETON", "id_tipo_material"),
    );
  const existing = before.materiales.find((row) => row.id === sid(55))!;
  await execute(store, "saveEntity", {
    entity: "materiales",
    key: { id: existing.id },
    row: { ...existing, nombre_material: "Cinta actualizada" },
  });
  assert.equal(
    store.snapshot().materiales.find((row) => row.id === existing.id)!
      .nombre_material,
    "Cinta actualizada",
  );
});

test("materiales por producto: unicidad global comprende tipos equivalentes y dos altas simultáneas", async (t) => {
  const store = await fixture(t);
  await execute(store, "saveEntity", {
    entity: "tipos_materiales",
    row: { id: sid(900), tipo_material: " CÍNTA " },
  });
  await assert.rejects(
    execute(store, "saveEntity", {
      entity: "materiales",
      row: { ...extraMaterial(901), id_tipo_material: sid(900) },
    }),
    failure("MATERIAL_SINGLETON"),
  );
  await execute(
    store,
    "setProductMaterials",
    payload(store.snapshot(), empty, sid(71)),
  );
  await execute(store, "deleteEntity", {
    entity: "materiales",
    key: { id: sid(55) },
  });
  const results = await Promise.allSettled(
    [902, 903].map((id) =>
      execute(store, "saveEntity", {
        entity: "materiales",
        row: extraMaterial(id, 45),
      }),
    ),
  );
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(results.filter((row) => row.status === "rejected").length, 1);
  assert.equal(
    store
      .snapshot()
      .materiales.filter(
        (row) => materialRole(store.snapshot(), row.id) === "cinta",
      ).length,
    1,
  );
});

test("materiales por producto: reintipar material usado o cambiar significado de tipo con materiales queda bloqueado", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  for (const [id, name] of [
    [40, "Corrugado"],
    [44, "Etiqueta especial"],
    [45, "Sticker especial"],
    [43, "Envase especial"],
  ] as const)
    await assert.rejects(
      execute(store, "saveEntity", {
        entity: "tipos_materiales",
        key: { id: sid(id) },
        row: { id: sid(id), tipo_material: name },
      }),
      failure("R13", "tipo_material"),
    );
  for (const [id, target] of [
    [50, 43],
    [54, 40],
    [55, 44],
    [53, 40],
  ]) {
    const material = before.materiales.find((row) => row.id === sid(id))!;
    await assert.rejects(
      execute(store, "saveEntity", {
        entity: "materiales",
        key: { id: material.id },
        row: {
          ...material,
          codigo_material: material.codigo_material ?? 990,
          id_tipo_material: sid(target),
        },
      }),
      failure("R13", "id_tipo_material"),
    );
  }
  assert.deepEqual(store.snapshot(), before);
  await execute(store, "saveEntity", {
    entity: "tipos_materiales",
    key: { id: sid(45) },
    row: { id: sid(45), tipo_material: "  CÍNTA  " },
  });
  assert.equal(materialRole(store.snapshot(), sid(55)), "cinta");
});

test("materiales por producto: roles ambiguos rechazados y tipo vacío permite cambiar significado", async (t) => {
  const store = await fixture(t);
  await assert.rejects(
    execute(store, "saveEntity", {
      entity: "tipos_materiales",
      row: { id: sid(910), tipo_material: "Cinta y sticker" },
    }),
    failure("PRODUCT_MATERIALS", "tipo_material"),
  );
  await execute(store, "saveEntity", {
    entity: "tipos_materiales",
    row: { id: sid(911), tipo_material: "General vacío" },
  });
  await execute(store, "saveEntity", {
    entity: "tipos_materiales",
    key: { id: sid(911) },
    row: { id: sid(911), tipo_material: "Sticker alternativo" },
  });
  assert.equal(
    materialTypeRole(
      store.snapshot().tipos_materiales.find((row) => row.id === sid(911))!
        .tipo_material,
    ),
    "sticker",
  );
});

test("materiales por producto: validación de catálogo en vivo comparte las restricciones del servicio", () => {
  const db = makeSeed();
  const fresh = extraMaterial(920, 45);
  assert.equal(
    materialCatalogIssue(db, "materiales", fresh)?.code,
    "MATERIAL_SINGLETON",
  );
  assert.equal(
    validEntityField("materiales", "id_tipo_material", fresh, db),
    false,
  );
  const existing = db.materiales.find((row) => row.id === sid(55))!;
  assert.equal(
    validEntityField("materiales", "id_tipo_material", existing, db, existing),
    true,
  );
  const kind = db.tipos_materiales.find((row) => row.id === sid(45))!;
  assert.equal(
    validEntityField(
      "tipos_materiales",
      "tipo_material",
      { ...kind, tipo_material: "Otra categoría" },
      db,
      kind,
    ),
    false,
  );
  assert.equal(
    validEntityField(
      "tipos_materiales",
      "tipo_material",
      { ...kind, tipo_material: "  CÍNTA  " },
      db,
      kind,
    ),
    true,
  );
});

test("materiales por producto: integridad completa detecta formas inválidas incluso por APIs individuales", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  for (const row of [
    {
      id_producto: productId,
      id_material: sid(50),
      unidades_por_corrugado: 24,
    },
    { id_producto: productId, id_material: sid(53), unidades_por_corrugado: 0 },
  ])
    await assert.rejects(
      execute(store, "saveEntity", {
        entity: "producto_corrugado",
        key: { id_producto: productId },
        row,
      }),
      failure("PRODUCT_MATERIALS"),
    );
  await assert.rejects(
    execute(store, "saveEntity", {
      entity: "materiales_asociados",
      row: { id_producto: productId, id_material: sid(53) },
    }),
    failure("PRODUCT_MATERIALS"),
  );
  for (const entity of ["materiales", "tipos_materiales"] as const) {
    const id = entity === "materiales" ? sid(53) : sid(43);
    await assert.rejects(
      execute(store, "deleteEntity", { entity, key: { id } }),
      failure("FOREIGN_KEY"),
    );
  }
  assert.deepEqual(store.snapshot(), before);
});

test("materiales por producto: base antigua inválida conserva exactamente el archivo sin migraciones destructivas", async (t) => {
  const directory = await temporary(t);
  const invalids: Database[] = [];
  const duplicate = makeSeed();
  duplicate.materiales.push(extraMaterial(930, 44));
  invalids.push(duplicate);
  const capacity = makeSeed();
  capacity.producto_corrugado[0].unidades_por_corrugado = 0;
  invalids.push(capacity);
  const misplaced = makeSeed();
  misplaced.materiales_asociados.push({
    id_producto: productId,
    id_material: sid(53),
  });
  invalids.push(misplaced);
  for (let index = 0; index < invalids.length; index++) {
    const file = join(directory, `invalid-${index}.json`);
    const original = JSON.stringify(invalids[index], null, 3) + "\n";
    await writeFile(file, original);
    await assert.rejects(JsonStore.open(file), BusinessError);
    assert.equal(await readFile(file, "utf8"), original);
  }
});

test("materiales por producto: cambio directo del snapshot no omite protección semántica de tipos ni materiales", () => {
  const old = makeSeed();
  const renamed = structuredClone(old);
  renamed.tipos_materiales.find((row) => row.id === sid(45))!.tipo_material =
    "Otro";
  assert.equal(productMaterialsDatabaseIssue(renamed, old)?.code, "R13");
  assert.throws(() => validateDatabase(renamed, old), failure("R13"));
  const retyped = structuredClone(old);
  retyped.materiales.find((row) => row.id === sid(55))!.id_tipo_material =
    sid(40);
  assert.throws(() => validateDatabase(retyped, old), failure("R13"));
});

test("materiales por producto: recomendaciones siguen relaciones guardadas y las órdenes previas son inmutables", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const originalOrders = structuredClone(before.orden_producto);
  await execute(
    store,
    "setProductMaterials",
    payload(before, {
      id_materiales: [sid(55)],
      corrugado: { ...box, unidades_por_corrugado: 12 },
    }),
  );
  const rec = recommendations(store.snapshot(), productId, 4001);
  assert.equal(rec.cantidad_cinta, 2);
  assert.equal(rec.cantidad_sticker, null);
  assert.equal(rec.cantidad_corrugado, 339);
  assert.deepEqual(store.snapshot().orden_producto, originalOrders);
  assert.equal(
    productMaterialConfigIssue(store.snapshot(), productId, empty),
    null,
  );
});
