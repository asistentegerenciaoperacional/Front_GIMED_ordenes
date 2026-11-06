import { Check, Info } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { orderReference } from "../shared/schema";
import { CheckChoice, FieldEditContext } from "./components/controls";
import { ApiError, Button, Dialog, ErrorNotice, useApp } from "./ui";

export type OrderSelection = {
  ids: ReadonlySet<string>;
  toggle: (id: string) => void;
};

export function OrderAuthorizationDialog({
  ids,
  multiple = false,
  onClose,
  onAuthorized,
  onUnavailable,
}: {
  ids: readonly string[];
  multiple?: boolean;
  onClose: () => void;
  onAuthorized: () => void;
  onUnavailable?: (ids: string[]) => void;
}) {
  const { db, run } = useApp();
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const submitting = useRef(false);
  const orders = ids.flatMap((id) => {
    const order = db.orden_compra.find((item) => item.id === id);
    return order ? [order] : [];
  });
  const unavailable = error?.code === "AUTHORIZATION_CHANGED";
  const title = multiple
    ? `Autorizar órdenes (${orders.length})`
    : `Autorizar orden ${orders[0]?.no_orden ?? ""}`;
  const submit = async () => {
    if (submitting.current || !signed || !ids.length || unavailable) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await run(
        multiple ? "authorizeOrders" : "authorizeOrder",
        multiple
          ? { ids: [...ids], confirm: true }
          : { id: ids[0], confirm: true },
        multiple ? `${ids.length} órdenes autorizadas` : "Orden autorizada",
      );
      onAuthorized();
    } catch (cause) {
      const failure =
        cause instanceof ApiError
          ? cause
          : new ApiError({ message: (cause as Error).message });
      setError(failure);
      setSigned(false);
      if (
        failure.code === "AUTHORIZATION_CHANGED" &&
        Array.isArray(failure.details.orders)
      )
        onUnavailable?.(
          failure.details.orders.map((item: { id: string }) => item.id),
        );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={title}
      subtitle={
        multiple
          ? "La autorización corresponde a la totalidad de cada orden seleccionada."
          : "La autorización corresponde a toda la orden de compra."
      }
      busy={busy}
      className="authorization-dialog"
      onClose={onClose}
    >
      <div className="dialog-body">
        <ErrorNotice error={error} />
        {unavailable && Array.isArray(error.details.orders) && (
          <ul className="authorization-conflicts">
            {error.details.orders.map(
              (item: { id: string; reference: string; reason: string }) => (
                <li key={item.id}>
                  {item.reference}: {item.reason}
                </li>
              ),
            )}
          </ul>
        )}
        {multiple && (
          <div className="authorization-orders">
            {orders.length ? (
              <ul className="dialog-item-list" aria-label="Órdenes a autorizar">
                {orders.map((order) => {
                  const supplier = db.proveedor.find(
                    (item) => item.id === order.id_proveedor,
                  );
                  return (
                    <li key={order.id}>
                      <strong>
                        {orderReference(order.tipo_orden, order.no_orden)}
                      </strong>
                      <span>{" · "}
                        {supplier?.nombre_corto ??
                          supplier?.nombre_largo ??
                          "Sin proveedor"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>No quedan órdenes disponibles en la selección.</p>
            )}
          </div>
        )}
        <div className="notice warning">
          <Info size={17} aria-hidden="true" />
          {multiple
            ? "Esta acción es irreversible. Las órdenes no podrán volver a no autorizadas."
            : "Esta acción es irreversible. La orden no podrá volver a no autorizada."}
        </div>
        <FieldEditContext.Provider value={() => {}}>
          <CheckChoice
            className="checkbox-row"
            checked={signed}
            disabled={busy || unavailable || !ids.length}
            onChange={setSigned}
          >
            {multiple
              ? "Confirmo que todas las órdenes físicas tienen todas las firmas necesarias."
              : "Confirmo que la orden física tiene todas las firmas necesarias."}
          </CheckChoice>
        </FieldEditContext.Provider>
      </div>
      <div className="dialog-footer">
        <Button disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        {unavailable ? (
          <Button onClick={onClose}>Revisar selección</Button>
        ) : (
          <Button
            variant="primary"
            icon={Check}
            disabled={!signed || busy || !ids.length}
            onClick={() => void submit()}
          >
            {busy ? "Autorizando…" : "Confirmar autorización"}
          </Button>
        )}
      </div>
    </Dialog>
  );
}

// This component owns every selected ID and the confirmation state. Unmounting
// it releases the session without copying the database into a selection cache.
export function OrderAuthorizationSession({
  children,
  onExit,
}: {
  children: (selection: OrderSelection) => ReactNode;
  onExit: () => void;
}) {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const toggle = (id: string) =>
    setIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <>
      <div
        className="authorization-selection"
        aria-label="Selección de órdenes para autorizar"
      >
        <span role="status" aria-live="polite">
          {ids.size}{" "}
          {ids.size === 1 ? "orden seleccionada" : "órdenes seleccionadas"}
        </span>
        <div className="inline">
          <Button onClick={onExit}>Cancelar</Button>
          <Button
            variant="primary"
            icon={Check}
            disabled={!ids.size}
            onClick={() => setConfirming(true)}
          >
            Autorizar órdenes
          </Button>
        </div>
      </div>
      {children({ ids, toggle })}
      {confirming && (
        <OrderAuthorizationDialog
          ids={[...ids]}
          multiple
          onClose={() => setConfirming(false)}
          onAuthorized={onExit}
          onUnavailable={(unavailable) =>
            setIds(
              (current) =>
                new Set([...current].filter((id) => !unavailable.includes(id))),
            )
          }
        />
      )}
    </>
  );
}
