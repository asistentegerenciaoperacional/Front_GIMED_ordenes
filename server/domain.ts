import { randomBytes, randomUUID } from "node:crypto";
import type { Database } from "../shared/models";
import {
  blankRow,
  schemas,
  orderDeliverySchema,
  primaryKey,
  normalizeInvoice,
  groupOf,
  nextOrderNumber,
  lineTable,
  orderLines,
  orderItemLabel,
  recommendations,
  assignedBarcode,
  tolerance,
  deviation,
  isInitialProductLot,
  canonical,
  materialCodeRequired,
  validEmail,
  decimal,
  type Entity,
  type Row,
} from "../shared/schema";
import { BusinessError, check, findRecord } from "./integrity";
export const newId = () => randomBytes(12).toString("hex");
const now = () => new Date().toISOString();
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
  const delivery = requiredOrderDelivery(p.fecha_solicitada_entrega);
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
    fecha_elaboracion: p.fecha_elaboracion ?? now(),
    fecha_solicitada_entrega: delivery,
    estado_autorizacion: "no_autorizada",
    fecha_autorizacion: null,
  });
}
function createInitialProductLot(db: Database, line: Row): Row {
  return push(db, "lote_producto", {
    id_orden_producto: line.id,
    fecha_estimada_batch_record: findRecord(db, "orden_compra", {
      id: line.id_orden_compra,
    }).fecha_solicitada_entrega,
  });
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
function requireAuthorized(db: Database, line: Row) {
  const order = db.orden_compra.find((o) => o.id === line.id_orden_compra)!;
  check(
    order.estado_autorizacion === "autorizada",
    "Autoriza la orden de compra antes de gestionar el seguimiento.",
    "AUTHORIZATION",
  );
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
export type MailTransport = (message: {
  from: string;
  recipients: Row[];
  body: string;
  documents: Row[];
  event: string;
}) => Promise<string>;
const simulatedTransport: MailTransport = async () => `sim-${randomUUID()}`;
export async function command(
  db: Database,
  name: string,
  p: Row,
  transport: MailTransport = simulatedTransport,
): Promise<Row> {
  switch (name) {
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
      desired.forEach((id) => findRecord(db, "proveedor", { id }));
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
    case "editOrder":
      return saveOrder(db, p, true);
    case "authorizeOrder": {
      const o = findRecord(db, "orden_compra", { id: p.id });
      check(
        p.confirm === true,
        "Confirma que la orden física tiene todas las firmas.",
      );
      check(
        o.estado_autorizacion === "no_autorizada",
        "La orden ya está autorizada.",
      );
      o.estado_autorizacion = "autorizada";
      o.fecha_autorizacion = now();
      return {};
    }
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
      check(
        table !== "orden_producto" ||
          l.estado !== "anulada" ||
          p.estado !== "cerrada",
        "Reabre el producto anulado antes de cerrar su seguimiento.",
      );
      if (table === "orden_producto" && p.estado === "anulada") {
        check(
          p.confirm === true,
          "Confirma la anulación del producto y la eliminación de todos sus lotes.",
          "CONFIRMATION",
        );
        db.lote_producto = db.lote_producto.filter(
          (lot) => lot.id_orden_producto !== l.id,
        );
      }
      if (
        table === "orden_producto" &&
        l.estado === "anulada" &&
        p.estado === "en_seguimiento"
      ) {
        const lots = db.lote_producto.filter(
          (lot) => lot.id_orden_producto === l.id,
        );
        check(
          lots.length === 0 || p.confirm === true,
          "Este producto anulado conserva lotes anteriores. Confirma su reemplazo por un lote inicial nuevo.",
          "CONFIRMATION",
        );
        db.lote_producto = db.lote_producto.filter(
          (lot) => lot.id_orden_producto !== l.id,
        );
        createInitialProductLot(db, l);
      }
      if (p.estado === "cerrada" && table === "orden_producto") {
        const delta = deviation(db, l);
        if (delta !== null && Math.abs(delta) > tolerance(db))
          check(
            p.confirm === true,
            `La desviación es ${delta.toFixed(2)} %, fuera del margen ±${tolerance(db)} %. Confirma el cierre manual.`,
            "TOLERANCE",
            {},
            { deviation: delta },
          );
      }
      l.estado = p.estado;
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
      check(
        old || line.estado !== "anulada",
        "Reabre el producto anulado antes de agregar lotes.",
        "VALIDATION",
        { id_orden_producto: "Este producto está anulado." },
      );
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
      if (old) Object.assign(old, value);
      else push(db, "lote_producto", value);
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
      db.lote_producto = db.lote_producto.filter((row) => row.id !== lot.id);
      if (!db.lote_producto.some((row) => row.id_orden_producto === line.id))
        line.estado = "anulada";
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
      // The prototype transport confirms locally. No external email service is called.
      const messageId = await transport({
        from: preview.remitente,
        recipients: p.recipients,
        body: typeof p.body === "string" ? p.body : preview.body,
        documents: preview.documents,
        event: p.event,
      });
      check(
        typeof messageId === "string" && messageId.length,
        "El simulador no confirmó el envío.",
        "MAIL",
      );
      const message = push(db, "correo_enviado", {
        id_correo: messageId,
        remitente: preview.remitente,
        tipo_evento: p.event,
        fecha_envio: now(),
      });
      for (const r of p.recipients)
        push(db, "correo_enviado_destinatario", {
          id_correo: messageId,
          remitente: preview.remitente,
          destinatario: r.address,
          tipo_destinatario: r.type,
        });
      return { row: message };
    }
    default:
      throw new BusinessError("Operación desconocida.", "COMMAND");
  }
}
