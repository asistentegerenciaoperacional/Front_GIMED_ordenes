import type { Database, orden_compra, orden_material } from "./models";
import { amount, cents } from "./schema";

export type LinkedMaterialLine = {
  line: orden_material;
  order: orden_compra;
};

export function indexLinkedMaterialLines(
  db: Database,
  orders = new Map(db.orden_compra.map((order) => [order.id, order])),
) {
  const lines = new Map(db.orden_material.map((line) => [line.id, line]));
  const byProductLine = new Map<string, LinkedMaterialLine[]>();
  for (const link of db.abastecimiento_material) {
    const line = lines.get(link.id_orden_material);
    const order = line && orders.get(line.id_orden_compra);
    if (!line || order?.tipo_orden !== "material") continue;
    const linked = byProductLine.get(link.id_orden_producto) ?? [];
    linked.push({ line, order });
    byProductLine.set(link.id_orden_producto, linked);
  }
  return byProductLine;
}

export function productUnitCost(
  price: string,
  linked: readonly LinkedMaterialLine[],
) {
  let total = cents(price);
  const materials: LinkedMaterialLine[] = [];
  const counted = new Set<string>();
  for (const entry of linked) {
    const { line } = entry;
    if (line.estado === "anulada" || counted.has(line.id)) continue;
    counted.add(line.id);
    materials.push(entry);
    total += cents(line.precio_unitario);
  }
  return { total: amount(total), materials };
}
