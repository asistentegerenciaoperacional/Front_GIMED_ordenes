import type { ProductLotLifecycleSnapshot } from "../../shared/product-lot-lifecycle";
import { ConfirmationDialog } from "../ui";
import type { ReactNode } from "react";

export function DeleteLotsDialog({ onConfirm, onClose, busy, error, children }: {
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  busy?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return <ConfirmationDialog title="Eliminar lote" confirmLabel="Eliminar lote"
    onConfirm={onConfirm} onClose={onClose} busy={busy} destructive error={error}>
    {children}
  </ConfirmationDialog>;
}

export function DeleteProductLotsDialog({
  lots,
  expected,
  onConfirm,
  onClose,
  busy,
  error,
}: {
  lots: { id: string; number: string; product: string; order: string }[];
  expected: ProductLotLifecycleSnapshot;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  busy?: boolean;
  error?: string;
}) {
  const single = lots.length === 1;
  const selected = new Set(lots.map((lot) => lot.id));
  const leavesNoActiveLots = expected.some((line) =>
    line.lotes
      .filter((lot) => !selected.has(lot.id))
      .every((lot) => lot.estado === "anulado"),
  );
  return (
    <DeleteLotsDialog onConfirm={onConfirm} onClose={onClose} busy={busy} error={error}>
      {single ? (
        <p>
          Se eliminará el lote <strong>{lots[0].number}</strong> de{" "}
          {lots[0].product}, incluidos sus datos de recepción, Batch record e
          inspección. Esta acción no se puede deshacer.
        </p>
      ) : (
        <>
          <p>
            Se eliminarán los siguientes lotes, incluidos sus datos de
            recepción, Batch record e inspección. Esta acción no se puede
            deshacer:
          </p>
          <ul className="delete-lot-list">
            {lots.map((lot) => (
              <li key={lot.id}>
                Lote {lot.number} · {lot.product} · OC {lot.order}
              </li>
            ))}
          </ul>
        </>
      )}
      {leavesNoActiveLots && (
        <p className="notice warning">
          {single
            ? "No quedarán lotes activos de este producto. Al eliminarlo, el producto quedará anulado."
            : "No quedarán lotes activos de algunos productos. Al eliminarlos, los productos afectados quedarán anulados."}
        </p>
      )}
    </DeleteLotsDialog>
  );
}
