import { parseDateInput } from "./dates";

export type ColumnKey =
  | "orden"
  | "proveedor"
  | "productos"
  | "elaboracion"
  | "entrega"
  | "estado"
  | "total";
export type ColumnKind = "integer" | "decimal" | "text" | "date" | "enum";
export type Column<Key extends string = ColumnKey> = {
  key: Key;
  label: string;
  kind: ColumnKind;
  selectionOnly?: boolean;
  normalizeText?: (value: string) => string;
};
export type Operator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "greater"
  | "greater_equal"
  | "less"
  | "less_equal"
  | "between"
  | "empty"
  | "not_empty";
export type ColumnFilter = {
  selected?: string[];
  operator?: Operator;
  value?: string;
  end?: string;
};
export type ColumnFilters<Key extends string = ColumnKey> = Partial<
  Record<Key, ColumnFilter>
>;
export type ColumnSort<Key extends string = ColumnKey> = {
  column: Key;
  direction: "asc" | "desc";
};
export type TableState<Key extends string = ColumnKey> = {
  filters: ColumnFilters<Key>;
  sort?: ColumnSort<Key>;
};
export type ColumnValue = { key: string; label: string; value: string | null };
export type ColumnCell = {
  values: ColumnValue[];
  sortValue: string | null;
  searchValues?: string[];
};
export type ColumnRow<Key extends string = ColumnKey> = {
  cells: Record<Key, ColumnCell>;
};
export const EMPTY_VALUE = "__sin_valor__";

export const orderColumns: Column[] = [
  { key: "orden", label: "Orden / tipo", kind: "integer" },
  { key: "proveedor", label: "Proveedor", kind: "text" },
  { key: "productos", label: "Productos", kind: "text" },
  { key: "elaboracion", label: "Fecha de elaboración", kind: "date" },
  { key: "entrega", label: "Entrega solicitada", kind: "date" },
  { key: "estado", label: "Estado", kind: "enum" },
  { key: "total", label: "Total", kind: "decimal" },
];

const operators: Record<ColumnKind, [Operator, string][]> = {
  text: [
    ["contains", "Contiene"],
    ["not_contains", "No contiene"],
    ["equals", "Es igual a"],
    ["not_equals", "No es igual a"],
    ["starts_with", "Comienza con"],
    ["ends_with", "Termina con"],
    ["empty", "Está vacío"],
    ["not_empty", "No está vacío"],
  ],
  integer: [
    ["equals", "Es igual a"],
    ["not_equals", "No es igual a"],
    ["greater", "Es mayor que"],
    ["greater_equal", "Es mayor o igual que"],
    ["less", "Es menor que"],
    ["less_equal", "Es menor o igual que"],
    ["between", "Está entre"],
  ],
  decimal: [
    ["equals", "Es igual a"],
    ["not_equals", "No es igual a"],
    ["greater", "Es mayor que"],
    ["greater_equal", "Es mayor o igual que"],
    ["less", "Es menor que"],
    ["less_equal", "Es menor o igual que"],
    ["between", "Está entre"],
  ],
  date: [
    ["equals", "Es igual a"],
    ["not_equals", "No es igual a"],
    ["less", "Es anterior a"],
    ["less_equal", "Es anterior o igual a"],
    ["greater", "Es posterior a"],
    ["greater_equal", "Es posterior o igual a"],
    ["between", "Está entre"],
    ["empty", "Sin fecha"],
    ["not_empty", "Tiene fecha"],
  ],
  enum: [
    ["equals", "Es igual a"],
    ["not_equals", "No es igual a"],
  ],
};
export const columnOperators = (kind: ColumnKind) => operators[kind];
export const hasFilter = (filter: ColumnFilter | undefined) =>
  !!filter && (filter.selected !== undefined || !!filter.operator);
export const needsValue = (operator: Operator | undefined) =>
  !!operator && !["empty", "not_empty"].includes(operator);

const collator = new Intl.Collator("es-CO", {
  numeric: true,
  sensitivity: "base",
});
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
/** Match the calendar day displayed in the table, including ISO time offsets. */
export function calendarDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const dateOnly = parseDateInput(value);
  if (dateOnly) return dateOnly;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = dayFormat.formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Compare integer/currency filters without rounding through floating point. */
export function numericValue(
  value: string,
  kind: "integer" | "decimal",
): bigint | null {
  const source = value.trim().replace(",", ".");
  if (
    !(kind === "integer" ? /^[+-]?\d+$/ : /^[+-]?\d+(?:\.\d{1,2})?$/).test(
      source,
    )
  )
    return null;
  const negative = source.startsWith("-");
  const [whole, fraction = ""] = source.replace(/^[+-]/, "").split(".");
  const number =
    BigInt(whole) * (kind === "decimal" ? 100n : 1n) +
    (kind === "decimal" ? BigInt(fraction.padEnd(2, "0")) : 0n);
  return negative ? -number : number;
}

function compare(a: string, b: string, kind: ColumnKind): number {
  if (kind === "integer" || kind === "decimal") {
    const left = numericValue(a, kind)!,
      right = numericValue(b, kind)!;
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return kind === "date" ? a.localeCompare(b) : collator.compare(a, b);
}

const normalizedText = (value: string) =>
  value
    .toLocaleLowerCase("es-CO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function filterProblem(
  column: Column<string>,
  filter: ColumnFilter,
): string | null {
  const { operator, value = "", end = "" } = filter;
  if (!operator) return null;
  if (column.selectionOnly)
    return "Esta columna solo admite selección de valores.";
  if (!columnOperators(column.kind).some(([op]) => op === operator))
    return "La condición no corresponde a esta columna.";
  if (!needsValue(operator)) return null;
  const validValue = (input: string) => {
    if (column.kind === "date") return !!parseDateInput(input);
    if (column.kind === "integer" || column.kind === "decimal")
      return numericValue(input, column.kind) !== null;
    return input.trim().length > 0;
  };
  if (!validValue(value) || (operator === "between" && !validValue(end))) {
    if (column.kind === "date")
      return "Escribe una fecha válida y completa en cada campo.";
    if (column.kind === "integer")
      return "Escribe números enteros sin separadores de miles.";
    if (column.kind === "decimal")
      return "Escribe números sin separadores de miles y con hasta dos decimales.";
    return "Escribe el valor de la condición.";
  }
  if (operator === "between") {
    const start = column.kind === "date" ? parseDateInput(value)! : value;
    const finish = column.kind === "date" ? parseDateInput(end)! : end;
    if (compare(start, finish, column.kind) > 0)
      return "El valor desde no puede ser mayor que el valor hasta.";
  }
  return null;
}

function matchesCondition(
  cell: ColumnCell,
  column: Column<string>,
  filter: ColumnFilter,
): boolean {
  const { operator, value = "", end = "" } = filter;
  if (!operator) return true;
  const values =
    column.kind === "text"
      ? (cell.searchValues ??
        cell.values.map((v) => v.value).filter((v): v is string => v !== null))
      : cell.values.map((v) => v.value).filter((v): v is string => v !== null);
  const populated = values.filter((v) => v.trim() !== "");
  if (operator === "empty") return !populated.length;
  if (operator === "not_empty") return !!populated.length;
  if (!populated.length) return false;
  const first = column.kind === "date" ? parseDateInput(value)! : value;
  const last = column.kind === "date" ? parseDateInput(end)! : end;
  const matching = (input: string) => {
    if (column.kind === "text") {
      const source = normalizedText(column.normalizeText?.(input) ?? input),
        wanted = normalizedText(column.normalizeText?.(value) ?? value);
      if (operator === "contains" || operator === "not_contains")
        return source.includes(wanted);
      if (operator === "starts_with") return source.startsWith(wanted);
      if (operator === "ends_with") return source.endsWith(wanted);
      return source === wanted;
    }
    const result = compare(input, first, column.kind);
    if (operator === "greater") return result > 0;
    if (operator === "greater_equal") return result >= 0;
    if (operator === "less") return result < 0;
    if (operator === "less_equal") return result <= 0;
    if (operator === "between")
      return result >= 0 && compare(input, last, column.kind) <= 0;
    return result === 0;
  };
  // Negative text conditions must exclude a match in any associated product.
  return operator === "not_equals" || operator === "not_contains"
    ? !populated.some(matching)
    : populated.some(matching);
}

export function matchesColumn(
  cell: ColumnCell,
  column: Column<string>,
  filter?: ColumnFilter,
): boolean {
  if (!hasFilter(filter)) return true;
  if (
    filter!.selected !== undefined &&
    !cell.values.some((v) => filter!.selected!.includes(v.key))
  )
    return false;
  return (
    !filterProblem(column, filter!) && matchesCondition(cell, column, filter!)
  );
}

export function filterColumnRows<T extends ColumnRow>(
  rows: T[],
  filters: ColumnFilters,
  except?: ColumnKey,
): T[] {
  return filterTableRows(rows, orderColumns, filters, except);
}

export function filterTableRows<Key extends string, T extends ColumnRow<Key>>(
  rows: T[],
  columns: Column<Key>[],
  filters: ColumnFilters<Key>,
  except?: Key,
): T[] {
  return rows.filter((row) =>
    columns.every(
      (col) =>
        col.key === except ||
        matchesColumn(row.cells[col.key], col, filters[col.key]),
    ),
  );
}

export function sortColumnRows<T extends ColumnRow>(
  rows: T[],
  sort?: ColumnSort,
): T[] {
  return sortTableRows(rows, orderColumns, sort);
}

export function sortTableRows<Key extends string, T extends ColumnRow<Key>>(
  rows: T[],
  columns: Column<Key>[],
  sort?: ColumnSort<Key>,
): T[] {
  if (!sort) return rows;
  const column = columns.find((col) => col.key === sort.column);
  if (!column || column.selectionOnly) return rows;
  const kind = column.kind;
  return [...rows].sort((a, b) => {
    const left = a.cells[sort.column].sortValue,
      right = b.cells[sort.column].sortValue;
    // Missing dates/values remain last in either direction. Stable ties keep the default order.
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return compare(left, right, kind) * (sort.direction === "asc" ? 1 : -1);
  });
}

export function columnOptions<Key extends string>(
  rows: ColumnRow<Key>[],
  column: Column<Key>,
): ColumnValue[] {
  const values = new Map<string, ColumnValue>();
  rows.forEach((row) =>
    row.cells[column.key].values.forEach((v) => values.set(v.key, v)),
  );
  return [...values.values()].sort((a, b) => {
    if (a.value === null) return b.value === null ? 0 : 1;
    if (b.value === null) return -1;
    return column.kind === "text" || column.kind === "enum"
      ? collator.compare(a.label, b.label)
      : compare(a.value, b.value, column.kind);
  });
}

/** Invalid hand-edited URLs are ignored rather than making the table unusable. */
export function readColumnState<Key extends string>(
  params: URLSearchParams,
  columns: Column<Key>[],
): TableState<Key> {
  const filters: ColumnFilters<Key> = {};
  try {
    const saved: unknown = JSON.parse(params.get("filtros") ?? "{}");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      for (const column of columns) {
        const candidate = (saved as Record<string, unknown>)[column.key];
        if (
          !candidate ||
          typeof candidate !== "object" ||
          Array.isArray(candidate)
        )
          continue;
        const raw = candidate as Record<string, unknown>;
        const filter: ColumnFilter = {};
        if (
          Array.isArray(raw.selected) &&
          raw.selected.every((v) => typeof v === "string")
        )
          filter.selected = [...new Set(raw.selected as string[])];
        if (
          !column.selectionOnly &&
          typeof raw.operator === "string" &&
          columnOperators(column.kind).some(([op]) => op === raw.operator)
        ) {
          filter.operator = raw.operator as Operator;
          if (typeof raw.value === "string") filter.value = raw.value;
          if (typeof raw.end === "string") filter.end = raw.end;
          if (filterProblem(column, filter)) {
            delete filter.operator;
            delete filter.value;
            delete filter.end;
          }
        }
        if (hasFilter(filter)) filters[column.key] = filter;
      }
    }
  } catch {
    /* An invalid filter URL keeps the normal list accessible. */
  }
  const column = params.get("ordenar"),
    direction = params.get("direccion");
  const sort =
    columns.some((col) => col.key === column && !col.selectionOnly) &&
    ["asc", "desc"].includes(direction ?? "")
      ? { column: column as Key, direction: direction as "asc" | "desc" }
      : undefined;
  return { filters, sort };
}

export function readTableState(params: URLSearchParams): TableState {
  const state = readColumnState(params, orderColumns);
  const legacyState = params.get("estado");
  if (
    legacyState &&
    [
      "no_autorizada",
      "autorizada",
      "parcialmente_anulada",
      "cerrada",
      "anulada",
    ].includes(legacyState)
  )
    state.filters.estado = { selected: [legacyState] };
  return state;
}

export function tableParams<Key extends string>({
  filters,
  sort,
}: TableState<Key>): Record<string, string> {
  const active: ColumnFilters<Key> = {};
  for (const key of Object.keys(filters) as Key[])
    if (hasFilter(filters[key])) active[key] = filters[key];
  return {
    filtros: Object.keys(active).length ? JSON.stringify(active) : "",
    ordenar: sort?.column ?? "",
    direccion: sort?.direction ?? "",
    estado: "",
  };
}
