import { receptionTables } from "../shared/reception-location";

export function migrateReceptionData(input: Record<string, unknown>) {
  const database = { ...input };
  let changed = false;
  if (Object.hasOwn(database, "direccion_proveedor")) {
    if (
      Object.hasOwn(database, "direccion") ||
      !Array.isArray(database.direccion_proveedor)
    )
      throw new Error(
        "El catálogo de direcciones anterior no se puede migrar automáticamente.",
      );
    database.direccion = database.direccion_proveedor.map((row) => ({
      ...row,
      tipo: "proveedor",
      activa: true,
    }));
    delete database.direccion_proveedor;
    changed = true;
  }
  for (const name of ["usuario", "comentario"]) {
    if (!Object.hasOwn(database, name)) {
      database[name] = [];
      changed = true;
    }
  }
  for (const name of receptionTables) {
    const rows = database[name];
    if (
      Array.isArray(rows) &&
      rows.some((row) => !Object.hasOwn(row, "id_direccion"))
    ) {
      database[name] = rows.map((row) =>
        Object.hasOwn(row, "id_direccion")
          ? row
          : { ...row, id_direccion: null },
      );
      changed = true;
    }
  }
  return { database, changed };
}
