import type { Database } from "../shared/models";
import {
  schemas,
  entities,
  meta,
  primaryKey,
  groupOf,
  lineTable,
  orderItemLabel,
  canonical,
  materialKind,
  normalizeInvoice,
  type Entity,
  type Row,
} from "../shared/schema";
export class BusinessError extends Error {
  constructor(
    message: string,
    public code = "VALIDATION",
    public fields: Record<string, string> = {},
    public details: Row = {},
  ) {
    super(message);
  }
}
export function check(
  condition: unknown,
  message: string,
  code = "VALIDATION",
  fields: Record<string, string> = {},
  details: Row = {},
): asserts condition {
  if (!condition) throw new BusinessError(message, code, fields, details);
}
export function validateDatabase(
  input: Database,
  previous?: Database,
): Database {
  const db = structuredClone(input);
  for (const table of entities) {
    check(Array.isArray(db[table]), `Falta la colección ${table}.`);
    for (let i = 0; i < db[table].length; i++) {
      const parsed = schemas[table].safeParse(db[table][i]);
      if (!parsed.success)
        throw new BusinessError(
          `Revisa los campos de ${table}.`,
          "TYPE",
          Object.fromEntries(
            parsed.error.issues.map((e) => [e.path.join("."), e.message]),
          ),
          { table, index: i },
        );
      (db[table] as Row[])[i] = parsed.data;
    }
    const keys = [meta.tables[table].pk, ...meta.tables[table].unique];
    for (const fields of keys) {
      if (!fields.length) continue;
      const documentOwner =
        table === "documento" &&
        fields.join(",") === "tipo_entidad,id_entidad,tipo_documento";
      const used = new Set<string>();
      for (const row of db[table] as Row[]) {
        if (fields.some((f) => row[f] === null)) continue;
        const key = JSON.stringify(fields.map((f) => row[f]));
        check(
          !used.has(key),
          documentOwner
            ? "Ya existe este documento. Reemplaza el documento vigente."
            : `Ya existe un registro con estos datos en ${table}.`,
          documentOwner ? "R07" : "UNIQUE",
          documentOwner
            ? { tipo_documento: "Solo se permite un documento vigente." }
            : Object.fromEntries(
                fields.map((f) => [f, "El valor ya está registrado."]),
              ),
        );
        used.add(key);
      }
    }
  }
  for (const ref of meta.refs)
    for (const row of db[ref.table] as Row[]) {
      if (row[ref.field] !== null)
        check(
          (db[ref.target] as Row[]).some(
            (r) => r[ref.targetField] === row[ref.field],
          ),
          `La referencia ${ref.field} no existe.`,
          "FOREIGN_KEY",
          { [ref.field]: "Selecciona un registro existente." },
        );
    }
  const assignedProducts = new Set<string>();
  for (const code of db.codigos_barras) {
    if (code.estado === "activo" || code.estado === "asignado")
      check(
        code.id_producto !== null,
        "El código vigente necesita un producto asociado.",
        "BARCODE",
        { id_producto: "Selecciona un producto." },
      );
    if (code.estado === "asignado") {
      check(
        !assignedProducts.has(code.id_producto!),
        "Solo puede haber un código asignado por producto.",
        "BARCODE",
        { estado: "El producto ya tiene un código asignado." },
      );
      assignedProducts.add(code.id_producto!);
    }
  }
  const numbers = new Set<string>();
  for (const o of db.orden_compra) {
    const key = `${groupOf(o.tipo_orden)}:${o.no_orden}`;
    check(
      !numbers.has(key),
      `La orden ${o.no_orden} ya existe en ese grupo de numeración.`,
      "R01",
      { no_orden: "Este número ya está ocupado." },
      {
        existingId: db.orden_compra.find(
          (x) =>
            x.id !== o.id &&
            groupOf(x.tipo_orden) === groupOf(o.tipo_orden) &&
            x.no_orden === o.no_orden,
        )?.id,
      },
    );
    numbers.add(key);
    const old = previous?.orden_compra.find((x) => x.id === o.id);
    check(
      !(
        old?.estado_autorizacion === "autorizada" &&
        o.estado_autorizacion !== "autorizada"
      ),
      "La autorización es irreversible.",
      "AUTHORIZATION",
    );
  }
  for (const type of ["producto", "material", "otro"])
    for (const line of db[lineTable(type)]) {
      const o = db.orden_compra.find((o) => o.id === line.id_orden_compra)!;
      check(
        o.tipo_orden === type && line.posicion >= 1 && line.posicion <= 7,
        `La orden admite hasta siete ${orderItemLabel(type, true)} de su propio tipo.`,
        "R02",
        { posicion: "Usa una posición del 1 al 7." },
      );
    }
  for (const f of db.factura)
    check(
      f.numero_factura === normalizeInvoice(f.numero_factura),
      "El número de factura debe estar normalizado.",
      "R03",
      { numero_factura: "Usa mayúsculas y elimina caracteres externos." },
    );
  const receiptTypes: Entity[] = [
    "lote_producto",
    "orden_material",
    "orden_otro",
  ];
  for (const table of receiptTypes)
    for (const receipt of db[table] as Row[])
      if (receipt.id_factura) {
        const line =
          table === "lote_producto"
            ? db.orden_producto.find((l) => l.id === receipt.id_orden_producto)!
            : receipt;
        const o = db.orden_compra.find((o) => o.id === line.id_orden_compra)!;
        check(
          db.factura.find((f) => f.id === receipt.id_factura)?.id_proveedor ===
            o.id_proveedor,
          "La factura debe pertenecer al proveedor de la orden.",
          "R03",
          { id_factura: "Proveedor incompatible con esta recepción." },
        );
      }
  for (const link of db.abastecimiento_material) {
    const p = db.orden_producto.find((p) => p.id === link.id_orden_producto)!;
    const m = db.orden_material.find((m) => m.id === link.id_orden_material)!;
    check(
      db.orden_compra.find((o) => o.id === p.id_orden_compra)?.tipo_orden ===
        "producto" &&
        db.orden_compra.find((o) => o.id === m.id_orden_compra)?.tipo_orden ===
          "material",
      "La relación de abastecimiento requiere producto y material.",
      "R05",
    );
  }
  const ownership: Record<string, string | null> = {
    factura_fisica: "factura",
    orden_compra_escaneada: "orden_compra",
    certificado_calidad: "lote_material",
    certificado_liberacion: "lote_material",
    plantilla_certificado_liberacion: null,
  };
  const documents = new Set<string>();
  for (const doc of db.documento) {
    const expected = ownership[doc.tipo_documento];
    check(
      doc.tipo_entidad === expected &&
        (expected === null
          ? doc.id_entidad === null
          : !!doc.id_entidad &&
            (db[expected as Entity] as Row[]).some(
              (r) => r.id === doc.id_entidad,
            )),
      "La clase de documento no corresponde a su propietario o el propietario no existe.",
      "R06",
      { tipo_documento: "Revisa la clase y el propietario." },
    );
    const key = JSON.stringify([
      doc.tipo_entidad,
      doc.id_entidad,
      doc.tipo_documento,
    ]);
    check(
      !documents.has(key),
      "Ya existe este documento. Reemplaza el documento vigente.",
      "R07",
      { tipo_documento: "Solo se permite un documento vigente." },
    );
    documents.add(key);
  }
  const configs = new Set<string>();
  for (const r of db.destinatario_evento) {
    const key = `${r.tipo_evento}:${r.tipo_contacto}:${canonical(r.cargo_area)}`;
    check(
      !configs.has(key),
      "Ese cargo o área ya está configurado para el evento y directorio.",
      "R09",
      { cargo_area: "Configuración repetida." },
    );
    configs.add(key);
  }
  for (const r of db.correo_enviado_destinatario)
    check(
      db.correo_enviado.some(
        (m) => m.id_correo === r.id_correo && m.remitente === r.remitente,
      ),
      "El destinatario debe pertenecer a un mensaje registrado.",
      "R11",
    );
  for (const m of db.materiales)
    check(
      m.codigo_material === null ||
        (m.codigo_material >= 0 && m.codigo_material <= 999),
      "El código MAIA debe representarse con tres dígitos.",
      "R12",
      { codigo_material: "Introduce tres dígitos." },
    );
  for (const p of db.productos) {
    const kinds = db.materiales_asociados
      .filter((a) => a.id_producto === p.id)
      .map((a) => materialKind(db, a.id_material));
    check(
      !(
        kinds.some((k) => k.includes("sticker")) &&
        kinds.some((k) => k.includes("cinta"))
      ),
      "Un producto puede llevar sticker o cinta, pero no ambos.",
      "R13",
      { id_material: "Este producto ya tiene el material excluyente." },
    );
  }
  for (const l of db.orden_producto)
    check(
      l.cantidad_sticker === null || l.cantidad_cinta === null,
      "La orden no puede registrar sticker y cinta para el mismo producto.",
      "R13",
    );
  return db;
}
export function findRecord(db: Database, table: Entity, key: Row): Row {
  const row = (db[table] as Row[]).find(
    (r) => primaryKey(table, r) === primaryKey(table, key),
  );
  check(row, "El registro ya no existe.", "NOT_FOUND");
  return row;
}
