import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { command } from "../server/domain";
import { BusinessError } from "../server/integrity";
import { JsonStore } from "../server/store";
import { makeSeed, sid } from "../shared/seed";
import { materialCodeRequired, type Row } from "../shared/schema";
import { entityValidation, remainingFieldErrors } from "../src/live-validation";

async function fixture(t: test.TestContext) {
  const base = resolve("tests/.tmp");
  await mkdir(base, { recursive: true });
  const folder = await mkdtemp(join(base, "material-code-"));
  t.after(async () => {
    assert.ok(resolve(folder).startsWith(base + sep));
    await rm(folder, { recursive: true, force: true });
  });
  return JsonStore.open(join(folder, "database.json"));
}
const save = (store: JsonStore, row: Row, key?: Row) =>
  store.transaction((db) =>
    command(db, "saveEntity", { entity: "materiales", row, key }),
  );

test("corrugados: crear con código sin informar o null y editar conserva null al reiniciar", async (t) => {
  const store = await fixture(t);
  for (const extra of [{}, { codigo_material: null }]) {
    const result = await save(store, {
      id_tipo_material: sid(43),
      nombre_material: "Corrugado sin MAIA",
      ...extra,
    });
    assert.equal(result.row.codigo_material, null);
    await save(
      store,
      { ...result.row, nombre_material: "Corrugado editado" },
      { id: result.row.id },
    );
    const reopened = await JsonStore.open(store.file);
    assert.equal(
      reopened.snapshot().materiales.find((row) => row.id === result.row.id)!
        .codigo_material,
      null,
    );
  }
});

test("solo Corrugado admite crear materiales sin código; rechazar no altera el archivo", async (t) => {
  const store = await fixture(t);
  for (const type of store
    .snapshot()
    .tipos_materiales.filter((row) => row.id !== sid(43))) {
    for (const extra of [{}, { codigo_material: null }]) {
      const before = await readFile(store.file, "utf8");
      await assert.rejects(
        save(store, {
          id_tipo_material: type.id,
          nombre_material: "Sin MAIA",
          ...extra,
        }),
        (error: unknown) =>
          error instanceof BusinessError &&
          error.code === "R12" &&
          !!error.fields.codigo_material,
      );
      assert.equal(await readFile(store.file, "utf8"), before);
    }
  }
});

test("cambiar un corrugado sin código a otro tipo exige MAIA; cero y códigos únicos siguen admitidos", async (t) => {
  const store = await fixture(t);
  // MAIA conversion is exercised on an unused box; used boxes retain their semantic role.
  const box = (
    await save(store, {
      id_tipo_material: sid(43),
      nombre_material: "Corrugado sin uso",
    })
  ).row;
  await assert.rejects(
    save(store, { ...box, id_tipo_material: sid(40) }, { id: box.id }),
    (error: unknown) => error instanceof BusinessError && error.code === "R12",
  );
  await save(
    store,
    { ...box, id_tipo_material: sid(40), codigo_material: 0 },
    { id: box.id },
  );
  assert.equal(
    store.snapshot().materiales.find((row) => row.id === box.id)!
      .codigo_material,
    0,
  );
  await save(store, { ...box, codigo_material: null }, { id: box.id });
  assert.equal(
    store.snapshot().materiales.find((row) => row.id === box.id)!
      .codigo_material,
    null,
  );
});

test("corrugados con código mantienen las restricciones de rango y unicidad", async (t) => {
  const store = await fixture(t);
  for (const codigo_material of [-1, 1000, 101]) {
    await assert.rejects(
      save(store, {
        id_tipo_material: sid(43),
        nombre_material: "Código inválido",
        codigo_material,
      }),
      BusinessError,
    );
  }
});

test("validación en vivo: cambiar a Corrugado retira el error de código vacío, sin aceptar formatos inválidos", () => {
  const db = makeSeed();
  const fields = { codigo_material: "Introduce exactamente tres dígitos." };
  for (const codigo_material of [null, "", undefined]) {
    const row = { id_tipo_material: sid(40), codigo_material };
    assert.deepEqual(
      remainingFieldErrors(fields, entityValidation("materiales", row, db)),
      fields,
    );
    assert.deepEqual(
      remainingFieldErrors(
        fields,
        entityValidation(
          "materiales",
          { ...row, id_tipo_material: sid(43) },
          db,
        ),
      ),
      {},
    );
  }
  for (const codigo_material of ["12", "abc", "1000", "101"]) {
    assert.equal(
      entityValidation(
        "materiales",
        { id_tipo_material: sid(43), codigo_material },
        db,
      ).valid("codigo_material"),
      false,
    );
  }
  for (const codigo_material of ["000", "007", 7]) {
    assert.equal(
      entityValidation(
        "materiales",
        { id_tipo_material: sid(43), codigo_material },
        db,
      ).valid("codigo_material"),
      true,
    );
  }
  db.tipos_materiales.find((row) => row.id === sid(43))!.tipo_material =
    " CÓRRUGADO ";
  assert.equal(materialCodeRequired(db, sid(43)), false);
  assert.equal(materialCodeRequired(db, sid(40)), true);
  assert.equal(materialCodeRequired(db, "tipo-inexistente"), true);
});
