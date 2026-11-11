import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { addLineComment } from "../server/comments";
import { command } from "../server/domain";
import { BusinessError } from "../server/integrity";
import { JsonStore } from "../server/store";
import { receptionTables } from "../shared/reception-location";
import { makeSeed } from "../shared/seed";
import type { Row } from "../shared/schema";

const id = (value: number) => value.toString(16).padStart(24, "0");
const author = {
  id: "8ca7d4c6-fdc9-4320-94e5-0e625660903b",
  nombre: "Compras",
};
const databaseFile = async () => {
  await mkdir("tests/.tmp", { recursive: true });
  return join(await mkdtemp(resolve("tests/.tmp/reception-")), "database.json");
};
const newStore = async () => JsonStore.open(await databaseFile());
const run = (store: JsonStore, name: string, payload: Row) =>
  store.transaction((db) => command(db, name, payload));

test("migrar ubicaciones conserva el catálogo, los textos y el archivo original una sola vez", async () => {
  const seed = makeSeed();
  const { direccion, usuario: _user, comentario: _comment, ...rest } = seed;
  const legacy: Row = {
    ...rest,
    direccion_proveedor: direccion.map(
      ({ activa: _active, tipo: _type, ...row }) => row,
    ),
  };
  for (const table of receptionTables)
    legacy[table] = seed[table].map(
      ({ id_direccion: _address, ...row }) => row,
    );
  const file = await databaseFile();
  const original = JSON.stringify(legacy);
  await writeFile(file, original);
  const migrated = await JsonStore.open(file);
  assert.ok(migrated.receptionMigration);
  assert.equal(
    await readFile(migrated.receptionMigration.backup, "utf8"),
    original,
  );
  assert.deepEqual(migrated.snapshot(), seed);
  const after = await readFile(file, "utf8");
  assert.equal((await JsonStore.open(file)).receptionMigration, undefined);
  assert.equal(await readFile(file, "utf8"), after);
});

test("recepciones guardan el nombre histórico y admiten direcciones propias y de otro proveedor activo", async () => {
  const store = await newStore();
  const { row: own } = await run(store, "saveEntity", {
    entity: "direccion",
    row: { tipo: "propia", nombre_dir: " Bodega interna " },
  });
  await assert.rejects(
    run(store, "saveEntity", {
      entity: "direccion",
      row: { tipo: "proveedor", nombre_dir: "Sin proveedor" },
    }),
    BusinessError,
  );
  const entity = "orden_material";
  const material = store
    .snapshot()
    .orden_material.find((row) => row.id === id(140))!;
  await run(store, "saveReceipt", {
    entity,
    id: material.id,
    row: { id_direccion: own.id, ubicacion: "Nombre enviado por el cliente" },
  });
  assert.equal(
    store.snapshot().orden_material.find((row) => row.id === material.id)
      ?.ubicacion,
    "Bodega interna",
  );
  await run(store, "saveEntity", {
    entity: "direccion",
    key: own,
    row: { ...own, activa: false, nombre_dir: "Nombre nuevo" },
  });
  await run(store, "saveReceipt", {
    entity,
    id: material.id,
    row: { id_direccion: own.id },
  });
  assert.equal(
    store.snapshot().orden_material.find((row) => row.id === material.id)
      ?.ubicacion,
    "Bodega interna",
  );
  await assert.rejects(
    run(store, "saveReceipt", {
      entity,
      id: id(141),
      row: { id_direccion: own.id },
    }),
    BusinessError,
  );
  const supplier = store
    .snapshot()
    .direccion.find((row) => row.id_proveedor === id(1))!;
  await run(store, "saveReceipt", {
    entity,
    id: material.id,
    row: { id_direccion: supplier.id },
  });
  assert.equal(
    store.snapshot().orden_material.find((row) => row.id === material.id)
      ?.id_direccion,
    supplier.id,
  );
  const lot = store
    .snapshot()
    .lote_producto.find(
      (row) => row.numero_lote && row.id_orden_producto === id(110),
    )!;
  await run(store, "saveProductOrderSheet", {
    changes: [
      {
        entity: "lote_producto",
        id: lot.id,
        field: "id_direccion",
        expected: null,
        value: supplier.id,
      },
    ],
  });
  const saved = store.snapshot().lote_producto.find((row) => row.id === lot.id);
  assert.equal(saved?.id_direccion, supplier.id);
  assert.equal(saved?.ubicacion, supplier.nombre_dir);
});

test("sustituir un material comprueba el conjunto de comentarios y anular conserva el historial", async () => {
  const store = await newStore();
  const order = store
    .snapshot()
    .orden_compra.find((row) => row.id === id(121))!;
  const line = store
    .snapshot()
    .orden_material.find((row) => row.id_orden_compra === order.id)!;
  const lineWithState = id(140);
  await store.transaction((db) => {
    db.usuario.push(author);
    addLineComment(
      db,
      { tipo: "material", id: line.id, texto: "Primer mensaje" },
      author,
    );
    addLineComment(
      db,
      { tipo: "material", id: lineWithState, texto: "Conservar al anular" },
      author,
    );
  });
  await run(store, "setLineState", {
    entity: "orden_material",
    id: lineWithState,
    estado: "anulada",
  });
  const changed = {
    ...order,
    fecha_solicitada_entrega: "2026-10-14T12:00:00.000Z",
    lines: [{ ...line, id_material: id(52) }],
  };
  const confirmation = async (payload: Row, count: number) => {
    let revision = "";
    await assert.rejects(run(store, "editOrder", payload), (failure) => {
      assert.ok(failure instanceof BusinessError);
      assert.equal(failure.code, "COMMENT_REMOVAL");
      assert.equal(failure.details.count, count);
      revision = failure.details.revision;
      return true;
    });
    return { [order.id]: revision };
  };
  const previous = await confirmation(changed, 1);
  await store.transaction((db) =>
    addLineComment(
      db,
      { tipo: "material", id: line.id, texto: "Segundo mensaje" },
      author,
    ),
  );
  const current = await confirmation(
    { ...changed, confirmar_comentarios: previous },
    2,
  );
  assert.equal(store.snapshot().comentario.length, 3);
  await assert.rejects(
    run(store, "editOrder", {
      ...changed,
      lines: [{ ...line, id_material: id(51) }],
      confirmar_comentarios: current,
    }),
    (failure) => failure instanceof BusinessError && failure.code === "SUPPLY_CHANGED",
  );
  assert.equal(store.snapshot().comentario.length, 3);
  await run(store, "editOrder", { ...changed, confirmar_comentarios: current });
  assert.deepEqual(
    store.snapshot().comentario.map((row) => row.texto),
    ["Conservar al anular"],
  );
  assert.equal(
    store.snapshot().orden_material.find((row) => row.id === line.id)
      ?.id_material,
    id(52),
  );
});

test("reemplazar una OC exige confirmar los comentarios de sus renglones anteriores", async () => {
  const store = await newStore();
  const order = store.snapshot().orden_compra.find((row) => row.id === id(101))!;
  const oldLine = store.snapshot().orden_producto.find((row) => row.id_orden_compra === order.id)!;
  await store.transaction((db) => {
    db.usuario.push(author);
    addLineComment(db, { tipo: "producto", id: oldLine.id, texto: "Renglón del proveedor anterior" }, author);
  });
  const replacement = {
    ...order,
    id_proveedor: id(1),
    confirm: true,
    lines: [{ id_producto: id(70), cantidad_solicitada: 500, precio_unitario: "3200.00" }],
  };
  let revision = "";
  await assert.rejects(run(store, "editOrder", replacement), (failure) => {
    assert.ok(failure instanceof BusinessError);
    assert.equal(failure.code, "COMMENT_REMOVAL");
    assert.equal(failure.details.count, 1);
    revision = failure.details.revision;
    return true;
  });
  assert.equal(store.snapshot().comentario.length, 1);
  await run(store, "editOrder", { ...replacement, confirmar_comentarios: { [order.id]: revision } });
  const saved = store.snapshot();
  assert.equal(saved.comentario.length, 0);
  assert.ok(!saved.orden_producto.some((row) => row.id === oldLine.id));
  assert.ok(saved.orden_producto.some((row) => row.id_orden_compra === order.id && row.id_producto === id(70)));
});
