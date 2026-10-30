import {
  decimal,
  schemas,
  productLotNeedsNumber,
  assignedBarcode,
  isInitialProductLot,
  type Row,
} from "./schema";
import type { Database } from "./models";
import { materialRole } from "./product-materials";

export type SheetEntity = "orden_compra" | "orden_producto" | "lote_producto";
export type SheetChange = {
  entity: SheetEntity;
  id: string;
  field: string;
  value: unknown;
  expected: unknown;
};
export type SheetDraft = {
  version: 1;
  timestamp: string;
  changes: SheetChange[];
};
export function isSheetDraft(value: unknown): value is SheetDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as SheetDraft;
  const scalar = (item: unknown) =>
    item === null ||
    typeof item === "string" ||
    typeof item === "boolean" ||
    (typeof item === "number" && Number.isFinite(item));
  return (
    draft.version === 1 &&
    typeof draft.timestamp === "string" &&
    Number.isFinite(Date.parse(draft.timestamp)) &&
    Array.isArray(draft.changes) &&
    draft.changes.every(
      (change) =>
        change &&
        typeof change.id === "string" &&
        typeof change.field === "string" &&
        Object.hasOwn(sheetFields, change.entity) &&
        (sheetFields[change.entity] as string[]).includes(change.field) &&
        scalar(change.expected) &&
        scalar(change.value),
    )
  );
}
export const changeKey = (
  change: Pick<SheetChange, "entity" | "id" | "field">,
) => `${change.entity}/${change.id}/${change.field}`;
export const sheetFields = {
  orden_compra: [
    "id_proveedor",
    "fecha_elaboracion",
    "fecha_solicitada_entrega",
  ],
  orden_producto: [
    "id_producto",
    "cantidad_solicitada",
    "precio_unitario",
    "cantidad_sticker",
    "cantidad_cinta",
    "ref_corrugado",
    "cantidad_corrugado",
  ],
  lote_producto: [
    "id_factura",
    "numero_lote",
    "cantidad_recibida",
    "fecha_estimada_batch_record",
    "fecha_entrega_batch_record",
    "estado_batch_record",
    "fecha_inspeccion",
    "estado_inspeccion",
    "fecha_recepcion",
    "fecha_confirmacion",
    "ubicacion",
  ],
} satisfies Record<SheetEntity, string[]>;

export function sheetPermission(
  db: Database,
  change: Pick<SheetChange, "entity" | "id" | "field">,
): string | null {
  if (
    !Object.hasOwn(sheetFields, change.entity) ||
    !(sheetFields[change.entity] as string[]).includes(change.field)
  )
    return "Celda protegida: este dato no admite edición en la hoja.";
  const record = db[change.entity].find((row) => row.id === change.id);
  if (!record) return "El registro ya no está disponible.";
  const line =
    change.entity === "lote_producto"
      ? db.orden_producto.find(
          (row) => row.id === (record as Row).id_orden_producto,
        )
      : change.entity === "orden_producto"
        ? record
        : null;
  const order =
    change.entity === "orden_compra"
      ? record
      : db.orden_compra.find(
          (row) => row.id === (line as Row)?.id_orden_compra,
        );
  if (!order || (order as Row).tipo_orden !== "producto")
    return "La hoja solo admite órdenes de productos.";
  if (
    change.entity === "lote_producto" &&
    (order as Row).estado_autorizacion !== "autorizada"
  )
    return "Celda protegida: autoriza la OC antes de editar el seguimiento del lote.";
  if (
    (order as Row).estado_autorizacion === "autorizada" &&
    ["id_proveedor", "id_producto"].includes(change.field)
  )
    return "Celda protegida: proveedor y producto están bloqueados después de autorizar.";
  return null;
}

export function overlaySheetChanges(
  db: Database,
  changes: SheetChange[],
): Database {
  if (!changes.length) return db;
  const next = { ...db };
  for (const entity of Object.keys(sheetFields) as SheetEntity[]) {
    const byId = new Map<string, SheetChange[]>();
    for (const change of changes)
      if (
        change.entity === entity &&
        (sheetFields[entity] as string[]).includes(change.field)
      )
        byId.set(change.id, [...(byId.get(change.id) ?? []), change]);
    if (byId.size)
      (next[entity] as Row[]) = db[entity].map((row) =>
        byId.has(row.id)
          ? {
              ...row,
              ...Object.fromEntries(
                byId.get(row.id)!.map((change) => [change.field, change.value]),
              ),
            }
          : row,
      );
  }
  const changedProducts = new Set(
    changes
      .filter(
        (change) =>
          change.entity === "orden_producto" && change.field === "id_producto",
      )
      .map((change) => change.id),
  );
  if (changedProducts.size)
    next.orden_producto = next.orden_producto.map((line) =>
      changedProducts.has(line.id)
        ? {
            ...line,
            id_codigo_barras:
              assignedBarcode(db, line.id_producto)?.id ??
              line.id_codigo_barras,
          }
        : line,
    );
  const changedDeliveries = new Map(
    changes
      .filter(
        (change) =>
          change.entity === "orden_compra" &&
          change.field === "fecha_solicitada_entrega" &&
          db.orden_compra.some(
            (order) =>
              order.id === change.id &&
              order.estado_autorizacion === "no_autorizada",
          ),
      )
      .map((change) => [change.id, change.value]),
  );
  if (changedDeliveries.size) {
    const lineOrder = new Map(
      db.orden_producto.map((line) => [line.id, line.id_orden_compra]),
    );
    next.lote_producto = next.lote_producto.map((lot) =>
      changedDeliveries.has(lineOrder.get(lot.id_orden_producto) ?? "") &&
      isInitialProductLot(lot) &&
      !changes.some(
        (change) =>
          change.entity === "lote_producto" &&
          change.id === lot.id &&
          change.field === "fecha_estimada_batch_record",
      )
        ? {
            ...lot,
            fecha_estimada_batch_record: changedDeliveries.get(
              lineOrder.get(lot.id_orden_producto)!,
            ) as string,
          }
        : lot,
    );
  }
  return next;
}

export function sheetRecordIssue(
  db: Database,
  entity: SheetEntity,
  id: string,
  original: Database = db,
): Record<string, string> {
  const row = db[entity].find((record) => record.id === id) as Row | undefined;
  if (!row) return { id: "El registro ya no existe." };
  const result = schemas[entity].safeParse(row);
  const issues: Record<string, string> = result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ]),
      );
  if (entity === "orden_producto") {
    try {
      decimal(row.precio_unitario);
    } catch {
      issues.precio_unitario = "Introduce un precio con hasta dos decimales.";
    }
    const product = db.productos.find(
      (product) => product.id === row.id_producto,
    );
    const order = db.orden_compra.find(
      (order) => order.id === row.id_orden_compra,
    );
    if (!product) issues.id_producto = "Selecciona un producto existente.";
    const previous = original.orden_producto.find((line) => line.id === id);
    if (previous && previous.id_producto !== row.id_producto) {
      if (product?.activo !== true)
        issues.id_producto = "Selecciona un producto activo.";
      else if (!assignedBarcode(db, row.id_producto))
        issues.id_producto = "El producto no tiene código asignado.";
      else if (
        !db.lote_producto
          .filter((lot) => lot.id_orden_producto === id)
          .every(isInitialProductLot)
      )
        issues.id_producto = "El producto tiene lotes con seguimiento.";
    }
    if (
      previous &&
      previous.ref_corrugado !== row.ref_corrugado &&
      row.ref_corrugado &&
      materialRole(db, row.ref_corrugado) !== "corrugado"
    )
      issues.ref_corrugado = "Selecciona una referencia de corrugado.";
    if (
      order?.estado_autorizacion === "no_autorizada" &&
      product?.id_maquilador !== order.id_proveedor
    )
      issues.id_producto = "El producto debe pertenecer al proveedor de la OC.";
  }
  if (entity === "lote_producto" && row.id_factura) {
    const line = db.orden_producto.find(
      (line) => line.id === row.id_orden_producto,
    );
    const order = db.orden_compra.find(
      (order) => order.id === line?.id_orden_compra,
    );
    if (
      !db.factura.some(
        (invoice) =>
          invoice.id === row.id_factura &&
          invoice.id_proveedor === order?.id_proveedor,
      )
    )
      issues.id_factura = "La factura debe pertenecer al proveedor de la OC.";
  }
  if (
    entity === "lote_producto" &&
    productLotNeedsNumber(row) &&
    (typeof row.numero_lote !== "string" || !row.numero_lote.trim())
  )
    issues.numero_lote =
      "Indica el número de lote antes de registrar seguimiento.";
  return issues;
}
