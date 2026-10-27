import type {
  Database,
  orden_compra,
  orden_producto,
  productos,
  materiales,
  proveedor,
} from "./models";
import { materialTypeRole } from "./product-materials";
import { increasedQuantity } from "./schema";
import { z } from "zod";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function validDemandDay(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function materialDemandDay(value: string | null): string | null {
  if (!value) return null;
  if (validDemandDay(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = dayFormat.formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function earliestMaterialDelivery(
  deliveries: Iterable<string | null>,
): string | null {
  let earliest: string | null = null;
  for (const value of deliveries) {
    const day = materialDemandDay(value);
    if (day && (!earliest || day < earliest)) earliest = day;
  }
  return earliest;
}
export function materialOrderDeliveryIssue(
  delivery: string | null,
  earliestSourceDay: string | null,
): string | null {
  const day = materialDemandDay(delivery);
  return day && earliestSourceDay && day >= earliestSourceDay
    ? `La fecha solicitada de entrega de la OCM debe ser anterior a la fecha de entrega más próxima de las OC asociadas (${earliestSourceDay.split("-").reverse().join("/")}).`
    : null;
}
const daySchema = z.string().refine(validDemandDay, "Indica una fecha válida.");
export const materialDemandSchema = z
  .object({
    desde: daySchema,
    hasta: daySchema,
    fuentes: z
      .array(
        z
          .object({
            id_orden_producto: z.string().min(1),
            id_material: z.string().min(1),
            cantidad_solicitada: z.number().int().refine(Number.isSafeInteger),
            fecha_solicitada_entrega: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .refine((value) => value.desde <= value.hasta, {
    message: "Desde debe ser anterior o igual a Hasta.",
    path: ["hasta"],
  });
export type MaterialDemand = z.infer<typeof materialDemandSchema>;
export type MaterialSource = MaterialDemand["fuentes"][number];
export type MaterialNeed = {
  key: string;
  source: MaterialSource;
  deliveryDay: string;
  order: orden_compra;
  line: orden_producto;
  product: productos;
  material: materiales;
  provider: proveedor;
  materialType: string;
};
export const materialNeedKey = (productLine: string, material: string) =>
  `${productLine}/${material}`;

/** Linear indexes per immutable snapshot; an existing purchase covers a pair, not an entire OC. */
export function buildMaterialNeeds(
  db: Database,
  orderId?: string,
): MaterialNeed[] {
  const materials = new Map(db.materiales.map((m) => [m.id, m]));
  const types = new Map(
    db.tipos_materiales.map((t) => [t.id, t.tipo_material ?? ""]),
  );
  const specific = new Set(
    db.materiales
      .filter(
        (m) => materialTypeRole(types.get(m.id_tipo_material)) === "general",
      )
      .map((m) => m.id),
  );
  const products = new Map(db.productos.map((p) => [p.id, p]));
  const providers = new Map(db.proveedor.map((p) => [p.id, p]));
  const orders = new Map(
    db.orden_compra
      .filter(
        (o) =>
          o.tipo_orden === "producto" &&
          o.estado_autorizacion === "autorizada" &&
          (!orderId || o.id === orderId),
      )
      .map((order) => [
        order.id,
        { order, day: materialDemandDay(order.fecha_solicitada_entrega) },
      ]),
  );
  const materialLines = new Map(
    db.orden_material
      .filter((m) => m.estado !== "anulada")
      .map((m) => [m.id, m]),
  );
  const covered = new Set<string>();
  for (const link of db.abastecimiento_material) {
    const material = materialLines.get(link.id_orden_material);
    if (material)
      covered.add(
        materialNeedKey(link.id_orden_producto, material.id_material),
      );
  }
  const byProduct = new Map<string, string[]>();
  for (const relation of db.materiales_asociados) {
    if (!specific.has(relation.id_material)) continue;
    const list = byProduct.get(relation.id_producto) ?? [];
    list.push(relation.id_material);
    byProduct.set(relation.id_producto, list);
  }
  const needs: MaterialNeed[] = [];
  for (const line of db.orden_producto) {
    const header = orders.get(line.id_orden_compra);
    if (line.estado !== "en_seguimiento" || !header?.day) continue;
    const product = products.get(line.id_producto);
    const provider = providers.get(header.order.id_proveedor);
    if (!product || !provider) continue;
    for (const id of byProduct.get(line.id_producto) ?? []) {
      const key = materialNeedKey(line.id, id);
      const material = materials.get(id)!;
      if (covered.has(key)) continue;
      needs.push({
        key,
        deliveryDay: header.day,
        order: header.order,
        line,
        product,
        material,
        provider,
        materialType: types.get(material.id_tipo_material) ?? "",
        source: {
          id_orden_producto: line.id,
          id_material: id,
          cantidad_solicitada: line.cantidad_solicitada,
          fecha_solicitada_entrega: header.order.fecha_solicitada_entrega!,
        },
      });
    }
  }
  return needs;
}
export function needsInRange(
  needs: MaterialNeed[],
  desde: string,
  hasta: string,
) {
  if (!validDemandDay(desde) || !validDemandDay(hasta) || desde > hasta)
    return [];
  return needs.filter(
    (need) => need.deliveryDay >= desde && need.deliveryDay <= hasta,
  );
}
export function demandQuantity(base: number | bigint, percent: number): number {
  if (!Number.isFinite(percent) || percent < 5 || percent > 10)
    throw new RangeError("Introduce un adicional entre 5 y 10 %.");
  if (typeof base === "number" && !Number.isSafeInteger(base))
    throw new RangeError("Cantidad base fuera de rango.");
  const total = increasedQuantity(base, percent);
  if (!Number.isSafeInteger(total))
    throw new RangeError("Cantidad recomendada fuera de rango.");
  return total;
}
export function consolidateMaterialSources(sources: MaterialSource[]) {
  const groups = new Map<
    string,
    {
      id_material: string;
      cantidad_base: number;
      cantidad_solicitada: number;
      precio_unitario: string;
      adicional_pct: number;
      fuentes: MaterialSource[];
    }
  >();
  const seen = new Set<string>();
  for (const source of sources) {
    const key = materialNeedKey(source.id_orden_producto, source.id_material);
    if (seen.has(key))
      throw new Error("La selección contiene un vínculo repetido.");
    seen.add(key);
    const group = groups.get(source.id_material) ?? {
      id_material: source.id_material,
      cantidad_base: 0,
      cantidad_solicitada: 0,
      precio_unitario: "0.00",
      adicional_pct: 10,
      fuentes: [],
    };
    const base =
      BigInt(group.cantidad_base) + BigInt(source.cantidad_solicitada);
    if (
      base > BigInt(Number.MAX_SAFE_INTEGER) ||
      base < BigInt(Number.MIN_SAFE_INTEGER)
    )
      throw new RangeError("Cantidad base fuera de rango.");
    group.cantidad_base = Number(base);
    group.cantidad_solicitada = demandQuantity(base, 10);
    group.fuentes.push(source);
    groups.set(source.id_material, group);
  }
  if (groups.size < 1 || groups.size > 7)
    throw new Error("Selecciona entre uno y siete materiales distintos.");
  return [...groups.values()];
}
