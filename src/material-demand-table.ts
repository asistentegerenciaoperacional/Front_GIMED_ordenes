import {
  buildMaterialNeeds,
  type MaterialNeed,
} from "../shared/material-demand";
import type { Database } from "../shared/models";
import { canonical, orderReference } from "../shared/schema";
import type { Column, ColumnRow, ColumnCell } from "./order-table";
import { formatDateInput } from "./dates";

export type DemandColumnKey =
  "material" | "orden" | "producto" | "cantidad" | "entrega";
export type DemandRow = MaterialNeed &
  ColumnRow<DemandColumnKey> & { searchText: string };
export const demandColumns: Column<DemandColumnKey>[] = [
  { key: "material", label: "Material / MAIA", kind: "text" },
  { key: "orden", label: "OC", kind: "integer" },
  { key: "producto", label: "Producto / maquilador", kind: "text" },
  { key: "cantidad", label: "Cantidad de producto", kind: "integer" },
  { key: "entrega", label: "Entrega solicitada", kind: "date" },
];
export const pendingPrefix = "pendientes_";
export function readDemandParams(params: URLSearchParams) {
  return new URLSearchParams(
    [...params]
      .filter(([key]) => key.startsWith(pendingPrefix))
      .map(([key, value]) => [key.slice(pendingPrefix.length), value]),
  );
}
export function buildDemandRows(db: Database): DemandRow[] {
  return buildMaterialNeeds(db).map((need) => {
    const code =
      need.material.codigo_material == null
        ? "Sin código MAIA"
        : String(need.material.codigo_material).padStart(3, "0");
    const maker =
      need.provider.nombre_corto ?? need.provider.nombre_largo ?? "";
    const cell = (
      key: string,
      label: string,
      value = label,
      searchValues?: string[],
    ): ColumnCell => ({
      sortValue: value,
      values: [{ key, label, value }],
      searchValues,
    });
    return {
      ...need,
      searchText: canonical(
        [
          need.order.no_orden,
          `OC${need.order.no_orden}`,
          orderReference("producto", need.order.no_orden),
          need.product.nombre_producto,
          maker,
          need.provider.nombre_largo,
          need.material.nombre_material,
          code,
          need.materialType,
        ].join(" "),
      ),
      cells: {
        material: cell(
          need.material.id,
          `${need.material.nombre_material ?? "Material"} · ${code}`,
          need.material.nombre_material ?? "",
          [need.material.nombre_material ?? "", code, need.materialType],
        ),
        orden: cell(
          need.order.no_orden,
          orderReference("producto", need.order.no_orden),
          need.order.no_orden,
        ),
        producto: cell(
          `${need.product.id}/${need.provider.id}`,
          `${need.product.nombre_producto} · ${maker}`,
        ),
        cantidad: cell(
          String(need.line.cantidad_solicitada),
          String(need.line.cantidad_solicitada),
        ),
        entrega: cell(
          need.deliveryDay,
          formatDateInput(need.deliveryDay),
          need.deliveryDay,
        ),
      },
    };
  });
}
export function searchDemandRows(rows: DemandRow[], query: string) {
  const terms = canonical(query).split(/\s+/).filter(Boolean);
  return terms.length
    ? rows.filter((row) => terms.every((term) => row.searchText.includes(term)))
    : rows;
}
