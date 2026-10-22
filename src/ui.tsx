import {
  Children,
  cloneElement,
  createContext,
  Fragment,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  Tabs as AriaTabs,
  Tab,
  TabList,
  TabPanel,
} from "react-aria-components/Tabs";
import {
  Action,
  ChoiceCombo,
  ControlError,
  FormErrorsContext,
  ControlLabel,
  ControlLink,
  type Choice,
} from "./components/controls";
import { DateInput } from "./components/date-control";
import {
  ActionTooltip,
  CancelAction,
  Dialog,
  DialogScope,
  TooltipHelp,
} from "./components/overlays";

import {
  AlertCircle,
  ChevronRight,
  LoaderCircle,
  PackageSearch,
  type LucideIcon,
} from "lucide-react";
import type { Database } from "../shared/models";
import { supplierOptionLabel } from "../shared/favorite-suppliers";
import {
  meta,
  orderReference,
  titles,
  words,
  type Entity,
  type Row,
} from "../shared/schema";
import { parseDateInput } from "./dates";
import {
  remainingFieldErrors,
  validationSignature,
  type LiveValidation,
} from "./live-validation";
export class ApiError extends Error {
  focusKey = {};
  fields: Record<string, string>;
  code: string;
  details: Row;
  constructor(data: Row) {
    super(data.message ?? "No se pudo completar la operación.");
    this.fields = data.fields ?? {};
    this.code = data.code ?? "NETWORK";
    this.details = data.details ?? {};
  }
}
export async function request(path: string, body?: Row): Promise<any> {
  let response: Response;
  try {
    response = await fetch(
      `/api/${path}`,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {},
    );
  } catch {
    throw new ApiError({
      message:
        "No hay conexión con el servicio local. Comprueba que esté iniciado.",
    });
  }
  const data = await response.json();
  if (!response.ok) throw new ApiError(data);
  return data;
}
type AppContextValue = {
  db: Database;
  run: (name: string, payload: Row, message?: string) => Promise<Row>;
  navigate: (path: string) => void;
  notify: (message: string, error?: boolean) => void;
};
export const AppContext = createContext<AppContextValue>(null!);
const FieldScope = DialogScope;
export const useApp = () => useContext(AppContext);
export const text = (value: string | null | undefined) =>
  value ? (words[value] ?? value.replaceAll("_", " ")) : "—";
const numberFormatter = new Intl.NumberFormat("es-CO");
export const count = (value: number) => numberFormatter.format(value);
export function money(value: string | number): string {
  const input = String(value);
  const negative = input.startsWith("-");
  const [whole, part = "00"] = (negative ? input.slice(1) : input).split(".");
  return `$ ${negative ? "-" : ""}${numberFormatter.format(BigInt(whole))},${part.padEnd(2, "0")}`;
}
const shortDateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Bogota",
});
export const shortDate = (value: string | null | undefined) =>
  value ? shortDateFormatter.format(new Date(value)) : "Sin fecha";
export const isoDate = (value: string) =>
  value
    ? parseDateInput(value)
      ? `${parseDateInput(value)}T12:00:00.000Z`
      : value
    : null;
export const today = () => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
};
export function recordName(db: Database, entity: Entity, row: Row): string {
  if (!row) return "—";
  if (entity === "proveedor")
    return row.nombre_largo ?? row.nombre_corto ?? "Proveedor sin nombre";
  if (entity === "orden_compra")
    return `${orderReference(row.tipo_orden, row.no_orden)} · ${text(row.tipo_orden)}`;
  if (entity === "costos_maquila")
    return `${db.productos.find((p) => p.id === row.id_producto)?.nombre_producto ?? "Producto"} · ${shortDate(row.fecha_inicio)}`;
  if (entity === "factura") return row.numero_factura;
  if (entity === "lote_producto")
    return row.numero_lote ?? "Sin número de lote";
  if (entity === "materiales")
    return `${row.codigo_material === null ? "" : String(row.codigo_material).padStart(3, "0") + " · "}${row.nombre_material ?? "Material sin nombre"}`;
  return (
    row.nombre_producto ??
    row.codigo ??
    row.nombre_material ??
    row.nombre_categoria ??
    row.tipo_material ??
    row.nombre ??
    row.nombre_dir ??
    row.numero_lote ??
    titles[entity]
  );
}
export function displayField(
  db: Database,
  entity: Entity,
  field: string,
  value: any,
): string {
  if (value === null || value === undefined) return "—";
  const ref = meta.refs.find((r) => r.table === entity && r.field === field);
  if (ref) {
    const row = (db[ref.target] as Row[]).find(
      (r) => r[ref.targetField] === value,
    );
    return row ? recordName(db, ref.target, row) : "Referencia no disponible";
  }
  if (field === "codigo_material") return String(value).padStart(3, "0");
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (field.startsWith("fecha_")) return shortDate(value);
  if (field === "costo" || field === "precio_unitario") return money(value);
  if (typeof value === "number") return count(value);
  return text(String(value));
}
export function Button({
  children,
  icon: Icon,
  variant = "secondary",
  className = "",
  ...props
}: React.ComponentPropsWithRef<"button"> & {
  icon?: LucideIcon;
  variant?: string;
}) {
  const tooltip =
    props.title ??
    props["aria-label"] ??
    (typeof children === "string" ? children : undefined);
  const isTableAction = className.split(/\s+/).includes("table-action");
  const button = (
    <Action
      type="button"
      {...props}
      title={isTableAction ? undefined : props.title}
      className={"btn " + variant + " " + className}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </Action>
  );
  return isTableAction && tooltip ? (
    <ActionTooltip content={tooltip}>{button}</ActionTooltip>
  ) : (
    button
  );
}
export function CancelButton({
  children,
  icon: Icon,
  variant = "secondary",
  className = "",
  ...props
}: React.ComponentPropsWithRef<"button"> & {
  icon?: LucideIcon;
  variant?: string;
}) {
  return (
    <CancelAction
      type="button"
      {...props}
      className={"btn " + variant + " " + className}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </CancelAction>
  );
}
export function Badge({
  value,
  children,
  tone,
}: {
  value: string;
  children?: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${value}${tone ? ` ${tone}` : ""}`}>
      {children ?? text(value)}
    </span>
  );
}
export function LinkButton({
  children,
  icon: Icon,
  variant = "secondary",
  className = "",
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  icon?: LucideIcon;
  variant?: string;
}) {
  const tooltip =
    props.title ??
    props["aria-label"] ??
    (typeof children === "string" ? children : undefined);
  const isTableAction = className.split(/\s+/).includes("table-action");
  const link = (
    <ControlLink
      {...props}
      title={isTableAction ? undefined : props.title}
      className={"btn " + variant + " " + className}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </ControlLink>
  );
  return isTableAction && tooltip ? (
    <ActionTooltip content={tooltip}>{link}</ActionTooltip>
  ) : (
    link
  );
}
export function Empty({
  title = "Sin resultados",
  description = "Prueba con otros filtros o agrega un registro.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <PackageSearch size={32} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="empty" role="status">
      <LoaderCircle className="spin" aria-hidden="true" />
      <p>Cargando información…</p>
    </div>
  );
}

export function Field({
  label,
  children,
  error: suppliedError,
  hint,
  tooltip,
  id,
  required,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
  tooltip?: string;
  id: string;
  required?: boolean;
}) {
  const scope = useContext(FieldScope),
    actualId = scope + id;
  const { fields } = useContext(FormErrorsContext);
  const error = suppliedError ?? fields[id.replace(/^field-/, "")];
  const attributes = {
    id: actualId,
    name: id.replace(/^field-/, ""),
    "data-field-path": id.replace(/^field-/, ""),
    "aria-label": label,
    "aria-invalid": error ? true : undefined,
    "aria-describedby":
      [hint ? `${actualId}-hint` : "", error ? `${actualId}-error` : ""]
        .filter(Boolean)
        .join(" ") || undefined,
  };
  let assigned = false;
  function prepare(node: ReactNode): ReactNode {
    if (!isValidElement(node)) return node;
    if (node.type === Fragment)
      return cloneElement(node as ReactElement<{ children?: ReactNode }>, {
        children: Children.map(
          (node.props as { children?: ReactNode }).children,
          prepare,
        ),
      });
    const props = (node as ReactElement<Record<string, unknown>>).props;
    if (
      typeof node.type === "string" &&
      !["input", "select", "textarea"].includes(node.type)
    )
      return node;
    if (assigned || node.type === Button || node.type === LinkButton)
      return node;
    assigned = true;
    return cloneElement(node as ReactElement<Record<string, unknown>>, {
      ...attributes,
      "aria-label": props["aria-label"] ?? label,
      required: required ?? props.required,
      autoComplete: props.autoComplete ?? "off",
      spellCheck: /correo|codigo/.test(id) ? false : props.spellCheck,
      ...(node.type === DateInput ? { calendarLabel: label } : {}),
    });
  }
  const control = Children.map(children, prepare);
  const body = (
    <>
      <div className="field-label-row">
        <ControlLabel htmlFor={actualId}>
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </ControlLabel>
        {tooltip && <TooltipHelp label={label} content={tooltip} />}
      </div>
      {control}
      {hint && <small id={`${actualId}-hint`}>{hint}</small>}
      {error && <ControlError id={actualId + "-error"} message={error} />}
    </>
  );
  const className = `field ${error ? "invalid" : ""}`;
  return <div className={className}>{body}</div>;
}
type PickerProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "value" | "defaultValue" | "onChange" | "type"
> & {
  value: string;
  onChange: (id: string) => void;
  "data-field-path"?: string;
};

function ReferencePicker({
  options,
  value,
  onChange,
  commitOnSelection = false,
  onBlur,
  ...inputProps
}: PickerProps & { options: Choice[]; commitOnSelection?: boolean }) {
  const selected = options.find((option) => option.id === value);
  const [query, setQuery] = useState(selected?.label ?? "");
  useEffect(() => {
    if (selected || commitOnSelection) setQuery(selected?.label ?? "");
  }, [value, selected?.label, commitOnSelection]);
  return (
    <ChoiceCombo
      options={options}
      value={commitOnSelection && query !== selected?.label ? "" : value}
      inputValue={query}
      onInputChange={(next) => {
        setQuery(next);
        if (!commitOnSelection && next !== selected?.label) onChange("");
      }}
      onSelectionChange={(id) => {
        if (id) {
          onChange(id);
          setQuery(
            commitOnSelection
              ? (selected?.label ?? "")
              : (options.find((option) => option.id === id)?.label ?? ""),
          );
        }
      }}
      inputProps={{
        ...inputProps,
        onBlur: (event) => {
          if (commitOnSelection) setQuery(selected?.label ?? "");
          onBlur?.(event);
        },
      }}
    />
  );
}

export function ProviderPicker({
  providers,
  sections,
  placeholder = "Buscar proveedor…",
  ...props
}: PickerProps & {
  providers: Database["proveedor"];
  sections?: Record<string, string>;
  commitOnSelection?: boolean;
}) {
  const { db } = useApp();
  const options = useMemo(
    () =>
      providers.map((provider) => ({
        id: provider.id,
        label: supplierOptionLabel(provider, db.proveedor),
        section: sections?.[provider.id],
      })),
    [providers, sections, db.proveedor],
  );
  return (
    <ReferencePicker {...props} options={options} placeholder={placeholder} />
  );
}

export function MaterialPicker({
  materials,
  placeholder = "Buscar material…",
  ...props
}: PickerProps & { materials: Database["materiales"] }) {
  const { db } = useApp();
  const options = useMemo(
    () =>
      materials.map((material) => ({
        id: material.id,
        label: recordName(db, "materiales", material),
      })),
    [materials, db],
  );
  return (
    <ReferencePicker {...props} options={options} placeholder={placeholder} />
  );
}

export function ProductPicker({
  products,
  value,
  onChange,
  disabled = false,
  placeholder = "Buscar producto…",
  ...inputProps
}: PickerProps & { products: readonly Row[] }) {
  const { db } = useApp();
  const options = useMemo(() => {
    const names = new Map<string, number>();
    const providers = new Map(
      db.proveedor.map((provider) => [provider.id, provider.nombre_corto]),
    );
    for (const product of products)
      names.set(
        product.nombre_producto,
        (names.get(product.nombre_producto) ?? 0) + 1,
      );
    return products.map((product) => ({
      id: String(product.id),
      label: String(product.nombre_producto),
      description:
        (names.get(product.nombre_producto) ?? 0) > 1
          ? (providers.get(product.id_maquilador) ?? "Producto") +
            " · " +
            String(product.id).slice(-6)
          : undefined,
    }));
  }, [products, db.proveedor]);
  return (
    <ReferencePicker
      options={options}
      value={value}
      onChange={onChange}
      {...inputProps}
      disabled={disabled}
      placeholder={placeholder}
    />
  );
}
export function useErrors(validation?: LiveValidation) {
  const latestValidation = useRef(validation);
  latestValidation.current = validation;
  const [state, setState] = useState<{
    error: ApiError | null;
    failedValues: string;
  }>({
    error: null,
    failedValues: "",
  });
  const setError = useCallback((next: SetStateAction<ApiError | null>) => {
    setState((previous) => ({
      error: typeof next === "function" ? next(previous.error) : next,
      failedValues: validationSignature(latestValidation.current?.values ?? {}),
    }));
  }, []);
  const catchError = useCallback(
    (error: unknown) => {
      setError(
        error instanceof ApiError
          ? error
          : new ApiError({ message: (error as Error).message }),
      );
    },
    [setError],
  );
  useEffect(() => {
    if (
      !validation ||
      !state.error ||
      !Object.keys(state.error.fields).length ||
      validationSignature(validation.values) === state.failedValues
    )
      return;
    const fields = remainingFieldErrors(state.error.fields, validation);
    if (Object.keys(fields).length === Object.keys(state.error.fields).length)
      return;
    const error = Object.keys(fields).length
      ? new ApiError({
          message: state.error.message,
          code: state.error.code,
          details: state.error.details,
          fields,
        })
      : null;
    if (error) error.focusKey = state.error.focusKey;
    setState((current) => (current === state ? { ...state, error } : current));
  }, [state, validation]);
  return {
    error: state.error,
    setError,
    catchError,
  };
}
export function ErrorNotice({
  error,
  id,
}: {
  error: ApiError | null;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scope = useContext(FieldScope);
  const validation = useContext(FormErrorsContext);
  const fields = { ...validation.constraints, ...error?.fields };
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error?.focusKey]);
  useEffect(() => {
    if (validation.focusKey && Object.keys(validation.constraints).length)
      ref.current?.focus();
  }, [validation.focusKey]);
  return error || Object.keys(fields).length ? (
    <div id={id} className="error-notice" role="alert" tabIndex={-1} ref={ref}>
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <strong>{error?.message ?? "Revisa los campos indicados."}</strong>
        {Object.keys(fields).length > 0 && (
          <ul>
            {Object.entries(fields).map(([field, msg]) => (
              <li key={field}>
                <ControlLink
                  id={`${validation.id ?? scope}summary-${field}-error`}
                  href={`#field-${field}`}
                  onClick={(e) => {
                    e.preventDefault();
                    const form =
                      ref.current?.closest("form") ??
                      ref.current?.parentElement;
                    const target =
                      form?.querySelector<HTMLElement>(
                        `[data-field-path="${CSS.escape(field)}"]`,
                      ) ??
                      form?.querySelector<HTMLElement>(
                        `[data-field-path$=".${CSS.escape(field)}"]`,
                      ) ??
                      form?.querySelector<HTMLElement>(
                        `[data-field-path^="${CSS.escape(field)}."]`,
                      ) ??
                      form?.querySelector<HTMLElement>(
                        `[id="${CSS.escape(field)}"],[name="${CSS.escape(field)}"]`,
                      );
                    if (target) {
                      e.preventDefault();
                      target.focus();
                    }
                  }}
                >
                  {msg}
                </ControlLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  ) : null;
}

export function ConfirmationDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  busy = false,
  destructive = false,
  error,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  busy?: boolean;
  destructive?: boolean;
  error?: string;
}) {
  return (
    <Dialog title={title} onClose={() => !busy && onClose()}>
      <div className="dialog-body">
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {children}
      </div>
      <div className="dialog-footer">
        <CancelButton type="button" autoFocus disabled={busy} onClick={onClose}>
          Cancelar
        </CancelButton>
        <Button
          type="button"
          variant="danger"
          className={destructive ? "destructive-confirm" : ""}
          disabled={busy}
          onClick={() => void onConfirm()}
        >
          {busy ? "Guardando…" : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
type TabOptions = {
  items: { id: string; label: string; count?: number }[];
  value: string;
  onChange?: (id: string) => void;
  label?: string;
  className?: string;
  children?: ReactNode;
};
export function TabGroup({
  value,
  onChange,
  children,
  className = "aria-tab-group",
  orientation = "horizontal",
}: {
  value: string;
  onChange: (id: string) => void;
  children: ReactNode;
  className?: string;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <AriaTabs
      className={className}
      selectedKey={value}
      onSelectionChange={(key) => onChange(String(key))}
      orientation={orientation}
    >
      {children}
    </AriaTabs>
  );
}
export function TabHeader({
  items,
  value,
  label = "Vistas de órdenes",
  className = "tabs",
}: TabOptions) {
  return (
    <TabList className={className} aria-label={label}>
      {items.map((item) => (
        <Tab
          id={item.id}
          key={item.id}
          className={
            value === item.id
              ? className === "catalog-tabs"
                ? "active"
                : "selected"
              : ""
          }
        >
          {item.label}
          {item.count !== undefined && (
            <>
              {" "}
              <span>{item.count}</span>
            </>
          )}
        </Tab>
      ))}
    </TabList>
  );
}
export function TabContent({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <TabPanel id={id} className="aria-tab-panel">
      {children}
    </TabPanel>
  );
}
export function Tabs({ children, onChange = () => {}, ...props }: TabOptions) {
  return (
    <TabGroup value={props.value} onChange={onChange}>
      <TabHeader {...props} />
      <TabContent id={props.value}>{children}</TabContent>
    </TabGroup>
  );
}
export function RowLink({
  href,
  label = "Ver detalle",
}: {
  href: string;
  label?: string;
}) {
  return (
    <LinkButton
      className="icon-btn table-action"
      aria-label={label}
      icon={ChevronRight}
      href={href}
    />
  );
}

export {
  confirmAction,
  ConfirmationProvider,
  Dialog,
} from "./components/overlays";
export { DateInput };
