import type { SheetRange } from "./product-sheet-selection";
import { rangeBounds } from "./product-sheet-selection";
import { parseDateInput } from "./dates";
import { decimal } from "../shared/schema";

export type SheetCellIssue = {
  rowKey: string;
  column: string;
  message: string;
  protected?: boolean;
};
export type SheetInput<R, C> = { row: R; column: C; text: string };
type Target = { entity: string; id: string; field: string };
export type OrderSheetChange = Target & { expected: unknown; value: unknown };
export const changeKey = ({ entity, id, field }: Target) =>
  `${entity}/${id}/${field}`;
export const sameSheetChanges = <T extends OrderSheetChange>(
  left: T[],
  right: T[],
) =>
  left.length === right.length &&
  left.every(
    (item, index) =>
      changeKey(item) === changeKey(right[index]) &&
      item.value === right[index].value &&
      item.expected === right[index].expected,
  );

export function proposeOrderSheetInput<
  DB,
  R extends { key: string },
  C extends { key: string },
  T extends Target,
>(
  db: DB,
  current: (T & OrderSheetChange)[],
  inputs: SheetInput<R, C>[],
  rules: {
    permission: (db: DB, row: R, col: C) => string | null;
    target: (row: R, col: C) => T;
    expected: (db: DB, target: T) => unknown;
    parse: (db: DB, row: R, col: C, text: string) => unknown;
    overlay: (db: DB, changes: (T & OrderSheetChange)[]) => DB;
    validate: (next: DB, target: T, original: DB) => Record<string, string>;
    relatedError?: (
      target: T,
      issues: Record<string, string>,
    ) => string | undefined;
  },
): { changes: (T & OrderSheetChange)[]; issues: SheetCellIssue[] } {
  const issues: SheetCellIssue[] = [];
  const prior = new Map(current.map((change) => [changeKey(change), change]));
  const candidates: { change: T & OrderSheetChange; row: R; column: C }[] = [];
  const values = new Map<string, Set<unknown>>();
  for (const { row, column, text } of inputs) {
    const denied = rules.permission(db, row, column);
    if (denied) {
      issues.push({
        rowKey: row.key,
        column: column.key,
        message: denied,
        protected: true,
      });
      continue;
    }
    try {
      const target = rules.target(row, column);
      const key = changeKey(target);
      const old = prior.get(key);
      const expected = old ? old.expected : rules.expected(db, target);
      const value = rules.parse(db, row, column, text);
      candidates.push({ change: { ...target, expected, value }, row, column });
      const seen = values.get(key) ?? new Set();
      seen.add(value);
      values.set(key, seen);
    } catch (error) {
      issues.push({
        rowKey: row.key,
        column: column.key,
        message: (error as Error).message,
      });
    }
  }
  const accepted = candidates.filter(({ change, row, column }) => {
    if (values.get(changeKey(change))!.size === 1) return true;
    issues.push({
      rowKey: row.key,
      column: column.key,
      message: "Valores contradictorios: estas filas comparten el mismo dato.",
    });
    return false;
  });
  const next = new Map(prior);
  for (const { change } of accepted) next.set(changeKey(change), change);
  let eligible = accepted;
  while (eligible.length) {
    const prospective = rules.overlay(db, [...next.values()]);
    const invalid = new Map<string, Record<string, string>>();
    const problems = eligible.map(({ change }) => {
      const key = `${change.entity}/${change.id}`;
      if (!invalid.has(key))
        invalid.set(key, rules.validate(prospective, change, db));
      return invalid.get(key)!;
    });
    const direct = problems.some(
      (problem, index) => problem[eligible[index].change.field],
    );
    const rejected = new Set<string>();
    eligible.forEach(({ change, row, column }, index) => {
      const message = direct
        ? problems[index][change.field]
        : rules.relatedError?.(change, problems[index]);
      if (!message) return;
      const key = changeKey(change);
      issues.push({ rowKey: row.key, column: column.key, message });
      rejected.add(key);
      const old = prior.get(key);
      if (old) next.set(key, old);
      else next.delete(key);
    });
    if (!rejected.size) break;
    eligible = eligible.filter(
      ({ change }) => !rejected.has(changeKey(change)),
    );
  }
  return {
    changes: [...next.values()].filter(
      (change) => change.value !== change.expected,
    ),
    issues,
  };
}

export function sheetScalarInput(kind: string, raw: string) {
  if (kind === "date") {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? parseDateInput(raw.split("-").reverse().join("/"))
      : parseDateInput(raw);
    if (!date) throw new Error("Introduce una fecha válida (dd/mm/aaaa).");
    return `${date}T12:00:00.000Z`;
  }
  if (kind === "integer" || kind === "decimal") {
    let value = raw.replace(/[$\s]/g, "");
    if (value.includes(","))
      value = value.replaceAll(".", "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(value))
      value = value.replaceAll(".", "");
    if (!/^-?\d+(\.\d+)?$/.test(value))
      throw new Error("Introduce un número válido.");
    if (kind === "decimal") return decimal(value);
    const number = Number(value);
    if (!Number.isSafeInteger(number))
      throw new Error("Introduce una cantidad entera.");
    return number;
  }
  return raw;
}

export function sheetRangeInputs<R, C>(
  range: SheetRange,
  rows: readonly R[],
  columns: readonly C[],
  matrix: string[][],
  display: (row: R) => R = (row) => row,
) {
  const inputs: SheetInput<R, C>[] = [];
  let overflow = 0;
  if (matrix.length === 1 && matrix[0].length === 1) {
    const { top, bottom, left, right } = rangeBounds(range);
    for (let r = top; r <= bottom && r < rows.length; r++) {
      const row = display(rows[r]);
      for (let c = left; c <= right && c < columns.length; c++)
        inputs.push({ row, column: columns[c], text: matrix[0][0] });
    }
  } else {
    const { row: firstRow, column: firstColumn } = range.anchor;
    const rowCount = Math.min(matrix.length, rows.length - firstRow);
    for (let r = 0; r < rowCount; r++) {
      const values = matrix[r];
      const columnCount = Math.min(values.length, columns.length - firstColumn);
      overflow += values.length - columnCount;
      const row = display(rows[firstRow + r]);
      for (let c = 0; c < columnCount; c++)
        inputs.push({ row, column: columns[firstColumn + c], text: values[c] });
    }
    for (let r = rowCount; r < matrix.length; r++) overflow += matrix[r].length;
  }
  return { inputs, overflow };
}

export type SheetView = "no_autorizadas" | "seguimiento" | "anuladas";
export function formatSheetClipboard(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((value) =>
          value === "" || /[\t\r\n"]/.test(value)
            ? `"${value.replaceAll('"', '""')}"`
            : value,
        )
        .join("\t"),
    )
    .join("\n");
}
export function parseSheetClipboard(text: string): string[][] {
  const rows: string[][] = [[]];
  let value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (quoted || !value) quoted = !quoted;
      else value += char;
    } else if (!quoted && (char === "\t" || char === "\n" || char === "\r")) {
      rows.at(-1)!.push(value);
      value = "";
      if (char !== "\t") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        rows.push([]);
      }
    } else value += char;
  }
  rows.at(-1)!.push(value);
  if (
    !quoted &&
    /[\r\n]$/.test(text) &&
    rows.length > 1 &&
    rows.at(-1)!.length === 1 &&
    !rows.at(-1)![0]
  )
    rows.pop();
  return rows;
}
