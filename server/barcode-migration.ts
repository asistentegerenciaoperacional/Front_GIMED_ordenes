import { BusinessError } from "./integrity";
import { dateSchema } from "../shared/schema";

/** Old databases allowed several assigned codes; preserve their previous choice. */
export function migrateBarcodes(input: unknown) {
  const db = input as Record<string, any>;
  if (!db || !Array.isArray(db.codigos_barras))
    throw new BusinessError(
      "Falta la colección codigos_barras.",
      "BARCODE_MIGRATION",
    );
  const products = new Set((db.productos ?? []).map((p: any) => p.id));
  const assigned = new Map<string, any[]>();
  const errors: { id: string; reason: string }[] = [];
  for (const code of db.codigos_barras) {
    if (!code) continue; // Full schema validation reports malformed records.
    if (
      ["activo", "asignado"].includes(code.estado) &&
      !products.has(code.id_producto)
    )
      errors.push({
        id: code.id,
        reason: "El código vigente necesita un producto existente.",
      });
    if (code.estado === "asignado") {
      const codes = assigned.get(code.id_producto) ?? [];
      codes.push(code);
      assigned.set(code.id_producto, codes);
    }
  }
  const demoted = new Set<string>();
  for (const codes of assigned.values()) {
    if (codes.length < 2) continue;
    const dated = codes.map((code) => ({
      code,
      date: dateSchema.safeParse(code.fecha_creacion),
    }));
    if (dated.some((item) => !item.date.success)) {
      errors.push({
        id: codes[0].id,
        reason: "Varios asignados con fecha ausente o inválida.",
      });
      continue;
    }
    dated.sort((a, b) =>
      (b.date.data as string).localeCompare(a.date.data as string),
    );
    if (dated[0].date.data === dated[1].date.data) {
      errors.push({
        id: codes[0].id,
        reason: "Varios asignados comparten la fecha más reciente.",
      });
      continue;
    }
    for (const item of dated.slice(1)) demoted.add(item.code.id);
  }
  if (errors.length)
    throw new BusinessError(
      "No se pudieron convertir los códigos de barras; el archivo original se conserva.",
      "BARCODE_MIGRATION",
      {},
      { errors },
    );
  return {
    database: demoted.size
      ? {
          ...db,
          codigos_barras: db.codigos_barras.map((code: any) =>
            demoted.has(code?.id) ? { ...code, estado: "activo" } : code,
          ),
        }
      : db,
    changed: demoted.size > 0,
    demoted: [...demoted],
  };
}
