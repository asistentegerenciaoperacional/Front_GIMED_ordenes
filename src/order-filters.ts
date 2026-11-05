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
    description: "Órdenes con o sin documento escaneado adjunto.",
    options: [
      { id: "documento_con", label: "Con orden escaneada" },
      { id: "documento_sin", label: "Sin orden escaneada" },
    ],
  },
  {
    id: "sin_factura",
    name: "Recepciones sin factura",
    description: "Órdenes con lotes recibidos sin factura adjunta.",
    options: [
      { id: "recepciones_sin_factura", label: "Recepciones sin factura" },
    ],
  },
  {
    id: "entrega_vencida",
    name: "Entrega solicitada vencida",
    description:
      "Órdenes con productos/materiales pendientes y fecha de entrega vencida a día de hoy.",
    options: [{ id: "entrega_vencida", label: "Entrega solicitada vencida" }],
  },
  {
    id: "proximas",
    name: "Próximas entregas",
    description:
      "Órdenes con fecha solicitada de entrega en los próximos 7, 15 o 30 días.",
    options: [
      { id: "proximas_7", label: "Próximas entregas · 7 días" },
      { id: "proximas_15", label: "Próximas entregas · 15 días" },
      { id: "proximas_30", label: "Próximas entregas · 30 días" },
    ],
  },
  {
    id: "sin_recepciones",
    name: "Sin recepciones registradas",
    description: "Órdenes sin ningún producto o material recibido.",
    options: [{ id: "sin_recepciones", label: "Sin recepciones registradas" }],
  },
  {
    id: "batch_vencido",
    name: "Batch record vencido",
    description:
      "Órdenes con lotes sin recibir y cuya fecha estimada de batch record está vencida a día de hoy.",
    productOnly: true,
    options: [{ id: "batch_vencido", label: "Batch record vencido" }],
  },
  {
    id: "recibido_sin_batch",
    name: "Producto recibido sin batch record",
    description:
      "Órdenes con lotes que tienen cantidad recibida pero sin fecha de recepción del batch record.",
    productOnly: true,
    options: [
      { id: "recibido_sin_batch", label: "Producto recibido sin batch record" },
    ],
  },
  {
    id: "inspeccion",
    name: "Inspección pendiente",
    description:
      "Órdenes con lotes que tienen fecha de recepción de batch record pero sin fecha de inspección.",
    productOnly: true,
    options: [{ id: "inspeccion_pendiente", label: "Inspección pendiente" }],
  },
  {
    id: "recibidos_sin_inspeccion",
    name: "Recibidos sin inspección",
    description: "Órdenes con lotes recibidos sin fecha de inspección.",
    productOnly: true,
    options: [
      { id: "recibidos_sin_inspeccion", label: "Recibidos sin inspección" },
    ],
  },
  {
    id: "confirmacion",
    name: "Confirmación pendiente",
    description: "Órdenes con lotes recibidos sin fecha de confirmación.",
    productOnly: true,
    options: [
      { id: "confirmacion_pendiente", label: "Confirmación pendiente" },
    ],
  },
  {
    id: "vinculos",
    name: "Vínculos de abastecimiento",
    description: "Órdenes que tienen OCM/OC vinculadas.",
    options: [
      { id: "vinculos_con", label: "Con vínculos de abastecimiento" },
      { id: "vinculos_sin", label: "Sin vínculos de abastecimiento" },
    ],
  },
  {
    id: "ocm_pendientes",
    name: "OCM vinculadas pendientes",
    description:
      "Órdenes con productos que tienen materiales vinculados pendientes por entregar.",
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
