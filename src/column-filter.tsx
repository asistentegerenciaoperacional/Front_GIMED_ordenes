import { ArrowDown, ArrowUp, Filter, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Group } from "react-aria-components/Group";
import { Popover } from "react-aria-components/Popover";
import {
  Action,
  CheckChoice,
  ChoiceGroup,
  ControlForm,
  ControlInput,
  ControlLabel,
  ControlSelect,
} from "./components/controls";
import { TableColumn } from "./components/data-table";
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
import { ApiError, Button, CancelButton, DateInput, ErrorNotice } from "./ui";

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

export function ColumnHeader<Key extends string>(
  props: HeaderProps<Key> & { asContent?: boolean },
) {
  const { column, filter, sort, open, onOpen, onClose } = props;
  const trigger = useRef<HTMLButtonElement>(null);
  const currentOpen = useRef(open);
  const scrolling = useRef(false);
  currentOpen.current = open;
  const sorted = !column.selectionOnly && sort?.column === column.key;
  const filtered = hasFilter(filter);
  const menuLabel =
    (column.selectionOnly ? "Filtrar " : "Filtrar y ordenar ") + column.label;
  useEffect(() => {
    let scrollTimer: number | undefined;
    const onScroll = () => {
      if (!currentOpen.current) return;
      scrolling.current = true;
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        scrolling.current = false;
      }, 0);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.clearTimeout(scrollTimer);
    };
  }, []);
  const content = (
    <>
      <div className="column-heading">
        <span>{column.label}</span>
        {sorted &&
          (sort.direction === "asc" ? (
            <ArrowUp size={13} aria-hidden="true" />
          ) : (
            <ArrowDown size={13} aria-hidden="true" />
          ))}
        <Action
          ref={trigger}
          className={
            "column-filter-button " + (filtered || sorted ? "active" : "")
          }
          aria-label={menuLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? onClose() : onOpen())}
        >
          <Filter
            size={15}
            aria-hidden="true"
            fill={filtered ? "currentColor" : "none"}
          />
          {filtered && <span className="visually-hidden">Filtro aplicado</span>}
        </Action>
      </div>
      {open && (
        <Popover
          isNonModal
          triggerRef={trigger}
          isOpen={open}
          onOpenChange={(next) => {
            if (next) onOpen();
            else if (!scrolling.current) onClose();
          }}
          placement="bottom end"
          offset={6}
          containerPadding={8}
          maxHeight={Math.min(400, window.innerHeight * 0.6)}
          className="column-filter-panel"
        >
          <Group aria-label={menuLabel} className="column-filter-dialog">
            <FilterPanel
              column={column}
              filter={filter}
              sort={sort}
              options={props.options}
              onClose={onClose}
              onFilter={props.onFilter}
              onSort={props.onSort}
            />
          </Group>
        </Popover>
      )}
    </>
  );
  return props.asContent ? (
    content
  ) : (
    <TableColumn className={column.key === "total" ? "right" : undefined}>
      {content}
    </TableColumn>
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
  const [valuePage, setValuePage] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (
      error &&
      !filterProblem(column, operator ? { operator, value, end } : {})
    )
      setError("");
  }, [column, error, operator, value, end]);
  const notice = useMemo(
    () => (error ? new ApiError({ message: error }) : null),
    [error],
  );

  const allChecked =
    options.length > 0 && options.every((v) => selected.has(v.key));
  const someChecked = options.some((v) => selected.has(v.key));

  const shown = useMemo(() => {
    const query = search.toLocaleLowerCase("es-CO");
    return query
      ? options.filter((v) =>
          v.label.toLocaleLowerCase("es-CO").includes(query),
        )
      : options;
  }, [options, search]);
  const pageSize = 50,
    page = Math.min(
      valuePage,
      Math.max(0, Math.ceil(shown.length / pageSize) - 1),
    );
  const visibleValues = shown.slice(page * pageSize, (page + 1) * pageSize);
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
      <ControlLabel htmlFor={inputId}>{label}</ControlLabel>
      {column.kind === "date" ? (
        <DateInput
          id={inputId}
          calendarLabel={label}
          className="control"
          value={current}
          onChange={change}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      ) : column.kind === "enum" ? (
        <ControlSelect
          id={inputId}
          className="control"
          value={current}
          onChange={(event) => change(event.target.value)}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        >
          <option value="">Seleccionar…</option>
          {options.map((v) => (
            <option key={v.key} value={v.value ?? ""}>
              {v.label}
            </option>
          ))}
        </ControlSelect>
      ) : (
        <ControlInput
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
    <ControlForm
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
          return;
        }
        onFilter(hasFilter(draft) ? draft : undefined);
        onClose();
      }}
    >
      <div className="column-filter-title">
        <h3>{column.label}</h3>
        <Action
          type="button"
          className="column-filter-button"
          aria-label={`Cerrar filtros de ${column.label}`}
          onClick={() => onClose()}
        >
          <X size={16} aria-hidden="true" />
        </Action>
      </div>
      <div className="column-filter-content">
        <ErrorNotice id={`${id}-error`} error={notice} />
        {!column.selectionOnly && (
          <div className="column-sort-actions" aria-label="Ordenamiento">
            {(["asc", "desc"] as const).map((direction, index) => (
              <Action
                key={direction}
                type="button"
                autoFocus={index === 0}
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
              </Action>
            ))}
            {sort?.column === column.key && (
              <Action
                type="button"
                onClick={() => {
                  onSort();
                  onClose();
                }}
              >
                Quitar ordenamiento
              </Action>
            )}
          </div>
        )}
        <div className="column-filter-body">
          {!column.selectionOnly && (
            <div className="column-filter-field">
              <ControlLabel htmlFor={`${id}-condition`}>Condición</ControlLabel>
              <ControlSelect
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
              </ControlSelect>
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
          <fieldset className="column-value-set">
            <legend>Valores</legend>
            {!column.selectionOnly && (
              <div className="column-value-search">
                <Search size={14} aria-hidden="true" />
                <ControlInput
                  className="control"
                  type="search"
                  aria-label="Buscar valores"
                  placeholder="Buscar valores…"
                  autoComplete="off"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setValuePage(0);
                  }}
                />
              </div>
            )}
            {!column.selectionOnly && (
              <CheckChoice
                className="column-value-option column-select-all"

                checked={allChecked}
                disabled={!options.length}
                onChange={() =>
                  setSelected(
                    allChecked ? new Set() : new Set(options.map((v) => v.key)),
                  )
                }
                indeterminate={someChecked && !allChecked}
              >
                Seleccionar todos
              </CheckChoice>
            )}
            <ChoiceGroup
              className="column-value-list"
              value={[...selected]}
              aria-label="Valores de la columna"
              onChange={(next) => setSelected(new Set(next))}
            >
              {visibleValues.map((item, index) => (
                <CheckChoice
                  key={item.key}
                  className="column-value-option"
                  autoFocus={column.selectionOnly && index === 0}

                  data-initial-focus={
                    column.selectionOnly && index === 0 ? "true" : undefined
                  }

                  value={item.key}
                >
                  <span>{item.label}</span>
                </CheckChoice>
              ))}
              {!shown.length && (
                <p className="column-values-empty">
                  No hay valores coincidentes.
                </p>
              )}
            </ChoiceGroup>
            {shown.length > pageSize && (
              <div
                className="inline column-value-pagination"
                aria-label="Páginas de valores"
              >
                <Button
                  className="small"
                  disabled={page === 0}
                  onClick={() => setValuePage(page - 1)}
                  aria-label="Valores anteriores"
                >
                  Anterior
                </Button>
                <span role="status">
                  {page * pageSize + 1}–
                  {Math.min((page + 1) * pageSize, shown.length)} de{" "}
                  {shown.length}
                </span>
                <Button
                  className="small"
                  disabled={(page + 1) * pageSize >= shown.length}
                  onClick={() => setValuePage(page + 1)}
                  aria-label="Siguientes valores"
                >
                  Siguiente
                </Button>
              </div>
            )}
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
          <CancelButton onClick={() => onClose()}>Cancelar</CancelButton>
          <Button type="submit" variant="primary">
            Aplicar
          </Button>
        </div>
      </div>
    </ControlForm>
  );
}
