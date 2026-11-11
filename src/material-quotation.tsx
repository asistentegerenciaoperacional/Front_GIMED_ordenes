import { ChevronDown, Send, Trash2 } from "lucide-react";
import {
  startTransition,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import type { Key } from "react-aria-components";
import {
  Disclosure,
  DisclosureGroup,
  DisclosurePanel,
} from "react-aria-components/DisclosureGroup";
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
  quotationTemplate,
  refreshMaterialQuotation,
  suggestedQuotationRecipient,
  type MaterialQuotationDraft,
  type MaterialQuotationPreview,
} from "../shared/material-quotation";
import { validEmail } from "../shared/schema";
import {
  ControlForm,
  ControlInput,
  ControlSelect,
} from "./components/controls";
import { formatDateInput } from "./dates";
import { QuotationTemplateFields } from "./quotation-template";
import {
  ApiError,
  Badge,
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

const sectionIds = ["materiales", "destinatarios", "plantilla"] as const;
type SectionId = (typeof sectionIds)[number];
const sectionForField = (field: string) =>
  sectionIds.find((id) => field.startsWith(`${id}.`));
const messagesLabel = (total: number) =>
  `${count(total)} ${total === 1 ? "mensaje" : "mensajes"}`;

function QuotationSection({
  id,
  title,
  summary,
  children,
}: {
  id: SectionId;
  title: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  const summaryId = `quotation-summary-${id}`;
  return (
    <Disclosure id={id} className="quotation-section">
      {({ isExpanded }) => (
        <>
          <h3>
            <Button
              slot="trigger"
              variant="ghost"
              className="quotation-section-trigger line-disclosure-toggle"
              aria-label={title}
              aria-describedby={summaryId}
            >
              <span>{title}</span>
              <span
                id={summaryId}
                className="compact-note quotation-section-summary"
              >
                {summary}
              </span>
              <ChevronDown size={16} aria-hidden="true" />
            </Button>
          </h3>
          <DisclosurePanel inert={!isExpanded}>
            <div className="quotation-section-content stack">{children}</div>
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
}

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
  const [expanded, setExpanded] = useState<Set<Key>>(
    () => new Set(["materiales"]),
  );
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
  const providerMessages = useMemo(() => {
    const messages = new Map<string, number>();
    for (const line of draft.materiales)
      for (const id of line.proveedor_ids)
        messages.set(id, (messages.get(id) ?? 0) + 1);
    return messages;
  }, [draft.materiales]);
  const pendingRecipients = draft.destinatarios.filter(
    (recipient) => !validEmail(quotationRecipientAddress(snapshot, recipient)),
  ).length;
  const globalTemplate = quotationTemplate(snapshot);
  const templateEdited =
    draft.plantilla.asunto !== globalTemplate.asunto ||
    draft.plantilla.cuerpo !== globalTemplate.cuerpo;
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
  const reportError = (problem: ApiError) => {
    setError(problem);
    const section = sectionForField(Object.keys(problem.fields)[0] ?? "");
    if (!preview && section) setExpanded(new Set([section]));
  };
  const [, submit, sending] = useActionState(async () => {
    try {
      if (!preview) {
        const result: MaterialQuotationPreview = await request(
          "material-quotation-preview",
          draft,
        );
        if (Object.keys(result.issues).length)
          reportError(
            new ApiError({
              message: "Revisa los campos indicados antes de continuar.",
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
      reportError(
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
    if (error) {
      const field = Object.keys(error.fields)[0];
      const target =
        !preview && field && sectionForField(field)
          ? form.current?.querySelector<HTMLElement>(
              `[data-field-path="${CSS.escape(field)}"]`,
            )
          : null;
      (
        target ?? form.current?.querySelector<HTMLElement>(".error-notice")
      )?.focus();
    } else if (preview) reviewHeading.current?.focus();
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
          <ErrorNotice
            error={error}
            onBeforeFieldFocus={(field) => {
              const section = sectionForField(field);
              if (!preview && section && !expanded.has(section))
                flushSync(() => setExpanded(new Set([section])));
            }}
          />
          {error?.code === "QUOTATION_CHANGED" && (
            <Button onClick={() => void refresh()}>Actualizar datos</Button>
          )}
          {status && (
            <p className="notice subtle" role="status">
              {status}
            </p>
          )}
          {preview ? (
            <>
              <p className="compact-note">
                {messagesLabel(preview.messages.length)} · Un destinatario
                principal por mensaje.
              </p>
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
            <DisclosureGroup
              className="quotation-sections"
              expandedKeys={expanded}
              onExpandedChange={setExpanded}
            >
              <QuotationSection
                id="materiales"
                title="Materiales y proveedores"
                summary={`${count(draft.materiales.length)} ${draft.materiales.length === 1 ? "material" : "materiales"} · ${count(providerMessages.size)} ${providerMessages.size === 1 ? "proveedor" : "proveedores"}`}
              >
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
                      className="quotation-material"
                      key={line.id_material}
                      data-quotation-material={line.id_material}
                    >
                      <h4>{material?.nombre_material ?? "Material"}</h4>
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
                              Number.isFinite(line.cantidad)
                                ? line.cantidad
                                : ""
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
                      <p className="strong quotation-suppliers-heading">
                        Proveedores a cotizar
                      </p>
                      <ul
                        className="quotation-providers"
                        aria-label="Proveedores a cotizar"
                      >
                        {line.proveedor_ids.map((id) => {
                          const provider = snapshot.proveedor.find(
                            (p) => p.id === id,
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
                        error={
                          error?.fields[`materiales.${index}.proveedor_ids`]
                        }
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
              </QuotationSection>
              <QuotationSection
                id="destinatarios"
                title="Destinatarios por proveedor"
                summary={
                  pendingRecipients ? (
                    <Badge value="pendiente">
                      {count(pendingRecipients)}{" "}
                      {pendingRecipients === 1 ? "pendiente" : "pendientes"}
                    </Badge>
                  ) : providerMessages.size ? (
                    "Completos"
                  ) : (
                    "Sin proveedores"
                  )
                }
              >
                <p className="compact-note">
                  {providerMessages.size
                    ? "Un destinatario principal por proveedor, compartido entre sus mensajes."
                    : "Agrega proveedores en la sección Materiales y proveedores."}
                </p>
                {[...providerMessages].map(([id, messages]) => {
                  const provider = snapshot.proveedor.find((p) => p.id === id);
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
                      <div>
                        <h4>
                          {provider
                            ? supplierOptionLabel(provider, snapshot.proveedor)
                            : "Proveedor no disponible"}
                        </h4>
                        <p className="compact-note">
                          {messagesLabel(messages)}
                        </p>
                      </div>
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
              </QuotationSection>
              <QuotationSection
                id="plantilla"
                title="Plantilla de envío"
                summary={templateEdited ? "Editada" : "Sin cambios"}
              >
                <p className="compact-note">
                  Los cambios se aplican solo a este envío.
                </p>
                <QuotationTemplateFields
                  prefix="plantilla."
                  value={draft.plantilla}
                  fields={error?.fields}
                  onChange={(plantilla) => update({ ...draft, plantilla })}
                />
              </QuotationSection>
            </DisclosureGroup>
          )}
        </div>
        <div
          className={`dialog-footer${preview ? " quotation-review-footer" : ""}`}
        >
          {!preview && (
            <p className="compact-note quotation-count">
              {messagesLabel(messageCount)}
            </p>
          )}
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
