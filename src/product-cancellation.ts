import { productStateFromLots } from "../shared/product-line-state";
import type { Database } from "../shared/models";
import type { ProductLotLifecycleSnapshot } from "../shared/product-lot-lifecycle";
import { confirmAction } from "./components/overlays";

export function cancellationMessage(
  db: Database,
  kind: "lot" | "product",
  expected: ProductLotLifecycleSnapshot,
  lotIds: readonly string[] = [],
) {
  const selected = new Set(lotIds);
  const affected =
    kind === "lot"
      ? expected.filter(
          (line) =>
            line.estado !== "anulada" &&
            line.lotes.every(
              (lot) => lot.estado === "anulado" || selected.has(lot.id),
            ),
        )
      : expected;
  const closing =
    kind === "lot"
      ? expected.filter(
          (line) =>
            line.estado !== "cerrada" &&
            productStateFromLots(
              line.lotes.map((lot) => ({
                estado: selected.has(lot.id) ? "anulado" : lot.estado,
              })),
            ) === "cerrada",
        )
      : [];
  const multiple = kind === "product" ? expected.length > 1 : lotIds.length > 1;
  let message =
    kind === "product"
      ? multiple
        ? "Se anularán los productos y todos sus lotes."
        : "Se anulará el producto y todos sus lotes."
      : multiple
        ? "Se anularán los lotes seleccionados."
        : "Se anulará el lote seleccionado.";
  if (kind === "lot" && affected.length)
    message +=
      affected.length === 1
        ? " Esta acción anulará el último lote y también el producto."
        : " Esta acción anulará los últimos lotes y también sus productos.";
  if (closing.length)
    message +=
      closing.length === 1
        ? " El producto quedará cerrado porque no quedarán lotes en seguimiento y conservará lotes cerrados."
        : ` ${closing.length} productos quedarán cerrados porque no tendrán lotes en seguimiento y conservarán lotes cerrados.`;
  if (kind === "lot" && expected.length > 1 && affected.length)
    message += ` Productos afectados: ${affected
      .map((item) => {
        const line = db.orden_producto.find((row) => row.id === item.id);
        const order = db.orden_compra.find(
          (row) => row.id === line?.id_orden_compra,
        );
        const product = db.productos.find(
          (row) => row.id === line?.id_producto,
        );
        return `OC ${order?.no_orden ?? "—"}, ${product?.nombre_producto ?? "Producto"}, renglón ${line?.posicion ?? "—"}`;
      })
      .join("; ")}.`;
  return `${message} La información de los lotes se conservará. ¿Está seguro?`;
}

export function confirmProductCancellation(
  db: Database,
  kind: "lot" | "product",
  expected: ProductLotLifecycleSnapshot,
  lotIds: readonly string[] = [],
) {
  const multiple = kind === "lot" ? lotIds.length > 1 : expected.length > 1;
  const label =
    kind === "lot"
      ? multiple
        ? "Anular lotes"
        : "Anular lote"
      : multiple
        ? "Anular productos"
        : "Anular producto";
  return confirmAction(
    cancellationMessage(db, kind, expected, lotIds),
    label,
    true,
  );
}
