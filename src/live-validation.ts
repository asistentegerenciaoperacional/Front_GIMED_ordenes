import type { Database } from "../shared/models";
import { selectableAddresses } from "../shared/reception-location";
import { costIssue } from "../shared/maquila-costs";
import { materialCatalogIssue } from "../shared/product-materials";
import {
  canonical,
  decimal,
  materialKind,
  materialCodeRequired,
  meta,
  primaryKey,
  schemas,
  productLotNeedsNumber,
  validEmail,
  type Entity,
  type Row,
} from "../shared/schema";
import { parseDateInput } from "./dates";

export type LiveValidation = {
  values: Row;
  valid: (field: string) => boolean;
};

export function validationSignature(values: Row): string {
  return JSON.stringify(values, (_key, value) =>
    typeof value === "bigint" ||
    (typeof value === "number" && !Number.isFinite(value))
      ? `${typeof value}:${value}`
      : value,
  );
}

export function remainingFieldErrors(
  fields: Record<string, string>,
  validation: LiveValidation,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).filter(([field]) => !validation.valid(field)),
  );
}

function normalizedField(
  entity: Entity,
  field: string,
  value: unknown,
): unknown {
  const spec = meta.tables[entity].fields[field];
  if (value === "" || value === undefined) return spec.required ? "" : null;
  if (value === null) return null;
  if (spec.type === "integer" || spec.type === "float(5,2)")
    return Number(value);
  if (
    spec.type === "datetime" &&
    typeof value === "string" &&
    value.length === 10
  ) {
    const date = parseDateInput(value);
    return date ? `${date}T12:00:00.000Z` : value;
  }
  return value;
}

export function validEntityField(
  entity: Entity,
  field: string,
  values: Row,
  db?: Database,
  record?: Row,
): boolean {
  const spec = meta.tables[entity].fields[field];
  if (!spec) return false;
  const raw = values[field];
  const value = normalizedField(entity, field, raw);
  if (spec.required && typeof value === "string" && !value.trim()) return false;
  if (!schemas[entity].shape[field].safeParse(value).success) return false;
  if (entity === "direccion" && field === "id_proveedor" && (values.tipo === "proveedor") !== (value !== null))
    return false;
  if (entity === "direccion" && field === "nombre_dir" && (typeof value !== "string" || !value.trim()))
    return false;
  if (entity === "costos_maquila" && db) {
    const normalized = Object.fromEntries(
      Object.entries(values).map(([name, raw]) => [
        name,
        normalizedField(entity, name, raw),
      ]),
    );
    const issue = costIssue(
      { ...normalized, id: record?.id },
      db.costos_maquila,
    );
    if (issue?.fields[field]) return false;
  }
  if (
    entity === "lote_producto" &&
    field === "numero_lote" &&
    productLotNeedsNumber(values) &&
    (typeof value !== "string" || !value.trim())
  )
    return false;
  if (field === "correo" && value !== null && !validEmail(String(value)))
    return false;
  if (
    entity === "materiales" &&
    field === "codigo_material" &&
    value !== null &&
    !/^\d{3}$/.test(
      typeof raw === "number" ? String(raw).padStart(3, "0") : String(raw),
    )
  )
    return false;
  if (!db) return true;
  if (field === "id_direccion" && value !== null && value !== record?.id_direccion)
    return selectableAddresses(db).some((address) => address.id === value);
  if (entity === "materiales" || entity === "tipos_materiales") {
    const issue = materialCatalogIssue(db, entity, {
      ...values,
      id: record?.id ?? values.id,
    });
    if (issue?.fields[field]) return false;
  }
  if (
    entity === "materiales" &&
    field === "codigo_material" &&
    value === null &&
    materialCodeRequired(db, values.id_tipo_material)
  )
    return false;
  const ref = meta.refs.find(
    (item) => item.table === entity && item.field === field,
  );
  if (
    ref &&
    value !== null &&
    !(db[ref.target] as Row[]).some((row) => row[ref.targetField] === value)
  )
    return false;
  if (
    field === "id_factura" &&
    value !== null &&
    ["lote_producto", "orden_material", "orden_otro"].includes(entity)
  ) {
    const line =
      entity === "lote_producto"
        ? db.orden_producto.find((row) => row.id === values.id_orden_producto)
        : values;
    const order = db.orden_compra.find(
      (row) => row.id === line?.id_orden_compra,
    );
    if (
      !order ||
      !db.factura.some(
        (row) => row.id === value && row.id_proveedor === order.id_proveedor,
      )
    )
      return false;
  }
  const others = (db[entity] as Row[]).filter(
    (row) => !record || primaryKey(entity, row) !== primaryKey(entity, record),
  );
  if (
    entity === "documento" &&
    ["tipo_documento", "tipo_entidad", "id_entidad"].includes(field) &&
    others.some(
      (row) =>
        row.tipo_entidad === values.tipo_entidad &&
        row.id_entidad === values.id_entidad &&
        row.tipo_documento === values.tipo_documento,
    )
  )
    return false;
  for (const keys of [meta.tables[entity].pk, ...meta.tables[entity].unique]) {
    if (!keys.includes(field)) continue;
    const keyValues = keys.map((key) =>
      normalizedField(entity, key, values[key]),
    );
    if (
      keyValues.some(
        (item) => item === null || item === undefined || item === "",
      )
    )
      continue;
    if (
      others.some((row) =>
        keys.every((key, index) => row[key] === keyValues[index]),
      )
    )
      return false;
  }
  if (
    entity === "destinatario_evento" &&
    ["cargo_area", "tipo_evento", "tipo_contacto"].includes(field)
  ) {
    if (
      others.some(
        (row) =>
          row.tipo_evento === values.tipo_evento &&
          row.tipo_contacto === values.tipo_contacto &&
          canonical(row.cargo_area) ===
            canonical(String(values.cargo_area ?? "")),
      )
    )
      return false;
  }
  if (
    entity === "materiales_asociados" &&
    ["id_material", "id_producto"].includes(field)
  ) {
    const kinds = [
      ...others
        .filter((row) => row.id_producto === values.id_producto)
        .map((row) => materialKind(db, row.id_material)),
      materialKind(db, values.id_material),
    ];
    if (
      kinds.some((kind) => kind.includes("sticker")) &&
      kinds.some((kind) => kind.includes("cinta"))
    )
      return false;
  }
  return true;
}

export function entityValidation(
  entity: Entity,
  values: Row,
  db?: Database,
  record?: Row,
): LiveValidation {
  return {
    values,
    valid: (field) => validEntityField(entity, field, values, db, record),
  };
}

export function validPrice(value: unknown): boolean {
  try {
    decimal(value as string | number);
    return true;
  } catch {
    return false;
  }
}
