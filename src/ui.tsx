import {
  cloneElement,
  isValidElement,
  Fragment,
  Children,
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
  type ReactElement,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import {
  X,
  AlertCircle,
  PackageSearch,
  LoaderCircle,
  ChevronRight,
  CalendarDays,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";
import type { Database } from "../shared/models";
import {
  words,
  type Row,
  type Entity,
  meta,
  titles,
  orderReference,
} from "../shared/schema";
import { formatDateInput, maskDateInput, parseDateInput } from "./dates";
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
const FieldScope = createContext("");
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
  return (
    <button type="button" {...props} className={`btn ${variant} ${className}`}>
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}
export function Badge({
  value,
  children,
}: {
  value: string;
  children?: ReactNode;
}) {
  return <span className={`badge ${value}`}>{children ?? text(value)}</span>;
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
  return (
    <a {...props} className={`btn ${variant} ${className}`}>
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </a>
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
type DateInputProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "type" | "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  calendarLabel?: string;
};
export function DateInput({
  value,
  onChange,
  calendarLabel = "fecha",
  min,
  max,
  disabled,
  readOnly,
  onBlur,
  ...props
}: DateInputProps) {
  const [draft, setDraft] = useState(() => formatDateInput(value));
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const calendar = useRef<HTMLInputElement>(null);
  const emitted = useRef<string | undefined>(undefined);
  const nextCaret = useRef<number | null>(null);
  useEffect(() => {
    if (value !== emitted.current) setDraft(formatDateInput(value));
  }, [value]);
  useLayoutEffect(() => {
    if (
      nextCaret.current !== null &&
      input.current === document.activeElement
    ) {
      input.current?.setSelectionRange(nextCaret.current, nextCaret.current);
      nextCaret.current = null;
    }
  });
  function change(raw: string, caret: number, deleting = false) {
    const masked = maskDateInput(raw, caret, deleting);
    nextCaret.current = masked.caret;
    // Keep the cursor stable even when masking leaves the controlled value unchanged.
    if (input.current) {
      input.current.value = masked.value;
      input.current.setSelectionRange(masked.caret, masked.caret);
    }
    setDraft(masked.value);
    emitted.current = parseDateInput(masked.value) ?? masked.value;
    onChange(emitted.current);
  }
  const parsed = parseDateInput(draft);
  const problem =
    draft && !parsed
      ? "Escribe una fecha válida en formato dd/mm/aaaa."
      : parsed && min && parsed < String(min)
        ? `La fecha debe ser desde ${formatDateInput(String(min))}.`
        : parsed && max && parsed > String(max)
          ? `La fecha debe ser hasta ${formatDateInput(String(max))}.`
          : "";
  useEffect(() => input.current?.setCustomValidity(problem), [problem]);
  const described =
    [
      props["aria-describedby"],
      touched && problem ? `${props.id}-date-error` : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="date-control">
      <div className="date-input-wrap">
        <input
          {...props}
          ref={input}
          type="text"
          className={`date-input-text ${props.className ?? ""}`}
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          value={draft}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={touched && problem ? true : props["aria-invalid"]}
          aria-describedby={described}
          onChange={(e) => {
            change(
              e.target.value,
              e.target.selectionStart ?? e.target.value.length,
              (e.nativeEvent as InputEvent).inputType?.startsWith("delete"),
            );
          }}
          onKeyDown={(e) => {
            props.onKeyDown?.(e);
            if (e.defaultPrevented || disabled || readOnly) return;
            const control = e.currentTarget;
            const start = control.selectionStart ?? 0;
            if (start !== control.selectionEnd) return;
            if (
              e.key === "/" &&
              (draft[start - 1] === "/" || draft[start] === "/")
            ) {
              e.preventDefault();
              if (draft[start] === "/")
                control.setSelectionRange(start + 1, start + 1);
            } else if (e.key === "Backspace" && draft[start - 1] === "/") {
              e.preventDefault();
              const rest = draft.slice(start);
              change(
                draft.slice(0, start - 2) + (/\d/.test(rest) ? "/" + rest : ""),
                start - 2,
                true,
              );
            } else if (e.key === "Delete" && draft[start] === "/") {
              e.preventDefault();
              change(
                draft.slice(0, start + 1) + draft.slice(start + 2),
                start + 1,
                true,
              );
            }
          }}
          onBlur={(e) => {
            setTouched(true);
            if (parsed) setDraft(formatDateInput(parsed));
            onBlur?.(e);
          }}
          onInvalid={() => setTouched(true)}
        />
        <input
          ref={calendar}
          type="date"
          className="date-calendar-input"
          tabIndex={-1}
          aria-hidden="true"
          value={parsed ?? ""}
          min={min}
          max={max}
          disabled={disabled || readOnly}
          onChange={(e) => {
            setDraft(formatDateInput(e.target.value));
            emitted.current = e.target.value;
            onChange(e.target.value);
            setTouched(true);
            input.current?.focus();
          }}
        />
        <button
          type="button"
          className="date-calendar-button"
          aria-label={`Abrir calendario: ${calendarLabel}`}
          disabled={disabled || readOnly}
          onClick={() => {
            const picker = calendar.current;
            if (!picker) return;
            if (typeof picker.showPicker === "function") picker.showPicker();
            else {
              picker.focus();
              picker.click();
            }
          }}
        >
          <CalendarDays size={17} aria-hidden="true" />
        </button>
      </div>
      {touched && problem && (
        <small className="field-error" id={`${props.id}-date-error`}>
          {problem}
        </small>
      )}
    </div>
  );
}
function TooltipHelp({
  id,
  label,
  content,
}: {
  id: string;
  label: string;
  content: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const hovered = useRef(false);
  const focused = useRef(false);
  const openedFromPointer = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [open, setOpen] = useState(false);
  const show = (fromPointer = false) => {
    clearTimeout(leaveTimer.current);
    openedFromPointer.current ||= fromPointer;
    setOpen(true);
  };
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  useLayoutEffect(() => {
    const tip = tooltip.current;
    const button = trigger.current;
    if (!tip || !button) return;
    if (!open) {
      if (tip.matches(":popover-open")) tip.hidePopover();
      return;
    }
    const position = () => {
      const anchor = button.getBoundingClientRect();
      const dialog = button.closest("dialog");
      const topLimit = Math.max(
        8,
        dialog?.querySelector(".dialog-heading")?.getBoundingClientRect()
          .bottom ?? 0,
      );
      const bottomLimit = Math.min(
        window.innerHeight - 8,
        dialog?.querySelector(".dialog-footer")?.getBoundingClientRect().top ??
          window.innerHeight,
      );
      if (anchor.bottom < topLimit || anchor.top > bottomLimit) {
        if (tip.matches(":popover-open")) tip.hidePopover();
        return;
      }
      if (!tip.matches(":popover-open")) tip.showPopover();
      const size = tip.getBoundingClientRect();
      const left = Math.max(
        8,
        Math.min(anchor.left, window.innerWidth - size.width - 8),
      );
      const below = anchor.bottom + 6;
      const top =
        below + size.height <= bottomLimit
          ? below
          : anchor.top - size.height - 6;
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(topLimit, Math.min(top, bottomLimit - size.height))}px`;
    };
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      openedFromPointer.current = false;
      setOpen(false);
    };
    const dismissOutside = (event: PointerEvent) => {
      if (
        trigger.current?.contains(event.target as Node) ||
        tip.contains(event.target as Node)
      )
        return;
      hovered.current = false;
      focused.current = false;
      openedFromPointer.current = false;
      setOpen(false);
    };
    const dismissPointerAway = (event: PointerEvent) => {
      if (!openedFromPointer.current || event.pointerType === "touch") return;
      const anchor = trigger.current?.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      if (!anchor || !tipRect.width || !tipRect.height) return;
      const margin = 8;
      const left = Math.min(anchor.left, tipRect.left) - margin;
      const right = Math.max(anchor.right, tipRect.right) + margin;
      const top = Math.min(anchor.top, tipRect.top) - margin;
      const bottom = Math.max(anchor.bottom, tipRect.bottom) + margin;
      if (
        event.clientX >= left &&
        event.clientX <= right &&
        event.clientY >= top &&
        event.clientY <= bottom
      )
        return;
      hovered.current = false;
      focused.current = false;
      openedFromPointer.current = false;
      setOpen(false);
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.addEventListener("keydown", dismiss, true);
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("pointermove", dismissPointerAway, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("keydown", dismiss, true);
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("pointermove", dismissPointerAway, true);
    };
  }, [open, content]);
  const cancelLeave = () => clearTimeout(leaveTimer.current);
  const scheduleLeave = () => {
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      if (openedFromPointer.current) return;
      if (!focused.current && !hovered.current) setOpen(false);
    }, 180);
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="field-help"
        aria-label={`Ayuda: ${label}`}
        aria-describedby={id}
        aria-expanded={open}
        aria-controls={id}
        onPointerEnter={(event) => {
          if (event.pointerType === "touch") return;
          hovered.current = true;
          cancelLeave();
          show(true);
        }}
        onPointerLeave={scheduleLeave}
        onFocus={() => {
          focused.current = true;
          show();
        }}
        onBlur={() => {
          focused.current = false;
          if (!hovered.current) setOpen(false);
        }}
        onClick={() => show()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            openedFromPointer.current = false;
            setOpen(false);
          }
        }}
      >
        <CircleHelp size={15} aria-hidden="true" />
      </button>
      <span
        ref={tooltip}
        id={id}
        className="field-tooltip"
        role="tooltip"
        popover="manual"
        onPointerEnter={() => {
          hovered.current = true;
          cancelLeave();
        }}
        onPointerLeave={() => {
          hovered.current = false;
          scheduleLeave();
        }}
      >
        {content}
      </span>
    </>
  );
}
export function Field({
  label,
  children,
  error,
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
  const attributes = {
    id: actualId,
    name: id.replace(/^field-/, ""),
    "data-field-path": id.replace(/^field-/, ""),
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
        <label htmlFor={actualId}>
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
        {tooltip && (
          <TooltipHelp
            id={`${actualId}-tooltip`}
            label={label}
            content={tooltip}
          />
        )}
      </div>
      {control}
      {hint && <small id={`${actualId}-hint`}>{hint}</small>}
      {error && (
        <small className="field-error" id={`${actualId}-error`}>
          {error}
        </small>
      )}
    </>
  );
  const className = `field ${error ? "invalid" : ""}`;
  return <div className={className}>{body}</div>;
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
export function ErrorNotice({ error }: { error: ApiError | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error?.focusKey]);
  return error ? (
    <div className="error-notice" role="alert" tabIndex={-1} ref={ref}>
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <strong>{error.message}</strong>
        {Object.keys(error.fields).length > 0 && (
          <ul>
            {Object.entries(error.fields).map(([field, msg]) => (
              <li key={field}>
                <a
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
                      );
                    if (target) {
                      e.preventDefault();
                      target.focus();
                    }
                  }}
                >
                  {msg}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  ) : null;
}
export function Dialog({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  dirty = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  dirty?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [edited, setEdited] = useState(false);
  const unsaved = dirty || edited;
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  useEffect(() => {
    if (!unsaved) return;
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [unsaved]);
  const close = () => {
    if (
      !unsaved ||
      window.confirm("Hay cambios sin guardar. ¿Cerrar el formulario?")
    )
      onClose();
  };
  return createPortal(
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""}`}
      aria-labelledby={titleId}
      data-dirty={unsaved}
      onInput={(e) => {
        e.stopPropagation();
        if ((e.target as HTMLInputElement).name) setEdited(true);
      }}
      onSubmit={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (
          e.key !== "Tab" ||
          e.defaultPrevented ||
          (e.target as HTMLElement).closest("dialog[open]") !== e.currentTarget
        )
          return;
        const controls = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            "button, input, select, textarea, a[href], summary, [tabindex]",
          ),
        ).filter(
          (control) =>
            control.tabIndex >= 0 &&
            !control.matches(":disabled") &&
            !control.closest("[inert]") &&
            control.getClientRects().length > 0,
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) {
          e.preventDefault();
          e.currentTarget.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
      onSubmitCapture={(e) => {
        const invalid = Array.from(
          (e.target as HTMLFormElement).querySelectorAll<HTMLInputElement>(
            ".date-input-text",
          ),
        ).find(
          // Empty required fields belong to the form's shared error summary.
          (field) => !field.checkValidity() && !field.validity.valueMissing,
        );
        if (invalid) {
          e.preventDefault();
          e.stopPropagation();
          invalid.focus();
          invalid.reportValidity();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="dialog-heading">
        <div>
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <Button
          className="icon-btn"
          aria-label={`Cerrar ${title}`}
          icon={X}
          onClick={close}
        />
      </div>
      <FieldScope.Provider value={`${titleId}-`}>
        {children}
      </FieldScope.Provider>
    </dialog>,
    document.body,
  );
}
export function ConfirmationDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  busy = false,
  error,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  busy?: boolean;
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
        <Button type="button" autoFocus disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="danger"
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
export function Tabs({
  items,
  value,
  onChange,
  label = "Vistas de órdenes",
}: {
  items: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((t, i) => (
        <button
          type="button"
          key={t.id}
          role="tab"
          tabIndex={value === t.id ? 0 : -1}
          aria-selected={value === t.id}
          className={value === t.id ? "selected" : ""}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key))
              return;
            e.preventDefault();
            const index =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? items.length - 1
                  : (i + (e.key === "ArrowRight" ? 1 : -1) + items.length) %
                    items.length;
            const buttons =
              e.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                "button",
              );
            buttons[index].focus();
            onChange(items[index].id);
          }}
        >
          {t.label}
          {t.count !== undefined && <span>{t.count}</span>}
        </button>
      ))}
    </div>
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
      className="icon-btn"
      aria-label={label}
      icon={ChevronRight}
      href={href}
    />
  );
}
