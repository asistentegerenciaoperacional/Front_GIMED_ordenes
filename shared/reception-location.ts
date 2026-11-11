import type { Database, direccion } from "./models";

export const receptionTables = [
  "lote_producto",
  "orden_material",
  "orden_otro",
] as const;

export function selectableAddresses(db: Database): direccion[] {
  const active = new Set(
    db.proveedor.filter((row) => row.activo).map((row) => row.id),
  );
  return db.direccion.filter(
    (row) =>
      row.activa &&
      row.nombre_dir?.trim() &&
      (row.tipo === "propia" ||
        (row.id_proveedor !== null && active.has(row.id_proveedor))),
  );
}
