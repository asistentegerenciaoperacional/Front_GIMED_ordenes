import {
  ChevronDown,
  ClipboardPaste,
  Copy,
  FilterX,
  Save,
  X,
} from "lucide-react";
import {
  Dialog as AriaDialog,
  DialogTrigger,
} from "react-aria-components/Dialog";
import { Popover } from "react-aria-components/Popover";
import { ActionTooltip } from "./overlays";
import { CheckChoice, ControlInput, CustomFilterSelect } from "./controls";
import { Button, CancelButton, Dialog } from "../ui";
import {
  customFilters,
  type CustomFilterId,
  type OrderGroup,
} from "../order-filters";
import type { SheetView } from "../order-sheet-editing";
import type { ComponentProps, ReactNode } from "react";
import { useRef } from "react";

export function SheetTool({
  label,
  tooltip = label,
  ...props
}: ComponentProps<typeof Button> & { label: string; tooltip?: string }) {
  return (
    <ActionTooltip content={tooltip}>
      <span className="product-sheet-tooltip-anchor">
        <Button {...props} aria-label={label} />
      </span>
    </ActionTooltip>
  );
}

export function SheetClipboardTools({
  disabled,
  onCopy,
  onPaste,
  notify,
}: {
  disabled: boolean;
  onCopy: () => void;
  onPaste: (text: string) => void;
  notify: (message: string, error?: boolean) => void;
}) {
  return (
    <>
      <SheetTool
        icon={Copy}
        label="Copiar rango"
        tooltip="Copiar (Ctrl+C)"
        disabled={disabled}
        onClick={onCopy}
      />
      <SheetTool
        icon={ClipboardPaste}
        label="Pegar rango"
        tooltip="Pegar (Ctrl+V)"
        disabled={disabled}
        onClick={() => {
          if (!navigator.clipboard?.readText) {
            notify("Usa Ctrl+V sobre la hoja para pegar.", true);
            return;
          }
          void navigator.clipboard
            .readText()
            .then(onPaste)
            .catch(() => notify("Usa Ctrl+V sobre la hoja para pegar.", true));
        }}
      />
    </>
  );
}

const tabs: [SheetView, string][] = [
  ["no_autorizadas", "No autorizadas"],
  ["seguimiento", "En seguimiento"],
  ["anuladas", "Anuladas"],
];
export function SheetViewTabs({
  view,
  onChange,
}: {
  view: SheetView;
  onChange: (view: SheetView) => void;
}) {
  return (
    <div className="product-sheet-tabs" aria-label="Hojas de OC">
      {tabs.map(([value, label]) => (
        <Button
          key={value}
          aria-pressed={value === view}
          variant={value === view ? "primary" : "ghost"}
          onClick={() => onChange(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

export function SheetFilterTools({
  group,
  filter,
  query,
  clearable,
  onFilter,
  onSearch,
  onClear,
  children,
}: {
  group: OrderGroup;
  filter: CustomFilterId | "";
  query: string;
  clearable: boolean;
  onFilter: (filter: string) => void;
  onSearch: (query: string) => void;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <CustomFilterSelect
        style={{ width: 200, flex: "0 0 200px" }}
        aria-label="Filtro personalizado de la hoja"
        value={filter}
        onChange={(event) => onFilter(event.target.value)}
      >
        <option value="">Sin filtro personalizado</option>
        {customFilters
          .filter((item) => group === "productos" || !item.productOnly)
          .map((item) => (
            <optgroup
              key={item.id}
              label={
                group === "materiales" && item.id === "vinculos"
                  ? "OC vinculadas"
                  : item.name
              }
            >
              {item.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {group === "materiales" && item.id === "vinculos"
                    ? option.id === "vinculos_con"
                      ? "Con OC vinculadas"
                      : "Sin OC vinculadas"
                    : option.label}
                </option>
              ))}
            </optgroup>
          ))}
      </CustomFilterSelect>
      {clearable && (
        <SheetTool icon={FilterX} label="Limpiar filtros" onClick={onClear} />
      )}
      {children}
      <ControlInput
        className="control product-sheet-search"
        aria-label="Buscar en la hoja de OC"
        type="search"
        value={query}
        placeholder="Buscar en la hoja…"
        onChange={(event) => onSearch(event.target.value)}
      />
    </>
  );
}

export function SheetColumnsMenu({
  open,
  onOpen,
  columns,
  hidden,
  canHide,
  onHide,
  onChange,
}: {
  open: boolean;
  onOpen: (open: boolean) => void;
  columns: readonly { key: string; label: string }[];
  hidden: string[];
  canHide: boolean;
  onHide: () => void;
  onChange: (hidden: string[]) => void;
}) {
  const dialog = useRef<HTMLElement | null>(null);
  const visible = columns.filter(
    (column) => !hidden.includes(column.key),
  ).length;
  return (
    <DialogTrigger isOpen={open} onOpenChange={onOpen}>
      <Button icon={ChevronDown}>Columnas</Button>
      <Popover
        className="product-sheet-column-popover"
        placement="bottom start"
        offset={4}
      >
        <AriaDialog
          className="product-sheet-column-menu"
          aria-label="Columnas visibles"
          ref={(node) => {
            dialog.current = node;
            if (!node) return;
            const dismiss = (event: KeyboardEvent) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              onOpen(false);
            };
            node.addEventListener("keydown", dismiss, true);
            return () => {
              dialog.current = null;
              node.removeEventListener("keydown", dismiss, true);
            };
          }}
        >
          <div className="product-sheet-column-menu-header column-filter-title">
            <h3>Columnas visibles</h3>
          </div>
          <div className="product-sheet-column-list">
            <Button
              className="product-sheet-hide-columns"
              disabled={!canHide}
              aria-keyshortcuts="Alt+H"
              onClick={onHide}
            >
              Ocultar columnas seleccionadas <span>Alt+H</span>
            </Button>
            <CheckChoice
              className="column-value-option column-select-all"
              aria-keyshortcuts="Alt+S"
              checked={!hidden.length}
              indeterminate={hidden.length > 0}
              disabled={!hidden.length}
              onChange={() => {
                dialog.current?.focus({ preventScroll: true });
                onChange([]);
              }}
            >
              Seleccionar todas (Alt+S)
            </CheckChoice>
            {columns.map((col) => (
              <CheckChoice
                key={col.key}
                className="column-value-option"
                checked={!hidden.includes(col.key)}
                disabled={!hidden.includes(col.key) && visible === 1}
                onChange={(checked) =>
                  onChange(
                    checked
                      ? hidden.filter((key) => key !== col.key)
                      : [...hidden, col.key],
                  )
                }
              >
                {col.label}
              </CheckChoice>
            ))}
          </div>
        </AriaDialog>
      </Popover>
    </DialogTrigger>
  );
}

export function SheetWriteTools({
  count,
  editing,
  busy,
  canDiscard,
  onSave,
  onDiscard,
  children,
}: {
  count: number;
  editing: boolean;
  busy: boolean;
  canDiscard: boolean;
  onSave: () => void;
  onDiscard?: () => void;
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <Button
        icon={Save}
        data-sheet-return-focus
        variant="primary"
        disabled={busy || (!count && !editing)}
        onClick={onSave}
      >
        Guardar{count ? ` ${count} cambios` : ""}
      </Button>
      {onDiscard && (
        <Button
          icon={X}
          disabled={!canDiscard || busy}
          data-sheet-return-focus
          onClick={onDiscard}
        >
          Descartar
        </Button>
      )}
    </>
  );
}

export function SheetPendingDialog({
  onClose,
  onDiscard,
  onSave,
  busy,
}: {
  onClose: () => void;
  onDiscard: () => void;
  onSave: () => void;
  busy: boolean;
}) {
  return (
    <Dialog title="Hay cambios sin guardar" onClose={onClose}>
      <div className="dialog-body">
        <p>Resuelve el borrador antes de continuar con la acción.</p>
      </div>
      <div className="dialog-footer">
        <CancelButton onClick={onClose}>Cancelar</CancelButton>
        <Button disabled={busy} onClick={onDiscard}>
          Descartar y continuar
        </Button>
        <Button variant="primary" disabled={busy} onClick={onSave}>
          Guardar y continuar
        </Button>
      </div>
    </Dialog>
  );
}

export function printOrderFromSheet(
  orderId: string,
  navigate: (path: string) => void,
) {
  const viewport = document.querySelector<HTMLElement>(
    ".product-sheet-viewport",
  );
  navigate(
    `ordenes/${orderId}/imprimir?${new URLSearchParams({
      returnTo: location.pathname + location.search,
      returnScroll: String(Math.round(window.scrollY)),
      returnTableScroll: String(Math.round(viewport?.scrollLeft ?? 0)),
    })}`,
  );
}
