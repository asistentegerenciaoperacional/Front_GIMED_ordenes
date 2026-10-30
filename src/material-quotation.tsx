import { Send, Trash2 } from "lucide-react";
import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Disclosure, DisclosurePanel } from "react-aria-components/Disclosure";
import type { Database } from "../shared/models";
import {
  isMaterialSupplier,
  supplierOptionLabel,
} from "../shared/favorite-suppliers";
import {
  demandQuantity,
  earliestMaterialDelivery,
  groupMaterialSources,
  type MaterialDemand,
} from "../shared/material-demand";
import {
  createMaterialQuotation,
  quotationContacts,
  quotationRecipientAddress,
  refreshMaterialQuotation,
  suggestedQuotationRecipient,
  type MaterialQuotationDraft,
  type MaterialQuotationPreview,
} from "../shared/material-quotation";
import {
  ControlForm,
  ControlInput,
  ControlSelect,
} from "./components/controls";
import { formatDateInput } from "./dates";
import { QuotationTemplateFields } from "./quotation-template";
import {
  ApiError,
  Button,
  CancelButton,
  Dialog,
  ErrorNotice,
  Field,
  ProviderPicker,
  count,
  request,
  useApp,
} from "./ui";

export default function MaterialQuotationDialog({
  demanda,
  onClose,
}: {
  demanda: MaterialDemand;
  onClose: () => void;
}) {
  const { db, run } = useApp();
  const [snapshot, setSnapshot] = useState(db);
  const [draft, setDraft] = useState(() =>
    createMaterialQuotation(db, demanda),
  );
  const [initial] = useState(() => JSON.stringify(draft));
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<MaterialQuotationPreview | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [status, setStatus] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const guard = useRef(false);
  const groups = useMemo(
    () =>
      new Map(
        groupMaterialSources(draft.demanda.fuentes).map((group) => [
          group.id_material,
          group,
        ]),
      ),
    [draft.demanda.fuentes],
  );
  const providers = useMemo(
    () => snapshot.proveedor.filter(isMaterialSupplier),
    [snapshot.proveedor],
  );
  const providerIds = useMemo(
    () => [...new Set(draft.materiales.flatMap((line) => line.proveedor_ids))],
    [draft.materiales],
  );
  const messageCount = draft.materiales.reduce(
    (total, line) => total + line.proveedor_ids.length,
    0,
  );
  const update = (next: MaterialQuotationDraft) => {
    setDraft(next);
    setPreview(null);
    setError(null);
    setStatus("");
  };
  const updateMaterial = (
    index: number,
    change: Partial<MaterialQuotationDraft["materiales"][number]>,
  ) => {
    const materiales = draft.materiales.map((line, i) =>
      i === index ? { ...line, ...change } : line,
    );
    const used = new Set(materiales.flatMap((line) => line.proveedor_ids));
    update({
      ...draft,
      materiales,
      destinatarios: [...used].map(
        (id) =>
          draft.destinatarios.find((r) => r.id_proveedor === id) ??
          suggestedQuotationRecipient(snapshot, id),
      ),
    });
  };
  const [, submit, sending] = useActionState(async () => {
    try {
      if (!preview) {
        const result: MaterialQuotationPreview = await request(
          "material-quotation-preview",
          draft,
        );
        if (Object.keys(result.issues).length)
          setError(
            new ApiError({
              message: "Completa los destinatarios de todos los materiales.",
              fields: result.issues,
            }),
          );
        else {
          setPreview(result);
          setError(null);
        }
      } else {
        await run(
          "sendMaterialQuotations",
          { borrador: draft, expected_revision: preview.revision },
          `${preview.messages.length} cotizaciones simuladas confirmadas`,
        );
        onClose();
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError({ message: (cause as Error).message }),
      );
    } finally {
      guard.current = false;
    }
    return null;
  }, null);
  const busy = sending || refreshing;
  useEffect(() => {
    if (busy) return;
    if (error)
      form.current?.querySelector<HTMLElement>(".error-notice")?.focus();
    else if (preview) reviewHeading.current?.focus();
  }, [preview, busy, error]);
  const refresh = async () => {
    setRefreshing(true);
    try {
      const next: Database = await request("state");
      const reconciled = refreshMaterialQuotation(next, draft);
      setSnapshot(next);
      setDraft(reconciled);
      setPreview(null);
      setError(
        reconciled.materiales.length
          ? null
          : new ApiError({
              message:
                "Ya no quedan necesidades vigentes. Cierra el diálogo y revisa la tabla de materiales pendientes.",
            }),
      );
      setStatus(
        "Datos actualizados. Revisa cantidades, destinatarios y mensajes antes de confirmar.",
      );
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError({ message: (cause as Error).message }),
      );
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <Dialog
      title="Cotizar materiales"
      className="material-quotation-dialog"
      subtitle="Envío simulado · no se enviarán mensajes externos."
      wide
      busy={busy}
      dirty={JSON.stringify(draft) !== initial}
      onClose={onClose}
    >
      <ControlForm
        ref={form}
        noValidate
        fieldErrors={error?.fields}
        onSubmit={(event) => {
          event.preventDefault();
          if (guard.current || busy) return;
          guard.current = true;
          startTransition(submit);
        }}
      >
        <div className="dialog-body stack" inert={busy}>
          <ErrorNotice error={error} />
          {error?.code === "QUOTATION_CHANGED" && (
            <Button onClick={() => void refresh()}>Actualizar datos</Button>
          )}
          {status && (
            <p className="notice subtle" role="status">
              {status}
            </p>
          )}
          <p className="compact-note">
            {draft.materiales.length} materiales · {providerIds.length}{" "}
            proveedores · {preview?.messages.length ?? messageCount} mensajes.
            Un mensaje por material y proveedor, con un único destinatario
            principal.
          </p>
          {preview ? (
            <>
              <h3 ref={reviewHeading} tabIndex={-1}>
                Revisar cotizaciones
              </h3>
              {preview.messages.map((message) => (
                <article
                  className="quotation-card"
                  key={`${message.id_material}/${message.id_proveedor}`}
                >
                  <h3>
                    {message.material} → {message.proveedor}
                  </h3>
                  <p>
                    Para: {message.recipient.name} · {message.recipient.address}
                  </p>
                  <Disclosure>
                    <Button
                      slot="trigger"
                      variant="link"
                      className="quotation-preview-trigger"
                    >
                      Ver mensaje
                    </Button>
                    <DisclosurePanel>
                      <strong>{message.subject}</strong>
                      <p className="quotation-message">{message.body}</p>
                    </DisclosurePanel>
                  </Disclosure>
                </article>
              ))}
            </>
          ) : (
            <>
              <div className="notice subtle">
                Cada material necesita al menos un proveedor con destinatario
                válido. Puedes quitar favoritos y agregar otros proveedores de
                materiales.
              </div>
              {draft.materiales.map((line, index) => {
                const material = snapshot.materiales.find(
                  (m) => m.id === line.id_material,
                )!;
                const group = groups.get(line.id_material)!;
                const date = earliestMaterialDelivery(
                  group.fuentes.map(
                    (source) => source.fecha_solicitada_entrega,
                  ),
                )!;
                return (
                  <section
                    className="quotation-card"
                    key={line.id_material}
                    data-quotation-material={line.id_material}
                  >
                    <h3>{material?.nombre_material ?? "Material"}</h3>
                    <p className="compact-note">
                      MAIA{" "}
                      {material?.codigo_material == null
                        ? "Sin código"
                        : String(material.codigo_material).padStart(
                            3,
                            "0",
                          )}{" "}
                      · Base {count(group.cantidad_base)} · Entrega solicitada{" "}
                      {formatDateInput(date)}
                    </p>
                    <div className="form-grid">
                      <Field
                        id={`field-materiales.${index}.adicional_pct`}
                        label="Adicional (%)"
                        error={
                          error?.fields[`materiales.${index}.adicional_pct`]
                        }
                      >
                        <ControlInput
                          id={`field-materiales.${index}.adicional_pct`}
                          type="number"
                          min={5}
                          max={10}
                          step="any"
                          value={
                            Number.isFinite(line.adicional_pct)
                              ? line.adicional_pct
                              : ""
                          }
                          onChange={(event) => {
                            const percent =
                              event.target.value === ""
                                ? NaN
                                : Number(event.target.value);
                            let quantity = line.cantidad;
                            try {
                              quantity = demandQuantity(
                                group.cantidad_base,
                                percent,
                              );
                            } catch {
                              /* Field validation explains invalid percentages. */
                            }
                            updateMaterial(index, {
                              adicional_pct: percent,
                              cantidad: quantity,
                            });
                          }}
                        />
                      </Field>
                      <Field
                        id={`field-materiales.${index}.cantidad`}
                        label="Cantidad a cotizar"
                        error={error?.fields[`materiales.${index}.cantidad`]}
                      >
                        <ControlInput
                          id={`field-materiales.${index}.cantidad`}
                          type="number"
                          min={1}
                          step={1}
                          value={
                            Number.isFinite(line.cantidad) ? line.cantidad : ""
                          }
                          onChange={(event) =>
                            updateMaterial(index, {
                              cantidad:
                                event.target.value === ""
                                  ? NaN
                                  : Number(event.target.value),
                            })
                          }
                        />
                      </Field>
                    </div>
                    <ul className="quotation-providers">
                      {line.proveedor_ids.map((id) => {
                        const provider = snapshot.proveedor.find(
                          (p) => p.id === id,
                        );
                        const address = quotationRecipientAddress(
                          snapshot,
                          draft.destinatarios.find(
                            (r) => r.id_proveedor === id,
                          ),
                        );
                        return (
                          <li key={id}>
                            <span>
                              {provider
                                ? supplierOptionLabel(
                                    provider,
                                    snapshot.proveedor,
                                  )
                                : "Proveedor no disponible"}
                              <small>
                                {address ||
                                  "Completa su destinatario en la sección siguiente"}
                              </small>
                            </span>
                            <Button
                              icon={Trash2}
                              className="icon-btn"
                              aria-label={`Quitar ${provider?.nombre_largo ?? id} de ${material?.nombre_material}`}
                              onClick={() =>
                                updateMaterial(index, {
                                  proveedor_ids: line.proveedor_ids.filter(
                                    (value) => value !== id,
                                  ),
                                })
                              }
                            />
                          </li>
                        );
                      })}
                    </ul>
                    <Field
                      id={`field-materiales.${index}.proveedor_ids`}
                      label="Agregar proveedor"
                      error={error?.fields[`materiales.${index}.proveedor_ids`]}
                    >
                      <ProviderPicker
                        key={line.proveedor_ids.join("/")}
                        id={`field-materiales.${index}.proveedor_ids`}
                        value=""
                        commitOnSelection
                        providers={providers.filter(
                          (p) => !line.proveedor_ids.includes(p.id),
                        )}
                        onChange={(id) => {
                          if (id && !line.proveedor_ids.includes(id))
                            updateMaterial(index, {
                              proveedor_ids: [...line.proveedor_ids, id],
                            });
                        }}
                      />
                    </Field>
                    {!line.proveedor_ids.length && (
                      <p className="compact-note">
                        Sin proveedores. Agrega al menos uno para cotizar este
                        material.
                      </p>
                    )}
                  </section>
                );
              })}
              {providerIds.length > 0 && (
                <section className="quotation-card">
                  <h3>Destinatario único por proveedor</h3>
                  <p className="compact-note">
                    Cada cambio se aplica a todos sus materiales. Escribir un
                    correo manual no modifica el directorio.
                  </p>
                  {providerIds.map((id) => {
                    const provider = snapshot.proveedor.find(
                      (p) => p.id === id,
                    );
                    const recipient = draft.destinatarios.find(
                      (r) => r.id_proveedor === id,
                    )!;
                    const contacts = quotationContacts(snapshot, id);
                    const change = (value: Partial<typeof recipient>) =>
                      update({
                        ...draft,
                        destinatarios: draft.destinatarios.map((r) =>
                          r.id_proveedor === id ? { ...r, ...value } : r,
                        ),
                      });
                    return (
                      <div
                        className="quotation-recipient"
                        key={id}
                        data-quotation-provider={id}
                      >
                        <h4>
                          {provider
                            ? supplierOptionLabel(provider, snapshot.proveedor)
                            : "Proveedor no disponible"}
                        </h4>
                        {contacts.suggested.length > 1 &&
                          !recipient.id_contacto &&
                          !recipient.correo && (
                            <p className="compact-note">
                              Hay varios contactos sugeridos; elige uno o
                              escribe un correo.
                            </p>
                          )}
                        <div className="form-grid">
                          <Field
                            id={`field-contacto-${id}`}
                            label="Contacto del proveedor"
                          >
                            <ControlSelect
                              id={`field-contacto-${id}`}
                              value={recipient.id_contacto ?? ""}
                              onChange={(event) => {
                                const contact = contacts.contacts.find(
                                  (c) => c.id === event.target.value,
                                );
                                change({
                                  id_contacto: contact?.id ?? null,
                                  correo: contact?.correo ?? "",
                                });
                              }}
                            >
                              <option value="">Escribir correo manual</option>
                              {contacts.contacts.map((contact) => (
                                <option key={contact.id} value={contact.id}>
                                  {contact.nombre} · {contact.correo}
                                  {contacts.suggested.some(
                                    (c) => c.id === contact.id,
                                  )
                                    ? " · Sugerido"
                                    : ""}
                                </option>
                              ))}
                            </ControlSelect>
                          </Field>
                          <Field
                            id={`field-destinatarios.${id}`}
                            label="Correo del destinatario"
                            required
                            error={error?.fields[`destinatarios.${id}`]}
                          >
                            <ControlInput
                              id={`field-destinatarios.${id}`}
                              type="email"
                              autoComplete="email"
                              value={quotationRecipientAddress(
                                snapshot,
                                recipient,
                              )}
                              onChange={(event) =>
                                change({
                                  id_contacto: null,
                                  correo: event.target.value,
                                })
                              }
                            />
                          </Field>
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}
              <section className="quotation-card">
                <h3>Plantilla común para este envío</h3>
                <p className="compact-note">
                  Una plantilla para todos los mensajes. Estos ajustes no
                  cambian la plantilla global de Configuración.
                </p>
                <QuotationTemplateFields
                  prefix="plantilla."
                  value={draft.plantilla}
                  fields={error?.fields}
                  onChange={(plantilla) => update({ ...draft, plantilla })}
                />
              </section>
            </>
          )}
        </div>
        <div
          className={`dialog-footer${preview ? " quotation-review-footer" : ""}`}
        >
          <CancelButton disabled={busy} onClick={onClose}>
            Cancelar
          </CancelButton>
          {preview && (
            <Button
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
            >
              Volver a editar
            </Button>
          )}
          <Button
            type="submit"
            icon={Send}
            variant="primary"
            disabled={
              busy ||
              !draft.materiales.length ||
              error?.code === "QUOTATION_CHANGED"
            }
          >
            {busy
              ? "Procesando…"
              : preview
                ? `Confirmar ${preview.messages.length} envíos simulados`
                : "Revisar cotización"}
          </Button>
        </div>
      </ControlForm>
    </Dialog>
  );
}
