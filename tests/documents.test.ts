import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { JsonStore } from "../server/store";
import { command } from "../server/domain";
import { BusinessError, validateDatabase } from "../server/integrity";
import { makeSeed, sid } from "../shared/seed";
import { meta, type Row } from "../shared/schema";
import { validEntityField } from "../src/live-validation";

async function fixture(t: test.TestContext) {
  const root = resolve("tests/.tmp");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "documents-"));
  assert.ok(directory.startsWith(root + sep));
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(root + sep));
    await rm(directory, { recursive: true, force: true });
  });
  return JsonStore.open(join(directory, "database.json"));
}
const execute = (store: JsonStore, name: string, payload: Row) =>
  store.transaction((db) => command(db, name, payload));
const r07 = (error: unknown) =>
  error instanceof BusinessError &&
  error.code === "R07" &&
  error.fields.tipo_documento === "Solo se permite un documento vigente.";

test("cada OC y OCM admite una orden escaneada; reemplazar conserva identidad, propietario y cantidad de registros", async (t) => {
  const store = await fixture(t);
  for (const type of ["producto", "material", "otro"]) {
    const provider =
      type === "producto"
        ? sid(1)
        : type === "material"
          ? sid(3)
          : store
              .snapshot()
              .proveedor.find(
                (row) =>
                  row.Es_maquila === false && row.Es_materiales === false,
              )!.id;
    const item =
      type === "producto"
        ? { id_producto: sid(70) }
        : type === "material"
          ? { id_material: sid(50) }
          : { producto: "Servicio de prueba" };
    const order = await execute(store, "createOrder", {
      tipo_orden: type,
      id_proveedor: provider,
      fecha_solicitada_entrega: "2026-10-30T12:00:00.000Z",
      lines: [{ ...item, cantidad_solicitada: 100, precio_unitario: "125.00" }],
    });
    const payload = {
      tipo_entidad: "orden_compra",
      id_entidad: order.orderId,
      tipo_documento: "orden_compra_escaneada",
      nombre_archivo: "Orden-inicial.html",
    };
    const created = await execute(store, "saveDocument", payload);
    const before = store.snapshot();
    const fileBefore = await readFile(store.file, "utf8");
    await assert.rejects(
      execute(store, "saveDocument", {
        ...payload,
        nombre_archivo: "Segunda.html",
      }),
      r07,
    );
    assert.deepEqual(store.snapshot(), before);
    assert.equal(await readFile(store.file, "utf8"), fileBefore);
    const replaced = await execute(store, "saveDocument", {
      ...payload,
      id: created.row.id,
      nombre_archivo: "Orden-reemplazada.html",
    });
    assert.equal(replaced.row.id, created.row.id);
    assert.equal(replaced.row.tipo_entidad, payload.tipo_entidad);
    assert.equal(replaced.row.id_entidad, order.orderId);
    assert.equal(replaced.row.tipo_documento, payload.tipo_documento);
    assert.notEqual(
      replaced.row.clave_almacenamiento,
      created.row.clave_almacenamiento,
    );
    assert.equal(replaced.row.nombre_archivo, "Orden-reemplazada.html");
    assert.ok(
      Date.parse(replaced.row.fecha_carga) >=
        Date.parse(created.row.fecha_carga),
    );
    assert.deepEqual(
      store.snapshot().documento.filter((row) => row.id !== created.row.id),
      before.documento.filter((row) => row.id !== created.row.id),
    );
    assert.deepEqual(store.snapshot().orden_compra, before.orden_compra);
    assert.equal(store.snapshot().documento.length, before.documento.length);
  }
});

test("dos adjuntos simultáneos al mismo propietario guardan exactamente uno y rechazan el otro", async (t) => {
  const store = await fixture(t);
  const invoice = await execute(store, "createInvoice", {
    id_proveedor: sid(1),
    numero_factura: "UNICA-001",
  });
  const payload = {
    tipo_entidad: "factura",
    id_entidad: invoice.row.id,
    tipo_documento: "factura_fisica",
  };
  const before = store.snapshot();
  const results = await Promise.allSettled([
    execute(store, "saveDocument", {
      ...payload,
      nombre_archivo: "Primera.html",
    }),
    execute(store, "saveDocument", {
      ...payload,
      nombre_archivo: "Segunda.html",
    }),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && r07(rejected.reason));
  const after = store.snapshot();
  const documents = after.documento.filter(
    (row) => row.id_entidad === invoice.row.id,
  );
  assert.equal(documents.length, 1);
  assert.deepEqual(
    after.documento.filter((row) => row.id_entidad !== invoice.row.id),
    before.documento,
  );
  assert.deepEqual(after.factura, before.factura);
  assert.deepEqual(after.consecutivo_orden, before.consecutivo_orden);
  assert.deepEqual(JSON.parse(await readFile(store.file, "utf8")), after);
});

test("el documento incluido al crear factura es su único vigente y se puede reemplazar", async (t) => {
  const store = await fixture(t);
  const invoice = await execute(store, "createInvoice", {
    id_proveedor: sid(1),
    numero_factura: "CON-DOC-001",
    placeholder: true,
  });
  const document = store
    .snapshot()
    .documento.find((row) => row.id_entidad === invoice.row.id)!;
  const payload = {
    tipo_entidad: "factura",
    id_entidad: invoice.row.id,
    tipo_documento: "factura_fisica",
  };
  const before = store.snapshot();
  const fileBefore = await readFile(store.file, "utf8");
  await assert.rejects(execute(store, "saveDocument", payload), r07);
  assert.deepEqual(store.snapshot(), before);
  assert.equal(await readFile(store.file, "utf8"), fileBefore);
  await execute(store, "saveDocument", {
    ...payload,
    id: document.id,
    nombre_archivo: "Factura-corregida.html",
  });
  assert.deepEqual(store.snapshot().factura, before.factura);
  assert.equal(
    store
      .snapshot()
      .documento.filter((row) => row.id_entidad === invoice.row.id).length,
    1,
  );
  assert.equal(
    store.snapshot().documento.find((row) => row.id === document.id)!
      .nombre_archivo,
    "Factura-corregida.html",
  );
});

test("reemplazar rechaza cambiar propietario o clase y conserva estado y archivo completos", async (t) => {
  const store = await fixture(t);
  const document = store
    .snapshot()
    .documento.find((row) => row.tipo_documento === "factura_fisica")!;
  const another = await execute(store, "createInvoice", {
    id_proveedor: sid(1),
    numero_factura: "OTRO-DOC-001",
  });
  const before = store.snapshot();
  const fileBefore = await readFile(store.file, "utf8");
  for (const changes of [
    { id_entidad: another.row.id },
    {
      tipo_entidad: "orden_compra",
      id_entidad: before.orden_compra[0].id,
      tipo_documento: "orden_compra_escaneada",
    },
    { tipo_documento: "certificado_calidad" },
  ]) {
    await assert.rejects(
      execute(store, "saveDocument", { ...document, ...changes }),
      (error: unknown) =>
        error instanceof BusinessError && error.code === "R06",
    );
    assert.deepEqual(store.snapshot(), before);
    assert.equal(await readFile(store.file, "utf8"), fileBefore);
  }
});

test("modelo y validación en vivo identifican duplicados por propietario, incluyendo la plantilla global", () => {
  assert.ok(
    meta.tables.documento.unique.some(
      (fields) => fields.join(",") === "tipo_entidad,id_entidad,tipo_documento",
    ),
  );
  const db = makeSeed();
  for (const document of db.documento) {
    assert.equal(
      validEntityField("documento", "tipo_documento", document, db),
      false,
    );
    assert.equal(
      validEntityField("documento", "tipo_documento", document, db, document),
      true,
    );
    const duplicate = structuredClone(db);
    duplicate.documento.push({
      ...document,
      id: sid(990),
      clave_almacenamiento: "placeholder/duplicado",
    });
    assert.throws(() => validateDatabase(duplicate), r07);
  }
});
