import { Link2 } from "lucide-react";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  materialSupplyCandidates,
  materialSupplySelection,
} from "../shared/material-supply";
import {
  buildMaterialNeeds,
  materialOrderDeliveryIssue,
  materialDemandDay,
  type MaterialNeed,
} from "../shared/material-demand";
import { canonical, orderReference } from "../shared/schema";
import { ControlForm, ControlInput } from "./components/controls";
import {
  ApiError,
  Badge,
  Button,
  CancelButton,
  Dialog,
  ErrorNotice,
  Field,
  LinkButton,
  ReferencePicker,
  count,
  recordName,
  shortDate,
  useApp,
} from "./ui";

const supplyOrder = new Intl.Collator("es", { numeric: true });

export function ProductSupply({
  productLineId,
  needs,
}: {
  productLineId: string;
  needs: MaterialNeed[];
}) {
  const { db } = useApp();
  const [editing, setEditing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const productHeading = useRef<HTMLElement | null>(null);
  const restore = useRef<number | null>(null);
  const links = db.abastecimiento_material.filter(
    (link) => link.id_orden_producto === productLineId,
  );
  useLayoutEffect(() => {
    if (editing || restore.current === null) return;
    const top = restore.current;
    restore.current = null;
    let next = 0;
    const frame = requestAnimationFrame(() => {
      next = requestAnimationFrame(() => {
        (trigger.current && !trigger.current.disabled
          ? trigger.current
          : (heading.current ?? productHeading.current)
        )?.focus({ preventScroll: true });
        window.scrollTo({ top, behavior: "instant" });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(next);
    };
  }, [editing]);
  if (!needs.length && !links.length && !editing) return null;
  return (
    <section
      className="stack"
      style={{ marginTop: 16 }}
      aria-label="Abastecimiento del producto"
    >
      <div className="spread" style={{ flexWrap: "wrap" }}>
        <div>
          <h4 ref={heading} tabIndex={-1}>
            Abastecimiento
          </h4>
          <small>
            {needs.length}{" "}
            {needs.length === 1
              ? "material pendiente"
              : "materiales pendientes"}
          </small>
        </div>
        <Button
          ref={trigger}
          className="small"
          icon={Link2}
          disabled={!needs.length}
          title={
            !needs.length
              ? "Este producto no tiene materiales pendientes de abastecer"
              : undefined
          }
          onClick={() => {
            productHeading.current =
              trigger.current?.closest(".line-card")?.querySelector("h3") ??
              null;
            restore.current = window.scrollY;
            setEditing(true);
          }}
        >
          Vincular OCM existente
        </Button>
      </div>
      {!!links.length && (
        <div className="inline">
          {links.map((link) => {
            const material = db.orden_material.find(
              (line) => line.id === link.id_orden_material,
            )!;
            const order = db.orden_compra.find(
              (row) => row.id === material.id_orden_compra,
            )!;
            return (
              <LinkButton
                key={material.id}
                className="small"
                href={`/ordenes/${order.id}`}
              >
                {orderReference(order.tipo_orden, order.no_orden)} ·{" "}
                {
                  db.materiales.find((row) => row.id === material.id_material)
                    ?.nombre_material
                }
                {material.estado === "anulada" ? " · Anulada" : ""}
              </LinkButton>
            );
          })}
        </div>
      )}
      {editing && (
        <MaterialSupplyDialog
          productLineId={productLineId}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  );
}

function MaterialSupplyDialog({
  productLineId,
  onClose,
}: {
  productLineId: string;
  onClose: () => void;
}) {
  const { db, run } = useApp();
  const [snapshot, setSnapshot] = useState(db);
  const needs = useMemo(
    () =>
      buildMaterialNeeds(
        snapshot,
        snapshot.orden_producto.find((line) => line.id === productLineId)
          ?.id_orden_compra,
      ).filter((need) => need.line.id === productLineId),
    [snapshot, productLineId],
  );
  const [materialId, setMaterialId] = useState(() =>
    needs.length === 1 ? needs[0].material.id : "",
  );
  const [targetId, setTargetId] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const submitting = useRef(false);
  const need = needs.find((row) => row.material.id === materialId);
  const source = snapshot.orden_producto.find(
    (row) => row.id === productLineId,
  );
  const order = snapshot.orden_compra.find(
    (row) => row.id === source?.id_orden_compra,
  );
  const candidates = useMemo(
    () => materialSupplyCandidates(snapshot, materialId),
    [snapshot, materialId],
  );
  const target = candidates.find(({ line }) => line.id === targetId);
  const conflict = error?.code === "SUPPLY_CHANGED";
  const warning =
    target &&
    order &&
    materialOrderDeliveryIssue(
      target.order.fecha_solicitada_entrega,
      materialDemandDay(order.fecha_solicitada_entrega),
    );
  const choices = useMemo(
    () =>
      candidates
        .map(({ line, order }) => ({
          id: line.id,
          line,
          order,
          label: `${orderReference(order.tipo_orden, order.no_orden)} · ${count(line.cantidad_solicitada)} unidades · ${snapshot.proveedor.find((row) => row.id === order.id_proveedor)?.nombre_corto ?? "Proveedor"}`,
        }))
        .sort((a, b) => supplyOrder.compare(a.label, b.label)),
    [candidates, snapshot.proveedor],
  );
  const options = useMemo(() => {
    const selected = choices.find((choice) => choice.id === targetId);
    const query = canonical(targetQuery === selected?.label ? "" : targetQuery);
    const matches = choices.filter((choice) =>
      canonical(choice.label).includes(query),
    );
    const visible = matches.slice(0, 50);
    // Keep the committed ID available while searching for another option.
    if (selected && !visible.some((choice) => choice.id === targetId))
      visible.push(selected);
    return visible.map(({ id, label, order }) => ({
      id,
      label,
      description: `${shortDate(order.fecha_solicitada_entrega)} · ${order.estado_autorizacion === "autorizada" ? "Autorizada" : "Sin autorizar"}`,
    }));
  }, [choices, targetQuery, targetId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || conflict) return;
    if (!need || !target) {
      setError(
        new ApiError({
          message: "Selecciona un material pendiente y un renglón de OCM.",
          fields: !need
            ? { id_material: "Selecciona un material pendiente." }
            : { id_orden_material: "Selecciona un renglón compatible." },
        }),
      );
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await run(
        "linkMaterialSupply",
        {
          id_orden_producto: productLineId,
          id_orden_material: targetId,
          expected: materialSupplySelection(snapshot, productLineId, targetId),
        },
        "OCM vinculada al producto",
      );
      onClose();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure
          : new ApiError({ message: (failure as Error).message }),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Vincular OCM existente"
      subtitle="Selecciona una compra para el material pendiente de este producto."
      busy={busy}
      dirty={!!targetId}
      onClose={onClose}
    >
      <ControlForm onSubmit={submit} fieldErrors={error?.fields}>
        <div className="dialog-body stack" inert={busy}>
          <ErrorNotice error={error} />
          {conflict && (
            <div className="notice">
              <div>
                <p>
                  Tu selección se conserva. Revisa la disponibilidad actualizada
                  antes de continuar.
                </p>
                <Button
                  onClick={() => {
                    setSnapshot(db);
                    setError(null);
                  }}
                >
                  Revisar opciones actualizadas
                </Button>
              </div>
            </div>
          )}
          <div className="form-grid two">
            <Field id="field-oc" label="Orden de compra">
              <ControlInput
                disabled
                value={
                  order
                    ? orderReference(order.tipo_orden, order.no_orden)
                    : "Orden no disponible"
                }
              />
            </Field>
            <Field id="field-producto" label="Producto">
              <ControlInput
                disabled
                value={
                  snapshot.productos.find(
                    (row) => row.id === source?.id_producto,
                  )?.nombre_producto ?? "Producto no disponible"
                }
              />
            </Field>
          </div>
          <Field id="field-id_material" label="Material pendiente" required>
            <ReferencePicker
              options={needs.map((row) => ({
                id: row.material.id,
                label: recordName(snapshot, "materiales", row.material),
                description:
                  row.materialType + " · " + row.material.id.slice(-6),
              }))}
              value={materialId}
              commitOnSelection
              onChange={(id) => {
                setMaterialId(id);
                setTargetId("");
                setTargetQuery("");
                if (!conflict) setError(null);
              }}
              placeholder="Buscar material pendiente…"
            />
          </Field>
          {materialId && !need && !!needs.length && (
            <p role="status">
              El material seleccionado ya no está pendiente. Selecciona otro
              material para continuar.
            </p>
          )}
          {!needs.length && (
            <p role="status">
              Este producto ya no tiene materiales pendientes de abastecer.
            </p>
          )}
          <Field id="field-id_orden_material" label="Renglón de OCM" required>
            <ReferencePicker
              options={options}
              value={targetId}
              onQueryChange={setTargetQuery}
              commitOnSelection
              disabled={!need}
              onChange={(id) => {
                setTargetId(id);
                if (!conflict) setError(null);
              }}
              placeholder="Buscar OCM o proveedor…"
            />
          </Field>
          {candidates.length > 50 && (
            <p className="compact-note" role="status">
              {count(candidates.length)} renglones compatibles. Se muestran
              hasta 50 coincidencias; busca por número de OCM o proveedor para
              acotar.
            </p>
          )}
          {need && !candidates.length && (
            <p role="status">
              No hay OCM en seguimiento para este material. Puedes crear una
              desde Materiales pendientes.
            </p>
          )}
          {target && (
            <dl className="summary-grid">
              <div>
                <dt>Cantidad solicitada en OCM</dt>
                <dd>{count(target.line.cantidad_solicitada)}</dd>
              </div>
              <div>
                <dt>Entrega solicitada de OCM</dt>
                <dd>{shortDate(target.order.fecha_solicitada_entrega)}</dd>
              </div>
              <div>
                <dt>Entrega solicitada de OC</dt>
                <dd>{shortDate(order?.fecha_solicitada_entrega)}</dd>
              </div>
              <div>
                <dt>Autorización de OCM</dt>
                <dd>
                  <Badge value={target.order.estado_autorizacion} />
                </dd>
              </div>
            </dl>
          )}
          {warning && (
            <div className="notice warning" role="status">
              La entrega de esta OCM es igual o posterior a la de la OC. Puedes
              vincularla; para editarla después deberás indicar una entrega
              anterior a todas sus OC vinculadas.
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <CancelButton disabled={busy} onClick={onClose}>
            Cancelar
          </CancelButton>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || conflict || !need || !target}
          >
            {busy ? "Vinculando…" : "Vincular OCM"}
          </Button>
        </div>
      </ControlForm>
    </Dialog>
  );
}
