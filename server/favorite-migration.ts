import { BusinessError } from "./integrity";

/** Pure conversion: no input mutation, and no inference for missing references. */
export function migrateFavoriteSuppliers(input: unknown) {
  const db = input as Record<string, any>;
  if (!db || !Array.isArray(db.proveedores_favoritos))
    throw new BusinessError(
      "Falta la colección proveedores_favoritos.",
      "FAVORITES_MIGRATION",
    );
  const materials = new Map<string, any>(
    (db.materiales ?? []).map((m: any) => [m.id, m]),
  );
  const types = new Set((db.tipos_materiales ?? []).map((t: any) => t.id));
  const providers = new Set((db.proveedor ?? []).map((p: any) => p.id));
  const pairs = new Map<
    string,
    { id_tipo_material: string; id_proveedor: string }
  >();
  const errors: { index: number; reason: string }[] = [];
  let legacy = false;
  db.proveedores_favoritos.forEach((row: any, index: number) => {
    const old = row && Object.hasOwn(row, "id_material");
    legacy ||= Boolean(old);
    const material = old ? materials.get(row.id_material) : undefined;
    const type = row?.id_tipo_material ?? material?.id_tipo_material;
    let reason = "";
    if (old && !material) reason = "El material anterior no existe.";
    else if (
      old &&
      row.id_tipo_material != null &&
      row.id_tipo_material !== material?.id_tipo_material
    )
      reason = "El tipo indicado no coincide con el material anterior.";
    else if (!types.has(type)) reason = "El tipo de material no existe.";
    else if (!providers.has(row?.id_proveedor))
      reason = "El proveedor no existe.";
    if (reason) errors.push({ index, reason });
    else
      pairs.set(JSON.stringify([type, row.id_proveedor]), {
        id_tipo_material: type,
        id_proveedor: row.id_proveedor,
      });
  });
  if (errors.length)
    throw new BusinessError(
      "No se pudo convertir proveedores favoritos. Corrige las referencias indicadas; el archivo original se conserva.",
      "FAVORITES_MIGRATION",
      {},
      { errors },
    );
  const converted = [...pairs.values()];
  const changed =
    legacy || converted.length !== db.proveedores_favoritos.length;
  return {
    database: changed ? { ...db, proveedores_favoritos: converted } : db,
    changed,
    before: db.proveedores_favoritos.length,
    after: converted.length,
  };
}
