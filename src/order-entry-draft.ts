import type { Row } from "../shared/schema";

type SheetState = { key: string; query: string; quantityInput?: string };
export type SheetLine = Row & { _sheet: SheetState };
let nextKey = 0;

export function blankSheetLine(fresh: () => Row): SheetLine {
  return {
    ...fresh(),
    cantidad_solicitada: NaN,
    precio_unitario: "",
    _sheet: { key: `sheet-${++nextKey}`, query: "" },
  };
}

export function padSheetLines(lines: Row[], fresh: () => Row): SheetLine[] {
  const result = lines.map((line) => ({
    ...line,
    _sheet: line._sheet ?? { key: `sheet-${++nextKey}`, query: "" },
  })) as SheetLine[];
  while (result.length < 7) result.push(blankSheetLine(fresh));
  return result;
}

export function isEmptySheetLine(line: Row): boolean {
  return (
    !line.id_producto &&
    !line.id_material &&
    !String(line.producto ?? "").trim() &&
    !String(line._sheet?.query ?? "").trim() &&
    !String(line._sheet?.quantityInput ?? "").trim() &&
    (line.cantidad_solicitada == null ||
      Number.isNaN(line.cantidad_solicitada)) &&
    String(line.precio_unitario ?? "").trim() === ""
  );
}

export function compactSheetLines(lines: Row[]): Row[] {
  return lines.filter((line) => !isEmptySheetLine(line));
}

export function indexedOrderLineErrors(
  lines: Row[],
  validate: (line: Row) => Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    lines.flatMap((line, index) =>
      Object.entries(validate(line)).map(([field, message]) => [
        `lines.${index}.${field}`,
        message,
      ]),
    ),
  );
}

export function orderLinePayload(line: Row): Row {
  const { _sheet, ...payload } = line;
  return payload;
}
