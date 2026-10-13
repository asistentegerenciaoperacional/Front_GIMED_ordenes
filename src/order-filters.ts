export type CustomFilterId =
  | "documento_con"
  | "documento_sin"
  | "recepciones_sin_factura"
  | "entrega_vencida"
  | "proximas_7"
  | "proximas_15"
  | "proximas_30"
  | "sin_recepciones"
  | "batch_vencido"
  | "recibido_sin_batch"
  | "inspeccion_pendiente"
  | "recibidos_sin_inspeccion"
  | "confirmacion_pendiente"
  | "seguimiento_por_cerrar"
  | "vinculos_con"
  | "vinculos_sin"
  | "ocm_pendientes";

export type OrderGroup = "productos" | "materiales";
type FilterDefinition = {
  id: string;
  name: string;
  description: string;
  productOnly?: boolean;
  options: readonly { id: CustomFilterId; label: string }[];
};

export const customFilters: readonly FilterDefinition[] = [
  {
    id: "documento",
    name: "Documento de la orden",
    description:
      "Con o sin documento de clase orden escaneada perteneciente a esa cabecera.",
    options: [
      { id: "documento_con", label: "Con documento de la orden" },
      { id: "documento_sin", label: "Sin documento de la orden" },
    ],
  },
  {
    id: "sin_factura",
    name: "Recepciones sin factura",
    description: "Alguna recepción física sin factura asociada.",
    options: [
      { id: "recepciones_sin_factura", label: "Recepciones sin factura" },
    ],
  },
  {
    id: "entrega_vencida",
    name: "Entrega solicitada vencida",
    description:
      "Entrega de cabecera anterior a hoy y algún renglón en seguimiento.",
    options: [{ id: "entrega_vencida", label: "Entrega solicitada vencida" }],
  },
  {
    id: "proximas",
    name: "Próximas entregas",
    description:
      "Entrega de cabecera entre hoy y hoy más 7, 15 o 30 días, incluidos ambos extremos.",
    options: [
      { id: "proximas_7", label: "Próximas entregas · 7 días" },
      { id: "proximas_15", label: "Próximas entregas · 15 días" },
      { id: "proximas_30", label: "Próximas entregas · 30 días" },
    ],
  },
  {
    id: "sin_recepciones",
    name: "Sin recepciones registradas",
    description:
      "Ninguna cantidad recibida registrada en sus renglones o lotes efectivos. Una fecha sin cantidad permite aparecer aquí.",
    options: [{ id: "sin_recepciones", label: "Sin recepciones registradas" }],
  },
  {
    id: "batch_vencido",
    name: "Batch record vencido",
    description:
      "Algún lote con estimación anterior a hoy y sin fecha de recepción del batch record; no exige recepción física.",
    productOnly: true,
    options: [{ id: "batch_vencido", label: "Batch record vencido" }],
  },
  {
    id: "recibido_sin_batch",
    name: "Producto recibido sin batch record",
    description:
      "Algún lote recibido físicamente sin fecha de recepción del batch record.",
    productOnly: true,
    options: [
      { id: "recibido_sin_batch", label: "Producto recibido sin batch record" },
    ],
  },
  {
    id: "inspeccion",
    name: "Inspección pendiente",
    description:
      "Algún lote con fecha de recepción del batch record y sin fecha de inspección.",
    productOnly: true,
    options: [{ id: "inspeccion_pendiente", label: "Inspección pendiente" }],
  },
  {
    id: "recibidos_sin_inspeccion",
    name: "Recibidos sin inspección",
    description:
      "Algún lote recibido físicamente sin fecha de inspección. Puede coincidir con Inspección pendiente.",
    productOnly: true,
    options: [
      { id: "recibidos_sin_inspeccion", label: "Recibidos sin inspección" },
    ],
  },
  {
    id: "confirmacion",
    name: "Confirmación pendiente",
    description: "Algún lote recibido físicamente sin fecha de confirmación.",
    productOnly: true,
    options: [
      { id: "confirmacion_pendiente", label: "Confirmación pendiente" },
    ],
  },
  {
    id: "por_cerrar",
    name: "Seguimiento por cerrar",
    description:
      "Algún renglón en seguimiento con al menos un lote no anulado y todos sus lotes efectivos cerrados.",
    productOnly: true,
    options: [
      { id: "seguimiento_por_cerrar", label: "Seguimiento por cerrar" },
    ],
  },
  {
    id: "vinculos",
    name: "Vínculos de abastecimiento",
    description:
      "Con o sin relaciones existentes, en cualquiera de las dos direcciones, independientemente de sus estados.",
    options: [
      { id: "vinculos_con", label: "Con vínculos de abastecimiento" },
      { id: "vinculos_sin", label: "Sin vínculos de abastecimiento" },
    ],
  },
  {
    id: "ocm_pendientes",
    name: "OCM vinculadas pendientes",
    description:
      "Algún renglón de material efectivamente vinculado a la OC permanece en seguimiento. No cuentan otros renglones de esa OCM.",
    productOnly: true,
    options: [{ id: "ocm_pendientes", label: "OCM vinculadas pendientes" }],
  },
];

export function readCustomFilter(
  value: string | null,
  group: OrderGroup,
): CustomFilterId | "" {
  return (
    customFilters
      .filter((filter) => group === "productos" || !filter.productOnly)
      .flatMap((filter) => filter.options)
      .find((option) => option.id === value)?.id ?? ""
  );
}

export function addCalendarDays(day: string, days: number): string {
  const date = new Date(day + "T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const ORDER_PAGE_SIZE = 50;
export function paginateOrders<T>(rows: readonly T[], value: string | null) {
  const requested = value && /^[1-9]\d*$/.test(value) ? Number(value) : 1;
  const pageCount = Math.max(1, Math.ceil(rows.length / ORDER_PAGE_SIZE));
  const page = Math.min(
    Number.isSafeInteger(requested) ? requested : 1,
    pageCount,
  );
  const offset = (page - 1) * ORDER_PAGE_SIZE;
  return {
    rows: rows.slice(offset, offset + ORDER_PAGE_SIZE),
    page,
    pageCount,
    total: rows.length,
    start: rows.length ? offset + 1 : 0,
    end: Math.min(offset + ORDER_PAGE_SIZE, rows.length),
  };
}
