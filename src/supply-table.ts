import type { Database } from "../shared/models";
import { words, orderReference } from "../shared/schema";
import type { Column, ColumnRow, ColumnCell } from "./order-table";

export type SupplyColumnKey =
  "producto_orden" | "producto" | "material_orden" | "material" | "estado";
export const supplyColumns: Column<SupplyColumnKey>[] = [
  { key: "producto_orden", label: "Orden de producto", kind: "integer" },
  { key: "producto", label: "Producto / maquilador", kind: "text" },
  { key: "material_orden", label: "Orden de material", kind: "integer" },
  { key: "material", label: "Material / proveedor", kind: "text" },
  { key: "estado", label: "Estado del material", kind: "enum" },
];

export type SupplyTableRow = ColumnRow<SupplyColumnKey> & {
  p: Database["orden_producto"][number];
  m: Database["orden_material"][number];
  po: Database["orden_compra"][number];
  mo: Database["orden_compra"][number];
  productName: string;
  manufacturerName: string;
  materialName: string;
  supplierName: string;
};

export function searchSupplyRows(
  rows: SupplyTableRow[],
  query: string,
): SupplyTableRow[] {
  const match = /^(?:(OCM|OC)\s*)?(\d*)$/.exec(query.trim().toUpperCase());
  if (!match) return [];
  const [, prefix, number] = match;
  return rows.filter(
    ({ po, mo }) =>
      (prefix !== "OCM" && po.no_orden.includes(number)) ||
      (prefix !== "OC" && mo.no_orden.includes(number)),
  );
}

export function buildSupplyRows(db: Database): SupplyTableRow[] {
  const products = new Map(db.productos.map((row) => [row.id, row]));
  const materials = new Map(db.materiales.map((row) => [row.id, row]));
  const suppliers = new Map(db.proveedor.map((row) => [row.id, row]));
  const productLines = new Map(db.orden_producto.map((row) => [row.id, row]));
  const materialLines = new Map(db.orden_material.map((row) => [row.id, row]));
  const orders = new Map(db.orden_compra.map((row) => [row.id, row]));
  const orderCell = (order: Database["orden_compra"][number]): ColumnCell => ({
    sortValue: order.no_orden,
    values: [
      {
        key: order.no_orden,
        label: orderReference(order.tipo_orden, order.no_orden),
        value: order.no_orden,
      },
    ],
  });
  return db.abastecimiento_material.map((link) => {
    const p = productLines.get(link.id_orden_producto)!;
    const m = materialLines.get(link.id_orden_material)!;
    const po = orders.get(p.id_orden_compra)!;
    const mo = orders.get(m.id_orden_compra)!;
    const product = products.get(p.id_producto)!;
    const material = materials.get(m.id_material)!;
    const manufacturer = suppliers.get(po.id_proveedor)!;
    const supplier = suppliers.get(mo.id_proveedor)!;
    const productName = product.nombre_producto;
    const materialName = material.nombre_material ?? "";
    const manufacturerName =
      manufacturer.nombre_corto ?? manufacturer.nombre_largo ?? "";
    const supplierName = supplier.nombre_corto ?? supplier.nombre_largo ?? "";
    const productLabel = `${productName} · ${manufacturerName}`;
    const materialLabel = `${materialName} · ${supplierName}`;
    return {
      p,
      m,
      po,
      mo,
      productName,
      materialName,
      manufacturerName,
      supplierName,
      cells: {
        producto_orden: orderCell(po),
        material_orden: orderCell(mo),
        producto: {
          sortValue: productLabel,
          searchValues: [
            productName,
            manufacturerName,
            manufacturer.nombre_largo,
            manufacturer.nit,
          ].filter((v): v is string => !!v),
          values: [
            {
              key: `${product.id}:${manufacturer.id}`,
              label: productLabel,
              value: productLabel,
            },
          ],
        },
        material: {
          sortValue: materialLabel,
          searchValues: [
            materialName,
            supplierName,
            supplier.nombre_largo,
            supplier.nit,
          ].filter((v): v is string => !!v),
          values: [
            {
              key: `${material.id}:${supplier.id}`,
              label: materialLabel,
              value: materialLabel,
            },
          ],
        },
        estado: {
          sortValue: words[m.estado] ?? m.estado,
          values: [
            {
              key: m.estado,
              label: words[m.estado] ?? m.estado,
              value: m.estado,
            },
          ],
        },
      },
    };
  });
}
