import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Filter, Search, X } from "lucide-react";
import { Button, DateInput } from "./ui";
import {
  columnOperators,
  filterProblem,
  hasFilter,
  needsValue,
  type Column,
  type ColumnFilter,
  type ColumnSort,
  type ColumnValue,
  type Operator,
} from "./order-table";

type HeaderProps<Key extends string> = {
  column: Column<Key>;
  filter?: ColumnFilter;
  sort?: ColumnSort<Key>;
  options: ColumnValue[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onFilter: (filter?: ColumnFilter) => void;
  onSort: (sort?: ColumnSort<Key>) => void;
};

export function ColumnHeader<Key extends string>(props: HeaderProps<Key>) {
  const { column, filter, sort, options, open, onOpen, onClose } = props;
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const sorted = !column.selectionOnly && sort?.column === column.key;
  const filtered = hasFilter(filter);
  const menuLabel = `${column.selectionOnly ? "Filtrar" : "Filtrar y ordenar"} ${column.label}`;
  const close = (restoreFocus = true) => {
    onClose();
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    const panel = popup.current,
      button = trigger.current;
    if (!panel || !button || !open) return;
    panel.showPopover();
    const position = () => {
      const anchor = button.getBoundingClientRect();
      if (
        anchor.bottom < 0 ||
        anchor.top > window.innerHeight ||
        anchor.right < 0 ||
        anchor.left > window.innerWidth
      ) {
        onClose();
        return;
      }
      panel.style.width = `${Math.min(320, window.innerWidth - 16)}px`;
      panel.style.setProperty(
        "--column-menu-height",
        `${Math.min(400, Math.floor(window.innerHeight * 0.6))}px`,
      );
      const height = panel.getBoundingClientRect().height;
      const below = window.innerHeight - anchor.bottom - 8;
      const top =
        below >= height || below >= anchor.top - 8
          ? anchor.bottom + 6
          : anchor.top - height - 6;
      panel.style.left = `${Math.max(8, Math.min(anchor.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 8))}px`;
      panel.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
    };
    position();
    panel
      .querySelector<HTMLElement>("[data-initial-focus]")
      ?.focus({ preventScroll: true });
    let pointerStartedInside = false;
    const finishPointer = () => {
      pointerStartedInside = false;
    };
    const outside = (event: PointerEvent) => {
      pointerStartedInside =
        event.target instanceof Node &&
        (panel.contains(event.target) || button.contains(event.target));
      if (event.target instanceof Node && !pointerStartedInside) onClose();
    };
    const focusOutside = (event: FocusEvent) => {
      // Label activation briefly focuses the surrounding main before its checkbox.
      // Wait for the inside pointer gesture to finish before treating focus as an exit.
      if (
        !pointerStartedInside &&
        event.target instanceof Node &&
        !panel.contains(event.target) &&
        !button.contains(event.target)
      )
        onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
      button.focus({ preventScroll: true });
    };
    const scrolled = (event: Event) => {
      if (!(event.target instanceof Node && panel.contains(event.target)))
        position();
    };
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", scrolled, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("pointerup", finishPointer, true);
    document.addEventListener("pointercancel", finishPointer, true);
    document.addEventListener("focusin", focusOutside);
    document.addEventListener("keydown", escape, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", scrolled, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("pointerup", finishPointer, true);
      document.removeEventListener("pointercancel", finishPointer, true);
      document.removeEventListener("focusin", focusOutside);
      document.removeEventListener("keydown", escape, true);
      if (panel.matches(":popover-open")) panel.hidePopover();
    };
  }, [open]);
  return (
    <th
      scope="col"
      aria-sort={
        sorted
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
      className={column.key === "total" ? "right" : undefined}
    >
      <div className="column-heading">
        <span>{column.label}</span>
        {sorted &&
          (sort.direction === "asc" ? (
            <ArrowUp size={13} aria-hidden="true" />
          ) : (
            <ArrowDown size={13} aria-hidden="true" />
          ))}
        <button
          ref={trigger}
          type="button"
          className={`column-filter-button ${filtered || sorted ? "active" : ""}`}
          aria-label={menuLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={`${id}-filter`}
          title={menuLabel}
          onClick={() => (open ? close() : onOpen())}
        >
          <Filter
            size={15}
            aria-hidden="true"
            fill={filtered ? "currentColor" : "none"}
          />
          {filtered && <span className="visually-hidden">Filtro aplicado</span>}
        </button>
      </div>
      <div
        ref={popup}
        id={`${id}-filter`}
        popover="manual"
        role="dialog"
        aria-label={menuLabel}
        className="column-filter-panel"
      >
        {open && (
          <FilterPanel
            column={column}
            filter={filter}
            sort={sort}
            options={options}
            onClose={close}
            onFilter={props.onFilter}
            onSort={props.onSort}
          />
        )}
      </div>
    </th>
  );
}

function FilterPanel<Key extends string>({
  column,
  filter,
  sort,
  options,
  onClose,
  onFilter,
  onSort,
}: {
  column: Column<Key>;
  filter?: ColumnFilter;
  sort?: ColumnSort<Key>;
  options: ColumnValue[];
  onClose: (restoreFocus?: boolean) => void;
  onFilter: (filter?: ColumnFilter) => void;
  onSort: (sort?: ColumnSort<Key>) => void;
}) {
  const id = useId();
  const [selected, setSelected] = useState(
    () => new Set(filter?.selected ?? options.map((v) => v.key)),
  );
  const [operator, setOperator] = useState<Operator | "">(
    filter?.operator ?? "",
  );
  const [value, setValue] = useState(filter?.value ?? "");
  const [end, setEnd] = useState(filter?.end ?? "");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (
      error &&
      !filterProblem(column, operator ? { operator, value, end } : {})
    )
      setError("");
  }, [column, error, operator, value, end]);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const allRef = useRef<HTMLInputElement>(null);
  const allChecked =
    options.length > 0 && options.every((v) => selected.has(v.key));
  const someChecked = options.some((v) => selected.has(v.key));
  useLayoutEffect(() => {
    if (allRef.current)
      allRef.current.indeterminate = someChecked && !allChecked;
  }, [someChecked, allChecked]);
  const shown = options.filter((v) =>
    v.label
      .toLocaleLowerCase("es-CO")
      .includes(search.toLocaleLowerCase("es-CO")),
  );
  const labels =
    column.kind === "date"
      ? ["De más antigua a más reciente", "De más reciente a más antigua"]
      : column.kind === "integer" || column.kind === "decimal"
        ? ["De menor a mayor", "De mayor a menor"]
        : ["De A a Z", "De Z a A"];
  const conditionInput = (
    inputId: string,
    label: string,
    current: string,
    change: (value: string) => void,
  ) => (
    <div className="column-filter-field">
      <label htmlFor={inputId}>{label}</label>
      {column.kind === "date" ? (
        <DateInput
          id={inputId}
          calendarLabel={label}
          className="control"
          value={current}
          onChange={change}
          required
          aria-describedby={error ? `${id}-error` : undefined}
        />
      ) : column.kind === "enum" ? (
        <select
          id={inputId}
          className="control"
          value={current}
          onChange={(event) => change(event.target.value)}
          required
        >
          <option value="">Seleccionar…</option>
          {options.map((v) => (
            <option key={v.key} value={v.value ?? ""}>
              {v.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={inputId}
          className="control"
          type="text"
          autoComplete="off"
          value={current}
          inputMode={
            column.kind === "decimal"
              ? "decimal"
              : column.kind === "integer"
                ? "numeric"
                : "text"
          }
          placeholder={
            column.kind === "integer"
              ? "Ej. 2800"
              : column.kind === "decimal"
                ? "Ej. 25000000,00"
                : "Escribir valor…"
          }
          onChange={(event) => change(event.target.value)}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      )}
    </div>
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const draft: ColumnFilter = {
          ...(!allChecked && options.length ? { selected: [...selected] } : {}),
          ...(operator
            ? {
                operator,
                ...(needsValue(operator)
                  ? { value, ...(operator === "between" ? { end } : {}) }
                  : {}),
              }
            : {}),
        };
        const problem = filterProblem(column, draft);
        if (problem) {
          setError(problem);
          requestAnimationFrame(() => errorRef.current?.focus());
          return;
        }
        onFilter(hasFilter(draft) ? draft : undefined);
        onClose();
      }}
    >
      <div className="column-filter-title">
        <h3>{column.label}</h3>
        <button
          type="button"
          className="column-filter-button"
          aria-label={`Cerrar filtros de ${column.label}`}
          onClick={() => onClose()}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="column-filter-content">
        {!column.selectionOnly && (
          <div className="column-sort-actions" aria-label="Ordenamiento">
            {(["asc", "desc"] as const).map((direction, index) => (
              <button
                key={direction}
                type="button"
                data-initial-focus={index === 0 ? "true" : undefined}
                aria-pressed={
                  sort?.column === column.key && sort.direction === direction
                }
                onClick={() => {
                  onSort({ column: column.key, direction });
                  onClose();
                }}
              >
                {index === 0 ? (
                  <ArrowUp size={16} aria-hidden="true" />
                ) : (
                  <ArrowDown size={16} aria-hidden="true" />
                )}
                {labels[index]}
              </button>
            ))}
            {sort?.column === column.key && (
              <button
                type="button"
                onClick={() => {
                  onSort();
                  onClose();
                }}
              >
                Quitar ordenamiento
              </button>
            )}
          </div>
        )}
        <div className="column-filter-body">
          {!column.selectionOnly && (
            <div className="column-filter-field">
              <label htmlFor={`${id}-condition`}>Condición</label>
              <select
                id={`${id}-condition`}
                className="control"
                value={operator}
                onChange={(event) => {
                  setOperator(event.target.value as Operator | "");
                }}
              >
                <option value="">Sin condición</option>
                {columnOperators(column.kind).map(([op, label]) => (
                  <option key={op} value={op}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {operator && needsValue(operator) && (
            <div className="column-condition-values">
              {conditionInput(
                `${id}-value`,
                operator === "between" ? "Desde" : "Valor del filtro",
                value,
                (v) => {
                  setValue(v);
                },
              )}
              {operator === "between" &&
                conditionInput(`${id}-end`, "Hasta", end, (v) => {
                  setEnd(v);
                })}
            </div>
          )}
          {error && (
            <p
              id={`${id}-error`}
              className="field-error"
              role="alert"
              tabIndex={-1}
              ref={errorRef}
            >
              {error}
            </p>
          )}
          <fieldset className="column-value-set">
            <legend>Valores</legend>
            {!column.selectionOnly && (
              <div className="column-value-search">
                <Search size={14} aria-hidden="true" />
                <input
                  className="control"
                  type="search"
                  aria-label="Buscar valores"
                  placeholder="Buscar valores…"
                  autoComplete="off"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            )}
            {!column.selectionOnly && (
              <label className="column-value-option column-select-all">
                <input
                  ref={allRef}
                  type="checkbox"
                  checked={allChecked}
                  disabled={!options.length}
                  onChange={() =>
                    setSelected(
                      allChecked
                        ? new Set()
                        : new Set(options.map((v) => v.key)),
                    )
                  }
                />
                Seleccionar todos
              </label>
            )}
            <div className="column-value-list">
              {shown.map((item, index) => (
                <label key={item.key} className="column-value-option">
                  <input
                    type="checkbox"
                    data-initial-focus={
                      column.selectionOnly && index === 0 ? "true" : undefined
                    }
                    checked={selected.has(item.key)}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.target.checked) next.add(item.key);
                      else next.delete(item.key);
                      setSelected(next);
                    }}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
              {!shown.length && (
                <p className="column-values-empty">
                  No hay valores coincidentes.
                </p>
              )}
            </div>
          </fieldset>
        </div>
      </div>
      <div className="column-filter-footer">
        <Button
          variant="link"
          disabled={!hasFilter(filter)}
          onClick={() => {
            onFilter();
            onClose();
          }}
        >
          Quitar filtro
        </Button>
        <div>
          <Button onClick={() => onClose()}>Cancelar</Button>
          <Button type="submit" variant="primary">
            Aplicar
          </Button>
        </div>
      </div>
    </form>
  );
}
