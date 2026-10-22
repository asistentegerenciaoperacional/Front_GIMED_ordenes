import type { costos_maquila } from "./models";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const moneyFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});

/** The business date shown by the UI; intervals include their entire final day. */
export function costDay(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (Number(value.slice(0, 4)) < 1) return null;
    const date = new Date(`${value}T12:00:00.000Z`);
    return Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
      ? null
      : value;
  }
  // Do not reinterpret partially typed dd/mm/aaaa values through Date's permissive parser.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !costDay(value.slice(0, 10)))
    return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    dayFormatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}`;
}

type CostInput = {
  id?: string;
  id_producto?: unknown;
  costo?: unknown;
  fecha_inicio?: unknown;
  fecha_fin?: unknown;
};
export type CostIssue = {
  fields: Record<string, string>;
  conflictingId?: string;
  costId?: string;
};
const displayDay = (day: string) => day.split("-").reverse().join("/");
const describe = (cost: CostInput) =>
  `$${moneyFormatter.format(Number(cost.costo))} (${displayDay(costDay(cost.fecha_inicio)!)} – ${cost.fecha_fin ? displayDay(costDay(cost.fecha_fin)!) : "sin fecha final"})`;

/** Check an edited/new cost against the other records of its product, excluding its own ID. */
export function costIssue(
  cost: CostInput,
  records: readonly CostInput[],
): CostIssue | null {
  const fields: Record<string, string> = {};
  if (typeof cost.id_producto !== "string" || !cost.id_producto)
    fields.id_producto = "Selecciona un producto.";
  if (
    typeof cost.costo !== "number" ||
    !Number.isSafeInteger(cost.costo) ||
    cost.costo <= 0
  )
    fields.costo = "Ingresa un costo entero mayor que cero.";
  const start = costDay(cost.fecha_inicio);
  const end = costDay(cost.fecha_fin);
  if (!start) fields.fecha_inicio = "Indica una fecha de inicio válida.";
  if (cost.fecha_fin != null && cost.fecha_fin !== "" && !end)
    fields.fecha_fin = "Indica una fecha final válida o deja el campo vacío.";
  if (start && end && end < start)
    fields.fecha_fin = "La fecha final debe ser igual o posterior al inicio.";
  if (Object.keys(fields).length) return { fields, costId: cost.id };

  const others = records.filter(
    (other) =>
      other.id_producto === cost.id_producto &&
      (!cost.id || other.id !== cost.id),
  );
  const open = others.find((other) => !other.fecha_fin);
  if (!end && open)
    return {
      fields: {
        fecha_fin: `Cierra el costo abierto ${describe(open)} antes de crear otro sin fecha final.`,
      },
      conflictingId: open.id,
      costId: cost.id,
    };
  for (const other of others) {
    const otherStart = costDay(other.fecha_inicio);
    const otherEnd = costDay(other.fecha_fin);
    if (!otherStart) continue; // Shape validation reports malformed existing records separately.
    if ((!end || otherStart <= end) && (!otherEnd || start! <= otherEnd)) {
      const message = `El periodo se solapa con el costo ${describe(other)}.`;
      return {
        fields: { fecha_inicio: message, fecha_fin: message },
        conflictingId: other.id,
        costId: cost.id,
      };
    }
  }
  return null;
}

/** O(n log n) validation for the complete collection, including legacy/imported data. */
export function costScheduleIssue(
  records: readonly costos_maquila[],
): CostIssue | null {
  const sorted = [...records].sort(
    (a, b) =>
      a.id_producto.localeCompare(b.id_producto) ||
      (costDay(a.fecha_inicio) ?? "").localeCompare(
        costDay(b.fecha_inicio) ?? "",
      ) ||
      a.id.localeCompare(b.id),
  );
  for (let i = 0; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const issue = costIssue(
      sorted[i],
      previous?.id_producto === sorted[i].id_producto ? [previous] : [],
    );
    if (issue) return issue;
  }
  return null;
}
