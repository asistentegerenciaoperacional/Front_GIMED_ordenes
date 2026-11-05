import { randomBytes } from "node:crypto";
import { deliverMail, simulatedTransport, type MailTransport } from "./mail";
export type { MailTransport } from "./mail";
import { materialQuotationPreview } from "./material-quotation";
import {
  quotationEvent,
  quotationTemplate,
  quotationTemplateSchema,
} from "../shared/material-quotation";
import type { Database } from "../shared/models";
import { syncProductLineStates } from "../shared/product-line-state";
import {
  materialSupplyLinkSchema,
  materialSupplySelection,
  materialSupplyLinkAvailable,
} from "../shared/material-supply";
import { costIssue } from "../shared/maquila-costs";
import { isMaterialSupplier } from "../shared/favorite-suppliers";
import {
  buildMaterialNeeds,
  earliestMaterialDelivery,
  materialDemandSchema,
  materialOrderDeliveryIssue,
  materialNeedKey,
  needsInRange,
  type MaterialDemand,
} from "../shared/material-demand";
import {
  materialCatalogIssue,
  normalizeProductMaterialConfig,
  productMaterialConfig,
  productMaterialConfigIssue,
  productMaterialConfigShapeIssue,
  type ProductMaterialConfig,
} from "../shared/product-materials";
import {
  blankRow,
  schemas,
  orderDeliverySchema,
  orderCreationDeliveryIssue,
  primaryKey,
  normalizeInvoice,
  groupOf,
  nextOrderNumber,
  lineTable,
  orderLines,
  orderState,
  orderReference,
  orderItemLabel,
  recommendations,
  assignedBarcode,
  isInitialProductLot,
  canonical,
  materialCodeRequired,
  validEmail,
  decimal,
  type Entity,
  type Row,
} from "../shared/schema";
import { BusinessError, check, findRecord } from "./integrity";
import {
  matchesProductLotLifecycleSnapshot,
  productLotLifecycleSnapshot,
} from "../shared/product-lot-lifecycle";
import {
  saveProductOrderSheet,
  createProductLots,
} from "./product-order-sheet";
export const newId = () => randomBytes(12).toString("hex");
const now = () => new Date().toISOString();

function authorizeOrders(db: Database, ids: unknown, confirm: unknown): Row {
  check(
    confirm === true,
    "Confirma que las órdenes físicas tienen todas las firmas.",
  );
  check(
    Array.isArray(ids) &&
      ids.length > 0 &&
      ids.every((id) => typeof id === "string" && /^[a-f0-9]{24}$/.test(id)) &&
      new Set(ids).size === ids.length,
    "Selecciona órdenes válidas sin repetir.",
    "VALIDATION",
    {
      ids: "Selecciona al menos una orden; los identificadores deben ser válidos y únicos.",
    },
  );
  const byId = new Map(db.orden_compra.map((order) => [order.id, order]));
  const unavailable = ids.flatMap((id: string) => {
    const order = byId.get(id);
    if (
      order &&
      order.estado_autorizacion === "no_autorizada" &&
      orderState(db, order) !== "anulada"
    )
      return [];
    return [
      {
        id,
        reference: order
          ? orderReference(order.tipo_orden, order.no_orden)
          : id,
        reason: !order
          ? "La orden ya no existe."
          : order.estado_autorizacion !== "no_autorizada"
            ? "La orden ya está autorizada."
            : "La orden está anulada.",
      },
    ];
  });
  check(
    !unavailable.length,
    "No se autorizó ninguna orden. Revisa las órdenes que dejaron de estar disponibles.",
    "AUTHORIZATION_CHANGED",
    {},
    { orders: unavailable },
  );
  const date = now();
  for (const id of ids) {
    const order = byId.get(id)!;
    order.estado_autorizacion = "autorizada";
    order.fecha_autorizacion = date;
  }
  return {};
}
function price(value: string | number): string {
  try {
    return decimal(value);
  } catch {
    throw new BusinessError(
      "Precio inválido: usa hasta dos decimales.",
      "TYPE",
      {
        precio_unitario:
          "Introduce un precio numérico con hasta dos decimales.",
      },
    );
  }
}
const make = (table: Entity, values: Row): Row => ({
  ...blankRow(table),
  ...(Object.hasOwn(blankRow(table), "id") ? { id: newId() } : {}),
  ...values,
});
const push = (db: Database, table: Entity, values: Row) => {
  const row = make(table, values);
  const parsed = schemas[table].safeParse(row);
  if (!parsed.success)
    throw new BusinessError(
      "Revisa los campos del formulario.",
      "TYPE",
      Object.fromEntries(
        parsed.error.issues.map((e) => [e.path.join("."), e.message]),
      ),
    );
  (db[table] as Row[]).push(parsed.data);
  return parsed.data as Row;
};
export const editableEntities: Entity[] = [
  "productos",
  "proveedor",
  "direccion_proveedor",
  "contacto",
  "categorias",
  "costos_maquila",
  "tipos_materiales",
  "materiales",
  "materiales_asociados",
  "producto_corrugado",
  "contacto_interno",
  "destinatario_evento",
  "adjunto_evento",
  "lote_material",
];
export function reserveNumber(db: Database, type: string): string {
  const group = groupOf(type);
  const counter = db.consecutivo_orden.find((c) => c.grupo === group)!;
  check(counter, "Falta el consecutivo del grupo.");
  const number = nextOrderNumber(db, type);
  const existing = db.orden_compra.find(
    (o) => groupOf(o.tipo_orden) === group && o.no_orden === number,
  );
  check(
    !existing,
    `La orden ${number} ya existe.`,
    "R01",
    { no_orden: "Este número ya está ocupado." },
    { existingId: existing?.id },
  );
  if (/^\d+$/.test(number)) {
    const n = Number(number);
    check(Number.isSafeInteger(n), "Número fuera de rango.");
    counter.ultimo_numero = Math.max(counter.ultimo_numero, n);
  }
  return number;
}
function requiredOrderDelivery(value: unknown): string {
  const parsed = orderDeliverySchema.safeParse(value);
  check(
    parsed.success,
    "Indica una fecha solicitada de entrega válida.",
    "VALIDATION",
    {
      fecha_solicitada_entrega:
        parsed.error?.issues[0]?.message ??
        "Indica la fecha solicitada de entrega.",
    },
  );
  return parsed.data;
}
function requireOrderProvider(db: Database, p: Row) {
  const provider = db.proveedor.find((v) => v.id === p.id_proveedor);
  check(
    provider &&
      (p.tipo_orden === "producto"
        ? provider.Es_maquila
        : p.tipo_orden === "material"
          ? provider.Es_materiales
          : provider.Es_maquila === false && provider.Es_materiales === false),
    "Selecciona un proveedor correspondiente al tipo de orden.",
    "VALIDATION",
    { id_proveedor: "El proveedor no tiene el rol correspondiente." },
  );
}
function header(db: Database, p: Row): Row {
  const createdAt = now();
  const delivery = requiredOrderDelivery(p.fecha_solicitada_entrega);
  const deliveryIssue = orderCreationDeliveryIssue(delivery, createdAt);
  if (deliveryIssue)
    throw new BusinessError(deliveryIssue, "VALIDATION", {
      fecha_solicitada_entrega: deliveryIssue,
    });
  if (p.expected_no_orden !== undefined)
    check(
      p.expected_no_orden === nextOrderNumber(db, p.tipo_orden),
      "Otra orden actualizó el consecutivo. Se ha actualizado el número; revisa y vuelve a crear la orden.",
      "CONSECUTIVE_CHANGED",
      {
        no_orden: "El consecutivo ha cambiado desde que abriste el formulario.",
      },
    );
  check(
    p.no_orden === undefined ||
      p.no_orden === nextOrderNumber(db, p.tipo_orden),
    "El número de orden se asigna automáticamente y no se puede modificar.",
    "VALIDATION",
    { no_orden: "El número de orden es automático." },
  );
  requireOrderProvider(db, p);
  return push(db, "orden_compra", {
    tipo_orden: p.tipo_orden,
    no_orden: reserveNumber(db, p.tipo_orden),
    id_proveedor: p.id_proveedor,
    fecha_elaboracion: createdAt,
    fecha_solicitada_entrega: delivery,
    estado_autorizacion: "no_autorizada",
    fecha_autorizacion: null,
  });
}
function createInitialProductLot(db: Database, line: Row): Row {
  const lot = push(db, "lote_producto", {
    id_orden_producto: line.id,
    fecha_estimada_batch_record: findRecord(db, "orden_compra", {
      id: line.id_orden_compra,
    }).fecha_solicitada_entrega,
  });
  syncProductLineStates(db, [line.id]);
  return lot;
}
function selectBarcode(db: Database, product: string): string {
  const code = assignedBarcode(db, product);
  check(
    code,
    "Asigna un código de barras al producto antes de emitir una nueva orden.",
    "BARCODE",
    {
      id_producto:
        "El producto no tiene un código asignado para nuevas órdenes.",
    },
  );
  return code.id;
}
function expectBarcodeAssignment(
  db: Database,
  product: string,
  expected: unknown,
) {
  const current = assignedBarcode(db, product)?.id ?? null;
  check(
    expected === current,
    "La asignación del producto cambió. Revisa el código actual antes de confirmar nuevamente.",
    "BARCODE_CHANGED",
    {},
    { assignedId: current },
  );
}
function assignBarcode(
  db: Database,
  code: Database["codigos_barras"][number],
  product: string,
) {
  const previous = assignedBarcode(db, product);
  if (previous && previous.id !== code.id) {
    previous.estado = "activo";
    previous.fecha_act = now();
  }
  code.id_producto = product;
  code.estado = "asignado";
  code.fecha_act = now();
}
function saveOrder(db: Database, p: Row, edit = false): Row {
  let demand: MaterialDemand | undefined;
  if (p.abastecimiento !== undefined) {
    check(
      !edit && p.tipo_orden === "material",
      "El abastecimiento solo se admite al crear una orden de material.",
      "VALIDATION",
    );
    const parsed = materialDemandSchema.safeParse(p.abastecimiento);
    check(
      parsed.success,
      "Revisa el rango y las fuentes de abastecimiento.",
      "VALIDATION",
      {
        abastecimiento:
          "La selección de abastecimiento está incompleta o no es válida.",
      },
    );
    demand = parsed.data;
    const lineMaterials = Array.isArray(p.lines)
      ? p.lines.map((line: Row) => line.id_material)
      : [];
    const sourceMaterials = new Set(
      demand.fuentes.map((source) => source.id_material),
    );
    check(
      lineMaterials.length >= 1 &&
        lineMaterials.length <= 7 &&
        new Set(lineMaterials).size === lineMaterials.length &&
        sourceMaterials.size === lineMaterials.length &&
        lineMaterials.every((id: string) => sourceMaterials.has(id)),
      "Los materiales deben corresponder exactamente a la selección.",
      "VALIDATION",
      { lines: "Conserva los materiales seleccionados en abastecimiento." },
    );
    const current = new Map(
      needsInRange(buildMaterialNeeds(db), demand.desde, demand.hasta).map(
        (need) => [need.key, need.source],
      ),
    );
    const seen = new Set<string>();
    const sourceDeliveries: string[] = [];
    for (const source of demand.fuentes) {
      const key = materialNeedKey(source.id_orden_producto, source.id_material);
      check(
        !seen.has(key),
        "La selección contiene un vínculo repetido.",
        "VALIDATION",
      );
      seen.add(key);
      const saved = current.get(key);
      check(
        saved &&
          saved.cantidad_solicitada === source.cantidad_solicitada &&
          saved.fecha_solicitada_entrega === source.fecha_solicitada_entrega,
        "Las necesidades de material cambiaron. Revisa la selección actualizada antes de crear la OCM.",
        "SUPPLY_CHANGED",
        { abastecimiento: "Un origen cambió o ya tiene una compra vigente." },
      );
      sourceDeliveries.push(saved.fecha_solicitada_entrega);
    }
    const deliveryIssue = materialOrderDeliveryIssue(
      typeof p.fecha_solicitada_entrega === "string"
        ? p.fecha_solicitada_entrega
        : null,
      earliestMaterialDelivery(sourceDeliveries),
    );
    if (deliveryIssue)
      throw new BusinessError(deliveryIssue, "VALIDATION", {
        fecha_solicitada_entrega: deliveryIssue,
      });
  }
  check(
    p.sticker_pct === undefined ||
      (typeof p.sticker_pct === "number" &&
        Number.isFinite(p.sticker_pct) &&
        p.sticker_pct >= 1 &&
        p.sticker_pct <= 10),
    "El adicional de sticker debe estar entre 1 y 10 %.",
    "VALIDATION",
    { sticker_pct: "Introduce un porcentaje de 1 a 10." },
  );
  check(
    ["producto", "material", "otro"].includes(p.tipo_orden),
    "Selecciona el tipo de orden.",
  );
  check(
    Array.isArray(p.lines) && p.lines.length >= 1 && p.lines.length <= 7,
    `Agrega entre uno y siete ${orderItemLabel(p.tipo_orden, true)}.`,
    "R02",
    {
      lines: `La orden admite de uno a siete ${orderItemLabel(p.tipo_orden, true)}.`,
    },
  );
  const o = edit ? findRecord(db, "orden_compra", { id: p.id }) : header(db, p);
  const table = lineTable(p.tipo_orden);
  let existing = orderLines(db, o.id);
  const replacing =
    edit && p.tipo_orden === "producto" && p.id_proveedor !== o.id_proveedor;
  const previousDelivery = o.fecha_solicitada_entrega;
  if (edit) {
    const delivery = requiredOrderDelivery(p.fecha_solicitada_entrega);
    check(
      o.tipo_orden === p.tipo_orden,
      "El tipo de una orden existente no puede cambiar.",
    );
    if (p.tipo_orden === "material") {
      const materialLineIds = new Set(existing.map((line) => line.id));
      const sourceLineIds = new Set(
        db.abastecimiento_material
          .filter((link) => materialLineIds.has(link.id_orden_material))
          .map((link) => link.id_orden_producto),
      );
      const sourceDeliveries = db.orden_producto
        .filter((line) => sourceLineIds.has(line.id))
        .map(
          (line) =>
            db.orden_compra.find(
              (sourceOrder) => sourceOrder.id === line.id_orden_compra,
            )?.fecha_solicitada_entrega ?? null,
        );
      const deliveryIssue = materialOrderDeliveryIssue(
        delivery,
        earliestMaterialDelivery(sourceDeliveries),
      );
      if (deliveryIssue)
        throw new BusinessError(deliveryIssue, "VALIDATION", {
          fecha_solicitada_entrega: deliveryIssue,
        });
    }
    check(
      p.no_orden === undefined || p.no_orden === o.no_orden,
      "El número de orden es inmutable.",
      "VALIDATION",
      { no_orden: "El número de orden no se puede modificar." },
    );
    check(
      o.estado_autorizacion !== "autorizada" ||
        p.id_proveedor === o.id_proveedor,
      "El proveedor de una orden autorizada no puede cambiar.",
      "AUTHORIZATION",
      { id_proveedor: "El proveedor está bloqueado después de autorizar." },
    );
    requireOrderProvider(db, p);
    if (p.tipo_orden === "producto" && o.estado_autorizacion === "autorizada")
      check(
        p.lines.length === existing.length &&
          new Set(p.lines.map((row: Row) => row.id)).size === existing.length &&
          p.lines.every((row: Row) =>
            existing.some(
              (line) =>
                line.id === row.id && line.id_producto === row.id_producto,
            ),
          ),
        "No se pueden agregar, quitar ni sustituir productos de una orden autorizada.",
        "AUTHORIZATION",
        { lines: "Los productos de una orden autorizada están bloqueados." },
      );
    if (replacing) {
      check(
        p.confirm === true,
        "Confirma el reemplazo completo de la orden al cambiar de proveedor.",
        "CONFIRMATION",
      );
      check(
        p.lines.every((line: Row) => !line.id),
        "El reemplazo requiere productos nuevos, sin identificadores anteriores.",
        "VALIDATION",
        { lines: "No reutilices renglones de la orden anterior." },
      );
      const removed = new Set(existing.map((line) => line.id));
      db.lote_producto = db.lote_producto.filter(
        (lot) => !removed.has(lot.id_orden_producto),
      );
      db.abastecimiento_material = db.abastecimiento_material.filter(
        (link) => !removed.has(link.id_orden_producto),
      );
      db.orden_producto = db.orden_producto.filter(
        (line) => line.id_orden_compra !== o.id,
      );
      db.documento = db.documento.filter(
        (document) =>
          document.tipo_entidad !== "orden_compra" ||
          document.id_entidad !== o.id,
      );
      Object.assign(o, {
        ...blankRow("orden_compra"),
        id: o.id,
        no_orden: o.no_orden,
        tipo_orden: o.tipo_orden,
        id_proveedor: p.id_proveedor,
        fecha_elaboracion: p.fecha_elaboracion ?? now(),
        fecha_solicitada_entrega: delivery,
        estado_autorizacion: "no_autorizada",
        fecha_autorizacion: null,
      });
      existing = [];
    } else {
      o.fecha_elaboracion = p.fecha_elaboracion ?? null;
      o.fecha_solicitada_entrega = delivery;
      o.id_proveedor = p.id_proveedor;
    }
  }
  const kept = new Set<string>();
  p.lines.forEach((raw: Row, i: number) => {
    const old = existing.find((l) => l.id === raw.id);
    if (edit && raw.id)
      check(old, "El renglón ya no pertenece a esta orden.", "VALIDATION", {
        [`lines.${i}.id_producto`]:
          "Recarga la orden antes de editar sus productos.",
      });
    let values: Row = {
      id_orden_compra: o.id,
      posicion: i + 1,
      cantidad_solicitada: raw.cantidad_solicitada,
      precio_unitario: price(raw.precio_unitario),
      estado: old?.estado ?? "en_seguimiento",
    };
    if (p.tipo_orden === "producto") {
      const stickerPct =
        raw.sticker_pct === undefined ? (p.sticker_pct ?? 10) : raw.sticker_pct;
      check(
        typeof stickerPct === "number" &&
          Number.isFinite(stickerPct) &&
          stickerPct >= 1 &&
          stickerPct <= 10,
        "El adicional de sticker debe estar entre 1 y 10 %.",
        "VALIDATION",
        { [`lines.${i}.sticker_pct`]: "Introduce un porcentaje de 1 a 10." },
      );
      const product = db.productos.find((x) => x.id === raw.id_producto);
      check(product, "Selecciona un producto existente.");
      if (!old || old.id_producto !== raw.id_producto) {
        if (old)
          check(
            db.lote_producto
              .filter((lot) => lot.id_orden_producto === old.id)
              .every(isInitialProductLot),
            "No se puede sustituir un producto con información de seguimiento.",
            "VALIDATION",
            {
              [`lines.${i}.id_producto`]:
                "El producto tiene lotes con seguimiento.",
            },
          );
        check(
          product.activo === true,
          "Solo se pueden agregar productos activos a una orden de compra.",
          "VALIDATION",
          { [`lines.${i}.id_producto`]: "Selecciona un producto activo." },
        );
        check(
          product.id_maquilador === o.id_proveedor,
          "Los productos de una nueva emisión deben pertenecer al mismo maquilador.",
          "VALIDATION",
          { id_producto: "El producto pertenece a otro maquilador." },
        );
      }
      // Only new emissions resolve the assigned code. Existing lines retain their historical code.
      const code =
        old && old.id_producto === raw.id_producto
          ? old.id_codigo_barras
          : selectBarcode(db, raw.id_producto);
      const suggested = recommendations(
        db,
        raw.id_producto,
        raw.cantidad_solicitada,
        stickerPct,
      );
      values = {
        ...values,
        id_producto: raw.id_producto,
        id_codigo_barras: code,
        ref_corrugado: raw.ref_corrugado ?? suggested.ref_corrugado,
        cantidad_corrugado:
          raw.cantidad_corrugado ?? suggested.cantidad_corrugado,
        cantidad_sticker:
          raw.cantidad_sticker === undefined
            ? suggested.cantidad_sticker
            : raw.cantidad_sticker,
        cantidad_cinta:
          raw.cantidad_cinta === undefined
            ? suggested.cantidad_cinta
            : raw.cantidad_cinta,
      };
    } else if (p.tipo_orden === "material")
      values = {
        ...values,
        id_material: raw.id_material,
        fecha_estimada_entrega: old
          ? (raw.fecha_estimada_entrega ?? old.fecha_estimada_entrega)
          : o.fecha_solicitada_entrega,
      };
    else
      values = {
        ...values,
        producto: raw.producto,
        fecha_estimada_entrega: old
          ? (raw.fecha_estimada_entrega ?? old.fecha_estimada_entrega)
          : o.fecha_solicitada_entrega,
      };
    if (old) {
      Object.assign(old, values);
      const target = (db[table] as Row[]).find((r) => r.id === old.id)!;
      Object.assign(target, old);
      kept.add(old.id);
    } else {
      const line = push(db, table, values);
      kept.add(line.id);
      if (p.tipo_orden === "producto") createInitialProductLot(db, line);
      if (demand)
        for (const source of demand.fuentes) {
          if (source.id_material === raw.id_material)
            push(db, "abastecimiento_material", {
              id_orden_producto: source.id_orden_producto,
              id_orden_material: line.id,
            });
        }
    }
  });
  if (edit) {
    if (p.tipo_orden === "producto") {
      const removed = new Set(
        existing.filter((line) => !kept.has(line.id)).map((line) => line.id),
      );
      for (const id of removed) {
        const lots = db.lote_producto.filter(
          (lot) => lot.id_orden_producto === id,
        );
        check(
          lots.length <= 1 && lots.every(isInitialProductLot),
          "No se puede eliminar un producto con información de seguimiento.",
          "VALIDATION",
          {
            lines:
              "El producto tiene lotes con seguimiento; conserva el renglón.",
          },
        );
      }
      db.lote_producto = db.lote_producto.filter(
        (lot) => !removed.has(lot.id_orden_producto),
      );
      db.abastecimiento_material = db.abastecimiento_material.filter(
        (link) => !removed.has(link.id_orden_producto),
      );
      if (
        o.estado_autorizacion === "no_autorizada" &&
        previousDelivery !== o.fecha_solicitada_entrega
      )
        for (const lot of db.lote_producto)
          if (kept.has(lot.id_orden_producto) && isInitialProductLot(lot))
            lot.fecha_estimada_batch_record = o.fecha_solicitada_entrega;
    }
    // Referenced rows are protected by the integrity validator; removal cannot orphan receipts or links.
    (db[table] as Row[]) = (db[table] as Row[]).filter(
      (l) => l.id_orden_compra !== o.id || kept.has(l.id),
    );
  }
  return { orderId: o.id };
}
function requireAuthorized(
  db: Database,
  line: Row,
  orders?: ReadonlyMap<string, Row>,
) {
  const order =
    orders?.get(line.id_orden_compra) ??
    db.orden_compra.find((o) => o.id === line.id_orden_compra)!;
  check(
    order.estado_autorizacion === "autorizada",
    "Autoriza la orden de compra antes de gestionar el seguimiento.",
    "AUTHORIZATION",
  );
}

function validateLotStateExpectation(
  db: Database,
  lineIds: string[],
  expected: unknown,
  required = false,
) {
  const current = productLotLifecycleSnapshot(db, lineIds);
  check(
    (expected === undefined && !required) ||
      matchesProductLotLifecycleSnapshot(expected, current),
    "Los lotes o el estado del producto cambiaron. Revisa la selección actualizada antes de continuar.",
    "LOT_STATE_CHANGED",
    {},
    { expected: current },
  );
  return current;
}

function saveProductLotChanges(
  db: Database,
  changes: Row[],
  options: {
    expected?: unknown;
    confirm?: unknown;
    requireExpected?: boolean;
  },
) {
  const lineIds = [
    ...new Set(changes.map((lot) => String(lot.id_orden_producto))),
  ];
  const before = validateLotStateExpectation(db, lineIds, options.expected);
  const changed = new Map(changes.map((lot) => [lot.id, lot]));
  const oldById = new Map(db.lote_producto.map((lot) => [lot.id, lot]));
  const linesById = new Map(db.orden_producto.map((line) => [line.id, line]));
  const orders = new Map(db.orden_compra.map((order) => [order.id, order]));
  const lines = lineIds.map((id) => {
    const line = linesById.get(id);
    check(line, "El producto de la orden ya no existe.", "NOT_FOUND");
    return line;
  });
  for (const line of lines) requireAuthorized(db, line, orders);
  for (const lot of changes) {
    const old = oldById.get(lot.id);
    const line = linesById.get(lot.id_orden_producto)!;
    check(
      lot.estado !== "cerrado" ||
        (old?.estado !== "anulado" && line.estado !== "anulada"),
      "Reabre el lote y su producto antes de cerrar el seguimiento del lote.",
      "VALIDATION",
      {
        estado: "El lote o su producto está anulado; reábrelo antes de cerrar.",
      },
    );
  }
  const futureLots = db.lote_producto.map((lot) => changed.get(lot.id) ?? lot);
  for (const lot of changes)
    if (!oldById.has(lot.id))
      futureLots.push(lot as Database["lote_producto"][number]);
  const allAnnulled = new Map<string, boolean>();
  for (const lot of futureLots)
    allAnnulled.set(
      lot.id_orden_producto,
      (allAnnulled.get(lot.id_orden_producto) ?? true) &&
        lot.estado === "anulado",
    );
  const annulled = lines.filter((line) => {
    return line.estado !== "anulada" && allAnnulled.get(line.id) === true;
  });
  if (annulled.length) {
    const productNames = new Map(
      db.productos.map((product) => [product.id, product.nombre_producto]),
    );
    const products = annulled.map((line) => ({
      id: line.id,
      posicion: line.posicion,
      no_orden: orders.get(line.id_orden_compra)!.no_orden,
      producto: productNames.get(line.id_producto) ?? "Producto",
    }));
    check(
      options.confirm === true &&
        (!options.requireExpected || options.expected !== undefined),
      annulled.length === 1
        ? "Anular este lote dejará todos los lotes anulados y también anulará el producto de la orden. Confirma para continuar; se conservarán todos sus datos."
        : "Anular estos lotes también anulará los productos indicados porque no quedarán lotes vigentes. Confirma para continuar; se conservarán todos sus datos.",
      "CONFIRMATION",
      {},
      { expected: before, products },
    );
  }
  for (const lot of changes) {
    const old = oldById.get(lot.id);
    if (old) Object.assign(old, lot);
    else push(db, "lote_producto", lot);
  }
  syncProductLineStates(db, lineIds);
  return { rows: changes, productIds: lines.map((line) => line.id) };
}

export function setProductLotStates(db: Database, payload: Row): Row {
  check(
    Array.isArray(payload.ids) &&
      payload.ids.length > 0 &&
      payload.ids.every(
        (id: unknown) => typeof id === "string" && /^[a-f0-9]{24}$/.test(id),
      ) &&
      new Set(payload.ids).size === payload.ids.length,
    "Selecciona lotes válidos sin repetir.",
    "VALIDATION",
    { ids: "Selecciona al menos un lote, sin repetir identificadores." },
  );
  check(
    ["en_seguimiento", "cerrado", "anulado"].includes(payload.estado),
    "Estado de lote inválido.",
    "VALIDATION",
    { estado: "Selecciona un estado de lote válido." },
  );
  const lotsById = new Map(db.lote_producto.map((lot) => [lot.id, lot]));
  const changes = payload.ids.map((id: string) => {
    const lot = lotsById.get(id);
    check(lot, "El lote ya no existe.", "NOT_FOUND");
    return { ...lot, estado: payload.estado };
  });
  return saveProductLotChanges(db, changes, {
    expected: payload.expected,
    confirm: payload.confirm,
    requireExpected: true,
  });
}

function annulProductLines(db: Database, lines: Row[]) {
  const ids = new Set(lines.map((line) => line.id));
  for (const lot of db.lote_producto)
    if (ids.has(lot.id_orden_producto)) lot.estado = "anulado";
  syncProductLineStates(db, ids);
}

export async function setProductLineStates(
  db: Database,
  payload: Row,
): Promise<Row> {
  check(
    Array.isArray(payload.ids) &&
      payload.ids.length > 0 &&
      payload.ids.every(
        (id: unknown) => typeof id === "string" && /^[a-f0-9]{24}$/.test(id),
      ) &&
      new Set(payload.ids).size === payload.ids.length,
    "Selecciona productos de la orden válidos sin repetir.",
    "VALIDATION",
    {
      ids: "Selecciona al menos un producto de la orden, sin repetir identificadores.",
    },
  );
  check(
    payload.estado === "anulada",
    "El estado del producto depende de sus lotes. Cierra o reabre sus lotes, o agrega un lote en seguimiento.",
    "VALIDATION",
    { estado: "Selecciona un estado de seguimiento válido." },
  );
  const available = new Map(db.orden_producto.map((line) => [line.id, line]));
  const orders = new Map(db.orden_compra.map((order) => [order.id, order]));
  const names = new Map(
    db.productos.map((product) => [product.id, product.nombre_producto]),
  );
  const lines = payload.ids.map((id: string) => {
    const line = available.get(id);
    check(line, "El producto de la orden ya no existe.", "NOT_FOUND");
    requireAuthorized(db, line, orders);
    return line;
  });
  const expected = validateLotStateExpectation(
    db,
    payload.ids,
    payload.expected,
    true,
  );
  const products = lines.map((line: Row) => ({
    id: line.id,
    posicion: line.posicion,
    no_orden: orders.get(line.id_orden_compra)!.no_orden,
    producto: names.get(line.id_producto) ?? "Producto",
  }));
  if (payload.estado === "anulada")
    check(
      payload.confirm === true,
      "Confirma la anulación de los productos seleccionados y todos sus lotes. Se conservarán sus datos.",
      "CONFIRMATION",
      {},
      { products, expected },
    );
  annulProductLines(db, lines);
  return { productIds: lines.map((line: Row) => line.id) };
}
export function mailPreview(db: Database, p: Row): Row {
  check(
    [
      "codigos_barras_nuevos",
      "envio_orden_compra",
      "envio_certificado_calidad",
      "envio_certificado_liberacion",
    ].includes(p.event),
    "Selecciona un evento de correo.",
  );
  const order = p.orderId
    ? db.orden_compra.find((o) => o.id === p.orderId)
    : null;
  if (p.orderId) check(order, "La orden del envío no existe.");
  const productLine = p.productLineId
    ? db.orden_producto.find((l) => l.id === p.productLineId)
    : null;
  const materialLines = productLine
    ? db.abastecimiento_material
        .filter((a) => a.id_orden_producto === productLine.id)
        .map((a) =>
          db.orden_material.find((l) => l.id === a.id_orden_material)!,
        )
    : order?.tipo_orden === "material"
      ? db.orden_material.filter(
          (l) => l.id_orden_compra === order.id && l.estado !== "anulada",
        )
      : [];
  const lots = p.loteMaterialId
    ? [p.loteMaterialId]
    : [
        ...new Set(
          materialLines.map((l) => l.id_lote_material).filter(Boolean),
        ),
      ];
  for (const id of lots)
    check(
      db.lote_material.some((l) => l.id === id),
      "El lote de material no existe.",
    );
  const relatedSuppliers = lots.flatMap((id) =>
    db.orden_material
      .filter((l) => l.id_lote_material === id)
      .map(
        (l) =>
          db.orden_compra.find((o) => o.id === l.id_orden_compra)!.id_proveedor,
      ),
  );
  const supplier =
    order?.id_proveedor ??
    (new Set(relatedSuppliers).size === 1 ? relatedSuppliers[0] : null);
  const recipients: Row[] = [];
  for (const rule of db.destinatario_evento.filter(
    (c) => c.tipo_evento === p.event,
  )) {
    const contacts =
      rule.tipo_contacto === "interno"
        ? db.contacto_interno.filter((c) => c.activo)
        : db.contacto.filter((c) => c.id_proveedor === supplier);
    for (const c of contacts)
      if (
        c.correo &&
        validEmail(c.correo) &&
        canonical(c.cargo_area ?? "") === canonical(rule.cargo_area) &&
        !recipients.some(
          (r) => r.address.toLowerCase() === c.correo!.toLowerCase(),
        )
      )
        recipients.push({
          address: c.correo,
          type: rule.tipo_destinatario,
          name: c.nombre,
        });
  }
  const docs: Row[] = [];
  const missing: string[] = [];
  for (const a of db.adjunto_evento.filter((a) => a.tipo_evento === p.event)) {
    const isOrder = a.tipo_adjunto === "orden_compra_escaneada";
    const ownerIds = isOrder ? (order ? [order.id] : []) : lots;
    if (!ownerIds.length)
      missing.push(
        isOrder
          ? "Selecciona una orden para obtener su archivo escaneado."
          : "Selecciona un lote de material con su certificado.",
      );
    for (const id of ownerIds) {
      const found = db.documento.filter(
        (d) =>
          d.tipo_documento === a.tipo_adjunto &&
          d.id_entidad === id &&
          d.tipo_entidad === (isOrder ? "orden_compra" : "lote_material"),
      );
      if (!found.length)
        missing.push(
          `${a.tipo_adjunto === "orden_compra_escaneada" ? "Orden escaneada" : a.tipo_adjunto === "certificado_calidad" ? "Certificado de calidad" : "Certificado de liberación"}: ${isOrder ? order?.no_orden : db.lote_material.find((l) => l.id === id)?.numero_lote}`,
        );
      for (const d of found) {
        if (!d.clave_almacenamiento.startsWith("placeholder/"))
          missing.push(`Archivo no disponible: ${d.nombre_archivo}`);
        else if (!docs.some((x) => x.id === d.id)) docs.push(d);
      }
    }
  }
  let body =
    p.event === "codigos_barras_nuevos"
      ? `Códigos registrados para verificación y asignación:\n${db.codigos_barras
          .filter(
            (c) =>
              c.estado === "creado_gs1" &&
              (!Array.isArray(p.barcodeIds) || p.barcodeIds.includes(c.id)),
          )
          .map((c) => c.codigo)
          .join("\n")}`
      : `Adjunto ${p.event === "envio_orden_compra" ? `la orden de compra ${order?.no_orden ?? ""}` : "los certificados del lote de material"} para continuar el proceso.`;
  if (p.event === "envio_certificado_liberacion") {
    const destinations = new Set<string>();
    for (const id of lots)
      for (const m of db.orden_material.filter(
        (l) => l.id_lote_material === id && l.estado !== "anulada",
      ))
        for (const a of db.abastecimiento_material.filter(
          (a) => a.id_orden_material === m.id,
        )) {
          const line = db.orden_producto.find(
            (l) => l.id === a.id_orden_producto,
          )!;
          const o = db.orden_compra.find((o) => o.id === line.id_orden_compra)!;
          const prov = db.proveedor.find((p) => p.id === o.id_proveedor)!;
          const dirs = db.direccion_proveedor
            .filter((d) => d.id_proveedor === prov.id)
            .map((d) =>
              [d.nombre_dir, d.linea_1, d.linea_2, d.ciudad]
                .filter(Boolean)
                .join(", "),
            )
            .join(" / ");
          const contacts = db.contacto
            .filter((c) => c.id_proveedor === prov.id)
            .map((c) =>
              [c.nombre, c.correo, c.celular].filter(Boolean).join(" · "),
            )
            .join("; ");
          destinations.add(
            `${db.materiales.find((x) => x.id === m.id_material)?.nombre_material} → ${prov.nombre_largo}\nDirección: ${dirs || "Pendiente de completar"}\nContacto: ${contacts || "Pendiente de completar"}`,
          );
        }
    body += `\n\nDestinos para concertar la entrega:\n${[...destinations].join("\n\n")}`;
  }
  return {
    recipients,
    documents: docs,
    missing,
    body,
    remitente: "zamira@gimed-demo.example",
    supplier,
  };
}
export async function command(
  db: Database,
  name: string,
  p: Row,
  transport: MailTransport = simulatedTransport,
): Promise<Row> {
  switch (name) {
    case "saveQuotationTemplate": {
      const parsed = quotationTemplateSchema.safeParse(p.plantilla);
      if (!parsed.success)
        throw new BusinessError(
          "Revisa la plantilla de cotización.",
          "VALIDATION",
          Object.fromEntries(
            parsed.error.issues.map((issue) => [
              issue.path.join("."),
              issue.message,
            ]),
          ),
        );
      const current = quotationTemplate(db);
      check(
        p.expected &&
          p.expected.asunto === current.asunto &&
          p.expected.cuerpo === current.cuerpo,
        "La plantilla global cambió. Carga la versión actual y revisa tus cambios antes de guardar.",
        "QUOTATION_TEMPLATE_CHANGED",
      );
      db.plantilla_correo = [{ tipo_evento: quotationEvent, ...parsed.data }];
      return { plantilla: parsed.data };
    }
    case "sendMaterialQuotations": {
      const preview = materialQuotationPreview(db, p.borrador);
      check(
        typeof p.expected_revision === "string" &&
          p.expected_revision === preview.revision,
        "Los datos de la cotización cambiaron. Actualiza y revisa los mensajes antes de confirmar.",
        "QUOTATION_CHANGED",
      );
      check(
        !Object.keys(preview.issues).length && preview.messages.length > 0,
        "Completa los destinatarios de todos los materiales antes de enviar.",
        "VALIDATION",
        preview.issues,
      );
      const messages = [];
      for (const message of preview.messages)
        messages.push(
          await deliverMail(db, transport, {
            from: "zamira@gimed-demo.example",
            recipients: [message.recipient],
            subject: message.subject,
            body: message.body,
            documents: [],
            event: quotationEvent,
          }),
        );
      return { messages };
    }
    case "setProductMaterials": {
      const desired = {
        id_materiales: p.id_materiales,
        corrugado: p.corrugado,
      };
      for (const value of [desired, p.expected]) {
        const issue = productMaterialConfigShapeIssue(value);
        if (issue)
          throw new BusinessError(
            issue.message,
            issue.code,
            issue.fields,
            issue.details,
          );
      }
      check(
        db.productos.some((row) => row.id === p.id_producto),
        "El producto ya no existe.",
        "FOREIGN_KEY",
        { id_producto: "El producto ya no existe." },
      );
      const current = productMaterialConfig(db, p.id_producto);
      const expected = normalizeProductMaterialConfig(
        p.expected as ProductMaterialConfig,
      );
      check(
        JSON.stringify(expected) === JSON.stringify(current),
        "Los materiales de este producto cambiaron. Revisa la configuración actualizada antes de guardar.",
        "PRODUCT_MATERIALS_CHANGED",
        {},
        { current },
      );
      const issue = productMaterialConfigIssue(db, p.id_producto, desired);
      if (issue)
        throw new BusinessError(
          issue.message,
          issue.code,
          issue.fields,
          issue.details,
        );
      const config = normalizeProductMaterialConfig(
        desired as ProductMaterialConfig,
      );
      db.materiales_asociados = db.materiales_asociados.filter(
        (row) => row.id_producto !== p.id_producto,
      );
      db.materiales_asociados.push(
        ...config.id_materiales.map((id_material) => ({
          id_producto: p.id_producto,
          id_material,
        })),
      );
      db.producto_corrugado = db.producto_corrugado.filter(
        (row) => row.id_producto !== p.id_producto,
      );
      if (config.corrugado)
        db.producto_corrugado.push({
          id_producto: p.id_producto,
          ...config.corrugado,
        });
      return { config: productMaterialConfig(db, p.id_producto) };
    }
    case "setFavoriteSuppliers": {
      findRecord(db, "tipos_materiales", { id: p.id_tipo_material });
      const ids = (value: unknown): string[] => {
        check(
          Array.isArray(value) &&
            value.every((id) => typeof id === "string" && id.length > 0),
          "Selecciona proveedores válidos.",
          "TYPE",
          {
            id_proveedores:
              "La selección debe contener identificadores válidos.",
          },
        );
        return [...new Set(value as string[])].sort();
      };
      const desired = ids(p.id_proveedores);
      const expected = ids(p.expected_id_proveedores);
      for (const id of desired) {
        const provider = findRecord(db, "proveedor", { id });
        check(
          isMaterialSupplier({ Es_materiales: provider.Es_materiales }),
          "Solo se pueden agregar proveedores de materiales a los favoritos por tipo.",
          "VALIDATION",
          {
            id_proveedores:
              "Selecciona únicamente proveedores con la bandera de materiales activada.",
          },
        );
      }
      const current = db.proveedores_favoritos
        .filter((r) => r.id_tipo_material === p.id_tipo_material)
        .map((r) => r.id_proveedor)
        .sort();
      if (JSON.stringify(desired) === JSON.stringify(current))
        return { id_proveedores: current };
      check(
        JSON.stringify(expected) === JSON.stringify(current),
        "Los proveedores de este tipo cambiaron. Revisa la selección actualizada antes de guardar.",
        "FAVORITES_CHANGED",
        {},
        { id_proveedores: current },
      );
      db.proveedores_favoritos = db.proveedores_favoritos.filter(
        (r) => r.id_tipo_material !== p.id_tipo_material,
      );
      db.proveedores_favoritos.push(
        ...desired.map((id_proveedor) => ({
          id_tipo_material: p.id_tipo_material,
          id_proveedor,
        })),
      );
      return { id_proveedores: desired };
    }
    case "saveEntity": {
      const table = p.entity as Entity;
      check(
        editableEntities.includes(table),
        "Esta entidad se modifica desde su proceso correspondiente.",
      );
      const value = { ...blankRow(table), ...p.row };
      if (Object.hasOwn(value, "id") && !value.id) value.id = newId();
      const old = p.key
        ? (db[table] as Row[]).find(
            (r) => primaryKey(table, r) === primaryKey(table, p.key),
          )
        : null;
      if (p.key) check(old, "El registro ya no existe.", "NOT_FOUND");
      const parsed = schemas[table].safeParse(value);
      if (!parsed.success)
        throw new BusinessError(
          "Revisa los campos del formulario.",
          "TYPE",
          Object.fromEntries(
            parsed.error.issues.map((e) => [e.path.join("."), e.message]),
          ),
        );
      if (table === "materiales")
        check(
          parsed.data.codigo_material !== null ||
            !materialCodeRequired(db, String(parsed.data.id_tipo_material)),
          "El código MAIA es obligatorio salvo para corrugados.",
          "R12",
          { codigo_material: "Introduce exactamente tres dígitos." },
        );
      if (table === "materiales" || table === "tipos_materiales") {
        const issue = materialCatalogIssue(db, table, parsed.data);
        if (issue)
          throw new BusinessError(
            issue.message,
            issue.code,
            issue.fields,
            issue.details,
          );
      }
      if (table === "costos_maquila") {
        const issue = costIssue(parsed.data, db.costos_maquila);
        if (issue)
          throw new BusinessError(
            "Revisa el periodo del costo de maquila.",
            "COST_PERIOD_CONFLICT",
            issue.fields,
            issue,
          );
      }
      if (old)
        (db[table] as Row[])[(db[table] as Row[]).indexOf(old)] = parsed.data;
      else (db[table] as Row[]).push(parsed.data);
      return { row: parsed.data };
    }
    case "deleteEntity": {
      const table = p.entity as Entity;
      check(
        editableEntities.includes(table),
        "Esta entidad se modifica desde su proceso correspondiente.",
      );
      const record = findRecord(db, table, p.key);
      (db[table] as Row[]) = (db[table] as Row[]).filter((r) => r !== record);
      return {};
    }
    case "createOrder":
      return saveOrder(db, p);
    case "linkMaterialSupply": {
      const parsed = materialSupplyLinkSchema.safeParse(p);
      check(
        parsed.success,
        "Selecciona un material pendiente y un renglón de OCM válido.",
        "VALIDATION",
      );
      const selection = parsed.data;
      const current = materialSupplySelection(
        db,
        selection.id_orden_producto,
        selection.id_orden_material,
      );
      check(
        current &&
          JSON.stringify(current) === JSON.stringify(selection.expected) &&
          materialSupplyLinkAvailable(
            db,
            selection.id_orden_producto,
            selection.id_orden_material,
          ),
        "La necesidad o el renglón de OCM cambió. Revisa las opciones actualizadas antes de vincular.",
        "SUPPLY_CHANGED",
      );
      push(db, "abastecimiento_material", {
        id_orden_producto: selection.id_orden_producto,
        id_orden_material: selection.id_orden_material,
      });
      return {};
    }
    case "editOrder":
      return saveOrder(db, p, true);
    case "saveProductOrderSheet":
      return saveProductOrderSheet(db, p, command, (database, lots) =>
        saveProductLotChanges(database, lots, {}),
      );
    case "createProductLots":
      return createProductLots(db, p, command);
    case "setProductLotStates":
      return setProductLotStates(db, p);
    case "setProductLineStates":
      return setProductLineStates(db, p);
    case "authorizeOrder":
      return authorizeOrders(db, [p.id], p.confirm);
    case "authorizeOrders":
      return authorizeOrders(db, p.ids, p.confirm);
    case "setLineState": {
      const table = p.entity as Entity;
      check(
        ["orden_producto", "orden_material", "orden_otro"].includes(table),
        "Producto, material o concepto inválido.",
      );
      check(
        ["en_seguimiento", "anulada", "cerrada"].includes(p.estado),
        "Estado inválido.",
      );
      const l = findRecord(db, table, { id: p.id });
      requireAuthorized(db, l);
      if (table === "orden_producto")
        validateLotStateExpectation(db, [l.id], p.expected);
      if (table === "orden_producto") {
        check(
          p.estado === "anulada",
          "El estado del producto depende de sus lotes. Cierra o reabre sus lotes, o agrega un lote en seguimiento.",
          "VALIDATION",
          { estado: "Gestiona el estado desde los lotes del producto." },
        );
        check(
          p.confirm === true,
          "Confirma la anulación del producto y todos sus lotes. Se conservarán sus datos.",
          "CONFIRMATION",
        );
        annulProductLines(db, [l]);
      } else l.estado = p.estado;
      return {};
    }
    case "saveLot": {
      const line = findRecord(db, "orden_producto", {
        id: p.row.id_orden_producto,
      });
      requireAuthorized(db, line);
      const old = p.row.id
        ? findRecord(db, "lote_producto", { id: p.row.id })
        : null;
      if (old)
        check(
          old.id_orden_producto === line.id,
          "El lote no puede cambiar de producto de la orden.",
        );
      const value = {
        ...make("lote_producto", {
          fecha_estimada_batch_record: findRecord(db, "orden_compra", {
            id: line.id_orden_compra,
          }).fecha_solicitada_entrega,
        }),
        ...old,
        ...p.row,
      };
      value.numero_lote =
        typeof value.numero_lote === "string"
          ? value.numero_lote.trim() || null
          : value.numero_lote;
      if (!p.row.id) value.id = newId();
      saveProductLotChanges(db, [value], {
        expected: p.expected,
        confirm: p.confirm,
      });
      return { row: value };
    }
    case "deleteLot": {
      const lot = findRecord(db, "lote_producto", { id: p.id });
      const line = findRecord(db, "orden_producto", {
        id: lot.id_orden_producto,
      });
      requireAuthorized(db, line);
      check(
        p.confirm === true,
        "Confirma la eliminación del lote.",
        "CONFIRMATION",
      );
      validateLotStateExpectation(db, [line.id], p.expected);
      db.lote_producto = db.lote_producto.filter((row) => row.id !== lot.id);
      syncProductLineStates(db, [line.id]);
      return {};
    }
    case "saveReceipt": {
      const table = p.entity as Entity;
      check(
        ["orden_material", "orden_otro"].includes(table),
        "Recepción inválida.",
      );
      const l = findRecord(db, table, { id: p.id });
      requireAuthorized(db, l);
      const allowed = [
        "cantidad_recibida",
        "fecha_estimada_entrega",
        "fecha_entrega",
        "id_factura",
        "ubicacion",
        ...(table === "orden_material" ? ["id_lote_material"] : []),
      ];
      for (const field of allowed) if (field in p.row) l[field] = p.row[field];
      return {};
    }
    case "createInvoice": {
      const number = normalizeInvoice(p.numero_factura ?? "");
      check(number, "Escribe el número de factura.", "R03", {
        numero_factura: "Campo obligatorio.",
      });
      const exists = db.factura.find(
        (f) => f.id_proveedor === p.id_proveedor && f.numero_factura === number,
      );
      check(
        !exists,
        "Esta factura ya existe; puedes seleccionarla.",
        "R03",
        { numero_factura: "La factura ya está registrada." },
        { existingId: exists?.id },
      );
      const f = push(db, "factura", {
        numero_factura: number,
        id_proveedor: p.id_proveedor,
        fecha_registro: now(),
      });
      const attachment =
        p.document ??
        (p.placeholder
          ? {
              tipo_documento: "factura_fisica",
              nombre_archivo: `Factura-${number}.html`,
            }
          : null);
      if (attachment) {
        check(
          attachment.tipo_documento === "factura_fisica",
          "La factura requiere un documento de clase factura física.",
          "R06",
          { tipo_documento: "Selecciona Factura física." },
        );
        check(
          typeof attachment.nombre_archivo === "string" &&
            attachment.nombre_archivo.trim(),
          "Indica el nombre del archivo.",
          "R06",
          { nombre_archivo: "Campo obligatorio." },
        );
        push(db, "documento", {
          tipo_entidad: "factura",
          id_entidad: f.id,
          tipo_documento: "factura_fisica",
          clave_almacenamiento: `placeholder/${newId()}`,
          nombre_archivo: attachment.nombre_archivo.trim(),
          tipo_mime: "text/html",
          fecha_carga: now(),
        });
      }
      for (const r of p.receipts ?? []) {
        const table = r.entity as Entity;
        check(
          ["lote_producto", "orden_material", "orden_otro"].includes(table),
          "Recepción inválida.",
        );
        const record = findRecord(db, table, { id: r.id });
        const line =
          table === "lote_producto"
            ? findRecord(db, "orden_producto", { id: record.id_orden_producto })
            : record;
        requireAuthorized(db, line);
        record.id_factura = f.id;
      }
      return { row: f };
    }
    case "assignInvoice": {
      findRecord(db, "factura", { id: p.id });
      for (const r of p.unassign ?? []) {
        const table = r.entity as Entity;
        check(
          ["lote_producto", "orden_material", "orden_otro"].includes(table),
          "Recepción inválida.",
        );
        const record = findRecord(db, table, { id: r.id });
        check(
          record.id_factura === p.id,
          "La recepción no está asociada a esta factura.",
          "R03",
          { id_factura: "Desasigna únicamente recepciones de esta factura." },
        );
        check(
          !(p.receipts ?? []).some(
            (item: Row) => item.entity === table && item.id === r.id,
          ),
          "Una recepción no puede asignarse y desasignarse en la misma operación.",
          "R03",
        );
        const line =
          table === "lote_producto"
            ? findRecord(db, "orden_producto", { id: record.id_orden_producto })
            : record;
        requireAuthorized(db, line);
        record.id_factura = null;
      }
      for (const r of p.receipts ?? []) {
        const table = r.entity as Entity;
        check(
          ["lote_producto", "orden_material", "orden_otro"].includes(table),
          "Recepción inválida.",
        );
        const record = findRecord(db, table, { id: r.id });
        const line =
          table === "lote_producto"
            ? findRecord(db, "orden_producto", { id: record.id_orden_producto })
            : record;
        requireAuthorized(db, line);
        record.id_factura = p.id;
      }
      return {};
    }
    case "saveDocument": {
      const old = p.id ? findRecord(db, "documento", { id: p.id }) : null;
      const data = {
        tipo_entidad: p.tipo_entidad ?? null,
        id_entidad: p.id_entidad ?? null,
        tipo_documento: p.tipo_documento,
        clave_almacenamiento: `placeholder/${newId()}`,
        nombre_archivo: p.nombre_archivo || "Documento-simulado.html",
        tipo_mime: "text/html",
        fecha_carga: now(),
      };
      if (old)
        check(
          old.tipo_entidad === data.tipo_entidad &&
            old.id_entidad === data.id_entidad &&
            old.tipo_documento === data.tipo_documento,
          "Reemplazar conserva el propietario y la clase del documento.",
          "R06",
          {
            tipo_documento: "Reemplaza el documento de su propietario actual.",
          },
        );
      if (old) Object.assign(old, data);
      else return { row: push(db, "documento", data) };
      return { row: old };
    }
    case "deleteDocument": {
      db.documento = db.documento.filter((d) => d.id !== p.id);
      return {};
    }
    case "createBarcode":
      return {
        row: push(db, "codigos_barras", {
          codigo: p.codigo,
          id_producto: null,
          estado: "creado_gs1",
          fecha_creacion: now(),
          fecha_act: now(),
        }),
      };
    case "advanceBarcode": {
      const c = findRecord(db, "codigos_barras", {
        id: p.id,
      }) as Database["codigos_barras"][number];
      check(p.confirm === true, "Confirma el avance del código.");
      check(
        c.estado === p.expectedEstado,
        "El estado del código cambió. Revisa los datos actualizados antes de confirmar nuevamente.",
        "BARCODE_CHANGED",
      );
      if (p.estado === "verificado_sistema")
        check(c.estado === "creado_gs1", "El código debe estar creado en GS1.");
      else if (p.estado === "asignado") {
        check(
          c.estado === "verificado_sistema",
          "Verifica el código antes de asignarlo.",
        );
        findRecord(db, "productos", { id: p.id_producto });
        expectBarcodeAssignment(db, p.id_producto, p.expectedAssignedId);
        assignBarcode(db, c, p.id_producto);
        return {};
      } else {
        check(
          p.estado === "inactivo" && c.estado !== "inactivo",
          "Estado de código inválido.",
        );
        if (c.id_producto)
          expectBarcodeAssignment(db, c.id_producto, p.expectedAssignedId);
      }
      c.estado = p.estado;
      c.fecha_act = now();
      return {};
    }
    case "setAssignedBarcode": {
      check(
        p.confirm === true,
        "Confirma el cambio del código para nuevas órdenes.",
      );
      findRecord(db, "productos", { id: p.id_producto });
      const c = findRecord(db, "codigos_barras", {
        id: p.id,
      }) as Database["codigos_barras"][number];
      if (p.expectedEstado !== undefined)
        check(
          c.estado === p.expectedEstado,
          "El estado del código cambió. Revisa los datos actualizados antes de confirmar nuevamente.",
          "BARCODE_CHANGED",
        );
      expectBarcodeAssignment(db, p.id_producto, p.expectedAssignedId);
      check(
        c.estado === "activo" && c.id_producto === p.id_producto,
        "Selecciona un código activo asociado a este producto.",
        "BARCODE",
      );
      assignBarcode(db, c, p.id_producto);
      return {};
    }
    case "setTolerance": {
      const recent = [...db.parametros_seguimiento].sort((a, b) =>
        b.fecha_inicio.localeCompare(a.fecha_inicio),
      )[0];
      const at = new Date(
        Math.max(Date.now(), recent ? Date.parse(recent.fecha_inicio) + 1 : 0),
      ).toISOString();
      return {
        row: push(db, "parametros_seguimiento", {
          margen_tolerancia_pct: p.value,
          fecha_inicio: at,
        }),
      };
    }
    case "sendMail": {
      const preview = mailPreview(db, p);
      check(
        !preview.missing.length,
        `Faltan documentos: ${preview.missing.join("; ")}`,
        "R10",
      );
      check(
        Array.isArray(p.recipients) && p.recipients.length > 0,
        "Agrega al menos un destinatario.",
        "R08",
        { recipients: "Falta un destinatario." },
      );
      const seen = new Set<string>();
      for (const r of p.recipients) {
        check(
          validEmail(r.address) && ["para", "cc", "cco"].includes(r.type),
          "Revisa las direcciones y tipos de destinatario.",
          "R08",
          { recipients: "Dirección inválida." },
        );
        const key = r.address.toLowerCase();
        check(
          !seen.has(key),
          "Una dirección solo puede aparecer una vez por mensaje.",
          "R11",
          { recipients: "Dirección repetida en Para, CC o CCO." },
        );
        seen.add(key);
      }
      const message = await deliverMail(db, transport, {
        from: preview.remitente,
        recipients: p.recipients,
        body: typeof p.body === "string" ? p.body : preview.body,
        documents: preview.documents,
        event: p.event,
      });
      return { row: message };
    }
    default:
      throw new BusinessError("Operación desconocida.", "COMMAND");
  }
}
