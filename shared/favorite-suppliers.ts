import type { Database } from "./models";

export const supplierName = (p: Database["proveedor"][number]) =>
  p.nombre_largo ?? p.nombre_corto ?? p.id;
export function supplierOptionLabel(
  provider: Database["proveedor"][number],
  providers: Database["proveedor"],
) {
  const name = supplierName(provider);
  return providers.some(
    (other) => other.id !== provider.id && supplierName(other) === name,
  )
    ? `${name} · ${provider.nit ? `NIT ${provider.nit}` : `Sin NIT · ${provider.id.slice(-6)}`}`
    : name;
}
export function favoriteSupplierIds(
  db: Database,
  materialIds: readonly string[],
): Set<string> {
  const selected = new Set(materialIds);
  const types = new Set(
    db.materiales
      .filter((m) => selected.has(m.id))
      .map((m) => m.id_tipo_material),
  );
  return new Set(
    db.proveedores_favoritos
      .filter((r) => types.has(r.id_tipo_material))
      .map((r) => r.id_proveedor),
  );
}
export function materialSupplierGroups(
  db: Database,
  materialIds: readonly string[],
) {
  const favorite = favoriteSupplierIds(db, materialIds);
  const eligible = db.proveedor
    .filter((p) => p.Es_materiales)
    .sort(
      (a, b) =>
        supplierName(a).localeCompare(supplierName(b), "es") ||
        a.id.localeCompare(b.id),
    );
  return {
    favorites: eligible.filter((p) => favorite.has(p.id)),
    others: eligible.filter((p) => !favorite.has(p.id)),
  };
}
export function suggestedMaterial(db: Database, provider: string) {
  const types = new Set(
    db.proveedores_favoritos
      .filter((r) => r.id_proveedor === provider)
      .map((r) => r.id_tipo_material),
  );
  return (
    db.materiales.find((m) => types.has(m.id_tipo_material)) ?? db.materiales[0]
  );
}
