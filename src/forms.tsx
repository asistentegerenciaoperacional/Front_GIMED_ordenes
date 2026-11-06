import { productLotLifecycleSnapshot } from "../shared/product-lot-lifecycle";
import { confirmProductCancellation } from "./product-cancellation";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  FileText,
  Info,
  Paperclip,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { costDay, costIssue } from "../shared/maquila-costs";
import {
  consolidateMaterialSources,
  demandQuantity,
  earliestMaterialDelivery,
  materialOrderDeliveryIssue,
  type MaterialDemand,
} from "../shared/material-demand";
import {
  materialCatalogIssue,
  materialRole,
} from "../shared/product-materials";
import { materialSupplierGroups } from "../shared/favorite-suppliers";
import {
  blankRow,
  currentCost,
  dateSchema,
  decimal,
  increasedQuantity,
  isInitialProductLot,
  labels,
  assignedBarcode,
  materialCodeRequired,
  meta,
  nextOrderNumber,
  normalizeInvoice,
  orderDeliverySchema,
  orderCreationDeliveryIssue,
  orderItemLabel,
  orderLines,
  orderReference,
  primaryKey,
  productLotNeedsNumber,
  recommendations,
  schemas,
  titles,
  totalLines,
  validEmail,
  type Entity,
  type Row,
} from "../shared/schema";
import {
  CheckChoice,
  ChoiceGroup,
  ControlForm,
  ControlInput,
  ControlLink,
  ControlSelect,
  ControlTextArea,
  SuggestionList,
} from "./components/controls";
import { Documents } from "./document-controls";
import { TooltipHelp, confirmAction } from "./components/overlays";
import { OrderEntrySheet } from "./order-entry-sheet";
import {
  blankSheetLine,
  compactSheetLines,
  isEmptySheetLine,
  indexedOrderLineErrors,
  orderLinePayload,
  padSheetLines,
} from "./order-entry-draft";
import { readOrderEntryPreference } from "./ui-preferences";
import {
  readProductOrderDefaults,
  rememberProductOrder,
} from "./product-order-defaults";
import {
  entityValidation,
  validEntityField,
  validPrice,
} from "./live-validation";
import {
  ApiError,
  Badge,
  Button,
  CancelButton,
  ConfirmationDialog,
  count,
  DateInput,
  Dialog,
  ErrorNotice,
  Field,
  isoDate,
  money,
  ProductPicker,
  ProviderPicker,
  MaterialPicker,
  ReferencePicker,
  recordName,
  request,
  text,
  today,
  useApp,
  useErrors,
} from "./ui";

export function CatalogForm({
  entity,
  record,
  onClose,
  initialValues,
  readOnlyFields = [],
  onSaved,
}: {
  entity: Entity;
  record?: Row;
  onClose: () => void;
  initialValues?: Row;
  readOnlyFields?: readonly string[];
  onSaved?: (row: Row) => void;
}) {
  const { db, run } = useApp();
  const [values, setValues] = useState<Row>(() => ({
    ...blankRow(entity),
    ...initialValues,
    ...record,
  }));
  const [providerNit, setProviderNit] = useState(() => {
    if (entity !== "proveedor") return "";
    const nit = record?.nit ?? "";
    const verificationDigit = record?.digito_verf ?? "";
    return nit
      ? `${nit}${verificationDigit ? `-${verificationDigit}` : ""}`
      : "";
  });
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const { error, catchError } = useErrors(
    entity === "proveedor"
      ? {
          ...entityValidation(entity, values, db, record),
          valid: (field) =>
            field === "nit"
              ? providerNit === "" || /^\d+-\d$/.test(providerNit)
              : validEntityField(entity, field, values, db, record),
        }
      : entityValidation(entity, values, db, record),
  );
  const [dirty, setDirty] = useState(false);
  const update = (field: string, value: any) => {
    setValues({ ...values, [field]: value });
    setDirty(true);
  };
  const updateProviderNit = (value: string) => {
    const match = /^(\d+)-(\d)$/.exec(value);
    setProviderNit(value);
    setValues({
      ...values,
      nit: match?.[1] ?? value,
      digito_verf: match?.[2] ?? "",
    });
    setDirty(true);
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const row: Row = { ...values };
      if (entity === "proveedor") {
        const nitParts =
          providerNit === "" ? null : /^(\d+)-(\d)$/.exec(providerNit);
        if (providerNit && !nitParts)
          throw new ApiError({
            message: "Revisa el formato del NIT.",
            fields: {
              nit: "Ingresa el NIT sin puntos, seguido de un guion y un único dígito de verificación.",
            },
          });
        row.nit = nitParts?.[1] ?? null;
        row.digito_verf = nitParts?.[2] ?? null;
      }
      for (const [field, spec] of Object.entries(meta.tables[entity].fields)) {
        if (field === "id") continue;
        const raw = row[field];
        if (raw === "" || raw === undefined || raw === null) {
          row[field] = spec.required ? "" : null;
          continue;
        }
        if (spec.type === "integer" || spec.type === "float(5,2)") {
          if (
            field === "codigo_material" &&
            !/^\d{3}$/.test(
              typeof raw === "number"
                ? String(raw).padStart(3, "0")
                : String(raw),
            )
          )
            throw new ApiError({
              message: "El código MAIA debe tener tres dígitos.",
              fields: {
                codigo_material: "Introduce exactamente tres dígitos.",
              },
            });
          row[field] = Number(raw);
        }
        if (
          spec.type === "datetime" &&
          typeof raw === "string" &&
          raw.length === 10
        )
          row[field] = isoDate(raw);
      }
      if (
        entity === "materiales" &&
        row.codigo_material === null &&
        materialCodeRequired(db, row.id_tipo_material)
      )
        throw new ApiError({
          message: "El código MAIA es obligatorio para este tipo de material.",
          fields: { codigo_material: "Introduce exactamente tres dígitos." },
        });
      if (!row.id && Object.hasOwn(row, "id")) delete row.id;
      const checked = {
        ...blankRow(entity),
        ...row,
        ...(!row.id && Object.hasOwn(blankRow(entity), "id")
          ? { id: "000000000000000000000001" }
          : {}),
      };
      const parsed = schemas[entity].safeParse(checked);
      if (!parsed.success)
        throw new ApiError({
          message: "Revisa los campos indicados.",
          fields: Object.fromEntries(
            parsed.error.issues.map((e) => [e.path.join("."), e.message]),
          ),
        });
      if (entity === "materiales" || entity === "tipos_materiales") {
        const issue = materialCatalogIssue(db, entity, {
          ...parsed.data,
          id: record?.id ?? parsed.data.id,
        });
        if (issue) throw new ApiError(issue);
      }
      if (entity === "costos_maquila") {
        const issue = costIssue(
          { ...parsed.data, id: record?.id },
          db.costos_maquila,
        );
        if (issue)
          throw new ApiError({
            message: "Revisa el periodo del costo de maquila.",
            code: "COST_PERIOD_CONFLICT",
            fields: issue.fields,
          });
      }
      const result = await run(
        "saveEntity",
        {
          entity,
          row,
          key: record
            ? Object.fromEntries(
                meta.tables[entity].pk.map((k) => [k, record[k]]),
              )
            : undefined,
        },
        "Registro guardado",
      );
      onSaved?.(result.row);
      onClose();
    } catch (e) {
      catchError(e);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={`${record ? "Editar" : "Agregar"} · ${titles[entity]}`}
      titleAction={
        entity === "proveedor" ? (
          <TooltipHelp
            label="NIT"
            buttonLabel="Cómo ingresar el NIT"
            content="Ingresa el NIT sin puntos y escribe un guion seguido de un solo dígito de verificación. Ejemplo: 900123404-5."
          />
        ) : undefined
      }
      subtitle="Los cambios se guardan en los archivos locales del prototipo."
      onClose={onClose}
      dirty={dirty}
      busy={busy}
    >
      <ControlForm onSubmit={submit} fieldErrors={error?.fields} noValidate>
        <div className="dialog-body" inert={busy}>
          <ErrorNotice error={error} />
          <div className="form-grid">
            {Object.entries(meta.tables[entity].fields)
              .filter(
                ([name]) =>
                  name !== "id" &&
                  !(entity === "proveedor" && name === "digito_verf"),
              )
              .map(([field, spec]) => {
                const id = `field-${field}`,
                  ref = meta.refs.find(
                    (r) => r.table === entity && r.field === field,
                  ),
                  value = values[field];
                let control;
                if (entity === "proveedor" && field === "nit")
                  control = (
                    <ControlInput
                      id={id}
                      value={providerNit}
                      inputMode="text"
                      autoComplete="off"
                      placeholder="900123404-5"
                      onChange={(event) =>
                        updateProviderNit(event.target.value)
                      }
                    />
                  );
                else if (ref && ref.target === "productos")
                  control = (
                    <ProductPicker
                      id={id}
                      products={db.productos}
                      disabled={busy || readOnlyFields.includes(field)}
                      value={String(value ?? "")}
                      onChange={(id) => update(field, id || null)}
                    />
                  );
                else if (ref?.target === "proveedor")
                  control = (
                    <ProviderPicker
                      id={id}
                      providers={
                        entity === "productos" && field === "id_maquilador"
                          ? db.proveedor.filter(
                              (provider) => provider.Es_maquila === true,
                            )
                          : db.proveedor
                      }
                      value={String(value ?? "")}
                      onChange={(id) => update(field, id || null)}
                    />
                  );
                else if (ref?.target === "materiales")
                  control = (
                    <MaterialPicker
                      id={id}
                      materials={db.materiales}
                      value={String(value ?? "")}
                      onChange={(id) => update(field, id || null)}
                    />
                  );
                else if (ref)
                  control = (
                    <ControlSelect
                      id={id}
                      value={value ?? ""}
                      onChange={(e) => update(field, e.target.value || null)}
                    >
                      <option value="">Seleccionar…</option>
                      {(db[ref.target] as Row[]).map((r) => (
                        <option
                          key={primaryKey(ref.target, r)}
                          value={r[ref.targetField]}
                        >
                          {recordName(db, ref.target, r)}
                        </option>
                      ))}
                    </ControlSelect>
                  );
                else if (spec.type === "boolean")
                  control = (
                    <ControlSelect
                      id={id}
                      value={value === null ? "" : String(value)}
                      onChange={(e) =>
                        update(
                          field,
                          e.target.value === ""
                            ? null
                            : e.target.value === "true",
                        )
                      }
                    >
                      <option value="">Sin informar</option>
                      <option value="true">Sí</option>
                      <option value="false">No</option>
                    </ControlSelect>
                  );
                else if (meta.enums[spec.type])
                  control = (
                    <ControlSelect
                      id={id}
                      value={value ?? ""}
                      onChange={(e) => {
                        if (
                          entity === "destinatario_evento" &&
                          field === "tipo_evento" &&
                          e.target.value === "cotizacion_materiales"
                        ) {
                          setValues({
                            ...values,
                            tipo_evento: e.target.value,
                            tipo_contacto: "proveedor",
                            tipo_destinatario: "para",
                          });
                          setDirty(true);
                        } else update(field, e.target.value || null);
                      }}
                    >
                      <option value="">Seleccionar…</option>
                      {meta.enums[spec.type]
                        .filter((v) => !(entity === "adjunto_evento" && field === "tipo_evento" && v === "cotizacion_materiales"))
                        .filter((v) =>
                          entity !== "destinatario_evento" ||
                          values.tipo_evento !== "cotizacion_materiales" ||
                          (field !== "tipo_contacto" && field !== "tipo_destinatario") ||
                          v === (field === "tipo_contacto" ? "proveedor" : "para")
                        )
                        .map((v) => (
                          <option key={v} value={v}>
                            {text(v)}
                          </option>
                        ))}
                    </ControlSelect>
                  );
                else if (spec.type === "datetime")
                  control = (
                    <DateInput
                      id={id}
                      value={
                        value
                          ? entity === "costos_maquila"
                            ? (costDay(value) ?? String(value))
                            : String(value).slice(0, 10)
                          : ""
                      }
                      onChange={(value) => update(field, value)}
                    />
                  );
                else
                  control = (
                    <ControlInput
                      id={id}
                      type={
                        spec.type === "integer" && field !== "codigo_material"
                          ? "number"
                          : spec.type.startsWith("float")
                            ? "number"
                            : field === "correo"
                              ? "email"
                              : "text"
                      }
                      step={
                        spec.type.startsWith("float")
                          ? "0.01"
                          : spec.type === "integer"
                            ? "1"
                            : undefined
                      }
                      autoComplete={
                        field === "correo"
                          ? "email"
                          : field === "celular"
                            ? "tel"
                            : "off"
                      }
                      inputMode={
                        field === "codigo_material" ? "numeric" : undefined
                      }
                      value={
                        value === null
                          ? ""
                          : field === "codigo_material" &&
                              typeof value === "number"
                            ? String(value).padStart(3, "0")
                            : value
                      }
                      onChange={(e) => update(field, e.target.value)}
                    />
                  );
                return (
                  <Field
                    key={field}
                    id={id}
                    label={labels[field] ?? text(field)}
                    required={
                      entity === "materiales" && field === "codigo_material"
                        ? materialCodeRequired(db, values.id_tipo_material)
                        : spec.required
                    }
                    hint={
                      entity === "materiales" && field === "codigo_material"
                        ? materialCodeRequired(db, values.id_tipo_material)
                          ? "Obligatorio: exactamente tres dígitos."
                          : "Opcional para corrugados. Si lo indicas, usa tres dígitos."
                        : undefined
                    }
                  >
                    {control}
                  </Field>
                );
              })}
          </div>
          {entity === "materiales_asociados" && (
            <div className="notice subtle">
              <Info size={16} aria-hidden="true" />
              Un producto puede tener sticker o cinta, pero no ambos.
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <CancelButton onClick={onClose} disabled={busy}>
            Cancelar
          </CancelButton>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar registro"}
          </Button>
        </div>
      </ControlForm>
    </Dialog>
  );
}

export { Documents } from "./document-controls";

export function receipts(db: ReturnType<typeof useApp>["db"]): Row[] {
  const result: Row[] = [];
  for (const table of [
    "lote_producto",
    "orden_material",
    "orden_otro",
  ] as Entity[])
    for (const row of db[table] as Row[]) {
      const line: Row =
        table === "lote_producto"
          ? db.orden_producto.find((l) => l.id === row.id_orden_producto)!
          : row;
      const o = db.orden_compra.find((o) => o.id === line.id_orden_compra)!;
      if (o.estado_autorizacion !== "autorizada") continue;
      const item =
        table === "lote_producto"
          ? db.productos.find((p) => p.id === line.id_producto)?.nombre_producto
          : table === "orden_material"
            ? db.materiales.find((m) => m.id === line.id_material)
                ?.nombre_material
            : line.producto;
      const provider = db.proveedor.find((p) => p.id === o.id_proveedor)!;
      const lotLabel =
        table === "lote_producto"
          ? (row.numero_lote ??
            `Sin número de lote ${db.lote_producto.filter((lot) => lot.id_orden_producto === line.id).findIndex((lot) => lot.id === row.id) + 1} · Producto ${line.posicion}`)
          : null;
      result.push({
        entity: table,
        id: row.id,
        provider: o.id_proveedor,
        order: o.no_orden,
        orderType: o.tipo_orden,
        orderId: o.id,
        lot:
          lotLabel ??
          row.numero_lote ??
          db.lote_material.find((l) => l.id === row.id_lote_material)
            ?.numero_lote ??
          `Recepción del ${orderItemLabel(o.tipo_orden)}`,
        item,
        label: `${orderReference(o.tipo_orden, o.no_orden)} · ${lotLabel ?? text(orderItemLabel(o.tipo_orden)) + " " + line.posicion} · ${item} · ${provider.nombre_corto ?? provider.nombre_largo}`,
        invoice: row.id_factura,
      });
    }
  return result;
}
export function InvoiceForm({
  provider,
  onClose,
  onSaved,
  initialNumber = "",
  invoice,
}: {
  provider?: string;
  onClose: () => void;
  onSaved?: (row: Row) => void;
  initialNumber?: string;
  invoice?: Row;
}) {
  const { db, run } = useApp();
  const [supplier, setSupplier] = useState(
    provider ?? invoice?.id_proveedor ?? "",
  );
  const [number, setNumber] = useState(
    initialNumber || invoice?.numero_factura || "",
  );
  const [documentDraft, setDocumentDraft] = useState<{
    tipo_documento: string;
    nombre_archivo: string;
  } | null>(null);
  const [initialSelected] = useState<string[]>(() =>
    invoice
      ? receipts(db)
          .filter((row) => row.invoice === invoice.id)
          .map((row) => row.id)
      : [],
  );
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const { error, catchError } = useErrors({
    values: { id_proveedor: supplier, numero_factura: number, selected },
    valid: (field) => {
      if (field === "id_proveedor")
        return db.proveedor.some((row) => row.id === supplier);
      if (field === "numero_factura") {
        const normalized = normalizeInvoice(number);
        return (
          Boolean(normalized) &&
          !db.factura.some(
            (row) =>
              row.id !== invoice?.id &&
              row.id_proveedor === supplier &&
              row.numero_factura === normalized,
          )
        );
      }
      if (field === "id_factura")
        return receipts(db)
          .filter((row) => selected.includes(row.id))
          .every((row) => row.provider === supplier);
      return false;
    },
  });
  const options = receipts(db).filter(
    (r) =>
      (!supplier || r.provider === supplier) &&
      r.label.toLowerCase().includes(query.toLowerCase()),
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const chosen = receipts(db)
        .filter((r) => selected.includes(r.id))
        .map(({ entity, id }) => ({ entity, id }));
      let row;
      if (invoice) {
        await run(
          "assignInvoice",
          {
            id: invoice.id,
            receipts: chosen,
            unassign: receipts(db)
              .filter(
                (row) =>
                  initialSelected.includes(row.id) &&
                  !selected.includes(row.id),
              )
              .map(({ entity, id }) => ({ entity, id })),
          },
          "Asociaciones actualizadas",
        );
        row = invoice;
      } else
        row = (
          await run(
            "createInvoice",
            {
              id_proveedor: supplier,
              numero_factura: number,
              document: documentDraft,
              receipts: chosen,
            },
            "Factura registrada",
          )
        ).row;
      onSaved?.(row);
      onClose();
    } catch (e) {
      catchError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        invoice
          ? `Asignar recepciones · ${invoice.numero_factura}`
          : "Agregar factura"
      }
      subtitle="Una factura puede respaldar varios lotes del mismo proveedor."
      onClose={onClose}
      dirty={
        (!invoice && !!number) ||
        selected.length !== initialSelected.length ||
        selected.some((id) => !initialSelected.includes(id)) ||
        !!documentDraft
      }
    >
      <ControlForm onSubmit={submit} fieldErrors={error?.fields} noValidate>
        <div className="dialog-body">
          <ErrorNotice error={error} />
          {error?.details.existingId && onSaved && (
            <Button
              onClick={() => {
                const row = db.factura.find(
                  (f) => f.id === error.details.existingId,
                );
                if (row) {
                  onSaved(row);
                  onClose();
                }
              }}
            >
              Seleccionar factura existente
            </Button>
          )}
          <div className="form-grid">
            <Field
              id="field-id_proveedor"
              label="Proveedor"
              required
              error={error?.fields.id_proveedor}
            >
              <ProviderPicker
                id="field-id_proveedor"
                providers={db.proveedor}
                placeholder="Buscar proveedor o elegir el primer lote…"
                value={supplier}
                disabled={!!provider || !!invoice}
                onChange={(id) => {
                  setSupplier(id);
                  setSelected([]);
                }}
              />
            </Field>
            <Field
              id="field-numero_factura"
              label="Número de factura"
              required
              error={error?.fields.numero_factura}
            >
              <ControlInput
                id="field-numero_factura"
                value={number}
                readOnly={!!invoice}
                onChange={(e) => setNumber(e.target.value)}
                autoComplete="off"
              />
            </Field>
          </div>
          {!invoice && (
            <div
              className={`invoice-draft-document${documentDraft ? " has-document" : ""}`}
            >
              {documentDraft && (
                <span className="invoice-draft-document-label">
                  Documento adjunto
                </span>
              )}
              <div className="invoice-draft-document-row">
                <span className="invoice-draft-document-icon">
                  <FileText size={20} aria-hidden="true" />
                </span>
                {documentDraft ? (
                  <strong className="invoice-draft-document-name">
                    {documentDraft.nombre_archivo}
                  </strong>
                ) : (
                  <div className="invoice-draft-document-empty">
                    <strong>Ningún documento seleccionado</strong>
                    <small>Adjunta una factura en PDF, imagen o HTML.</small>
                  </div>
                )}
                <Documents
                  owner="factura"
                  ownerId={null}
                  showList={false}
                  draft={documentDraft ?? undefined}
                  onDraftSave={setDocumentDraft}
                  renderAddTrigger={(open) => (
                    <Button
                      icon={Paperclip}
                      className="invoice-attach-button"
                      disabled={busy}
                      onClick={open}
                    >
                      {documentDraft ? "Reemplazar" : "Seleccionar documento"}
                    </Button>
                  )}
                />
                {documentDraft && (
                  <>
                    <span
                      className="invoice-draft-document-divider"
                      aria-hidden="true"
                    />
                    <Button
                      variant="link"
                      className="invoice-draft-document-remove"
                      disabled={busy}
                      onClick={() => setDocumentDraft(null)}
                    >
                      Quitar documento
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
          <h3>Lotes disponibles</h3>
          <ControlInput
            className="control"
            aria-label="Buscar orden o lote para la factura"
            placeholder="Buscar por orden, lote, producto o proveedor…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ChoiceGroup
            className="check-list"
            value={selected}
            aria-label="Recepciones disponibles"
            onChange={(next) => {
              if (!supplier) {
                const chosen = options.find((option) =>
                  next.includes(option.id),
                );
                if (chosen) setSupplier(chosen.provider);
              }
              setSelected(next);
            }}
          >
            {options.length ? (
              options.map((r) => (
                <CheckChoice
                  key={r.id}

                  value={r.id}
                >
                  <span>
                    {r.label}
                    {r.invoice && (
                      <small style={{ display: "block" }}>
                        Factura actual:{" "}
                        {
                          db.factura.find((f) => f.id === r.invoice)
                            ?.numero_factura
                        }
                      </small>
                    )}
                  </span>
                </CheckChoice>
              ))
            ) : (
              <p style={{ padding: 12 }}>No hay recepciones coincidentes.</p>
            )}
          </ChoiceGroup>
          <p className="compact-note">
            También puedes guardar la factura sin lotes ni documentos.
          </p>
        </div>
        <div className="dialog-footer">
          <CancelButton onClick={onClose}>Cancelar</CancelButton>
          <Button type="submit" variant="primary" disabled={busy}>
            {invoice ? "Guardar asociaciones" : "Guardar factura"}
          </Button>
        </div>
      </ControlForm>
    </Dialog>
  );
}
export function InvoicePicker({
  provider,
  value,
  onChange,
  onSearchChange,
  id = "field-id_factura",
  layout = "inline",
  ...inputProps
}: {
  provider: string;
  value: string | null;
  onChange: (id: string | null) => void;
  onSearchChange?: (query: string) => void;
  layout?: "inline" | "stacked";
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const { db } = useApp();
  const chosen = db.factura.find((f) => f.id === value);
  const [search, setSearch] = useState(chosen?.numero_factura ?? "");
  const [create, setCreate] = useState(false);
  const [document, setDocument] = useState(false);
  useEffect(() => {
    if (value)
      setSearch(db.factura.find((f) => f.id === value)?.numero_factura ?? "");
  }, [value, db.factura]);
  const options = [
    { id: "__sin_factura__", label: "Sin factura asociada" },
    ...db.factura
      .filter((f) => f.id_proveedor === provider)
      .map((f) => ({ id: f.id, label: f.numero_factura })),
  ];
  const doc = chosen
    ? db.documento.find(
        (d) => d.id_entidad === chosen.id && d.tipo_entidad === "factura",
      )
    : null;
  return (
    <>
      <div
        className={`invoice-picker${layout === "stacked" ? " invoice-picker-stacked" : ""}${chosen ? " invoice-picker-has-attachment" : ""}`}
      >
        <ReferencePicker
          options={options}
          value={value ?? ""}
          onChange={(id) => onChange(id || null)}
          onQueryChange={(query) => {
            setSearch(query);
            onSearchChange?.(query);
          }}
          clearOptionId="__sin_factura__"
          {...inputProps}
          id={id}
          aria-label="Buscar número de factura"
          placeholder="Buscar factura..."
          commitOnSelection
        />
        <Button className="small" icon={Plus} onClick={() => setCreate(true)}>
          Agregar factura
        </Button>
        {chosen && (
          <Button
            className={`icon-btn ${doc ? "clip-blue" : "clip-gray"}`}
            icon={Paperclip}
            aria-label={
              doc ? "Previsualizar factura" : "Adjuntar placeholder a factura"
            }
            onClick={() =>
              doc
                ? window.open(
                    `/api/documents/${doc.id}/content`,
                    "_blank",
                    "noopener",
                  )
                : setDocument(true)
            }
          />
        )}
      </div>
      {create && (
        <InvoiceForm
          provider={provider}
          initialNumber={search}
          onClose={() => setCreate(false)}
          onSaved={(f) => {
            onChange(f.id);
            setSearch(f.numero_factura);
          }}
        />
      )}
      {document && chosen && (
        <Dialog
          title={`Documentos · ${chosen.numero_factura}`}
          onClose={() => setDocument(false)}
        >
          <Documents owner="factura" ownerId={chosen.id} />
        </Dialog>
      )}
    </>
  );
}

export const productLotFieldOrder = [
  "numero_lote",
  "cantidad_recibida",
  "estado",
  "fecha_estimada_batch_record",
  "fecha_entrega_batch_record",
  "estado_batch_record",
  "fecha_inspeccion",
  "estado_inspeccion",
  "fecha_recepcion",
  "fecha_confirmacion",
  "ubicacion",
];

export function LotForm({
  line,
  record,
  onClose,
}: {
  line: Row;
  record?: Row;
  onClose: () => void;
}) {
  const { db, run } = useApp();
  const initial = {
    ...blankRow("lote_producto"),
    ...record,
    id_orden_producto: line.id,
    fecha_estimada_batch_record: record
      ? record.fecha_estimada_batch_record
      : (db.orden_compra.find((order) => order.id === line.id_orden_compra)
          ?.fecha_solicitada_entrega ?? null),
    id_factura: record?.id_factura ?? null,
  };
  const [row, setRow] = useState<Row>(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const { error, catchError } = useErrors(
    entityValidation("lote_producto", row, db, record),
  );
  const o = db.orden_compra.find((o) => o.id === line.id_orden_compra);
  const update = (field: string, value: any) => {
    setRow({ ...row, [field]: value });
    setDirty(true);
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Row = { ...row, id_orden_producto: line.id, id: record?.id };
      delete payload.id;
      if (record) payload.id = record.id;
      const cancelling = payload.estado === "anulado" && record?.estado !== "anulado";
      const expected = cancelling ? productLotLifecycleSnapshot(db, [line.id]) : undefined;
      if (expected && !(await confirmProductCancellation(db, "lot", expected, record?.id ? [record.id] : []))) return;
      await run("saveLot", { row: payload, ...(expected ? { confirm: true, expected } : {}) }, "Lote guardado");
      onClose();
    } catch (e) {
      catchError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        record
          ? isInitialProductLot(record)
            ? "Completar lote"
            : `Editar lote · ${record.numero_lote ?? "Sin número de lote"}`
          : "Agregar lote de producto"
      }
      subtitle={
        db.productos.find((p) => p.id === line.id_producto)?.nombre_producto
      }
      onClose={onClose}
      wide
      dirty={dirty}
    >
      <ControlForm onSubmit={submit} fieldErrors={error?.fields} noValidate>
        <div className="dialog-body">
          <ErrorNotice error={error} />
          <div className="form-grid three">
            {Object.entries(meta.tables.lote_producto.fields)
              .filter(
                ([f]) => !["id", "id_orden_producto", "id_factura"].includes(f),
              )
              .sort(
                ([a], [b]) =>
                  productLotFieldOrder.indexOf(a) -
                  productLotFieldOrder.indexOf(b),
              )
              .map(([field, spec]) => {
                const id = `field-${field}`;
                const isDate = spec.type === "datetime";
                const control = meta.enums[spec.type] ? (
                  <ControlSelect
                    id={id}
                    value={row[field] ?? ""}
                    onChange={(e) => update(field, e.target.value)}
                  >
                    {meta.enums[spec.type].map((v) => (
                      <option key={v} value={v}>
                        {text(v)}
                      </option>
                    ))}
                  </ControlSelect>
                ) : isDate ? (
                  <DateInput
                    id={id}
                    value={row[field]?.slice(0, 10) ?? ""}
                    onChange={(value) => update(field, isoDate(value))}
                  />
                ) : (
                  <ControlInput
                    id={id}
                    type={spec.type === "integer" ? "number" : "text"}
                    step={spec.type === "integer" ? 1 : undefined}
                    value={row[field] === null ? "" : row[field]}
                    onChange={(e) =>
                      update(
                        field,
                        spec.type === "integer"
                          ? e.target.value === ""
                            ? null
                            : Number(e.target.value)
                          : e.target.value || null,
                      )
                    }
                  />
                );
                return (
                  <Field
                    key={field}
                    id={id}
                    label={labels[field] ?? text(field)}
                    required={
                      spec.required ||
                      (field === "numero_lote" && productLotNeedsNumber(row))
                    }
                    error={error?.fields[field]}
                  >
                    {control}
                  </Field>
                );
              })}
            {o && (
              <Field
                id="field-id_factura"
                label="Factura (opcional)"
                error={error?.fields.id_factura}
              >
                <InvoicePicker
                  layout="stacked"
                  provider={o.id_proveedor}
                  value={row.id_factura}
                  onChange={(v) => update("id_factura", v)}
                />
              </Field>
            )}
          </div>
        </div>
        <div className="dialog-footer">
          <CancelButton onClick={onClose}>Cancelar</CancelButton>
          <Button type="submit" variant="primary" disabled={busy || !line.id}>
            {busy ? "Guardando…" : "Guardar lote"}
          </Button>
        </div>
      </ControlForm>
    </Dialog>
  );
}

export function ReceiptForm({
  entity,
  line,
  onClose,
}: {
  entity: "orden_material" | "orden_otro";
  line: Row;
  onClose: () => void;
}) {
  const { db, run } = useApp();
  const [row, setRow] = useState<Row>({ ...line });
  const [busy, setBusy] = useState(false);
  const [lotCreate, setLotCreate] = useState(false);
  const { error, catchError } = useErrors(
    entityValidation(entity, row, db, line),
  );
  const order = db.orden_compra.find((o) => o.id === line.id_orden_compra)!;
  const update = (key: string, value: any) => setRow({ ...row, [key]: value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await run(
        "saveReceipt",
        { entity, id: line.id, row },
        "Recepción guardada",
      );
      onClose();
    } catch (e) {
      catchError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={`Recepción del ${orderItemLabel(order.tipo_orden)}`}
      subtitle={`Este ${orderItemLabel(order.tipo_orden)} conserva una sola recepción.`}
      onClose={onClose}
      dirty={JSON.stringify(row) !== JSON.stringify(line)}
    >
      <ControlForm onSubmit={submit} fieldErrors={error?.fields}>
        <div className="dialog-body">
          <ErrorNotice error={error} />
          <div className="form-grid">
            <Field
              id="field-cantidad_recibida"
              label="Cantidad recibida (facturada)"
              error={error?.fields.cantidad_recibida}
            >
              <ControlInput
                id="field-cantidad_recibida"
                type="number"
                step="1"
                value={row.cantidad_recibida ?? ""}
                onChange={(e) =>
                  update(
                    "cantidad_recibida",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              />
            </Field>
            <Field
              id="field-ubicacion"
              label="Ubicación de recepción"
              error={error?.fields.ubicacion}
            >
              <ControlInput
                id="field-ubicacion"
                value={row.ubicacion ?? ""}
                onChange={(e) => update("ubicacion", e.target.value || null)}
              />
            </Field>
            {["fecha_estimada_entrega", "fecha_entrega"].map((f) => (
              <Field
                key={f}
                id={`field-${f}`}
                label={labels[f]}
                error={error?.fields[f]}
              >
                <DateInput
                  id={`field-${f}`}
                  value={row[f]?.slice(0, 10) ?? ""}
                  onChange={(value) => update(f, isoDate(value))}
                />
              </Field>
            ))}
            {entity === "orden_material" && (
              <>
                <Field
                  id="field-id_lote_material"
                  label="Lote de material"
                  error={error?.fields.id_lote_material}
                >
                  <ReferencePicker
                    id="field-id_lote_material"
                    aria-label="Lote de material"
                    options={[
                      { id: "__sin_lote__", label: "Sin lote" },
                      ...db.lote_material.map((lot) => ({
                        id: lot.id,
                        label: lot.numero_lote,
                      })),
                    ]}
                    value={row.id_lote_material ?? ""}
                    onChange={(id) => update("id_lote_material", id || null)}
                    clearOptionId="__sin_lote__"
                    placeholder="Buscar lote..."
                    commitOnSelection
                  />
                  <Button
                    className="small"
                    icon={Plus}
                    onClick={() => setLotCreate(true)}
                  >
                    Agregar identidad de lote
                  </Button>
                </Field>
                <Field
                  id="field-id_factura"
                  label="Factura (opcional)"
                  error={error?.fields.id_factura}
                >
                  <InvoicePicker
                    layout="stacked"
                    provider={order.id_proveedor}
                    value={row.id_factura}
                    onChange={(id) => update("id_factura", id)}
                  />
                </Field>
              </>
            )}
          </div>
          {entity !== "orden_material" && (
            <Field
              id="field-id_factura"
              label="Factura (opcional)"
              error={error?.fields.id_factura}
            >
              <InvoicePicker
                provider={order.id_proveedor}
                value={row.id_factura}
                onChange={(id) => update("id_factura", id)}
              />
            </Field>
          )}
        </div>
        <div className="dialog-footer">
          <CancelButton onClick={onClose}>Cancelar</CancelButton>
          <Button type="submit" variant="primary" disabled={busy}>
            Guardar recepción
          </Button>
        </div>
      </ControlForm>
      {lotCreate && (
        <CatalogForm
          entity="lote_material"
          onClose={() => setLotCreate(false)}
        />
      )}
    </Dialog>
  );
}

export function OrderForm({
  order,
  proposedSupplier,
  onClose,
  onCreated,
  initialType = "producto",
  abastecimiento,
  onReviewSupply,
}: {
  order?: Row;
  proposedSupplier?: string;
  onClose: () => void;
  onCreated?: () => void;
  initialType?: string;
  abastecimiento?: MaterialDemand;
  onReviewSupply?: () => void;
}) {
  const { db, run, navigate } = useApp();
  const supplyCreation = Boolean(abastecimiento && !order);
  const [alternativeEntry] = useState(
    () => readOrderEntryPreference(),
  );
  const [activeSheetRow, setActiveSheetRow] = useState(0);
  const [type, setType] = useState(
    order?.tipo_orden ?? (supplyCreation ? "material" : initialType),
  );
  const [productDefaults] = useState(() =>
    order || supplyCreation ? {} : readProductOrderDefaults(),
  );
  const authorized = order?.estado_autorizacion === "autorizada";
  const productsLocked = type === "producto" && authorized;
  const suppliers = (t: string) =>
    db.proveedor.filter((p) =>
      t === "producto"
        ? p.Es_maquila
        : t === "material"
          ? p.Es_materiales
          : p.Es_maquila === false && p.Es_materiales === false,
    );
  const defaultSupplier = (orderType: string) => {
    const eligible = suppliers(orderType);
    if (orderType === "producto") {
      const preferred = eligible.find(
        (provider) => provider.id === productDefaults.supplier,
      );
      if (preferred) return preferred.id;
    }
    return eligible[0]?.id ?? "";
  };
  const [supplier, setSupplier] = useState(
    () => order?.id_proveedor ?? defaultSupplier(type),
  );
  const automaticNumber = nextOrderNumber(db, type);
  const number = order?.no_orden ?? automaticNumber;
  const replacement =
    Boolean(order) && type === "producto" && supplier !== order?.id_proveedor;
  const [pendingSupplier, setPendingSupplier] = useState<string | null>(null);
  useEffect(() => {
    if (authorized || !proposedSupplier || proposedSupplier === order?.id_proveedor) return;
    const frame = requestAnimationFrame(() => setPendingSupplier(proposedSupplier));
    return () => cancelAnimationFrame(frame);
  }, [authorized,proposedSupplier,order?.id,order?.id_proveedor]);
  const [date, setDate] = useState(
    order?.fecha_elaboracion?.slice(0, 10) ?? today(),
  );
  const defaultProductDelivery = () =>
    productDefaults.delivery && productDefaults.delivery >= today()
      ? productDefaults.delivery
      : "";
  const [delivery, setDelivery] = useState(() => {
    if (order) return order.fecha_solicitada_entrega?.slice(0, 10) ?? "";
    return type === "producto" ? defaultProductDelivery() : "";
  });
  const inheritedDelivery = useRef(
    !order && type === "producto" && Boolean(delivery),
  );
  const fresh = (t: string, provider: string): Row => {
    if (t === "producto") {
      return {
        id_producto: "",
        cantidad_solicitada: 0,
        precio_unitario: "0.00",
        ...recommendations(db, "", 0),
        cantidad_corrugado: undefined,
        sticker_pct: 10,
      };
    }
    if (t === "material") {
      return {
        id_material: "",
        cantidad_solicitada: 0,
        precio_unitario: "0.00",
      };
    }
    return {
      producto: "",
      cantidad_solicitada: 1,
      precio_unitario: "0.00",
    };
  };
  const [lines, setLines] = useState<Row[]>(() => {
    const initialLines = order
      ? orderLines(db, order.id).map((l) => ({ ...l, sticker_pct: 10 }))
      : abastecimiento
        ? consolidateMaterialSources(abastecimiento.fuentes)
        : alternativeEntry
          ? []
          : [fresh(initialType, suppliers(initialType)[0]?.id ?? "")];
    return alternativeEntry
      ? padSheetLines(initialLines, () => fresh(type, supplier))
      : initialLines;
  });
  const [stage, setStage] = useState(1);
  const materialGroups = materialSupplierGroups(
    db,
    type === "material" ? lines.map((line) => line.id_material) : [],
  );
  const [busy, setBusy] = useState(false);
  const submittingOrder = useRef(false);
  const [supplyConflict, setSupplyConflict] = useState(false);
  const supplyOrigins = useMemo(() => {
    const groups = new Map<string, Row[]>();
    if (!abastecimiento) return groups;
    const products = new Map(
      db.orden_producto.map((line) => [line.id, line.id_orden_compra]),
    );
    const orders = new Map(db.orden_compra.map((order) => [order.id, order]));
    for (const source of abastecimiento.fuentes) {
      const order = orders.get(products.get(source.id_orden_producto) ?? "");
      if (!order) continue;
      const group = groups.get(source.id_material) ?? [];
      if (!group.some((origin) => origin.id === order.id)) group.push(order);
      groups.set(source.id_material, group);
    }
    return groups;
  }, [db, abastecimiento]);
  const earliestSupplyDelivery = useMemo(
    () =>
      earliestMaterialDelivery(
        [...supplyOrigins.values()].flatMap((origins) =>
          origins.map((origin) => origin.fecha_solicitada_entrega ?? null),
        ),
      ),
    [supplyOrigins],
  );
  const earliestLinkedSupplyDelivery = useMemo(() => {
    if (!order || type !== "material") return null;
    const materialLineIds = new Set(
      db.orden_material
        .filter((line) => line.id_orden_compra === order.id)
        .map((line) => line.id),
    );
    const sourceLineIds = new Set(
      db.abastecimiento_material
        .filter((link) => materialLineIds.has(link.id_orden_material))
        .map((link) => link.id_orden_producto),
    );
    const sourceOrderIds = new Set(
      db.orden_producto
        .filter((line) => sourceLineIds.has(line.id))
        .map((line) => line.id_orden_compra),
    );
    return earliestMaterialDelivery(
      db.orden_compra
        .filter((sourceOrder) => sourceOrderIds.has(sourceOrder.id))
        .map((sourceOrder) => sourceOrder.fecha_solicitada_entrega ?? null),
    );
  }, [db, order?.id, type]);
  const [dirty, setDirty] = useState(false);
  const originalDraft = useRef<{
    date: string;
    delivery: string;
    lines: Row[];
    stage: number;
    dirty: boolean;
  } | null>(null);
  const { error, catchError, setError } = useErrors({
    values: {
      tipo_orden: type,
      id_proveedor: supplier,
      no_orden: number,
      fecha_elaboracion: date,
      fecha_solicitada_entrega: delivery,
      lines,
    },
    valid: (field) => {
      if (field === "fecha_solicitada_entrega")
        return (
          orderDeliverySchema.safeParse(isoDate(delivery)).success &&
          (Boolean(order) ||
            !orderCreationDeliveryIssue(
              isoDate(delivery),
              new Date().toISOString(),
            )) &&
          (!supplyCreation ||
            !materialOrderDeliveryIssue(
              isoDate(delivery),
              earliestSupplyDelivery,
            )) &&
          (!order ||
            !materialOrderDeliveryIssue(
              isoDate(delivery),
              earliestLinkedSupplyDelivery,
            ))
        );
      if (field === "fecha_elaboracion")
        return !date || dateSchema.safeParse(isoDate(date)).success;
      if (field === "id_proveedor")
        return suppliers(type).some((row) => row.id === supplier);
      if (field === "no_orden") {
        const candidate = number;
        return (
          (!candidate && Boolean(order)) ||
          (/^\d+$/.test(candidate) &&
            !db.orden_compra.some(
              (row) =>
                row.id !== order?.id &&
                row.no_orden === candidate &&
                (row.tipo_orden === "producto") === (type === "producto"),
            ))
        );
      }
      if (field === "lines") {
        const count =
          alternativeEntry && stage === 1
            ? compactSheetLines(lines).length
            : lines.length;
        return count >= 1 && count <= 7;
      }
      const validLine = (line: Row, key: string) => {
        if (key === "adicional_pct")
          return (
            Number.isFinite(line.adicional_pct) &&
            line.adicional_pct >= 5 &&
            line.adicional_pct <= 10
          );
        if (key === "precio_unitario") return validPrice(line.precio_unitario);
        if (key === "cantidad_solicitada")
          return Number.isSafeInteger(line.cantidad_solicitada);
        if (key === "producto") return Boolean(line.producto?.trim());
        if (key === "id_material")
          return db.materiales.some((row) => row.id === line.id_material);
        if (key === "sticker_pct")
          return (
            Number.isFinite(line.sticker_pct) &&
            line.sticker_pct >= 1 &&
            line.sticker_pct <= 10
          );
        if (key === "id_producto") {
          const original =
            order &&
            db.orden_producto.find(
              (row) => row.id === line.id && row.id_orden_compra === order.id,
            );
          if (original?.id_producto === line.id_producto) return true;
          return (
            db.productos.some(
              (row) =>
                row.id === line.id_producto &&
                row.activo === true &&
                row.id_maquilador === supplier,
            ) && Boolean(assignedBarcode(db, line.id_producto))
          );
        }
        const entity =
          type === "producto"
            ? "orden_producto"
            : type === "material"
              ? "orden_material"
              : "orden_otro";
        const original =
          order && orderLines(db, order.id).find((row) => row.id === line.id);
        return validEntityField(entity, key, line, db, original);
      };
      const lineField = field.match(/^lines\.(\d+)\.(.+)$/);
      if (lineField) {
        const line = lines[Number(lineField[1])];
        return !line || validLine(line, lineField[2]);
      }
      return lines.length > 0 && lines.every((line) => validLine(line, field));
    },
  });
  function update(i: number, field: string, value: any) {
    setDirty(true);
    setLines((old) =>
      old.map((l, index) => (index !== i ? l : { ...l, [field]: value })),
    );
  }
  function hasSticker(line: Row) {
    return (
      line.cantidad_sticker != null ||
      db.materiales_asociados.some(
        (a) =>
          a.id_producto === line.id_producto &&
          materialRole(db, a.id_material) === "sticker",
      )
    );
  }
  function changeStickerPercentage(i: number, raw: string) {
    const percentage = raw === "" ? NaN : Number(raw);
    setDirty(true);
    setLines((old) =>
      old.map((line, index) =>
        index !== i
          ? line
          : {
              ...line,
              sticker_pct: percentage,
              ...(Number.isFinite(percentage) &&
              percentage >= 1 &&
              percentage <= 10
                ? {
                    cantidad_sticker: increasedQuantity(
                      BigInt(line.cantidad_solicitada) * 2n,
                      percentage,
                    ),
                  }
                : {}),
            },
      ),
    );
  }
  function switchType(t: string) {
    setType(t);
    const provider = defaultSupplier(t);
    setSupplier(provider);
    if (t !== "producto" && inheritedDelivery.current) {
      inheritedDelivery.current = false;
      setDelivery("");
    } else if (t === "producto" && !delivery) {
      const suggested = defaultProductDelivery();
      inheritedDelivery.current = Boolean(suggested);
      setDelivery(suggested);
    }
    setLines(
      alternativeEntry
        ? padSheetLines([], () => fresh(t, provider))
        : [fresh(t, provider)],
    );
    setActiveSheetRow(0);
    setStage(1);
    setDirty(true);
  }
  function changeSupplier(provider: string) {
    if (order && type === "producto") {
      if (provider === order.id_proveedor && originalDraft.current) {
        const draft = originalDraft.current;
        setSupplier(provider);
        setDate(draft.date);
        setDelivery(draft.delivery);
        setLines(draft.lines);
        setStage(draft.stage);
        setDirty(draft.dirty);
        originalDraft.current = null;
        setError(null);
      } else if (provider !== supplier) {
        setPendingSupplier(provider);
      }
      return;
    }
    setSupplier(provider);
    if (!order && !supplyCreation) {
      setLines(
        alternativeEntry
          ? padSheetLines([], () => fresh(type, provider))
          : [fresh(type, provider)],
      );
      setActiveSheetRow(0);
    }
    setDirty(true);
  }
  function acceptSupplierChange() {
    if (pendingSupplier === null) return;
    originalDraft.current ??= structuredClone({
      date,
      delivery,
      lines,
      stage,
      dirty,
    });
    setSupplier(pendingSupplier);
    setDate(today());
    setDelivery("");
    setLines(
      alternativeEntry
        ? padSheetLines([], () => fresh(type, pendingSupplier))
        : [fresh(type, pendingSupplier)],
    );
    setStage(1);
    setDirty(true);
    setError(null);
    setPendingSupplier(null);
  }
  function changeProduct(i: number, id: string) {
    const p = db.productos.find((p) => p.id === id);
    setLines((old) =>
      old.map((l, index) =>
        index !== i
          ? l
          : {
              ...l,
              id_producto: id,
              cantidad_solicitada: p?.unidades_lote ?? 0,
              precio_unitario: String(currentCost(db, id)?.costo ?? 0),
              ...recommendations(db, id, p?.unidades_lote ?? 0),
              cantidad_corrugado: undefined,
              sticker_pct: 10,
            },
      ),
    );
    setDirty(true);
  }
  function changeQuantity(index: number, raw: string) {
    update(index, "cantidad_solicitada", raw === "" ? NaN : Number(raw));
    setLines((previous) =>
      previous.map((line, position) =>
        position !== index
          ? line
          : {
              ...line,
              ...(alternativeEntry
                ? { _sheet: { ...line._sheet, quantityInput: raw } }
                : {}),
              ...(type === "producto"
                ? {
                    cantidad_corrugado:
                      line.cantidad_corrugado !== null &&
                      db.producto_corrugado.some(
                        (box) =>
                          box.id_producto === line.id_producto &&
                          box.id_material === line.ref_corrugado,
                      )
                        ? undefined
                        : line.cantidad_corrugado,
                    cantidad_sticker: null,
                    cantidad_cinta: null,
                  }
                : {}),
            },
      ),
    );
  }
  function changeSheetQuery(index: number, query: string) {
    setLines((previous) =>
      previous.map((line, position) =>
        position !== index || line._sheet?.query === query
          ? line
          : { ...line, _sheet: { ...line._sheet, query } },
      ),
    );
    if (query) setDirty(true);
  }
  function showEntry() {
    if (alternativeEntry)
      setLines((previous) =>
        padSheetLines(previous, () => fresh(type, supplier)),
      );
    setStage(1);
  }
  function review() {
    const candidates = alternativeEntry ? compactSheetLines(lines) : lines;
    if (alternativeEntry) {
      setLines(padSheetLines(candidates, () => fresh(type, supplier)));
      setActiveSheetRow(0);
    }
    try {
      if (supplyConflict) return;
      setError(null);
      if (!supplier)
        throw new ApiError({
          message: "Selecciona un proveedor.",
          fields: { id_proveedor: "Campo obligatorio." },
        });
      const issues: Row = {};
      if (alternativeEntry && !candidates.length)
        issues.lines = "Añade al menos un renglón a la orden.";
      const deliveryCheck = orderDeliverySchema.safeParse(isoDate(delivery));
      if (!deliveryCheck.success)
        issues.fecha_solicitada_entrega = deliveryCheck.error.issues[0].message;
      else if (!order) {
        const issue = orderCreationDeliveryIssue(
          deliveryCheck.data,
          new Date().toISOString(),
        );
        if (issue) issues.fecha_solicitada_entrega = issue;
        if (!issue && supplyCreation) {
          const supplyIssue = materialOrderDeliveryIssue(
            deliveryCheck.data,
            earliestSupplyDelivery,
          );
          if (supplyIssue) issues.fecha_solicitada_entrega = supplyIssue;
        }
      }
      if (deliveryCheck.success && order && type === "material") {
        const linkedSupplyIssue = materialOrderDeliveryIssue(
          deliveryCheck.data,
          earliestLinkedSupplyDelivery,
        );
        if (linkedSupplyIssue)
          issues.fecha_solicitada_entrega = linkedSupplyIssue;
      }
      Object.assign(
        issues,
        indexedOrderLineErrors(candidates, (l) => {
          const fields: Record<string, string> = {};
          if (
            supplyCreation &&
            (!Number.isFinite(l.adicional_pct) ||
              l.adicional_pct < 5 ||
              l.adicional_pct > 10)
          )
            fields.adicional_pct = "Introduce un adicional entre 5 y 10 %.";
          if (type === "producto" && !l.id_producto)
            fields.id_producto = "Selecciona un producto.";
          if (
            type === "producto" &&
            !assignedBarcode(db, l.id_producto) &&
            !l.id
          )
            fields.id_producto = "El producto no tiene código asignado.";
          if (type === "producto" && l.id_producto) {
            const original =
              order &&
              db.orden_producto.find(
                (row) => row.id === l.id && row.id_orden_compra === order.id,
              );
            const product = db.productos.find(
              (row) => row.id === l.id_producto,
            );
            if (
              product?.activo !== true &&
              original?.id_producto !== l.id_producto
            )
              fields.id_producto = "Selecciona un producto activo.";
            if (
              (!original || replacement) &&
              product?.id_maquilador !== supplier
            )
              fields.id_producto =
                "Selecciona un producto del proveedor de la orden.";
          }
          if (type === "material" && !l.id_material)
            fields.id_material = "Selecciona un material.";
          if (type === "otro" && !l.producto?.trim())
            fields.producto = "Escribe el concepto.";
          if (!Number.isSafeInteger(l.cantidad_solicitada))
            fields.cantidad_solicitada = "Introduce una cantidad entera.";
          try {
            decimal(l.precio_unitario);
          } catch {
            fields.precio_unitario =
              "Introduce un precio con hasta dos decimales.";
          }
          return fields;
        }),
      );
      if (Object.keys(issues).length)
        throw new ApiError({
          message: "Revisa los datos de la orden.",
          fields: issues,
        });
      const final: Row[] = candidates.map((l) => {
        const precio_unitario = decimal(l.precio_unitario);
        if (type !== "producto") return { ...l, precio_unitario };
        const suggested = recommendations(
          db,
          l.id_producto,
          l.cantidad_solicitada,
          Number.isFinite(l.sticker_pct) &&
            l.sticker_pct >= 1 &&
            l.sticker_pct <= 10
            ? l.sticker_pct
            : 10,
        );
        const boxReference =
          l.ref_corrugado === undefined
            ? suggested.ref_corrugado
            : l.ref_corrugado;
        return {
          ...l,
          ref_corrugado: boxReference,
          cantidad_corrugado:
            l.cantidad_corrugado !== undefined
              ? l.cantidad_corrugado
              : boxReference === suggested.ref_corrugado
                ? suggested.cantidad_corrugado
                : null,
          cantidad_sticker: l.cantidad_sticker ?? suggested.cantidad_sticker,
          cantidad_cinta: l.cantidad_cinta ?? suggested.cantidad_cinta,
          precio_unitario,
        };
      });
      setLines(final);
      setStage(2);
    } catch (e) {
      catchError(e);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingOrder.current || supplyConflict) return;
    if (stage === 1) {
      review();
      return;
    }
    submittingOrder.current = true;
    setBusy(true);
    try {
      const orderIssues: Record<string, string> = {};
      if (type === "producto")
        lines.forEach((line, i) => {
          if (
            hasSticker(line) &&
            (!Number.isFinite(line.sticker_pct) ||
              line.sticker_pct < 1 ||
              line.sticker_pct > 10)
          )
            orderIssues[`lines.${i}.sticker_pct`] =
              "Introduce un porcentaje de 1 a 10.";
        });
      if (Object.keys(orderIssues).length)
        throw new ApiError({
          message: "Revisa los porcentajes de sticker.",
          fields: orderIssues,
        });
      const requestedDelivery = isoDate(delivery);
      const result = await run(
        order ? "editOrder" : "createOrder",
        {
          id: order?.id,
          tipo_orden: type,
          id_proveedor: supplier,
          no_orden: order ? number : undefined,
          confirm: replacement,
          expected_no_orden: order ? undefined : automaticNumber,
          fecha_elaboracion: order ? isoDate(date) : undefined,
          fecha_solicitada_entrega: requestedDelivery,
          lines: supplyCreation
            ? lines.map((line) => ({
                id_material: line.id_material,
                cantidad_solicitada: line.cantidad_solicitada,
                precio_unitario: line.precio_unitario,
              }))
            : alternativeEntry
              ? lines.map(orderLinePayload)
              : lines,
          ...(supplyCreation ? { abastecimiento } : {}),
        },
        order ? "Orden actualizada" : "Orden creada",
      );
      if (!order) {
        const deliveryDay = costDay(requestedDelivery);
        if (type === "producto" && deliveryDay)
          rememberProductOrder(supplier, deliveryDay);
        onCreated?.();
      }
      onClose();
      if (order) navigate(`ordenes/${result.orderId}`);
    } catch (e) {
      catchError(e);
      if (e instanceof ApiError && e.code === "SUPPLY_CHANGED")
        setSupplyConflict(true);
      if (
        e instanceof ApiError &&
        Object.keys(e.fields).some(
          (field) =>
            field === "fecha_solicitada_entrega" ||
            /^lines\.\d+\.id_producto$/.test(field),
        )
      )
        showEntry();
    } finally {
      submittingOrder.current = false;
      setBusy(false);
    }
  }
  const total = (items: Row[] = lines) => {
    try {
      return money(
        totalLines(
          items.map((l) => ({
            ...l,
            precio_unitario: decimal(l.precio_unitario),
          })),
        ),
      );
    } catch {
      return "—";
    }
  };
  const entryFields = {
    type: (
      <Field id="field-tipo_orden" label="Tipo de orden">
        <ControlSelect
          id="field-tipo_orden"
          value={type}
          disabled={!!order || supplyCreation}
          onChange={(e) => switchType(e.target.value)}
        >
          {["producto", "material", "otro"].map((t) => (
            <option key={t} value={t}>
              {text(t)}
            </option>
          ))}
        </ControlSelect>
      </Field>
    ),
    number: (
      <Field
        id="field-no_orden"
        label="Número de orden"
        error={error?.fields.no_orden}
      >
        <ControlInput
          id="field-no_orden"
          value={number}
          readOnly
          autoComplete="off"
        />
      </Field>
    ),
    provider: (
      <Field
        id="field-id_proveedor"
        label="Proveedor"
        required
        error={error?.fields.id_proveedor}
      >
        <ProviderPicker
          id="field-id_proveedor"
          value={supplier}
          disabled={authorized}
          providers={
            type === "material"
              ? [...materialGroups.favorites, ...materialGroups.others]
              : suppliers(type)
          }
          sections={
            type === "material"
              ? Object.fromEntries([
                  ...materialGroups.favorites.map((p) => [p.id, "Favoritos"]),
                  ...materialGroups.others.map((p) => [
                    p.id,
                    "Otros proveedores",
                  ]),
                ])
              : undefined
          }
          commitOnSelection
          onChange={(id) => {
            if (id) changeSupplier(id);
          }}
        />
      </Field>
    ),
    date: (
      <Field
        id="field-fecha_elaboracion"
        label={
          alternativeEntry && stage === 1 ? "Fecha" : "Fecha de elaboración"
        }
      >
        <DateInput
          id="field-fecha_elaboracion"
          aria-label="Fecha de elaboración"
          value={order ? date : today()}
          readOnly={!order}
          onChange={(value) => {
            setDate(value);
            setDirty(true);
          }}
        />
      </Field>
    ),
    delivery: (
      <Field
        id="field-fecha_solicitada_entrega"
        label={
          alternativeEntry && stage === 1
            ? "Fecha entrega"
            : "Entrega solicitada"
        }
        required
        error={error?.fields.fecha_solicitada_entrega}
      >
        <DateInput
          id="field-fecha_solicitada_entrega"
          aria-label="Entrega solicitada"
          value={delivery}
          onChange={(value) => {
            inheritedDelivery.current = false;
            setDelivery(value);
            setDirty(true);
          }}
        />
      </Field>
    ),
  };
  function entryBarcode(line: Row) {
    const original = order && db.orden_producto.find(
      (row) => row.id === line.id && row.id_orden_compra === order.id && row.id_producto === line.id_producto,
    );
    return original
      ? db.codigos_barras.find((code) => code.id === original.id_codigo_barras)
      : assignedBarcode(db, line.id_producto);
  }
  function renderEntryItem(l: Row, i: number) {
    const key = (field: string) => `field-lines.${i}.${field}`;
    const selectedProduct = db.productos.find(
      (product) => product.id === l.id_producto,
    );
    const original =
      order &&
      db.orden_producto.find(
        (line) => line.id === l.id && line.id_orden_compra === order.id,
      );
    return (
      <Field
        id={key(
          type === "producto"
            ? "id_producto"
            : type === "material"
              ? "id_material"
              : "producto",
        )}
        label={
          type === "producto"
            ? "Producto"
            : type === "material"
              ? "Material"
              : "Producto o concepto"
        }
        required={!alternativeEntry || !isEmptySheetLine(l)}
        error={
          error?.fields[
            `lines.${i}.${type === "producto" ? "id_producto" : type === "material" ? "id_material" : "producto"}`
          ] ?? error?.fields.id_producto
        }
      >
        {type === "producto" ? (
          <ProductPicker
            id={key("id_producto")}
            products={[
              ...(selectedProduct &&
              selectedProduct.activo !== true &&
              original?.id_producto === selectedProduct.id
                ? [selectedProduct]
                : []),
              ...db.productos.filter(
                (p) =>
                  p.activo === true &&
                  (p.id_maquilador === supplier ||
                    p.id === original?.id_producto),
              ),
            ]}
            value={String(l.id_producto ?? "")}
            placeholder={alternativeEntry ? "" : undefined}
            onQueryChange={
              alternativeEntry
                ? (query) => changeSheetQuery(i, query)
                : undefined
            }
            disabled={productsLocked}
            aria-describedby={
              productsLocked ? "order-products-locked" : undefined
            }
            onChange={(id) => changeProduct(i, id)}
          />
        ) : type === "material" ? (
          <MaterialPicker
            id={key("id_material")}
            materials={db.materiales}
            value={l.id_material}
            placeholder={alternativeEntry ? "" : undefined}
            onQueryChange={
              alternativeEntry
                ? (query) => changeSheetQuery(i, query)
                : undefined
            }
            disabled={supplyCreation}
            aria-describedby={
              supplyCreation ? "order-supply-locked" : undefined
            }
            onChange={(id) => update(i, "id_material", id)}
          />
        ) : (
          <>
            <ControlInput
              id={key("producto")}
              value={l.producto}
              list={`conceptos-anteriores-${i}`}
              placeholder={
                alternativeEntry ? "" : "Escribe o selecciona un concepto…"
              }
              onChange={(e) => update(i, "producto", e.target.value)}
            />
            <SuggestionList id={`conceptos-anteriores-${i}`}>
              {[...new Set(db.orden_otro.map((o) => o.producto))].map((p) => (
                <option key={p} value={p} />
              ))}
            </SuggestionList>
          </>
        )}
      </Field>
    );
  }
  function renderEntryQuantity(l: Row, i: number) {
    const key = (field: string) => `field-lines.${i}.${field}`;
    return (
      <Field
        id={key("cantidad_solicitada")}
        label="Cantidad solicitada"
        required={!alternativeEntry || !isEmptySheetLine(l)}
        error={error?.fields[`lines.${i}.cantidad_solicitada`]}
      >
        <ControlInput
          disabled={
            alternativeEntry &&
            ((supplyCreation && !l.id_material) || (productsLocked && !l.id))
          }
          id={key("cantidad_solicitada")}
          type="number"
          step="1"
          value={
            Number.isNaN(l.cantidad_solicitada) ? "" : l.cantidad_solicitada
          }
          onChange={(event) => changeQuantity(i, event.target.value)}
        />
      </Field>
    );
  }
  function renderEntryPrice(l: Row, i: number) {
    const key = (field: string) => `field-lines.${i}.${field}`;
    return (
      <Field
        id={key("precio_unitario")}
        label="Precio unitario"
        required={!alternativeEntry || !isEmptySheetLine(l)}
        error={
          error?.fields[`lines.${i}.precio_unitario`] ??
          error?.fields.precio_unitario
        }
      >
        <ControlInput
          disabled={
            alternativeEntry &&
            ((supplyCreation && !l.id_material) || (productsLocked && !l.id))
          }
          id={key("precio_unitario")}
          inputMode="decimal"
          value={l.precio_unitario}
          onChange={(e) => update(i, "precio_unitario", e.target.value)}
        />
      </Field>
    );
  }
  function renderEntryAdditional(l: Row, i: number) {
    const key = (field: string) => `field-lines.${i}.${field}`;
    return (
      <Field
        id={key("adicional_pct")}
        label="Adicional (%)"
        tooltip="Base de las OC seleccionadas × (1 + adicional / 100), redondeada hacia arriba"
        error={error?.fields[`lines.${i}.adicional_pct`]}
      >
        <ControlInput
          id={key("adicional_pct")}
          aria-label={`Adicional del material ${i + 1} (%)`}
          type="number"
          min="5"
          max="10"
          step="any"
          value={Number.isFinite(l.adicional_pct) ? l.adicional_pct : ""}
          onChange={(event) => {
            const percent =
              event.target.value === "" ? NaN : Number(event.target.value);
            setDirty(true);
            setLines((previous) =>
              previous.map((line, index) => {
                if (index !== i) return line;
                try {
                  return {
                    ...line,
                    adicional_pct: percent,
                    cantidad_solicitada: demandQuantity(
                      line.cantidad_base,
                      percent,
                    ),
                  };
                } catch {
                  return {
                    ...line,
                    adicional_pct: percent,
                  };
                }
              }),
            );
          }}
        />
      </Field>
    );
  }
  return (
    <Dialog
      title={
        order ? `Editar orden · ${order.no_orden}` : "Nueva orden de compra"
      }
      className={alternativeEntry && stage === 1 ? "order-entry-dialog" : ""}
      subtitle={
        stage === 1
          ? `1. Datos y ${orderItemLabel(type, true)} de la orden`
          : `2. Revisión de ${orderReference(type, number)}: cantidades y total`
      }
      wide
      onClose={onClose}
      dirty={dirty}
      busy={busy}
    >
      <ControlForm onSubmit={submit} fieldErrors={error?.fields} noValidate>
        <div className="dialog-body" inert={busy}>
          <ErrorNotice error={error} />
          {supplyCreation && (
            <p className="notice subtle" id="order-supply-locked">
              Los materiales y sus OC de origen proceden de la selección de
              abastecimiento. Para cambiarlos, vuelve a la selección.
            </p>
          )}
          {supplyConflict && (
            <p className="notice" role="status">
              La selección necesita una revisión. Vuelve a la tabla para
              consultar las necesidades vigentes antes de preparar otra vez la
              OCM.
            </p>
          )}
          {replacement && (
            <p className="notice" role="status">
              Reemplazo pendiente: al guardar se eliminarán los datos anteriores
              de cabecera, productos, lotes, documentos propios y vínculos de
              abastecimiento de esta orden. Las OCM anteriores se conservarán.
              Los datos guardados se conservan hasta confirmar el reemplazo.
            </p>
          )}
          {error?.details.existingId && (
            <Button
              onClick={() => {
                onClose();
                navigate(`ordenes/${error.details.existingId}`);
              }}
            >
              Abrir orden existente
            </Button>
          )}
          {stage === 1 && alternativeEntry ? (
            <>
              <div className="order-sheet-type">{entryFields.type}</div>
              {productsLocked && (
                <p className="notice subtle" id="order-products-locked">
                  Los productos están bloqueados porque la orden está autorizada.
                  Puedes ajustar cantidades, precios y materiales de empaque.
                </p>
              )}
              <OrderEntrySheet
                editing={Boolean(order)}
                title={
                  type === "producto"
                    ? "ORDEN DE PRODUCCIÓN"
                    : "ORDEN DE COMPRA"
                }
                number={entryFields.number}
                date={entryFields.date}
                delivery={entryFields.delivery}
                provider={entryFields.provider}
                nit={(() => {
                  const provider = db.proveedor.find(
                    (row) => row.id === supplier,
                  );
                  return provider?.nit
                    ? `${provider.nit}${provider.digito_verf ? `-${provider.digito_verf}` : ""}`
                    : "";
                })()}
                rows={lines.map((line, index) => ({
                  key: line._sheet.key,
                  cells: [
                    type === "producto"
                      ? (entryBarcode(line)?.codigo ?? "")
                      : type === "material"
                        ? (db.materiales
                            .find(
                              (material) => material.id === line.id_material,
                            )
                            ?.codigo_material?.toString()
                            .padStart(3, "0") ?? "")
                        : "",
                    renderEntryItem(line, index),
                    renderEntryQuantity(line, index),
                    renderEntryPrice(line, index),
                    isEmptySheetLine(line) ? (
                      ""
                    ) : (
                      <output aria-label={`Total del renglón ${index + 1}`}>
                        {total([line])}
                      </output>
                    ),
                  ],
                }))}
                total={total(compactSheetLines(lines))}
                activeRow={activeSheetRow}
                onActiveRow={setActiveSheetRow}
                clearDisabled={
                  productsLocked ||
                  supplyCreation ||
                  isEmptySheetLine(lines[activeSheetRow])
                }
                onClear={() => {
                  setLines((previous) =>
                    previous.map((line, index) => {
                      if (index !== activeSheetRow) return line;
                      return blankSheetLine(() => fresh(type, supplier));
                    }),
                  );
                  setDirty(true);
                }}
              />
              {type === "producto" &&
                lines.some(
                  (line) =>
                    line.id_producto &&
                    (!entryBarcode(line) ||
                      !currentCost(db, line.id_producto)),
                ) && (
                  <div className="order-sheet-notes">
                    {lines.map(
                      (line, index) =>
                        line.id_producto && (
                          <div key={line._sheet.key}>
                            {!entryBarcode(line) && (
                              <small>
                                Fila {index + 1}: Sin código asignado.
                              </small>
                            )}
                            {!currentCost(db, line.id_producto) && (
                              <small>
                                Fila {index + 1}: Sin costo registrado.
                              </small>
                            )}
                          </div>
                        ),
                    )}
                  </div>
                )}
              {supplyCreation && (
                <section
                  className="order-sheet-supply"
                  aria-label="Detalle de abastecimiento"
                >
                  <h3>Detalle de abastecimiento</h3>
                  {lines.map(
                    (line, index) =>
                      line.id_material && (
                        <div className="order-form-line" key={line._sheet.key}>
                          <h4>
                            Fila {index + 1} ·{" "}
                            {
                              db.materiales.find(
                                (material) => material.id === line.id_material,
                              )?.nombre_material
                            }
                          </h4>
                          <p className="order-line-basis">
                            Base según OC: {count(line.cantidad_base)} unidades
                            · Orígenes:{" "}
                            {supplyOrigins
                              .get(line.id_material)
                              ?.map((origin) =>
                                orderReference("producto", origin.no_orden),
                              )
                              .join(", ")}{" "}
                            · {line.fuentes.length} renglones de producto
                          </p>
                          {renderEntryAdditional(line, index)}
                        </div>
                      ),
                  )}
                </section>
              )}
            </>
          ) : stage === 1 ? (
            <>
              <div className="form-grid three">
                {entryFields.type}
                {entryFields.number}
                {entryFields.provider}
                {entryFields.date}
                {entryFields.delivery}
              </div>
              <div>
                {productsLocked && (
                  <p className="notice subtle" id="order-products-locked">
                    Los productos están bloqueados porque la orden está
                    autorizada. Puedes ajustar cantidades, precios y materiales
                    de empaque.
                  </p>
                )}
                <div className="spread" style={{ marginBottom: 16 }}>
                  <h3>{text(orderItemLabel(type, true))} de la orden</h3>
                  <small>{lines.length} de 7</small>
                </div>
                {lines.map((l, i) => {
                  const selectedProduct = db.productos.find(
                    (p) => p.id === l.id_producto,
                  );
                  const original =
                    order &&
                    db.orden_producto.find(
                      (row) =>
                        row.id === l.id && row.id_orden_compra === order.id,
                    );
                  const barcode = l.id
                    ? db.codigos_barras.find((c) => c.id === l.id_codigo_barras)
                    : assignedBarcode(db, l.id_producto);
                  const key = (f: string) => `field-lines.${i}.${f}`;
                  return (
                    <div className="order-form-line" key={i}>
                      <div className="line-title">
                        <h3>
                          {text(orderItemLabel(type))} {i + 1}
                        </h3>
                        <Button
                          className="icon-btn"
                          icon={Trash2}
                          disabled={
                            productsLocked ||
                            supplyCreation ||
                            lines.length === 1
                          }
                          aria-describedby={
                            productsLocked ? "order-products-locked" : undefined
                          }
                          aria-label={`Eliminar ${orderItemLabel(type)} ${i + 1}`}
                          onClick={() => {
                            setLines(lines.filter((_, n) => n !== i));
                            setDirty(true);
                          }}
                        />
                      </div>
                      {supplyCreation && (
                        <p className="order-line-basis demand-line-basis">
                          <span>
                            Base según OC:{" "}
                            <strong className="num">
                              {count(l.cantidad_base)} unidades
                            </strong>
                          </span>
                          <span>
                            Orígenes:{" "}
                            <strong>
                              {supplyOrigins.get(l.id_material)?.length ?? 0} OC
                              · {l.fuentes.length}{" "}
                              {l.fuentes.length === 1 ? "renglón" : "renglones"}
                            </strong>
                          </span>
                        </p>
                      )}
                      <div className="form-grid three">
                        {renderEntryItem(l, i)}
                        <div
                          className={
                            supplyCreation
                              ? "demand-quantity-fields"
                              : "order-quantity-fields"
                          }
                        >
                          {renderEntryQuantity(l, i)}
                          {supplyCreation && (
                            <div className="demand-percent">
                              {renderEntryAdditional(l, i)}
                            </div>
                          )}
                        </div>
                        {renderEntryPrice(l, i)}
                        {type === "producto" && (
                          <div className="field">
                            <span className="field-label">
                              Código de barras
                            </span>
                            <div className="inline" style={{ minHeight: 36 }}>
                              {barcode ? (
                                <span className="mono">{barcode.codigo}</span>
                              ) : (
                                <Badge value="pendiente">
                                  Sin código asignado
                                </Badge>
                              )}
                              {selectedProduct &&
                                !currentCost(db, selectedProduct.id) && (
                                  <Badge value="pendiente">
                                    Sin costo registrado
                                  </Badge>
                                )}
                            </div>
                          </div>
                        )}
                        {type === "producto" && (
                          <div className="field order-line-total">
                            <span className="field-label">
                              Total del producto
                            </span>
                            <output
                              className="num"
                              aria-label={`Total del producto ${i + 1}`}
                              aria-live="polite"
                            >
                              {total([l])}
                            </output>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <Button
                  icon={Plus}
                  disabled={
                    productsLocked || supplyCreation || lines.length === 7
                  }
                  aria-describedby={
                    productsLocked ? "order-products-locked" : undefined
                  }
                  onClick={() => {
                    setLines([...lines, fresh(type, supplier)]);
                    setDirty(true);
                  }}
                >
                  Agregar {orderItemLabel(type)}
                </Button>
              </div>
            </>
          ) : (
            <>
              {supplyCreation && (
                <div
                  className="demand-review"
                  aria-label="Revisión de materiales y orígenes"
                >
                  {lines.map((line, index) => {
                    const sources = line.fuentes as MaterialDemand["fuentes"];
                    const origins = supplyOrigins.get(line.id_material) ?? [];
                    return (
                      <div className="order-form-line" key={line.id_material}>
                        <h3>
                          {index + 1}.{" "}
                          {
                            db.materiales.find(
                              (material) => material.id === line.id_material,
                            )?.nombre_material
                          }
                        </h3>
                        <p className="order-line-basis">
                          <span>
                            Base: <strong>{count(line.cantidad_base)}</strong>
                          </span>
                          <span>
                            Adicional de referencia:{" "}
                            <strong>{line.adicional_pct} %</strong>
                          </span>
                          <span>
                            Cantidad final:{" "}
                            <strong>{count(line.cantidad_solicitada)}</strong>
                          </span>
                          <span>
                            Precio unitario:{" "}
                            <strong>{money(line.precio_unitario)}</strong>
                          </span>
                          <span>
                            Subtotal: <strong>{total([line])}</strong>
                          </span>
                        </p>
                        <p className="compact-note">
                          {origins
                            .slice(0, 10)
                            .map((origin) =>
                              orderReference("producto", origin.no_orden),
                            )
                            .join(", ")}
                          {origins.length > 10
                            ? ` y ${origins.length - 10} OC más`
                            : ""}{" "}
                          · {sources.length}{" "}
                          {sources.length === 1 ? "renglón" : "renglones"} de
                          producto
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
              {type === "producto" && (
                <>
                  <h3>Cantidades recomendadas</h3>
                  {lines.map((l, i) => {
                    const box = db.producto_corrugado.find(
                      (c) =>
                        c.id_producto === l.id_producto &&
                        c.id_material === l.ref_corrugado,
                    );
                    return (
                      <div className="order-form-line" key={i}>
                        <h3 style={{ marginBottom: 14 }}>
                          {
                            db.productos.find((p) => p.id === l.id_producto)
                              ?.nombre_producto
                          }
                        </h3>
                        <p className="order-line-basis">
                          <span>
                            Cantidad solicitada:{" "}
                            <strong className="num">
                              {count(l.cantidad_solicitada)} unidades
                            </strong>
                          </span>
                          <span>
                            Capacidad del corrugado:{" "}
                            {box ? (
                              <strong className="num">
                                {count(box.unidades_por_corrugado)} unidades
                              </strong>
                            ) : (
                              "Sin configuración para la referencia seleccionada"
                            )}
                          </span>
                        </p>
                        <div className="form-grid three">
                          <Field
                            id={`field-lines.${i}.ref_corrugado`}
                            label="Referencia de corrugado"
                          >
                            <ReferencePicker
                              id={`field-lines.${i}.ref_corrugado`}
                              value={l.ref_corrugado ?? ""}
                              placeholder="Buscar corrugado…"
                              clearOptionId="__sin_corrugado__"
                              onChange={(id) =>
                                update(i, "ref_corrugado", id || null)
                              }
                              options={[
                                {
                                  id: "__sin_corrugado__",
                                  label: "Sin referencia",
                                },
                                ...db.materiales
                                  .filter((m) =>
                                    /corrugad/.test(
                                      db.tipos_materiales
                                        .find((t) => t.id === m.id_tipo_material)
                                        ?.tipo_material?.toLowerCase() ?? "",
                                    ),
                                  )
                                  .map((material) => ({
                                    id: material.id,
                                    label: recordName(db, "materiales", material),
                                  })),
                              ]}
                            />
                          </Field>
                          <Field
                            id={`field-lines.${i}.cantidad_corrugado`}
                            label="Cantidad de corrugado"
                            tooltip={
                              box
                                ? "Cantidad solicitada ÷ capacidad + 5 adicionales"
                                : undefined
                            }
                            error={error?.fields.cantidad_corrugado}
                          >
                            <ControlInput
                              id={`field-lines.${i}.cantidad_corrugado`}
                              type="number"
                              step="1"
                              value={l.cantidad_corrugado ?? ""}
                              onChange={(e) =>
                                update(
                                  i,
                                  "cantidad_corrugado",
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                                )
                              }
                            />
                          </Field>
                          {hasSticker(l) && (
                            <div
                              className="sticker-fields"
                              role="group"
                              aria-label={`Sticker del producto ${i + 1}`}
                            >
                              <Field
                                id={`field-lines.${i}.cantidad_sticker`}
                                label="Cantidad de sticker"
                                tooltip="Cantidad solicitada x 2 + % adicional"
                              >
                                <ControlInput
                                  id={`field-lines.${i}.cantidad_sticker`}
                                  aria-label="Cantidad de sticker · provisional"
                                  type="number"
                                  step="1"
                                  value={l.cantidad_sticker ?? ""}
                                  onChange={(e) =>
                                    update(
                                      i,
                                      "cantidad_sticker",
                                      e.target.value === ""
                                        ? null
                                        : Number(e.target.value),
                                    )
                                  }
                                />
                              </Field>
                              <Field
                                id={`field-lines.${i}.sticker_pct`}
                                label="%"
                                tooltip="Cantidad solicitada x 2 + % adicional"
                                error={error?.fields[`lines.${i}.sticker_pct`]}
                              >
                                <ControlInput
                                  aria-label="Adicional recomendado de sticker (%)"
                                  type="number"
                                  inputMode="decimal"
                                  min="1"
                                  max="10"
                                  step="any"
                                  value={
                                    Number.isFinite(l.sticker_pct)
                                      ? l.sticker_pct
                                      : ""
                                  }
                                  onChange={(e) =>
                                    changeStickerPercentage(i, e.target.value)
                                  }
                                />
                              </Field>
                            </div>
                          )}
                          {l.cantidad_cinta !== null && (
                            <Field
                              id={`field-lines.${i}.cantidad_cinta`}
                              label="Cantidad de cinta · provisional"
                              tooltip="Cantidad solicitada ÷ 4000"
                            >
                              <ControlInput
                                id={`field-lines.${i}.cantidad_cinta`}
                                type="number"
                                step="1"
                                value={l.cantidad_cinta ?? ""}
                                onChange={(e) =>
                                  update(
                                    i,
                                    "cantidad_cinta",
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                  )
                                }
                              />
                            </Field>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              {type !== "producto" && (
                <div className="notice subtle">
                  <Check size={16} aria-hidden="true" />
                  {lines.length === 1 ? "Se guardará" : "Se guardarán"}{" "}
                  {lines.length} {orderItemLabel(type, lines.length !== 1)}. La
                  orden se crea sin autorización.
                </div>
              )}
              {order && !replacement && type === "producto" && (
                <p className="compact-note">
                  Los vínculos de abastecimiento existentes se conservan al
                  editar.
                </p>
              )}
            </>
          )}
          {!(alternativeEntry && stage === 1) && (
            <div className="order-totals">
              <span>Total de la orden</span>
              <strong className="num">{total()}</strong>
            </div>
          )}
        </div>
        <div className="dialog-footer">
          {stage === 2 && (
            <Button icon={ArrowLeft} onClick={showEntry}>
              Volver
            </Button>
          )}
          <CancelButton
            onClick={supplyConflict ? (onReviewSupply ?? onClose) : onClose}
            disabled={busy}
          >
            {supplyConflict
              ? "Revisar selección"
              : supplyCreation
                ? "Volver a selección"
                : "Cancelar"}
          </CancelButton>
          <Button
            type="submit"
            variant="primary"
            icon={stage === 1 ? ChevronRight : Check}
            disabled={busy || supplyConflict}
          >
            {busy
              ? "Guardando…"
              : stage === 1
                ? "Revisar orden"
                : replacement
                  ? "Guardar reemplazo"
                  : order
                    ? "Guardar cambios"
                    : "Crear orden"}
          </Button>
        </div>
      </ControlForm>
      {pendingSupplier !== null && (
        <ConfirmationDialog
          title="Cambiar proveedor y reemplazar la orden"
          confirmLabel="Cambiar proveedor"
          onClose={() => setPendingSupplier(null)}
          onConfirm={acceptSupplierChange}
        >
          <p>
            Al guardar con el nuevo proveedor se perderá toda la información
            anterior de esta orden: datos de cabecera, productos, lotes,
            documentos propios y vínculos de abastecimiento.
          </p>
          <p>
            Las OCM anteriores y sus datos se conservarán. La orden mantendrá su
            número y su identidad. Ahora se preparará un borrador nuevo; la
            información guardada se reemplazará únicamente al confirmar
            <strong> Guardar reemplazo</strong> en la revisión final.
          </p>
          <p>
            Puedes cancelar o volver al proveedor original para recuperar el
            borrador anterior.
          </p>
        </ConfirmationDialog>
      )}
    </Dialog>
  );
}

export function MailForm({
  context = {},
  onClose,
}: {
  context?: Row;
  onClose: () => void;
}) {
  const { db, run } = useApp();
  const [event, setEvent] = useState(context.event ?? "envio_orden_compra");
  const [orderId, setOrderId] = useState(context.orderId ?? "");
  const [lotId, setLotId] = useState(context.loteMaterialId ?? "");
  const [preview, setPreview] = useState<Row | null>(null);
  const [recipients, setRecipients] = useState<Row[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const { error, catchError, setError } = useErrors({
    values: { recipients },
    valid: (field) =>
      field === "recipients" &&
      recipients.length > 0 &&
      recipients.every(
        (recipient) =>
          validEmail(recipient.address) &&
          ["para", "cc", "cco"].includes(recipient.type),
      ) &&
      new Set(recipients.map((recipient) => recipient.address.toLowerCase()))
        .size === recipients.length,
  });
  useEffect(() => {
    let active = true;
    setPreview(null);
    setError(null);
    void request("mail-preview", {
      ...context,
      event,
      orderId: orderId || undefined,
      loteMaterialId: lotId || undefined,
    })
      .then((p) => {
        if (active) {
          setPreview(p);
          setBody(p.body);
          setRecipients(p.recipients);
          setChanged(false);
        }
      })
      .catch((e) => {
        if (active) catchError(e);
      });
    return () => {
      active = false;
    };
  }, [event, orderId, lotId]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await run(
        "sendMail",
        {
          ...context,
          event,
          orderId: orderId || undefined,
          loteMaterialId: lotId || undefined,
          recipients,
          body,
        },
        "Envío simulado confirmado",
      );
      onClose();
    } catch (e) {
      catchError(e);
    } finally {
      setBusy(false);
    }
  }
  const manualContacts = [
    ...db.contacto_interno.filter((c) => c.activo),
    ...db.contacto,
  ].filter((c) => c.correo && validEmail(c.correo));
  return (
    <Dialog
      title="Preparar correo"
      subtitle="Envío simulado · no se enviarán mensajes externos."
      wide
      onClose={onClose}
      dirty={changed}
    >
      <ControlForm onSubmit={submit} fieldErrors={error?.fields} noValidate>
        <div className="dialog-body">
          <ErrorNotice error={error} />
          <div className="form-grid three">
            <Field id="field-event" label="Proceso">
              <ControlSelect
                id="field-event"
                value={event}
                onChange={(e) => setEvent(e.target.value)}
              >
                {meta.enums.tipo_evento_correo.filter((t) => t !== "cotizacion_materiales").map((t) => (
                  <option key={t} value={t}>
                    {text(t)}
                  </option>
                ))}
              </ControlSelect>
            </Field>
            {event === "envio_orden_compra" && (
              <Field id="field-orderId" label="Orden">
                <ControlSelect
                  id="field-orderId"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                >
                  <option value="">Seleccionar…</option>
                  {db.orden_compra.map((o) => (
                    <option key={o.id} value={o.id}>
                      {orderReference(o.tipo_orden, o.no_orden)} ·{" "}
                      {text(o.tipo_orden)}
                    </option>
                  ))}
                </ControlSelect>
              </Field>
            )}
            {event.startsWith("envio_certificado") && (
              <Field id="field-loteMaterialId" label="Lote de material">
                <ControlSelect
                  id="field-loteMaterialId"
                  value={lotId}
                  onChange={(e) => setLotId(e.target.value)}
                >
                  <option value="">Materiales del contexto de la orden</option>
                  {db.lote_material.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.numero_lote}
                    </option>
                  ))}
                </ControlSelect>
              </Field>
            )}
            <div className="field">
              <span className="field-label">Remitente de demostración</span>
              <p style={{ paddingTop: 9, fontSize: 12 }}>
                {preview?.remitente ?? "zamira@gimed-demo.example"}
              </p>
            </div>
          </div>
          <div className="spread">
            <h3>Destinatarios</h3>
            <Button
              className="small"
              icon={Plus}
              onClick={() => {
                setRecipients([...recipients, { address: "", type: "para" }]);
                setChanged(true);
              }}
            >
              Agregar
            </Button>
          </div>
          {recipients.map((r, i) => (
            <div
              className={`recipient ${error?.fields.recipients ? "invalid" : ""}`}
              key={i}
            >
              <ControlSelect
                className="control"
                aria-label={`Tipo de destinatario ${i + 1}`}
                name={`recipients.${i}.type`}
                data-field-path={`recipients.${i}.type`}
                aria-invalid={error?.fields.recipients ? true : undefined}
                aria-describedby={
                  error?.fields.recipients ? "mail-recipients-error" : undefined
                }
                value={r.type}
                onChange={(e) => {
                  setRecipients(
                    recipients.map((v, n) =>
                      n === i ? { ...v, type: e.target.value } : v,
                    ),
                  );
                  setChanged(true);
                }}
              >
                {["para", "cc", "cco"].map((t) => (
                  <option key={t} value={t}>
                    {text(t)}
                  </option>
                ))}
              </ControlSelect>
              <ControlInput
                className="control"
                type="email"
                list="correo-directorio"
                aria-label={`Dirección de destinatario ${i + 1}`}
                name={`recipients.${i}.address`}
                data-field-path={`recipients.${i}.address`}
                aria-invalid={error?.fields.recipients ? true : undefined}
                aria-describedby={
                  error?.fields.recipients ? "mail-recipients-error" : undefined
                }
                autoComplete="email"
                value={r.address}
                placeholder="correo@ejemplo.com"
                onChange={(e) => {
                  setRecipients(
                    recipients.map((v, n) =>
                      n === i ? { ...v, address: e.target.value } : v,
                    ),
                  );
                  setChanged(true);
                }}
              />
              <Button
                className="icon-btn"
                icon={Trash2}
                aria-label={`Quitar destinatario ${i + 1}`}
                onClick={() => {
                  setRecipients(recipients.filter((_, n) => n !== i));
                  setChanged(true);
                }}
              />
            </div>
          ))}
          {error?.fields.recipients && (
            <span id="mail-recipients-error" className="visually-hidden">
              {error.fields.recipients}
            </span>
          )}
          <SuggestionList id="correo-directorio">
            {manualContacts.map((c) => (
              <option key={c.id} value={c.correo!}>
                {c.nombre}
              </option>
            ))}
          </SuggestionList>
          {!recipients.length && (
            <p className="compact-note">
              Sin sugerencias. Puedes agregar cualquier dirección válida.
            </p>
          )}
          <Field id="field-body" label="Contenido del correo">
            <ControlTextArea
              id="field-body"
              rows={7}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setChanged(true);
              }}
            />
          </Field>
          <div>
            <h3>Documentos adjuntos</h3>
            {preview?.documents.length ? (
              preview.documents.map((d: Row) => (
                <div key={d.id} className="inline" style={{ marginTop: 8 }}>
                  <Paperclip size={15} aria-hidden="true" />
                  <ControlLink
                    href={`/api/documents/${d.id}/content`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12 }}
                  >
                    {d.nombre_archivo}
                  </ControlLink>
                  <Badge value="material">Placeholder</Badge>
                </div>
              ))
            ) : (
              <p className="compact-note" style={{ marginTop: 8 }}>
                {event === "codigos_barras_nuevos"
                  ? "Los códigos se incluyen en el cuerpo; no requieren archivos."
                  : "Sin archivos disponibles."}
              </p>
            )}
          </div>
          {preview && preview.missing.length > 0 && (
            <div className="notice warning">
              <Info size={17} aria-hidden="true" />
              <div>
                <strong>
                  Completa los documentos antes de simular el envío.
                </strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
                  {preview.missing.map((s: string) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
        <div className="dialog-footer">
          <CancelButton onClick={onClose}>Cancelar</CancelButton>
          <Button
            type="submit"
            icon={Send}
            variant="primary"
            disabled={busy || !preview}
          >
            {busy ? "Confirmando…" : "Simular envío"}
          </Button>
        </div>
      </ControlForm>
    </Dialog>
  );
}
