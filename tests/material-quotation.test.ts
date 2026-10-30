import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { command, type MailTransport } from "../server/domain";
import { materialQuotationPreview } from "../server/material-quotation";
import { BusinessError, validateDatabase } from "../server/integrity";
import { JsonStore } from "../server/store";
import { isMaterialSupplier } from "../shared/favorite-suppliers";
import {
  buildMaterialNeeds,
  consolidateMaterialSources,
  groupMaterialSources,
  needsInRange,
} from "../shared/material-demand";
import {
  createMaterialQuotation,
  defaultQuotationTemplate,
  quotationContacts,
  quotationEvent,
  quotationTemplate,
  quotationTemplateIssues,
  refreshMaterialQuotation,
} from "../shared/material-quotation";
import type { Database } from "../shared/models";
import { sid } from "../shared/seed";
import {
  addDemandMaterials,
  DEMAND_RANGE,
  makeMaterialDemandFixture,
} from "./fixtures/material-demand";

const needs = (db: Database) =>
  needsInRange(buildMaterialNeeds(db), DEMAND_RANGE.desde, DEMAND_RANGE.hasta);
const draftFor = (db: Database) => {
  const draft = createMaterialQuotation(db, {
    ...DEMAND_RANGE,
    fuentes: needs(db).map((n) => n.source),
  });
  // One eligible supplier across every material demonstrates per-pair delivery.
  const provider = db.proveedor.find(isMaterialSupplier)!;
  const contact = db.contacto.find((c) => c.id_proveedor === provider.id)!;
  draft.materiales = draft.materiales.map((m) => ({
    ...m,
    proveedor_ids: [provider.id],
  }));
  draft.destinatarios = [
    {
      id_proveedor: provider.id,
      id_contacto: contact.id,
      correo: contact.correo!,
    },
  ];
  return draft;
};
const isError = (code: string) => (cause: unknown) =>
  cause instanceof BusinessError && cause.code === code;
async function fixture(
  t: TestContext,
  seed: () => Database = makeMaterialDemandFixture,
) {
  const root = resolve("tests/.tmp");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "material-quotation-"));
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(root + sep));
    await rm(directory, { recursive: true, force: true });
  });
  return JsonStore.open(join(directory, "database.json"), seed);
}

test("cotización agrupa más de siete materiales por ID y mantiene el límite independiente de OCM", () => {
  const db = addDemandMaterials(makeMaterialDemandFixture());
  const sources = needs(db).map((n) => n.source);
  const groups = groupMaterialSources(sources);
  assert.equal(groups.length, 9);
  assert.throws(() => consolidateMaterialSources(sources), /siete/);
  const draft = draftFor(db);
  const before = structuredClone(db);
  const preview = materialQuotationPreview(db, draft);
  assert.equal(preview.materiales.length, 9);
  assert.equal(preview.messages.length, 9);
  assert.deepEqual(preview.issues, {});
  assert.equal(
    preview.materiales.filter(
      (m) => m.material === "Envase con nombre repetido",
    ).length,
    2,
  );
  const first = preview.materiales.find((m) => m.id_material === sid(50))!;
  const group = groups.find((m) => m.id_material === sid(50))!;
  assert.equal(group.cantidad_base, 3000);
  assert.equal(
    first.cantidad,
    3300,
    "El 10 % exacto no agrega una unidad por error de punto flotante",
  );
  assert.equal(first.fecha_entrega, "2027-02-15");
  assert.deepEqual(db, before, "Previsualizar no modifica datos");
});

test("favoritos y reglas resuelven un único contacto por proveedor, sin inferir cuando hay varios", () => {
  const db = makeMaterialDemandFixture();
  const recipient = draftFor(db).destinatarios[0];
  const material = db.materiales.find((m) => m.id === sid(50))!;
  db.proveedores_favoritos.push({
    id_tipo_material: material.id_tipo_material,
    id_proveedor: sid(1),
  });
  const initial = createMaterialQuotation(db, {
    ...DEMAND_RANGE,
    fuentes: needs(db).map((n) => n.source),
  });
  assert.ok(
    initial.materiales.every((m) => !m.proveedor_ids.includes(sid(1))),
    "Solo proveedores de materiales",
  );
  assert.equal(
    initial.destinatarios.find((r) => r.id_proveedor === recipient.id_proveedor)
      ?.id_contacto,
    recipient.id_contacto,
  );
  const first = db.contacto.find((c) => c.id === recipient.id_contacto)!;
  db.contacto.push({
    ...first,
    id: sid(8001),
    nombre: "Duplicado",
    correo: first.correo!.toUpperCase(),
  });
  assert.equal(
    quotationContacts(db, recipient.id_proveedor).suggested.length,
    1,
    "Misma dirección no crea ambigüedad",
  );
  db.contacto.push({ ...first, id: sid(8002), correo: "segundo@ejemplo.com" });
  const ambiguous = createMaterialQuotation(
    db,
    initial.demanda,
  ).destinatarios.find((r) => r.id_proveedor === recipient.id_proveedor)!;
  assert.equal(ambiguous.id_contacto, null);
  assert.equal(ambiguous.correo, "");
  db.destinatario_evento = db.destinatario_evento.filter(
    (r) => r.tipo_evento !== quotationEvent,
  );
  assert.equal(
    quotationContacts(db, recipient.id_proveedor).suggested.length,
    0,
  );
  assert.ok(
    quotationContacts(db, recipient.id_proveedor).contacts.length > 0,
    "Directorio disponible sin reglas",
  );
});

test("cada material requiere proveedor y cada proveedor incluido un destinatario válido", () => {
  const db = makeMaterialDemandFixture();
  const draft = draftFor(db);
  draft.materiales[0].proveedor_ids = [];
  assert.ok(
    materialQuotationPreview(db, draft).issues["materiales.0.proveedor_ids"],
  );
  draft.materiales[0].proveedor_ids = [draft.destinatarios[0].id_proveedor];
  draft.destinatarios[0].id_contacto = null;
  draft.destinatarios[0].correo = "incorrecto";
  assert.ok(
    materialQuotationPreview(db, draft).issues[
      `destinatarios.${draft.destinatarios[0].id_proveedor}`
    ],
  );
  draft.destinatarios[0].correo = "manual@ejemplo.com";
  assert.deepEqual(materialQuotationPreview(db, draft).issues, {});
  assert.ok(
    materialQuotationPreview(db, draft).messages.every(
      (m) =>
        m.recipient.address === "manual@ejemplo.com" &&
        m.recipient.type === "para",
    ),
  );
});

test("no admite contactos de otro proveedor, destinatarios duplicados ni proveedores sin rol de materiales", () => {
  const db = makeMaterialDemandFixture();
  const draft = draftFor(db);
  draft.destinatarios[0].id_contacto = db.contacto.find(
    (c) => c.id_proveedor !== draft.destinatarios[0].id_proveedor,
  )!.id;
  assert.ok(Object.keys(materialQuotationPreview(db, draft).issues).length);
  const repeated = draftFor(db);
  repeated.destinatarios.push({ ...repeated.destinatarios[0] });
  assert.throws(
    () => materialQuotationPreview(db, repeated),
    /solo destinatario/,
  );
  const ineligible = draftFor(db);
  db.proveedor.find(
    (p) => p.id === ineligible.destinatarios[0].id_proveedor,
  )!.Es_materiales = false;
  assert.throws(
    () => materialQuotationPreview(db, ineligible),
    isError("QUOTATION_CHANGED"),
  );
});

test("permite un proveedor de materiales que no sea favorito y mantiene intacto el directorio", () => {
  const db = makeMaterialDemandFixture();
  const draft = draftFor(db);
  const provider = db.proveedor.find(
    (p) => p.id === draft.destinatarios[0].id_proveedor,
  )!;
  db.proveedores_favoritos = db.proveedores_favoritos.filter(
    (r) => r.id_proveedor !== provider.id,
  );
  const before = structuredClone(db);
  assert.deepEqual(materialQuotationPreview(db, draft).issues, {});
  assert.deepEqual(db, before);
});

test("plantilla común sustituye variables por mensaje y conserva datos con llaves sin evaluarlos", () => {
  const db = makeMaterialDemandFixture();
  const draft = draftFor(db);
  db.materiales.find(
    (m) => m.id === draft.materiales[0].id_material,
  )!.nombre_material = "Envase {{desconocido}}";
  const first = materialQuotationPreview(db, draft).messages[0];
  assert.match(first.subject, /Envase {{desconocido}}/);
  assert.match(first.body, /Cantidad: \d+ unidades/);
  assert.match(first.body, /15\/02\/2027/);
  for (const invalid of ["", "{{desconocido}}", "{{material", "material}}"])
    assert.ok(
      quotationTemplateIssues({ asunto: invalid, cuerpo: "Texto" }).asunto,
    );
  assert.ok(quotationTemplateIssues({ asunto: "Asunto", cuerpo: " " }).cuerpo);
  assert.ok(
    quotationTemplateIssues({ asunto: "Asunto\nCabecera", cuerpo: "Texto" })
      .asunto,
  );
  assert.deepEqual(quotationTemplateIssues(defaultQuotationTemplate), {});
});

test("fuentes manipuladas, repetidas o materiales ajenos no se cotizan", () => {
  const db = makeMaterialDemandFixture();
  const draft = draftFor(db);
  draft.demanda.fuentes[0].cantidad_solicitada++;
  assert.throws(
    () => materialQuotationPreview(db, draft),
    isError("QUOTATION_CHANGED"),
  );
  const repeated = draftFor(db);
  repeated.demanda.fuentes.push({ ...repeated.demanda.fuentes[0] });
  assert.throws(() => materialQuotationPreview(db, repeated), /repetido/);
  const foreign = draftFor(db);
  foreign.materiales[0].id_material = sid(53);
  assert.throws(() => materialQuotationPreview(db, foreign), /exactamente/);
  const invalid = draftFor(db);
  invalid.materiales[0].adicional_pct = 11;
  assert.throws(
    () => materialQuotationPreview(db, invalid),
    isError("VALIDATION"),
  );
  invalid.materiales[0].adicional_pct = 10;
  invalid.materiales[0].cantidad = 0;
  assert.throws(
    () => materialQuotationPreview(db, invalid),
    isError("VALIDATION"),
  );
});

test("envío por material-proveedor reutiliza transporte, registra un Para por mensaje y no compra materiales", async (t) => {
  const store = await fixture(t, () =>
    addDemandMaterials(makeMaterialDemandFixture()),
  );
  const before = store.snapshot();
  const draft = draftFor(before);
  const preview = materialQuotationPreview(before, draft);
  const delivered: Parameters<MailTransport>[0][] = [];
  await store.transaction((db) =>
    command(
      db,
      "sendMaterialQuotations",
      { borrador: draft, expected_revision: preview.revision },
      async (message) => {
        delivered.push(message);
        return `quote-${delivered.length}`;
      },
    ),
  );
  assert.equal(delivered.length, 9);
  assert.ok(
    delivered.every(
      (message) =>
        message.recipients.length === 1 &&
        message.recipients[0].type === "para" &&
        message.documents.length === 0 &&
        message.subject &&
        message.event === quotationEvent,
    ),
  );
  const expected = structuredClone(before);
  const after = store.snapshot();
  assert.equal(after.correo_enviado.length - before.correo_enviado.length, 9);
  assert.equal(
    after.correo_enviado_destinatario.length -
      before.correo_enviado_destinatario.length,
    9,
  );
  expected.correo_enviado = after.correo_enviado;
  expected.correo_enviado_destinatario = after.correo_enviado_destinatario;
  assert.deepEqual(after, expected);
  assert.deepEqual((await JsonStore.open(store.file)).snapshot(), after);
});

test("un fallo del simulador no deja registros parciales ni cambia el archivo", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot(),
    file = await readFile(store.file, "utf8");
  const draft = draftFor(before),
    preview = materialQuotationPreview(before, draft);
  let calls = 0;
  await assert.rejects(
    store.transaction((db) =>
      command(
        db,
        "sendMaterialQuotations",
        { borrador: draft, expected_revision: preview.revision },
        async () => {
          if (++calls === 2) throw new Error("Fallo de prueba");
          return "first-sim";
        },
      ),
    ),
    /Fallo de prueba/,
  );
  assert.equal(calls, 2);
  assert.deepEqual(store.snapshot(), before);
  assert.equal(await readFile(store.file, "utf8"), file);
});

test("sin revisión vigente no se entrega ningún mensaje; cambios de contactos requieren revisar", async (t) => {
  const store = await fixture(t);
  const draft = draftFor(store.snapshot()),
    preview = materialQuotationPreview(store.snapshot(), draft);
  let calls = 0;
  const transport: MailTransport = async () => {
    calls++;
    return "unexpected";
  };
  await store.transaction((db) => {
    db.contacto.find(
      (c) => c.id === draft.destinatarios[0].id_contacto,
    )!.correo = "actualizado@ejemplo.com";
  });
  const before = store.snapshot();
  await assert.rejects(
    store.transaction((db) =>
      command(
        db,
        "sendMaterialQuotations",
        { borrador: draft, expected_revision: preview.revision },
        transport,
      ),
    ),
    isError("QUOTATION_CHANGED"),
  );
  assert.equal(calls, 0);
  assert.deepEqual(store.snapshot(), before);
  const refreshed = materialQuotationPreview(store.snapshot(), draft);
  assert.notEqual(refreshed.revision, preview.revision);
  assert.ok(
    refreshed.messages.every(
      (message) => message.recipient.address === "actualizado@ejemplo.com",
    ),
  );
});

test("actualizar orígenes conserva ajustes manuales y recalcula las cantidades que seguían recomendadas", () => {
  const db = makeMaterialDemandFixture(),
    draft = draftFor(db);
  const first = draft.materiales[0].id_material,
    second = draft.materiales[1].id_material;
  draft.materiales[1].cantidad = 123;
  draft.plantilla.asunto = "Mi borrador {{material}}";
  const line = db.orden_producto.find(
    (l) => l.id === draft.demanda.fuentes[0].id_orden_producto,
  )!;
  line.cantidad_solicitada += 500;
  const refreshed = refreshMaterialQuotation(db, draft);
  assert.ok(
    refreshed.materiales.find((m) => m.id_material === first)!.cantidad >
      draft.materiales[0].cantidad,
  );
  assert.equal(
    refreshed.materiales.find((m) => m.id_material === second)!.cantidad,
    123,
  );
  assert.equal(refreshed.plantilla.asunto, draft.plantilla.asunto);
  assert.deepEqual(materialQuotationPreview(db, refreshed).issues, {});
  db.orden_producto
    .filter((l) =>
      draft.demanda.fuentes.some((s) => s.id_orden_producto === l.id),
    )
    .forEach((l) => {
      l.estado = "cerrada";
    });
  assert.equal(refreshMaterialQuotation(db, refreshed).materiales.length, 0);
});

test("plantilla global persiste, rechaza sobrescrituras concurrentes y no cambia con un borrador", async (t) => {
  const store = await fixture(t);
  const expected = quotationTemplate(store.snapshot());
  const value = {
    asunto: "Cotizar {{material}}",
    cuerpo: "{{proveedor}}: {{cantidad}} unidades de {{material}}.",
  };
  await store.transaction((db) =>
    command(db, "saveQuotationTemplate", { plantilla: value, expected }),
  );
  assert.deepEqual(
    quotationTemplate((await JsonStore.open(store.file)).snapshot()),
    value,
  );
  const before = store.snapshot();
  await assert.rejects(
    store.transaction((db) =>
      command(db, "saveQuotationTemplate", { plantilla: expected, expected }),
    ),
    isError("QUOTATION_TEMPLATE_CHANGED"),
  );
  const draft = draftFor(before);
  draft.plantilla.asunto = "Solo este envío";
  materialQuotationPreview(before, draft);
  assert.deepEqual(store.snapshot(), before);
  await assert.rejects(
    store.transaction((db) =>
      command(db, "saveQuotationTemplate", {
        plantilla: { asunto: "{{no}}", cuerpo: "x" },
        expected: value,
      }),
    ),
    isError("VALIDATION"),
  );
});

test("integridad bloquea plantillas inválidas y reglas internas o de copia para cotización", () => {
  const db = makeMaterialDemandFixture();
  db.plantilla_correo.push({
    tipo_evento: quotationEvent,
    asunto: "{{incorrecta}}",
    cuerpo: "Texto",
  });
  assert.throws(() => validateDatabase(db), isError("VALIDATION"));
  db.plantilla_correo = [];
  const rule = db.destinatario_evento.find(
    (r) => r.tipo_evento === quotationEvent,
  )!;
  rule.tipo_contacto = "interno";
  assert.throws(() => validateDatabase(db), isError("VALIDATION"));
  rule.tipo_contacto = "proveedor";
  rule.tipo_destinatario = "cc";
  assert.throws(() => validateDatabase(db), isError("VALIDATION"));
});

test("migración aditiva respalda bytes originales, conserva registros y no se repite", async (t) => {
  const store = await fixture(t);
  const legacy: Partial<Database> = store.snapshot();
  delete legacy.plantilla_correo;
  const original = JSON.stringify(legacy, null, 3) + "\n";
  await writeFile(store.file, original);
  const migrated = await JsonStore.open(store.file);
  assert.ok(migrated.quotationMigration);
  assert.equal(
    await readFile(migrated.quotationMigration.backup, "utf8"),
    original,
  );
  assert.deepEqual(migrated.snapshot(), { ...legacy, plantilla_correo: [] });
  const files = await readdir(resolve(store.file, ".."));
  assert.equal(
    (await JsonStore.open(store.file)).quotationMigration,
    undefined,
  );
  assert.deepEqual(await readdir(resolve(store.file, "..")), files);
});

test("migración fallida conserva el archivo original sin respaldar ni reemplazar datos inválidos", async (t) => {
  const store = await fixture(t);
  const legacy: Partial<Database> = store.snapshot();
  delete legacy.plantilla_correo;
  legacy.destinatario_evento![0].id = "incorrecto";
  const original = JSON.stringify(legacy);
  await writeFile(store.file, original);
  await assert.rejects(JsonStore.open(store.file));
  assert.equal(await readFile(store.file, "utf8"), original);
  assert.equal(
    (await readdir(resolve(store.file, ".."))).filter((f) =>
      f.includes("quotations-"),
    ).length,
    0,
  );
});
