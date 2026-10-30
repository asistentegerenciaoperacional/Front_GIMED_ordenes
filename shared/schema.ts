import { z } from "zod";
z.config(z.locales.es());
import metadata from "./entities.json";
import type { Database } from "./models";
import { costDay } from "./maquila-costs";
import { materialRole } from "./product-materials";
export type Entity = keyof Database;
export type Row = Record<string, any>;
export type FieldSpec = {
  type: string;
  required: boolean;
  default?: unknown;
  prototype?: boolean;
};
export const meta = metadata as {
  enums: Record<string, string[]>;
  tables: Record<
    Entity,
    { fields: Record<string, FieldSpec>; pk: string[]; unique: string[][] }
  >;
  refs: { table: Entity; field: string; target: Entity; targetField: string }[];
};
export const entities = Object.keys(meta.tables) as Entity[];
export const idSchema = z
  .string({ error: "Selecciona un registro existente." })
  .regex(/^[a-f\d]{24}$/, "Identificador interno inválido.");
export const decimalSchema = z
  .string()
  .regex(
    /^-?\d{1,12}\.\d{2}$/,
    "Usa hasta 12 dígitos enteros y dos decimales.",
  );
export const dateSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
export const orderDeliverySchema = z
  .string({ error: "Indica la fecha solicitada de entrega." })
  .trim()
  .min(1, "Indica la fecha solicitada de entrega.")
  .pipe(dateSchema);
export function orderCreationDeliveryIssue(
  delivery: unknown,
  createdAt: string,
): string | null {
  const deliveryDay = costDay(delivery);
  const creationDay = costDay(createdAt);
  return deliveryDay && creationDay && deliveryDay < creationDay
    ? `La fecha solicitada de entrega no puede ser anterior a la fecha de elaboración (${creationDay.split("-").reverse().join("/")}).`
    : null;
}
export const lotNumberRequiredMessage =
  "Indica el número de lote antes de registrar datos de seguimiento o cerrar el lote.";
export function productLotNeedsNumber(row: Row): boolean {
  return (
    [
      "id_factura",
      "cantidad_recibida",
      "fecha_entrega_batch_record",
      "fecha_inspeccion",
      "fecha_recepcion",
      "fecha_confirmacion",
      "ubicacion",
    ].some(
      (field) =>
        row[field] !== null && row[field] !== undefined && row[field] !== "",
    ) ||
    (row.estado_batch_record ?? "pendiente") !== "pendiente" ||
    (row.estado_inspeccion ?? "pendiente") !== "pendiente" ||
    row.estado === "cerrado"
  );
}
export function isInitialProductLot(row: Row): boolean {
  return (
    row.numero_lote === null &&
    !productLotNeedsNumber(row) &&
    row.estado === "en_seguimiento" &&
    row.estado_batch_record === "pendiente" &&
    row.estado_inspeccion === "pendiente"
  );
}
export const schemas = Object.fromEntries(
  entities.map((name) => {
    const shape: Record<string, z.ZodType> = {};
    for (const [field, spec] of Object.entries(meta.tables[name].fields)) {
      let type: z.ZodType =
        spec.type === "object_id"
          ? idSchema
          : spec.type === "integer"
            ? z
                .number()
                .int()
                .refine(Number.isSafeInteger, "Entero fuera de rango.")
            : spec.type === "boolean"
              ? z.boolean()
              : spec.type === "datetime"
                ? dateSchema
                : spec.type === "decimal(14,2)"
                  ? decimalSchema
                  : spec.type === "float(5,2)"
                    ? z
                        .number()
                        .finite()
                        .refine(
                          (n) =>
                            Math.abs(n) < 1000 &&
                            Math.abs(n * 100 - Math.round(n * 100)) < 1e-7,
                          "Hasta tres dígitos enteros y dos decimales.",
                        )
                    : meta.enums[spec.type]
                      ? z.enum(meta.enums[spec.type] as [string, ...string[]])
                      : z.string();
      if (spec.required && spec.type === "varchar")
        type = z.string().min(1, "Campo obligatorio.");
      if (name === "lote_producto" && field === "numero_lote")
        type = z
          .string()
          .trim()
          .min(1, "Escribe un número de lote o deja el campo vacío.");
      if (name === "costos_maquila" && field === "costo")
        type = z
          .number({ error: "Ingresa un costo entero mayor que cero." })
          .int("Ingresa un costo entero mayor que cero.")
          .positive("Ingresa un costo entero mayor que cero.")
          .refine(Number.isSafeInteger, "Entero fuera de rango.");
      shape[field] = spec.required ? type : type.nullable();
    }
    const schema = z.strictObject(shape);
    return [
      name,
      name === "lote_producto"
        ? schema.refine(
            (row) => !productLotNeedsNumber(row) || Boolean(row.numero_lote),
            {
              path: ["numero_lote"],
              message: lotNumberRequiredMessage,
            },
          )
        : schema,
    ];
  }),
) as Record<Entity, z.ZodObject>;
export function emptyDatabase(): Database {
  return Object.fromEntries(
    entities.map((k) => [k, []]),
  ) as unknown as Database;
}
export function blankRow(entity: Entity): Row {
  return Object.fromEntries(
    Object.entries(meta.tables[entity].fields).map(([field, spec]) => [
      field,
      spec.default ?? null,
    ]),
  );
}
export function primaryKey(entity: Entity, row: Row): string {
  return JSON.stringify(meta.tables[entity].pk.map((k) => row[k]));
}
export function normalizeInvoice(value: string): string {
  return value
    .replace(
      /^[\s\u200B-\u200D\u2060\uFEFF]+|[\s\u200B-\u200D\u2060\uFEFF]+$/g,
      "",
    )
    .toUpperCase();
}
export function decimal(value: string | number): string {
  const input = String(value).trim().replace(",", ".");
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(input))
    throw new Error("Precio inválido: usa como máximo dos decimales.");
  const [whole, part = ""] = input.split(".");
  return `${whole}.${part.padEnd(2, "0")}`;
}
export function cents(value: string): bigint {
  const negative = value.startsWith("-");
  const [a, b] = value.replace("-", "").split(".");
  return (BigInt(a) * 100n + BigInt(b)) * (negative ? -1n : 1n);
}
export function amount(value: bigint): string {
  const n = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
}
export function totalLines(lines: Row[]): string {
  return amount(
    lines.reduce(
      (sum, l) =>
        sum + cents(l.precio_unitario) * BigInt(l.cantidad_solicitada),
      0n,
    ),
  );
}
export const canonical = (s: string) =>
  s
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const groupOf = (type: string) =>
  type === "producto" ? "producto" : "material";
export const orderPrefix = (type: string): "OC" | "OCM" =>
  type === "producto" ? "OC" : "OCM";
export const orderReference = (type: string, number: string | number) =>
  `${orderPrefix(type)} ${number}`;
export const nextOrderNumber = (db: Database, type: string) =>
  String(
    (db.consecutivo_orden.find((counter) => counter.grupo === groupOf(type))
      ?.ultimo_numero ?? 0) + 1,
  );
export const orderItemLabel = (type: string, plural = false): string =>
  type === "producto"
    ? plural
      ? "productos"
      : "producto"
    : type === "material"
      ? plural
        ? "materiales"
        : "material"
      : plural
        ? "conceptos"
        : "concepto";
export const lineTable = (
  type: string,
): "orden_producto" | "orden_material" | "orden_otro" =>
  type === "producto"
    ? "orden_producto"
    : type === "material"
      ? "orden_material"
      : "orden_otro";
export function orderLines(db: Database, id: string): Row[] {
  const order = db.orden_compra.find((o) => o.id === id);
  return order
    ? db[lineTable(order.tipo_orden)]
        .filter((l) => l.id_orden_compra === id)
        .sort((a, b) => a.posicion - b.posicion)
    : [];
}
export function orderState(db: Database, order: Row): string {
  return orderStateFromLines(order, orderLines(db, order.id));
}
export function orderStateFromLines(order: Row, lines: Row[]): string {
  if (lines.length && lines.every((l) => l.estado === "anulada"))
    return "anulada";
  if (lines.some((l) => l.estado === "anulada")) return "parcialmente_anulada";
  if (lines.length && lines.every((l) => l.estado === "cerrada"))
    return "cerrada";
  return order.estado_autorizacion === "autorizada"
    ? "autorizada"
    : "no_autorizada";
}
export function assignedBarcode(db: Database, product: string) {
  return db.codigos_barras.find(
    (c) => c.id_producto === product && c.estado === "asignado",
  );
}
export function currentCost(
  db: Database,
  product: string,
  at = new Date().toISOString(),
) {
  const day = costDay(at);
  if (!day) return undefined;
  return db.costos_maquila.find(
    (c) =>
      c.id_producto === product &&
      costDay(c.fecha_inicio)! <= day &&
      (!c.fecha_fin || costDay(c.fecha_fin)! >= day),
  );
}
export function materialKind(db: Database, id: string): string {
  const m = db.materiales.find((m) => m.id === id);
  return canonical(
    db.tipos_materiales.find((t) => t.id === m?.id_tipo_material)
      ?.tipo_material ?? "",
  );
}
export function materialCodeRequired(db: Database, typeId: string): boolean {
  const type = db.tipos_materiales.find((row) => row.id === typeId);
  return canonical(type?.tipo_material ?? "") !== "corrugado";
}
export function recommendations(
  db: Database,
  productId: string,
  quantity: number,
  stickerPct = 10,
) {
  const box = db.producto_corrugado.find((c) => c.id_producto === productId);
  const kinds = db.materiales_asociados
    .filter((a) => a.id_producto === productId)
    .map((a) => materialRole(db, a.id_material));
  return {
    ref_corrugado: box?.id_material ?? null,
    cantidad_corrugado:
      box && box.unidades_por_corrugado !== 0
        ? ceilRatio(BigInt(quantity), BigInt(box.unidades_por_corrugado)) + 5
        : null,
    cantidad_sticker: kinds.includes("sticker")
      ? increasedQuantity(BigInt(quantity) * 2n, stickerPct)
      : null,
    cantidad_cinta: kinds.includes("cinta")
      ? ceilRatio(BigInt(quantity), 4000n)
      : null,
  };
}
export function ceilRatio(n: bigint, d: bigint): number {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  return Number(n >= 0n ? (n + d - 1n) / d : n / d);
}
export function increasedQuantity(
  quantity: number | bigint,
  percent: number,
): number {
  const [whole, fraction = ""] = String(percent).split(".");
  const scale = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction);
  return ceilRatio(BigInt(quantity) * (100n * scale + numerator), 100n * scale);
}
export function tolerance(db: Database): number {
  return (
    [...db.parametros_seguimiento].sort((a, b) =>
      b.fecha_inicio.localeCompare(a.fecha_inicio),
    )[0]?.margen_tolerancia_pct ?? 10
  );
}
export function deviation(db: Database, line: Row): number | null {
  if (!line.cantidad_solicitada) return null;
  const received = db.lote_producto
    .filter((l) => l.id_orden_producto === line.id && l.estado === "cerrado")
    .reduce((n, l) => n + (l.cantidad_recibida ?? 0), 0);
  return (
    ((received - line.cantidad_solicitada) / line.cantidad_solicitada) * 100
  );
}
export const titles: Record<Entity, string> = {
  plantilla_correo: "Plantilla de cotización",
  productos: "Productos",
  codigos_barras: "Códigos de barras",
  proveedor: "Proveedores",
  direccion_proveedor: "Direcciones de proveedor",
  contacto: "Contactos de proveedor",
  categorias: "Categorías",
  costos_maquila: "Costos de maquila",
  tipos_materiales: "Tipos de material",
  materiales: "Materiales",
  materiales_asociados: "Materiales por producto",
  producto_corrugado: "Corrugado por producto",
  proveedores_favoritos: "Proveedores favoritos por tipo",
  orden_compra: "Órdenes",
  orden_producto: "Productos de la orden",
  lote_producto: "Lotes de producto",
  orden_material: "Materiales de la orden",
  lote_material: "Lotes de material",
  orden_otro: "Otros conceptos",
  abastecimiento_material: "Vínculos de abastecimiento",
  factura: "Facturas",
  documento: "Documentos",
  parametros_seguimiento: "Tolerancia de seguimiento",
  consecutivo_orden: "Consecutivos",
  contacto_interno: "Contactos internos",
  destinatario_evento: "Destinatarios por evento",
  adjunto_evento: "Adjuntos por evento",
  correo_enviado: "Correos simulados",
  correo_enviado_destinatario: "Destinatarios enviados",
};
export const labels: Record<string, string> = {
  nombre_producto: "Producto",
  id_maquilador: "Maquilador",
  id_categoria: "Categoría",
  unidades_lote: "Unidades por lote",
  activo: "Activo",
  codigo: "Código",
  id_producto: "Producto",
  fecha_creacion: "Creación",
  fecha_act: "Actualización",
  nombre_largo: "Nombre completo",
  nombre_corto: "Nombre resumido",
  nit: "NIT",
  digito_verf: "Dígito de verificación",
  Es_maquila: "Proveedor de maquila",
  Es_materiales: "Proveedor de materiales",
  id_proveedor: "Proveedor",
  nombre_dir: "Nombre de la bodega",
  ciudad: "Ciudad",
  linea_1: "Dirección",
  linea_2: "Complemento",
  nombre: "Nombre",
  celular: "Celular",
  cargo_area: "Cargo o área",
  correo: "Correo",
  nombre_categoria: "Categoría",
  iva: "IVA (%)",
  costo: "Costo de maquila",
  fecha_inicio: "Vigente desde",
  fecha_fin: "Vigente hasta",
  tipo_material: "Tipo de material",
  codigo_material: "Código MAIA (3 dígitos)",
  id_tipo_material: "Tipo de material",
  nombre_material: "Material",
  id_material: "Material",
  unidades_por_corrugado: "Unidades por corrugado",
  numero_lote: "Número de lote",
  margen_tolerancia_pct: "Tolerancia (%)",
  tipo_evento: "Evento",
  tipo_contacto: "Directorio",
  tipo_destinatario: "Destinatario",
  tipo_adjunto: "Clase de adjunto",
  cantidad_recibida: "Cantidad recibida",
  fecha_estimada_batch_record: "Batch record estimado",
  fecha_entrega_batch_record: "Batch record recibido",
  estado_batch_record: "Estado de batch record",
  fecha_inspeccion: "Fecha de inspección",
  estado_inspeccion: "Inspección",
  fecha_recepcion: "Recepción",
  fecha_confirmacion: "Confirmación",
  ubicacion: "Ubicación de recepción",
  estado: "Estado",
  fecha_estimada_entrega: "Entrega estimada",
  fecha_entrega: "Entrega recibida",
  id_lote_material: "Lote de material",
  id_factura: "Factura",
  fecha_carga: "Fecha de carga",
  nombre_archivo: "Nombre del archivo",
  tipo_documento: "Clase de documento",
  fecha_registro: "Registro",
  numero_factura: "Número de factura",
  precio_unitario: "Precio unitario",
  cantidad_solicitada: "Cantidad solicitada",
  tipo_orden: "Tipo de orden",
  no_orden: "Número de orden",
  fecha_elaboracion: "Elaboración",
  fecha_solicitada_entrega: "Entrega solicitada",
};
export const words: Record<string, string> = {
  no_autorizada: "No autorizada",
  autorizada: "Autorizada",
  parcialmente_anulada: "Parcialmente anulada",
  anulada: "Anulada",
  cerrada: "Cerrada",
  cerrado: "Cerrado",
  anulado: "Anulado",
  en_seguimiento: "En seguimiento",
  pendiente: "Pendiente",
  recibido: "Recibido",
  validado: "Validado",
  rechazado: "Rechazado",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  creado_gs1: "Creado en GS1",
  verificado_sistema: "Verificado en sistema",
  activo: "Activo",
  asignado: "Asignado",
  inactivo: "Inactivo",
  producto: "Producto",
  productos: "Productos",
  material: "Material",
  materiales: "Materiales",
  concepto: "Concepto",
  conceptos: "Conceptos",
  otro: "Otros",
  interno: "Internos",
  proveedor: "Proveedor",
  para: "Para",
  cc: "CC",
  cco: "CCO",
  codigos_barras_nuevos: "Códigos nuevos",
  cotizacion_materiales: "Cotización de materiales",
  envio_orden_compra: "Orden de compra",
  envio_certificado_calidad: "Certificado de calidad",
  envio_certificado_liberacion: "Certificado de liberación",
  orden_compra_escaneada: "Orden escaneada",
  factura_fisica: "Factura física",
  certificado_calidad: "Certificado de calidad",
  certificado_liberacion: "Certificado de liberación",
  plantilla_certificado_liberacion: "Plantilla de liberación",
};
