import type { Database, lote_producto, orden_producto } from "./models";

/** Persisted order-line state, derived only when its lots change. */
export function productStateFromLots(
  lots: Iterable<Pick<lote_producto, "estado">>,
): orden_producto["estado"] {
  let closed = false;
  for (const lot of lots) {
    if (lot.estado === "en_seguimiento") return "en_seguimiento";
    if (lot.estado === "cerrado") closed = true;
  }
  return closed ? "cerrada" : "anulada";
}

/** Mutation/fixture helper; never run in read models or application startup. */
export function syncProductLineStates(db: Database, ids: Iterable<string>) {
  const selected = new Set(ids);
  const lots = new Map<string, lote_producto[]>();
  for (const lot of db.lote_producto) {
    if (!selected.has(lot.id_orden_producto)) continue;
    const group = lots.get(lot.id_orden_producto) ?? [];
    group.push(lot);
    lots.set(lot.id_orden_producto, group);
  }
  for (const line of db.orden_producto) {
    if (selected.has(line.id))
      line.estado = productStateFromLots(lots.get(line.id) ?? []);
  }
}
