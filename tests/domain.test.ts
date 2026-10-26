import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { JsonStore } from "../server/store";
import { command, mailPreview } from "../server/domain";
import { BusinessError, validateDatabase } from "../server/integrity";
import { makeSeed, sid } from "../shared/seed";
import {
  entities,
  normalizeInvoice,
  recommendations,
  deviation,
  tolerance,
  totalLines,
  orderState,
  blankRow,
  nextOrderNumber,
  type Row,
} from "../shared/schema";
const base = resolve("tests/.tmp");
// These historical scenarios use October delivery dates; creation-date rules have their own clock-bound tests.
async function fixture(t: test.TestContext) {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-10T12:00:00.000Z"),
  });
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, "case-"));
  assert.ok(resolve(dir).startsWith(base + sep));
  t.after(async () => {
    assert.ok(resolve(dir).startsWith(base + sep));
    await rm(dir, { recursive: true, force: true });
  });
  return JsonStore.open(join(dir, "database.json"));
}
const execute = (store: JsonStore, name: string, payload: Row = {}) =>
  store.transaction((db) => command(db, name, payload));
const fails = (code: string) => (e: unknown) =>
  e instanceof BusinessError && e.code === code;
const material = (overrides: Row = {}) => ({
  tipo_orden: "material",
  id_proveedor: sid(3),
  fecha_solicitada_entrega: "2026-10-15T12:00:00.000Z",
  lines: [
    {
      id_material: sid(50),
      cantidad_solicitada: 150,
      precio_unitario: "450.00",
    },
  ],
  ...overrides,
});
const product = (overrides: Row = {}) => ({
  tipo_orden: "producto",
  id_proveedor: sid(1),
  fecha_solicitada_entrega: "2026-10-15T12:00:00.000Z",
  lines: [
    {
      id_producto: sid(70),
      cantidad_solicitada: 150,
      precio_unitario: "3100.50",
    },
  ],
  ...overrides,
});

test("consecutivo mostrado: material y otros comparten número; una previsualización obsoleta revierte la operación", async (t) => {
  const store = await fixture(t);
  const shown = nextOrderNumber(store.snapshot(), "material");
  assert.equal(shown, nextOrderNumber(store.snapshot(), "otro"));
  const created = await execute(
    store,
    "createOrder",
    material({ expected_no_orden: shown }),
  );
  assert.equal(
    store.snapshot().orden_compra.find((order) => order.id === created.orderId)!
      .no_orden,
    shown,
  );
  const before = store.snapshot();
  await assert.rejects(
    execute(store, "createOrder", material({ expected_no_orden: shown })),
    fails("CONSECUTIVE_CHANGED"),
  );
  assert.deepEqual(store.snapshot(), before);
  assert.equal(nextOrderNumber(before, "otro"), String(Number(shown) + 1));
});

test("el lote inicial toma batch estimado de la cabecera y conserva su fecha después de autorizar", async (t) => {
  const store = await fixture(t);
  const delivery = "2026-10-28T12:00:00.000Z";
  const created = await execute(
    store,
    "createOrder",
    product({ fecha_solicitada_entrega: delivery }),
  );
  const line = store
    .snapshot()
    .orden_producto.find((row) => row.id_orden_compra === created.orderId)!;
  assert.equal(Object.hasOwn(line, "fecha_estimada_batch_record"), false);
  const initialLot = store
    .snapshot()
    .lote_producto.find((lot) => lot.id_orden_producto === line.id)!;
  assert.equal(initialLot.fecha_estimada_batch_record, delivery);
  await execute(store, "authorizeOrder", {
    id: created.orderId,
    confirm: true,
  });
  const saved = await execute(store, "saveLot", {
    row: {
      id: initialLot.id,
      id_orden_producto: line.id,
      numero_lote: "CABECERA-001",
    },
  });
  assert.equal(saved.row.fecha_estimada_batch_record, delivery);
  await execute(store, "saveLot", {
    row: {
      ...saved.row,
      fecha_estimada_batch_record: "2026-10-30T12:00:00.000Z",
    },
  });
  await execute(
    store,
    "editOrder",
    product({
      id: created.orderId,
      fecha_solicitada_entrega: "2026-11-02T12:00:00.000Z",
      lines: [line],
    }),
  );
  assert.equal(
    store.snapshot().lote_producto.find((row) => row.id === saved.row.id)!
      .fecha_estimada_batch_record,
    "2026-10-30T12:00:00.000Z",
  );
});

test("el estado inicial tiene las 28 colecciones y conserva tipos, históricos y decimales exactos", () => {
  const db = validateDatabase(makeSeed());
  assert.equal(entities.length, 28);
  assert.equal(Object.keys(db).length, 28);
  assert.equal(
    db.orden_producto.find((l) => l.id === sid(116))!.id_codigo_barras,
    sid(94),
  );
  assert.equal(
    totalLines([
      { cantidad_solicitada: 9000000, precio_unitario: "999999999999.99" },
    ]),
    "8999999999999910000.00",
  );
  const invalid = makeSeed();
  (invalid.orden_producto[0] as Row).precio_unitario = 3200;
  assert.throws(() => validateDatabase(invalid), fails("TYPE"));
  const foreign = makeSeed();
  foreign.productos[0].id_categoria = sid(9999);
  assert.throws(() => validateDatabase(foreign), fails("FOREIGN_KEY"));
});

test("materiales y otros heredan la entrega de cabecera al crear; editar conserva la fecha de seguimiento", async (t) => {
  const store = await fixture(t);
  const delivery = "2026-10-28T12:00:00.000Z";
  const receiptDate = "2026-10-30T12:00:00.000Z";
  for (const type of ["material", "otro"] as const) {
    const entity = type === "material" ? "orden_material" : "orden_otro";
    const payload =
      type === "material"
        ? material()
        : {
            tipo_orden: "otro",
            id_proveedor: sid(5),
            lines: [
              {
                producto: "Servicio de prueba",
                cantidad_solicitada: 1,
                precio_unitario: "12.00",
              },
            ],
          };
    const created = await execute(store, "createOrder", {
      ...payload,
      fecha_solicitada_entrega: delivery,
      lines: payload.lines.map((line) => ({
        ...line,
        fecha_estimada_entrega: "2026-09-01T12:00:00.000Z",
      })),
    });
    const line = store
      .snapshot()
      [entity].find((row) => row.id_orden_compra === created.orderId)!;
    assert.equal(line.fecha_estimada_entrega, delivery);
    await execute(store, "authorizeOrder", {
      id: created.orderId,
      confirm: true,
    });
    await execute(store, "saveReceipt", {
      entity,
      id: line.id,
      row: { fecha_estimada_entrega: receiptDate },
    });
    const { fecha_estimada_entrega, ...withoutDate } = line;
    await execute(store, "editOrder", {
      ...payload,
      id: created.orderId,
      fecha_solicitada_entrega: "2026-11-05T12:00:00.000Z",
      lines: [withoutDate],
    });
    assert.equal(
      store.snapshot()[entity].find((row) => row.id === line.id)!
        .fecha_estimada_entrega,
      receiptDate,
    );
  }
});

test("sticker por producto: porcentajes independientes, redondeo y cantidades finales editables sin atributos nuevos persistidos", async (t) => {
  const store = await fixture(t);
  const created = await execute(
    store,
    "createOrder",
    product({
      lines: [
        { ...product().lines[0], cantidad_solicitada: 101, sticker_pct: 5 },
        { ...product().lines[0], cantidad_solicitada: 101, sticker_pct: 10 },
        {
          ...product().lines[0],
          cantidad_solicitada: 101,
          sticker_pct: 5.5,
          cantidad_sticker: 213,
        },
      ],
    }),
  );
  const db = store.snapshot();
  const lines = db.orden_producto.filter(
    (line) => line.id_orden_compra === created.orderId,
  );
  assert.deepEqual(
    lines.map((line) => line.cantidad_sticker),
    [213, 223, 213],
  );
  assert.ok(lines.every((line) => !("sticker_pct" in line)));
  assert.equal(
    db.abastecimiento_material.filter((link) =>
      lines.some((line) => line.id === link.id_orden_producto),
    ).length,
    0,
  );
});

test("sticker por producto: un porcentaje inválido revierte la orden, lotes y consecutivos", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  for (const invalid of [0, 11, NaN, null, "5"]) {
    await assert.rejects(
      execute(
        store,
        "createOrder",
        product({
          lines: [
            { ...product().lines[0], sticker_pct: 5 },
            { ...product().lines[0], sticker_pct: invalid },
          ],
        }),
      ),
      (error: unknown) =>
        error instanceof BusinessError &&
        error.code === "VALIDATION" &&
        Boolean(error.fields["lines.1.sticker_pct"]),
    );
    assert.deepEqual(store.snapshot(), before);
    assert.deepEqual(JSON.parse(await readFile(store.file, "utf8")), before);
  }
});
test("R01: solicitudes simultáneas reservan números únicos en el grupo material/otros", async (t) => {
  const store = await fixture(t);
  await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      execute(
        store,
        "createOrder",
        i % 2
          ? material()
          : {
              tipo_orden: "otro",
              id_proveedor: sid(5),
              fecha_solicitada_entrega: "2026-10-15T12:00:00.000Z",
              lines: [
                {
                  producto: "Servicio de prueba",
                  cantidad_solicitada: 1,
                  precio_unitario: "1.00",
                },
              ],
            },
      ),
    ),
  );
  const rows = store
    .snapshot()
    .orden_compra.filter(
      (o) => Number(o.no_orden) > 1604 && o.tipo_orden !== "producto",
    );
  assert.equal(rows.length, 12);
  assert.equal(new Set(rows.map((o) => o.no_orden)).size, 12);
  assert.equal(
    store.snapshot().consecutivo_orden.find((c) => c.grupo === "material")!
      .ultimo_numero,
    1616,
  );
});
test("R01: número automático y grupos independientes; no admite un número manual", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  await assert.rejects(
    execute(store, "createOrder", material({ no_orden: "1700" })),
    fails("VALIDATION"),
  );
  assert.deepEqual(store.snapshot(), before);
  const shown = nextOrderNumber(before, "producto");
  await store.transaction((db) => {
    db.consecutivo_orden.find(
      (counter) => counter.grupo === "material",
    )!.ultimo_numero = Number(shown) - 1;
  });
  const a = await execute(store, "createOrder", material());
  const b = await execute(store, "createOrder", product());
  for (const id of [a.orderId, b.orderId])
    assert.equal(
      store.snapshot().orden_compra.find((o) => o.id === id)!.no_orden,
      shown,
    );
});
test("R02: máximo siete productos, materiales o conceptos, posiciones y compatibilidad; fallos no consumen consecutivos", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  await assert.rejects(
    execute(
      store,
      "createOrder",
      material({ lines: Array(8).fill(material().lines[0]) }),
    ),
    fails("R02"),
  );
  assert.deepEqual(store.snapshot(), before);
  await assert.rejects(
    store.transaction((db) => {
      db.orden_material[0].posicion = 8;
    }),
    fails("R02"),
  );
  await assert.rejects(
    store.transaction((db) => {
      db.orden_material[0].id_orden_compra = sid(100);
    }),
    fails("R02"),
  );
  assert.deepEqual(store.snapshot(), before);
});
test("R03: factura normalizada, ceros/signos interiores y unicidad por proveedor", async (t) => {
  const store = await fixture(t);
  const raw = "\u200B  +ab-0001 / x+ \uFEFF";
  assert.equal(normalizeInvoice(raw), "+AB-0001 / X+");
  const r = await execute(store, "createInvoice", {
    id_proveedor: sid(1),
    numero_factura: raw,
  });
  assert.equal(r.row.numero_factura, "+AB-0001 / X+");
  await assert.rejects(
    execute(store, "createInvoice", {
      id_proveedor: sid(1),
      numero_factura: " +AB-0001 / X+ ",
    }),
    fails("R03"),
  );
  await execute(store, "createInvoice", {
    id_proveedor: sid(2),
    numero_factura: raw,
  });
});
test("R03: proveedor incompatible de factura revierte todas las asociaciones", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  await assert.rejects(
    execute(store, "assignInvoice", {
      id: sid(150),
      receipts: [
        { entity: "lote_producto", id: sid(160) },
        { entity: "orden_material", id: sid(140) },
      ],
    }),
    fails("R03"),
  );
  assert.deepEqual(store.snapshot(), before);
});
test("R04: lote de material compartido mantiene recepciones independientes", async (t) => {
  const store = await fixture(t);
  await execute(store, "saveReceipt", {
    entity: "orden_material",
    id: sid(140),
    row: { cantidad_recibida: 12000 },
  });
  const db = store.snapshot();
  assert.equal(
    db.orden_material.find((l) => l.id === sid(140))!.id_lote_material,
    sid(130),
  );
  assert.equal(
    db.orden_material.find((l) => l.id === sid(141))!.id_lote_material,
    sid(130),
  );
  assert.equal(
    db.orden_material.find((l) => l.id === sid(141))!.cantidad_recibida,
    13200,
  );
  assert.deepEqual(Object.keys(db.lote_material[0]).sort(), [
    "id",
    "numero_lote",
  ]);
});
test("R05: enlaces entre productos y materiales de órdenes existentes, sin cantidad asignada", async (t) => {
  const store = await fixture(t);
  await assert.rejects(
    store.transaction((db) => {
      db.abastecimiento_material.push({
        id_orden_producto: sid(110),
        id_orden_material: sid(145),
      });
    }),
    fails("FOREIGN_KEY"),
  );
  const link = store.snapshot().abastecimiento_material[0];
  assert.deepEqual(Object.keys(link).sort(), [
    "id_orden_material",
    "id_orden_producto",
  ]);
});
test("R06: clase/propietario, referencia polimórfica y plantilla global", async (t) => {
  const store = await fixture(t);
  await assert.rejects(
    execute(store, "saveDocument", {
      tipo_entidad: "factura",
      id_entidad: sid(150),
      tipo_documento: "orden_compra_escaneada",
    }),
    fails("R06"),
  );
  await assert.rejects(
    execute(store, "saveDocument", {
      tipo_entidad: "factura",
      id_entidad: sid(9999),
      tipo_documento: "factura_fisica",
    }),
    fails("R06"),
  );
  await assert.rejects(
    execute(store, "saveDocument", {
      tipo_entidad: null,
      id_entidad: sid(130),
      tipo_documento: "plantilla_certificado_liberacion",
    }),
    fails("R06"),
  );
});
test("R07: certificados, plantilla y factura únicos; reemplazo del registro vigente", async (t) => {
  const store = await fixture(t);
  await assert.rejects(
    execute(store, "saveDocument", {
      tipo_entidad: "lote_material",
      id_entidad: sid(130),
      tipo_documento: "certificado_calidad",
    }),
    fails("R07"),
  );
  await assert.rejects(
    execute(store, "saveDocument", {
      tipo_documento: "plantilla_certificado_liberacion",
    }),
    fails("R07"),
  );
  const before = store.snapshot().documento.length;
  await execute(store, "saveDocument", {
    id: sid(172),
    tipo_entidad: "lote_material",
    id_entidad: sid(130),
    tipo_documento: "certificado_calidad",
    nombre_archivo: "Calidad-corregida.html",
  });
  assert.equal(store.snapshot().documento.length, before);
  assert.equal(
    store.snapshot().documento.find((d) => d.id === sid(172))!.nombre_archivo,
    "Calidad-corregida.html",
  );
  await assert.rejects(
    execute(store, "saveDocument", {
      tipo_entidad: "factura",
      id_entidad: sid(150),
      tipo_documento: "factura_fisica",
    }),
    fails("R07"),
  );
  assert.equal(
    store.snapshot().documento.filter((d) => d.id_entidad === sid(150)).length,
    1,
  );
});
test("R08/R09: sugerencias resueltas por área normalizada, internos activos y proveedor del contexto", () => {
  const db = makeSeed();
  db.contacto_interno.find((c) => c.nombre === "Zamira")!.cargo_area =
    " COMPRAS ";
  let p = mailPreview(db, { event: "codigos_barras_nuevos" });
  assert.equal(p.recipients.length, 3);
  db.contacto_interno.find((c) => c.nombre === "Zamira")!.activo = false;
  p = mailPreview(db, { event: "codigos_barras_nuevos" });
  assert.equal(p.recipients.length, 2);
  p = mailPreview(db, { event: "envio_orden_compra", orderId: sid(100) });
  assert.deepEqual(
    p.recipients.map((r: Row) => r.address),
    ["compras1@proveedor.example"],
  );
});
test("el aviso de códigos incluye solo los códigos pendientes seleccionados", () => {
  const db = makeSeed();
  const pending = db.codigos_barras.find(
    (code) => code.estado === "creado_gs1",
  )!;
  const verified = db.codigos_barras.find(
    (code) => code.estado === "verificado_sistema",
  )!;
  const all = mailPreview(db, { event: "codigos_barras_nuevos" });
  assert.match(all.body, new RegExp(pending.codigo));
  assert.doesNotMatch(all.body, new RegExp(verified.codigo));

  const selected = mailPreview(db, {
    event: "codigos_barras_nuevos",
    barcodeIds: [pending.id],
  });
  assert.match(selected.body, new RegExp(pending.codigo));
  assert.doesNotMatch(selected.body, new RegExp(verified.codigo));
});
test("R09: cargos equivalentes no duplican configuración; sin configuración se permite envío manual", async (t) => {
  const store = await fixture(t);
  await assert.rejects(
    execute(store, "saveEntity", {
      entity: "destinatario_evento",
      row: {
        tipo_evento: "envio_orden_compra",
        tipo_contacto: "proveedor",
        cargo_area: " COMPRAS ",
        tipo_destinatario: "cc",
      },
    }),
    fails("R09"),
  );
  await store.transaction((db) => {
    db.destinatario_evento = [];
  });
  await execute(store, "sendMail", {
    event: "codigos_barras_nuevos",
    recipients: [{ address: "manual@ejemplo.example", type: "para" }],
  });
});
test("R10: falta de archivo impide confirmar envío; códigos nuevos no necesitan adjuntos", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot().correo_enviado.length;
  await assert.rejects(
    execute(store, "sendMail", {
      event: "envio_orden_compra",
      orderId: sid(101),
      recipients: [{ address: "uno@ejemplo.example", type: "para" }],
    }),
    fails("R10"),
  );
  assert.equal(store.snapshot().correo_enviado.length, before);
  assert.equal(
    mailPreview(store.snapshot(), { event: "codigos_barras_nuevos" }).missing
      .length,
    0,
  );
});
test("R10: certificados deduplicados y liberación con material, maquilador, direcciones y contactos", () => {
  const p = mailPreview(makeSeed(), {
    event: "envio_certificado_liberacion",
    orderId: sid(120),
  });
  assert.equal(p.documents.length, 1);
  assert.match(p.body, /Envase ámbar/);
  assert.match(p.body, /Laboratorios Aurora/);
  assert.match(p.body, /Calle demostración/);
  assert.match(p.body, /Laura Mora/);
});
test("R11: duplicados entre Para/CC rechazados; mensaje y destinatarios se guardan tras confirmación", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  await assert.rejects(
    execute(store, "sendMail", {
      event: "codigos_barras_nuevos",
      recipients: [
        { address: "uno@demo.example", type: "para" },
        { address: "UNO@demo.example", type: "cc" },
      ],
    }),
    fails("R11"),
  );
  assert.deepEqual(store.snapshot(), before);
  await assert.rejects(
    store.transaction((db) =>
      command(
        db,
        "sendMail",
        {
          event: "codigos_barras_nuevos",
          recipients: [{ address: "uno@demo.example", type: "para" }],
        },
        async () => {
          throw new Error("Sin confirmación");
        },
      ),
    ),
    /Sin confirmación/,
  );
  assert.deepEqual(store.snapshot(), before);
  await store.transaction((db) =>
    command(
      db,
      "sendMail",
      {
        event: "codigos_barras_nuevos",
        body: "NO CONSERVAR",
        recipients: [
          { address: "uno@demo.example", type: "para" },
          { address: "dos@demo.example", type: "cc" },
        ],
      },
      async () => "gmail-id-como-texto",
    ),
  );
  const db = store.snapshot();
  assert.ok(
    db.correo_enviado.some((m) => m.id_correo === "gmail-id-como-texto"),
  );
  assert.equal(
    db.correo_enviado_destinatario.filter(
      (r) => r.id_correo === "gmail-id-como-texto",
    ).length,
    2,
  );
  assert.equal(JSON.stringify(db).includes("NO CONSERVAR"), false);
  await store.transaction((db) => {
    db.contacto_interno[0].correo = "cambiado@demo.example";
  });
  assert.equal(
    store
      .snapshot()
      .correo_enviado_destinatario.find(
        (r) => r.id_correo === "gmail-id-como-texto",
      )!.destinatario,
    "uno@demo.example",
  );
});
test("R12: código MAIA de tres dígitos, único y opcional", async (t) => {
  const store = await fixture(t);
  await assert.rejects(
    execute(store, "saveEntity", {
      entity: "materiales",
      row: {
        id_tipo_material: sid(40),
        nombre_material: "Incorrecto",
        codigo_material: 1000,
      },
    }),
    fails("R12"),
  );
  await assert.rejects(
    execute(store, "saveEntity", {
      entity: "materiales",
      row: { id_tipo_material: sid(40), codigo_material: 101 },
    }),
    fails("UNIQUE"),
  );
  await execute(store, "saveEntity", {
    entity: "materiales",
    row: {
      id_tipo_material: sid(43),
      nombre_material: "Caja sin MAIA",
      codigo_material: null,
    },
  });
});
test("R13: exclusión al asociar materiales y al cambiar el tipo; no basta validar una fila", async (t) => {
  const store = await fixture(t);
  await assert.rejects(
    execute(store, "saveEntity", {
      entity: "materiales_asociados",
      row: { id_material: sid(55), id_producto: sid(70) },
    }),
    fails("R13"),
  );
  await assert.rejects(
    execute(store, "saveEntity", {
      entity: "tipos_materiales",
      key: { id: sid(40) },
      row: { id: sid(40), tipo_material: " CINTA " },
    }),
    fails("R13"),
  );
  assert.equal(
    store.snapshot().tipos_materiales.find((t) => t.id === sid(40))!
      .tipo_material,
    "Envase",
  );
});
test("autorización irreversible y seguimiento habilitado solo por orden de compra autorizada", async (t) => {
  const store = await fixture(t);
  await assert.rejects(
    execute(store, "saveLot", {
      row: { id_orden_producto: sid(112), numero_lote: "SIN-AUT" },
    }),
    fails("AUTHORIZATION"),
  );
  await execute(store, "authorizeOrder", { id: sid(101), confirm: true });
  const before = store.snapshot();
  await assert.rejects(
    store.transaction((db) => {
      db.orden_compra.find((o) => o.id === sid(101))!.estado_autorizacion =
        "no_autorizada";
    }),
    fails("AUTHORIZATION"),
  );
  assert.deepEqual(store.snapshot(), before);
});
test("lote precarga batch record desde la entrega de la cabecera; cantidad no provoca cierre", async (t) => {
  const store = await fixture(t);
  const r = await execute(store, "saveLot", {
    row: {
      id_orden_producto: sid(111),
      numero_lote: "NUEVO-LOT",
      cantidad_recibida: 8000,
    },
  });
  const db = store.snapshot();
  assert.equal(
    r.row.fecha_estimada_batch_record,
    db.orden_compra.find(
      (o) =>
        o.id ===
        db.orden_producto.find((l) => l.id === sid(111))!.id_orden_compra,
    )!.fecha_solicitada_entrega,
  );
  assert.equal(
    db.orden_producto.find((l) => l.id === sid(111))!.estado,
    "en_seguimiento",
  );
  assert.equal(
    db.lote_producto.find((l) => l.id === r.row.id)!.estado,
    "en_seguimiento",
  );
});
test("cierre: solo lotes cerrados, por producto, advertencia confirmable y tolerancia histórica", async (t) => {
  const store = await fixture(t);
  assert.equal(
    deviation(
      store.snapshot(),
      store.snapshot().orden_producto.find((l) => l.id === sid(110))!,
    ),
    -50,
  );
  await assert.rejects(
    execute(store, "setLineState", {
      entity: "orden_producto",
      id: sid(110),
      estado: "cerrada",
    }),
    fails("TOLERANCE"),
  );
  await execute(store, "setLineState", {
    entity: "orden_producto",
    id: sid(110),
    estado: "cerrada",
    confirm: true,
  });
  assert.equal(
    store.snapshot().orden_producto.find((l) => l.id === sid(110))!.estado,
    "cerrada",
  );
  assert.equal(
    orderState(
      store.snapshot(),
      store.snapshot().orden_compra.find((o) => o.id === sid(100))!,
    ),
    "autorizada",
  );
  await execute(store, "setLineState", {
    entity: "orden_producto",
    id: sid(110),
    estado: "en_seguimiento",
  });
  await execute(store, "setTolerance", { value: 60 });
  assert.equal(tolerance(store.snapshot()), 60);
  assert.equal(store.snapshot().parametros_seguimiento.length, 2);
  await execute(store, "setLineState", {
    entity: "orden_producto",
    id: sid(110),
    estado: "cerrada",
  });
});
test("código elegido explícitamente, no numéricamente mayor; condiciones históricas conservadas al editar", async (t) => {
  const store = await fixture(t);
  await store.transaction((db) => {
    db.codigos_barras.push({
      id: sid(300),
      codigo: "100000000000",
      id_producto: sid(70),
      estado: "activo",
      fecha_creacion: "2026-10-05T12:00:00.000Z",
      fecha_act: null,
    });
  });
  await execute(store, "setAssignedBarcode", {
    id: sid(300),
    id_producto: sid(70),
    expectedAssignedId: sid(90),
    confirm: true,
  });
  const result = await execute(store, "createOrder", product());
  const db = store.snapshot();
  assert.equal(
    db.orden_producto.find((l) => l.id_orden_compra === result.orderId)!
      .id_codigo_barras,
    sid(300),
  );
  assert.equal(
    db.orden_producto.find((l) => l.id === sid(110))!.id_codigo_barras,
    sid(90),
  );
  const old = db.orden_compra.find((o) => o.id === sid(100))!;
  await execute(store, "editOrder", {
    ...old,
    lines: db.orden_producto.filter((l) => l.id_orden_compra === old.id),
  });
  assert.equal(
    store.snapshot().orden_producto.find((l) => l.id === sid(110))!
      .id_codigo_barras,
    sid(90),
  );
  assert.equal(
    store.snapshot().orden_producto.find((l) => l.id === sid(110))!
      .precio_unitario,
    "3200.00",
  );
});
test("cantidades finales de producto y empaque con redondeo hacia arriba", async (t) => {
  const store = await fixture(t);
  const rec = recommendations(store.snapshot(), sid(70), 12001, 10);
  assert.equal(rec.cantidad_corrugado, 506);
  assert.equal(rec.cantidad_sticker, 26403);
  const result = await execute(store, "createOrder", product());
  const line = store
    .snapshot()
    .orden_producto.find((l) => l.id_orden_compra === result.orderId)!;
  assert.equal(line.cantidad_solicitada, 150);
  assert.ok(!("unidades_lote" in line));
  assert.equal(line.cantidad_corrugado, 12);
  assert.equal(line.cantidad_sticker, 330);
});

test("emisión de varios productos conserva materiales, vínculos y su consecutivo; guarda un lote inicial por producto", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const result = await execute(
    store,
    "createOrder",
    product({
      lines: [
        ...product().lines,
        {
          id_producto: sid(71),
          cantidad_solicitada: 10,
          precio_unitario: "2.00",
        },
      ],
    }),
  );
  const after = store.snapshot();
  assert.deepEqual(Object.keys(result), ["orderId"]);
  const lines = after.orden_producto.filter(
    (line) => line.id_orden_compra === result.orderId,
  );
  assert.equal(lines.length, 2);
  for (const line of lines) {
    const lots = after.lote_producto.filter(
      (lot) => lot.id_orden_producto === line.id,
    );
    assert.equal(lots.length, 1);
    assert.equal(
      lots[0].fecha_estimada_batch_record,
      product().fecha_solicitada_entrega,
    );
    assert.equal(lots[0].numero_lote, null);
    assert.equal(lots[0].cantidad_recibida, null);
    assert.equal(lots[0].estado, "en_seguimiento");
  }
  assert.deepEqual(
    after.orden_compra.filter((order) => order.tipo_orden !== "producto"),
    before.orden_compra.filter((order) => order.tipo_orden !== "producto"),
  );
  for (const table of [
    "orden_material",
    "orden_otro",
    "lote_material",
    "abastecimiento_material",
  ] as const)
    assert.deepEqual(after[table], before[table], table);
  assert.deepEqual(
    after.consecutivo_orden.filter((counter) => counter.grupo !== "producto"),
    before.consecutivo_orden.filter((counter) => counter.grupo !== "producto"),
  );
  assert.deepEqual(JSON.parse(await readFile(store.file, "utf8")), after);
});
test("facturas: desasignar un lote conserva los demás, la factura y sus documentos", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const lot = before.lote_producto.find((row) => row.id_factura)!;
  await execute(store, "assignInvoice", {
    id: lot.id_factura,
    unassign: [{ entity: "lote_producto", id: lot.id }],
    receipts: [],
  });
  const after = store.snapshot();
  assert.deepEqual(
    after.lote_producto,
    before.lote_producto.map((row) =>
      row.id === lot.id ? { ...row, id_factura: null } : row,
    ),
  );
  assert.deepEqual(after.factura, before.factura);
  assert.deepEqual(after.documento, before.documento);
  assert.deepEqual((await JsonStore.open(store.file)).snapshot(), after);
});

test("facturas: desasignar otro propietario o una selección contradictoria rechaza la operación completa", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const file = await readFile(store.file, "utf8");
  const lot = before.lote_producto.find((row) => row.id_factura)!;
  const other = before.factura.find((row) => row.id !== lot.id_factura)!;
  for (const payload of [
    { id: other.id, unassign: [{ entity: "lote_producto", id: lot.id }] },
    {
      id: lot.id_factura,
      unassign: [{ entity: "lote_producto", id: lot.id }],
      receipts: [{ entity: "lote_producto", id: lot.id }],
    },
  ])
    await assert.rejects(
      execute(store, "assignInvoice", payload),
      fails("R03"),
    );
  assert.deepEqual(store.snapshot(), before);
  assert.equal(await readFile(store.file, "utf8"), file);
});

test("facturas: fallo posterior de proveedor revierte también las desasignaciones", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const lot = before.lote_producto.find((row) => row.id_factura)!;
  const file = await readFile(store.file, "utf8");
  const differentProvider = before.orden_material.find((row) => {
    const order = before.orden_compra.find(
      (order) => order.id === row.id_orden_compra,
    )!;
    return (
      order.estado_autorizacion === "autorizada" &&
      order.id_proveedor !==
        before.factura.find((invoice) => invoice.id === lot.id_factura)!
          .id_proveedor
    );
  })!;
  await assert.rejects(
    execute(store, "assignInvoice", {
      id: lot.id_factura,
      unassign: [{ entity: "lote_producto", id: lot.id }],
      receipts: [{ entity: "orden_material", id: differentProvider.id }],
    }),
    fails("R03"),
  );
  assert.deepEqual(store.snapshot(), before);
  assert.equal(await readFile(store.file, "utf8"), file);
});

test("facturas: desasignar recepciones de material y otros conserva sus datos", async (t) => {
  const store = await fixture(t);
  const created = await execute(store, "createOrder", {
    tipo_orden: "otro",
    id_proveedor: sid(5),
    fecha_solicitada_entrega: "2026-11-15T12:00:00.000Z",
    lines: [
      {
        producto: "Servicio de prueba",
        cantidad_solicitada: 1,
        precio_unitario: "10.00",
      },
    ],
  });
  await execute(store, "authorizeOrder", {
    id: created.orderId,
    confirm: true,
  });
  const db = store.snapshot();
  const material = db.orden_material.find(
    (row) =>
      db.orden_compra.find((order) => order.id === row.id_orden_compra)!
        .estado_autorizacion === "autorizada",
  )!;
  const other = db.orden_otro.find(
    (row) => row.id_orden_compra === created.orderId,
  )!;
  for (const [entity, row] of [
    ["orden_material", material],
    ["orden_otro", other],
  ] as const) {
    const order = db.orden_compra.find(
      (order) => order.id === row.id_orden_compra,
    )!;
    const invoice = await execute(store, "createInvoice", {
      id_proveedor: order.id_proveedor,
      numero_factura: `DESASIGNAR-${entity}`,
      receipts: [{ entity, id: row.id }],
    });
    const assigned = store
      .snapshot()
      [entity].find((item) => item.id === row.id)!;
    await execute(store, "assignInvoice", {
      id: invoice.row.id,
      unassign: [{ entity, id: row.id }],
    });
    assert.deepEqual(
      store.snapshot()[entity].find((item) => item.id === row.id),
      { ...assigned, id_factura: null },
    );
  }
});

test("facturas: desasignación bloqueada sin autorización", async (t) => {
  const store = await fixture(t);
  const db = store.snapshot();
  const lot = db.lote_producto.find((row) => row.id_factura)!;
  const line = db.orden_producto.find(
    (row) => row.id === lot.id_orden_producto,
  )!;
  db.orden_compra.find(
    (row) => row.id === line.id_orden_compra,
  )!.estado_autorizacion = "no_autorizada";
  const before = structuredClone(db);
  await assert.rejects(
    command(db, "assignInvoice", {
      id: lot.id_factura,
      unassign: [{ entity: "lote_producto", id: lot.id }],
    }),
  );
  assert.deepEqual(db, before);
});

test("facturas: adjunto preparado se guarda con propietario y asociaciones en la misma operación", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const lot = before.lote_producto.find((row) => row.id_factura)!;
  const supplier = before.factura.find(
    (invoice) => invoice.id === lot.id_factura,
  )!.id_proveedor;
  const created = await execute(store, "createInvoice", {
    id_proveedor: supplier,
    numero_factura: "ADJUNTO-PREPARADO",
    document: {
      tipo_documento: "factura_fisica",
      nombre_archivo: "  Mi-factura.html  ",
    },
    receipts: [{ entity: "lote_producto", id: lot.id }],
  });
  const after = store.snapshot();
  assert.equal(after.factura.length, before.factura.length + 1);
  const document = after.documento.find(
    (row) => row.id_entidad === created.row.id,
  )!;
  assert.equal(document.tipo_entidad, "factura");
  assert.equal(document.tipo_documento, "factura_fisica");
  assert.equal(document.nombre_archivo, "Mi-factura.html");
  assert.equal(
    after.lote_producto.find((row) => row.id === lot.id)!.id_factura,
    created.row.id,
  );
  assert.deepEqual((await JsonStore.open(store.file)).snapshot(), after);
});

test("facturas: adjunto inválido o recepción incompatible no deja factura ni documento huérfano", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const file = await readFile(store.file, "utf8");
  for (const document of [
    { tipo_documento: "certificado_calidad", nombre_archivo: "Otro.html" },
    { tipo_documento: "factura_fisica", nombre_archivo: "   " },
  ])
    await assert.rejects(
      execute(store, "createInvoice", {
        id_proveedor: sid(1),
        numero_factura: "ADJUNTO-INVALIDO",
        document,
      }),
      fails("R06"),
    );
  await assert.rejects(
    execute(store, "createInvoice", {
      id_proveedor: sid(3),
      numero_factura: "ADJUNTO-INVALIDO",
      document: {
        tipo_documento: "factura_fisica",
        nombre_archivo: "Documento.html",
      },
      receipts: [
        {
          entity: "lote_producto",
          id: before.lote_producto.find((row) => row.id_factura)!.id,
        },
      ],
    }),
    fails("R03"),
  );
  assert.deepEqual(store.snapshot(), before);
  assert.equal(await readFile(store.file, "utf8"), file);
});

test("persistencia al reabrir y rollback conserva el archivo; un JSON dañado no se reemplaza con la semilla", async (t) => {
  const store = await fixture(t);
  await execute(store, "createInvoice", {
    id_proveedor: sid(1),
    numero_factura: "PERSIST-001",
  });
  const reopened = await JsonStore.open(store.file);
  assert.deepEqual(reopened.snapshot(), store.snapshot());
  const before = await readFile(store.file, "utf8");
  await assert.rejects(
    execute(store, "saveEntity", {
      entity: "materiales_asociados",
      row: { id_material: sid(55), id_producto: sid(70) },
    }),
  );
  assert.equal(await readFile(store.file, "utf8"), before);
  await writeFile(store.file, "{roto", "utf8");
  await assert.rejects(JsonStore.open(store.file), SyntaxError);
  assert.equal(await readFile(store.file, "utf8"), "{roto");
});
