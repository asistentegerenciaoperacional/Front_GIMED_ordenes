import type { Database } from "./models";

export const isMaterialSupplier = (
  provider: Pick<Database["proveedor"][number], "Es_materiales">,
): boolean => provider.Es_materiales === true;

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
  const eligible = new Set(
    db.proveedor.filter(isMaterialSupplier).map((p) => p.id),
  );
  const selected = new Set(materialIds);
  const types = new Set(
    db.materiales
      .filter((m) => selected.has(m.id))
      .map((m) => m.id_tipo_material),
  );
  return new Set(
    db.proveedores_favoritos
      .filter(
        (r) => types.has(r.id_tipo_material) && eligible.has(r.id_proveedor),
      )
      .map((r) => r.id_proveedor),
  );
}
export function materialSupplierGroups(
  db: Database,
  materialIds: readonly string[],
) {
  const favorite = favoriteSupplierIds(db, materialIds);
  const eligible = db.proveedor
    .filter(isMaterialSupplier)
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
  const eligible = db.proveedor.some(
    (p) => p.id === provider && isMaterialSupplier(p),
  );
  const types = new Set(
    db.proveedores_favoritos
      .filter((r) => eligible && r.id_proveedor === provider)
      .map((r) => r.id_tipo_material),
  );
  return (
    db.materiales.find((m) => types.has(m.id_tipo_material)) ?? db.materiales[0]
  );
}
