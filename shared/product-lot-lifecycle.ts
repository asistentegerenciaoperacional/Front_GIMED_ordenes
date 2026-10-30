import { z } from "zod";
import type { Database, lote_producto } from "./models";
import { tolerance } from "./schema";

export type ProductLotState = lote_producto["estado"];

const expectedSchema = z.array(
  z
    .object({
      id: z.string(),
      estado: z.enum(["en_seguimiento", "anulada", "cerrada"]),
      cantidad_solicitada: z.number(),
      margen_tolerancia: z.number(),
      lotes: z.array(
        z
          .object({
            id: z.string(),
            estado: z.enum(["en_seguimiento", "anulado", "cerrado"]),
            cantidad_recibida: z.number().nullable(),
          })
          .strict(),
      ),
    })
    .strict(),
);
export type ProductLotLifecycleSnapshot = z.infer<typeof expectedSchema>;

export function productLotLifecycleSnapshot(
  db: Database,
  lineIds: readonly string[],
): ProductLotLifecycleSnapshot {
  const selected = new Set(lineIds);
  const margin = tolerance(db);
  const byLine = new Map<
    string,
    { id: string; estado: ProductLotState; cantidad_recibida: number | null }[]
  >();
  for (const lot of db.lote_producto) {
    if (!selected.has(lot.id_orden_producto)) continue;
    const lots = byLine.get(lot.id_orden_producto) ?? [];
    lots.push({
      id: lot.id,
      estado: lot.estado,
      cantidad_recibida: lot.cantidad_recibida,
    });
    byLine.set(lot.id_orden_producto, lots);
  }
  return db.orden_producto
    .filter((line) => selected.has(line.id))
    .map((line) => ({
      id: line.id,
      estado: line.estado,
      cantidad_solicitada: line.cantidad_solicitada,
      margen_tolerancia: margin,
      lotes: (byLine.get(line.id) ?? []).sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function matchesProductLotLifecycleSnapshot(
  expected: unknown,
  current: ProductLotLifecycleSnapshot,
): boolean {
  const parsed = expectedSchema.safeParse(expected);
  if (!parsed.success) return false;
  const normalized = parsed.data
    .map((line) => ({
      ...line,
      lotes: [...line.lotes].sort((a, b) => a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(normalized) === JSON.stringify(current);
}
