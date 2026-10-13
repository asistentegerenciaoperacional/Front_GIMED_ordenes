import type {
  Database,
  orden_compra,
  orden_producto,
  orden_material,
  orden_otro,
  lote_producto,
  documento,
  proveedor,
} from "../shared/models";
import {
  orderItemLabel,
  orderStateFromLines,
  totalLines,
} from "../shared/schema";
import { calendarDay, type ColumnValue } from "./order-table";
import { addCalendarDays, type CustomFilterId } from "./order-filters";

export type OrderLine = orden_producto | orden_material | orden_otro;
export type OrderSummary = orden_compra & {
  ls: OrderLine[];
  p: proveedor;
  visible: string;
  name: string;
  itemValues: ColumnValue[];
  total: string;
  requestedQuantity: number;
  searchText: string;
  elaborationDay: string | null;
  deliveryDay: string | null;
  hasActiveLines: boolean;
  hasOpenLines: boolean;
  hasRecordedQuantity: boolean;
  hasReceiptWithoutInvoice: boolean;
  pendingBatchDay: string | null;
  receivedWithoutBatch: boolean;
  pendingInspection: boolean;
  receivedWithoutInspection: boolean;
  pendingConfirmation: boolean;
  readyToClose: boolean;
  hasSupplyLinks: boolean;
  hasPendingMaterial: boolean;
  hasOrderDocument: boolean;
};

export function hasPhysicalReceipt(
  quantity: number | null,
  date: string | null,
): boolean {
  return (quantity !== null && quantity > 0) || !!date;
}

function byId<T extends { id: string }>(rows: readonly T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}
function append<T>(groups: Map<string, T[]>, id: string, row: T) {
  const group = groups.get(id);
  if (group) group.push(row);
  else groups.set(id, [row]);
}

/** One read model per immutable database snapshot; never mutates saved records. */
export function buildOrderReadModel(db: Database) {
  const suppliers = byId(db.proveedor),
    products = byId(db.productos),
    materials = byId(db.materiales),
    barcodes = byId(db.codigos_barras);
  const productLines = byId(db.orden_producto),
    materialLines = byId(db.orden_material);
  const linesByOrder = new Map<string, OrderLine[]>();
  for (const lines of [db.orden_producto, db.orden_material, db.orden_otro])
    for (const line of lines) append(linesByOrder, line.id_orden_compra, line);
  const lotsByLine = new Map<string, lote_producto[]>();
  const documentByOrderId = new Map<string, documento>();
  for (const doc of db.documento) {
    if (
      doc.tipo_entidad !== "orden_compra" ||
      doc.tipo_documento !== "orden_compra_escaneada" ||
      !doc.id_entidad
    )
      continue;
    const previous = documentByOrderId.get(doc.id_entidad);
    if (!previous || doc.fecha_carga > previous.fecha_carga)
      documentByOrderId.set(doc.id_entidad, doc);
  }
  const orders = db.orden_compra.map((order): OrderSummary => {
    const ls = (linesByOrder.get(order.id) ?? []).sort(
      (a, b) => a.posicion - b.posicion,
    );
    const p = suppliers.get(order.id_proveedor)!;
    const itemValues = ls.map((line): ColumnValue => {
      const name =
        "id_producto" in line
          ? products.get(line.id_producto)?.nombre_producto
          : "id_material" in line
            ? materials.get(line.id_material)?.nombre_material
            : line.producto;
      const key =
        "id_producto" in line
          ? line.id_producto
          : "id_material" in line
            ? line.id_material
            : line.producto;
      return {
        key,
        value: name ?? null,
        label: name ?? `Sin ${orderItemLabel(order.tipo_orden)}`,
      };
    });
    const searchText = [
      order.no_orden,
      p.nombre_largo,
      p.nombre_corto,
      ...ls.flatMap((line, index) => [
        itemValues[index].value,
        "id_codigo_barras" in line
          ? barcodes.get(line.id_codigo_barras)?.codigo
          : "",
      ]),
    ]
      .join(" ")
      .toLowerCase();
    return {
      ...order,
      ls,
      p,
      visible: orderStateFromLines(order, ls),
      name:
        itemValues[0]?.label ?? `Sin ${orderItemLabel(order.tipo_orden, true)}`,
      itemValues,
      total: totalLines(ls),
      requestedQuantity: ls.reduce(
        (sum, line) => sum + line.cantidad_solicitada,
        0,
      ),
      searchText,
      elaborationDay: calendarDay(order.fecha_elaboracion),
      deliveryDay: calendarDay(order.fecha_solicitada_entrega),
      hasActiveLines: ls.some((line) => line.estado !== "anulada"),
      hasOpenLines: ls.some((line) => line.estado === "en_seguimiento"),
      hasRecordedQuantity: false,
      hasReceiptWithoutInvoice: false,
      pendingBatchDay: null,
      receivedWithoutBatch: false,
      pendingInspection: false,
      receivedWithoutInspection: false,
      pendingConfirmation: false,
      readyToClose: false,
      hasSupplyLinks: false,
      hasPendingMaterial: false,
      hasOrderDocument: documentByOrderId.has(order.id),
    };
  });
  const ordersById = byId(orders);
  const openLotsByLine = new Map<string, { count: number; unclosed: number }>();
  for (const lot of db.lote_producto) {
    append(lotsByLine, lot.id_orden_producto, lot);
    const line = productLines.get(lot.id_orden_producto);
    const order = line && ordersById.get(line.id_orden_compra);
    if (
      !line ||
      !order ||
      line.estado === "anulada" ||
      lot.estado === "anulado"
    )
      continue;
    const received = hasPhysicalReceipt(
      lot.cantidad_recibida,
      lot.fecha_recepcion,
    );
    order.hasRecordedQuantity ||= lot.cantidad_recibida !== null;
    order.hasReceiptWithoutInvoice ||= received && !lot.id_factura;
    order.receivedWithoutBatch ||= received && !lot.fecha_entrega_batch_record;
    order.pendingInspection ||=
      !!lot.fecha_entrega_batch_record && !lot.fecha_inspeccion;
    order.receivedWithoutInspection ||= received && !lot.fecha_inspeccion;
    order.pendingConfirmation ||= received && !lot.fecha_confirmacion;
    if (!lot.fecha_entrega_batch_record) {
      const day = calendarDay(lot.fecha_estimada_batch_record);
      if (day && (!order.pendingBatchDay || day < order.pendingBatchDay))
        order.pendingBatchDay = day;
    }
    const state = openLotsByLine.get(line.id) ?? { count: 0, unclosed: 0 };
    state.count++;
    if (lot.estado !== "cerrado") state.unclosed++;
    openLotsByLine.set(line.id, state);
  }
  for (const line of db.orden_producto) {
    const state = openLotsByLine.get(line.id);
    if (
      line.estado === "en_seguimiento" &&
      state &&
      state.count > 0 &&
      state.unclosed === 0
    ) {
      const order = ordersById.get(line.id_orden_compra);
      if (order) order.readyToClose = true;
    }
  }
  for (const lines of [db.orden_material, db.orden_otro]) {
    for (const line of lines) {
      const order = ordersById.get(line.id_orden_compra);
      if (!order || line.estado === "anulada") continue;
      order.hasRecordedQuantity ||= line.cantidad_recibida !== null;
      order.hasReceiptWithoutInvoice ||=
        hasPhysicalReceipt(line.cantidad_recibida, line.fecha_entrega) &&
        !line.id_factura;
    }
  }
  for (const link of db.abastecimiento_material) {
    const product = productLines.get(link.id_orden_producto),
      material = materialLines.get(link.id_orden_material);
    const productOrder = product && ordersById.get(product.id_orden_compra),
      materialOrder = material && ordersById.get(material.id_orden_compra);
    if (productOrder) {
      productOrder.hasSupplyLinks = true;
      if (
        product?.estado !== "anulada" &&
        material?.estado === "en_seguimiento"
      )
        productOrder.hasPendingMaterial = true;
    }
    if (materialOrder) materialOrder.hasSupplyLinks = true;
  }
  const ordersByNumber = new Map(
    orders.map((order) => [
      `${order.tipo_orden === "producto" ? "productos" : "materiales"}:${order.no_orden}`,
      order,
    ]),
  );
  return {
    orders,
    ordersById,
    ordersByNumber,
    linesByOrder,
    lotsByLine,
    documentByOrderId,
  };
}

/** All compound conditions were evaluated on the same lot/line during preparation. */
export function matchesCustomFilter(
  order: OrderSummary,
  filter: CustomFilterId | "",
  today: string,
): boolean {
  switch (filter) {
    case "documento_con":
      return order.hasOrderDocument;
    case "documento_sin":
      return !order.hasOrderDocument;
    case "recepciones_sin_factura":
      return order.hasReceiptWithoutInvoice;
    case "entrega_vencida":
      return (
        !!order.deliveryDay && order.deliveryDay < today && order.hasOpenLines
      );
    case "proximas_7":
    case "proximas_15":
    case "proximas_30":
      return (
        !!order.deliveryDay &&
        order.deliveryDay >= today &&
        order.deliveryDay <= addCalendarDays(today, Number(filter.slice(9)))
      );
    case "sin_recepciones":
      return order.hasActiveLines && !order.hasRecordedQuantity;
    case "batch_vencido":
      return !!order.pendingBatchDay && order.pendingBatchDay < today;
    case "recibido_sin_batch":
      return order.receivedWithoutBatch;
    case "inspeccion_pendiente":
      return order.pendingInspection;
    case "recibidos_sin_inspeccion":
      return order.receivedWithoutInspection;
    case "confirmacion_pendiente":
      return order.pendingConfirmation;
    case "seguimiento_por_cerrar":
      return order.readyToClose;
    case "vinculos_con":
      return order.hasSupplyLinks;
    case "vinculos_sin":
      return !order.hasSupplyLinks;
    case "ocm_pendientes":
      return order.hasPendingMaterial;
    default:
      return true;
  }
}

export function filterCustomOrders<T extends OrderSummary>(
  orders: readonly T[],
  filter: CustomFilterId | "",
  day: string,
): T[] {
  if (filter.startsWith("proximas_")) {
    const end = addCalendarDays(day, Number(filter.slice(9)));
    return orders.filter(
      (order) =>
        !!order.deliveryDay &&
        order.deliveryDay >= day &&
        order.deliveryDay <= end,
    );
  }
  return orders.filter((order) => matchesCustomFilter(order, filter, day));
}
