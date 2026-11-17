import type {
  Database,
  orden_compra,
  orden_material,
  orden_otro,
} from "./models";
import { selectableAddresses } from "./reception-location";
import { orderDeliverySchema, schemas } from "./schema";
import {
  earliestMaterialDelivery,
  materialOrderDeliveryIssue,
} from "./material-demand";

export type MaterialLineEntity = "orden_material" | "orden_otro";
export type MaterialLine = orden_material | orden_otro;
export type MaterialSheetEntity = "orden_compra" | MaterialLineEntity;
export type MaterialSheetChange = {
  entity: MaterialSheetEntity;
  id: string;
  field: string;
  expected: unknown;
  value: unknown;
};
export type MaterialLineState = MaterialLine["estado"];
export type MaterialStateTarget = {
  entity: MaterialLineEntity;
  id: string;
  expected: MaterialLineState;
};

export const materialOrderFields = [
  "fecha_elaboracion",
  "fecha_solicitada_entrega",
];
export const materialPurchaseFields = [
  "cantidad_solicitada",
  "precio_unitario",
];
export const materialReceiptFields = [
  "cantidad_recibida",
  "fecha_estimada_entrega",
  "fecha_entrega",
  "id_factura",
  "id_direccion",
  "id_lote_material",
];
const fields: Record<MaterialSheetEntity, readonly string[]> = {
  orden_compra: materialOrderFields,
  orden_material: [
    ...materialPurchaseFields,
    "id_material",
    ...materialReceiptFields,
  ],
  orden_otro: [
    ...materialPurchaseFields,
    "producto",
    ...materialReceiptFields.filter((field) => field !== "id_lote_material"),
  ],
};
export const isMaterialLineEntity = (
  entity: unknown,
): entity is MaterialLineEntity =>
  entity === "orden_material" || entity === "orden_otro";
export const materialChangeKey = ({
  entity,
  id,
  field,
}: Pick<MaterialSheetChange, "entity" | "id" | "field">) =>
  `${entity}/${id}/${field}`;

export function isMaterialSheetTarget(
  value: unknown,
): value is MaterialSheetChange {
  if (!value || typeof value !== "object") return false;
  const {
    entity,
    id,
    field,
    expected,
    value: next,
  } = value as MaterialSheetChange;
  const scalar = (item: unknown) =>
    item === null ||
    typeof item === "string" ||
    (typeof item === "number" && Number.isFinite(item));
  return (
    (entity === "orden_compra" || isMaterialLineEntity(entity)) &&
    typeof id === "string" &&
    typeof field === "string" &&
    fields[entity].includes(field) &&
    scalar(expected) &&
    scalar(next)
  );
}

export function materialFieldPermission(
  order: orden_compra,
  entity: MaterialSheetEntity,
  field: string,
) {
  if (!fields[entity].includes(field) || order.tipo_orden === "producto")
    return "Celda protegida: este dato no admite edición en la hoja de OCM.";
  if (
    entity !== "orden_compra" &&
    entity !==
      (order.tipo_orden === "material" ? "orden_material" : "orden_otro")
  )
    return "El renglón no corresponde al tipo de OCM.";
  const authorized = order.estado_autorizacion === "autorizada";
  if (!authorized && materialReceiptFields.includes(field))
    return "Autoriza la OCM antes de editar la recepción.";
  if (authorized && ["id_material", "producto"].includes(field))
    return "El material o concepto está bloqueado después de autorizar.";
  return null;
}

export function materialStateAllowed(
  previous: MaterialLineState,
  next: MaterialLineState,
) {
  return next === "en_seguimiento"
    ? previous === "cerrada" || previous === "anulada"
    : (next === "cerrada" || next === "anulada") &&
        previous === "en_seguimiento";
}

export type MaterialSheetDeletionTarget = { entity: MaterialLineEntity; id: string };

/** Include linked records so confirmation cannot silently remove newly added data. */
export function materialSheetDeletionSnapshot(db: Database, targets: MaterialSheetDeletionTarget[]) {
  return targets.map(({ entity, id }) => {
    const line = (entity === "orden_material" ? db.orden_material : db.orden_otro).find((row) => row.id === id);
    const order = line && db.orden_compra.find((row) => row.id === line.id_orden_compra);
    return {
      entity, id, line: line ?? null, order: order ?? null,
      links: entity === "orden_material" ? db.abastecimiento_material.filter((link) => link.id_orden_material === id).sort((a, b) => a.id_orden_producto.localeCompare(b.id_orden_producto)) : [],
      comments: entity === "orden_material" ? db.comentario.filter((comment) => comment.id_orden_material === id).sort((a, b) => a.id.localeCompare(b.id)) : [],
    };
  });
}

const byId = <T extends { id: string }>(rows: readonly T[]) =>
  new Map(rows.map((row) => [row.id, row]));
const indexes = new WeakMap<
  Database,
  ReturnType<typeof buildMaterialSheetIndexes>
>();
function buildMaterialSheetIndexes(db: Database) {
  const linesByOrder = new Map<string, string[]>();
  for (const line of db.orden_material) {
    const lines = linesByOrder.get(line.id_orden_compra) ?? [];
    lines.push(line.id);
    linesByOrder.set(line.id_orden_compra, lines);
  }
  const originsByLine = new Map<string, string[]>();
  for (const link of db.abastecimiento_material) {
    const origins = originsByLine.get(link.id_orden_material) ?? [];
    origins.push(link.id_orden_producto);
    originsByLine.set(link.id_orden_material, origins);
  }
  return {
    orders: byId(db.orden_compra),
    materials: byId(db.materiales),
    materialLines: byId(db.orden_material),
    otherLines: byId(db.orden_otro),
    products: byId(db.productos),
    productLines: byId(db.orden_producto),
    lots: byId(db.lote_material),
    providers: byId(db.proveedor),
    invoices: byId(db.factura),
    addresses: byId(selectableAddresses(db)),
    linesByOrder,
    originsByLine,
  };
}
export function materialSheetIndexes(db: Database) {
  let indexed = indexes.get(db);
  if (!indexed) {
    indexed = buildMaterialSheetIndexes(db);
    indexes.set(db, indexed);
  }
  return indexed;
}

export function overlayMaterialSheetChanges(
  db: Database,
  changes: readonly MaterialSheetChange[],
): Database {
  if (!changes.length) return db;
  const next = { ...db };
  const groups = new Map<
    MaterialSheetEntity,
    Map<string, Record<string, unknown>>
  >();
  for (const change of changes) {
    const entity = groups.get(change.entity) ?? new Map();
    const values = entity.get(change.id) ?? {};
    values[change.field] = change.value;
    entity.set(change.id, values);
    groups.set(change.entity, entity);
  }
  const { addresses } = materialSheetIndexes(db);
  for (const [entity, edits] of groups) {
    const overlay = <T extends { id: string }>(rows: T[]): T[] =>
      rows.map((row) => {
        const edit = edits.get(row.id);
        if (!edit) return row;
        if (entity !== "orden_compra" && Object.hasOwn(edit, "id_direccion"))
          return {
            ...row,
            ...edit,
            ubicacion:
              addresses.get(String(edit.id_direccion))?.nombre_dir ?? null,
          };
        return { ...row, ...edit };
      });
    if (entity === "orden_compra") next.orden_compra = overlay(db.orden_compra);
    else if (entity === "orden_material")
      next.orden_material = overlay(db.orden_material);
    else next.orden_otro = overlay(db.orden_otro);
  }
  return next;
}

export function materialSheetRecordIssues(
  db: Database,
  entity: MaterialSheetEntity,
  id: string,
  original: Database = db,
) {
  const index = materialSheetIndexes(db);
  const before = materialSheetIndexes(original);
  const row =
    entity === "orden_compra"
      ? index.orders.get(id)
      : entity === "orden_material"
        ? index.materialLines.get(id)
        : index.otherLines.get(id);
  if (!row) return { id: "El registro ya no está disponible." };
  const parsed = schemas[entity].safeParse(row);
  const issues: Record<string, string> = Object.fromEntries(
    (parsed.error?.issues ?? []).map((issue) => [
      String(issue.path[0]),
      issue.message,
    ]),
  );
  if ("tipo_orden" in row) {
    const delivery = orderDeliverySchema.safeParse(
      row.fecha_solicitada_entrega,
    );
    if (!delivery.success)
      issues.fecha_solicitada_entrega =
        "Indica una fecha solicitada de entrega válida.";
    else if (row.tipo_orden === "material") {
      const sources = (index.linesByOrder.get(id) ?? []).flatMap((lineId) =>
        (index.originsByLine.get(lineId) ?? []).map((productId) => {
          const origin = index.productLines.get(productId);
          return (
            index.orders.get(origin?.id_orden_compra ?? "")
              ?.fecha_solicitada_entrega ?? null
          );
        }),
      );
      const issue = materialOrderDeliveryIssue(
        delivery.data,
        earliestMaterialDelivery(sources),
      );
      if (issue) issues.fecha_solicitada_entrega = issue;
    }
  } else {
    const order = index.orders.get(row.id_orden_compra);
    if (Number(row.precio_unitario) < 0)
      issues.precio_unitario = "El precio no puede ser negativo.";
    if ("id_material" in row && !index.materials.has(row.id_material))
      issues.id_material = "Selecciona un material existente.";
    if ("producto" in row && !row.producto.trim())
      issues.producto = "Indica el concepto.";
    if (
      row.id_factura &&
      index.invoices.get(row.id_factura)?.id_proveedor !== order?.id_proveedor
    )
      issues.id_factura = "La factura debe pertenecer al proveedor de la OCM.";
    if (
      "id_lote_material" in row &&
      row.id_lote_material &&
      !index.lots.has(row.id_lote_material)
    )
      issues.id_lote_material = "Selecciona un lote existente.";
    const previous =
      entity === "orden_material"
        ? before.materialLines.get(id)
        : before.otherLines.get(id);
    if (
      row.id_direccion &&
      previous?.id_direccion !== row.id_direccion &&
      !index.addresses.has(row.id_direccion)
    )
      issues.id_direccion = "Selecciona una ubicación activa.";
  }
  return issues;
}
