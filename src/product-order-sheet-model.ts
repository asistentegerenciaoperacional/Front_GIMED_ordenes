import type {
  Database,
  orden_compra,
  orden_producto,
  lote_producto,
} from "../shared/models";
import { canonical, decimal, meta, type Row } from "../shared/schema";
import {
  changeKey,
  overlaySheetChanges,
  sheetPermission,
  sheetRecordIssue,
  type SheetChange,
  type SheetEntity,
} from "../shared/product-order-sheet";
import { addCalendarDays, type CustomFilterId } from "./order-filters";
import { parseDateInput } from "./dates";
import { materialRole } from "../shared/product-materials";
import {
  EMPTY_VALUE,
  calendarDay,
  type Column,
  type ColumnCell,
} from "./order-table";

export type SheetView = "no_autorizadas" | "seguimiento" | "anuladas";
export type SheetColumn = Column<string> & {
  width: number;
  entity?: SheetEntity;
  field?: string;
};
const column = (
  key: string,
  label: string,
  kind: SheetColumn["kind"],
  width: number,
  entity?: SheetEntity,
  field = key,
): SheetColumn => ({ key, label, kind, width, entity, field });
export const productSheetColumns: SheetColumn[] = [
  column("no_orden", "No. de orden", "integer", 112),
  column("id_factura", "Factura", "text", 145, "lote_producto"),
  column("numero_lote", "Lote", "text", 140, "lote_producto"),
  column("codigo", "Código de barras", "text", 162),
  column("id_producto", "Producto", "text", 280, "orden_producto"),
  column(
    "cantidad_solicitada",
    "Cantidad solicitada",
    "integer",
    163,
    "orden_producto",
  ),
  column(
    "cantidad_recibida",
    "Cantidad recibida",
    "integer",
    154,
    "lote_producto",
  ),
  column(
    "precio_unitario",
    "Precio unitario",
    "decimal",
    149,
    "orden_producto",
  ),
  column("id_proveedor", "Proveedor", "text", 190, "orden_compra"),
  column("cantidad_sticker", "Sticker", "integer", 110, "orden_producto"),
  column("cantidad_cinta", "Cinta", "integer", 110, "orden_producto"),
  column("ocm", "OCM vinculadas", "text", 160),
  column(
    "ref_corrugado",
    "Referencia de corrugado",
    "text",
    220,
    "orden_producto",
  ),
  column(
    "cantidad_corrugado",
    "Cantidad de corrugado",
    "integer",
    165,
    "orden_producto",
  ),
  column(
    "fecha_elaboracion",
    "Fecha de elaboración",
    "date",
    173,
    "orden_compra",
  ),
  column(
    "fecha_solicitada_entrega",
    "Fecha solicitada de entrega",
    "date",
    196,
    "orden_compra",
  ),
  column(
    "fecha_estimada_batch_record",
    "Fecha estimada de batch record",
    "date",
    205,
    "lote_producto",
  ),
  column(
    "fecha_entrega_batch_record",
    "Fecha de entrega de batch record",
    "date",
    211,
    "lote_producto",
  ),
  column(
    "estado_batch_record",
    "Estado batch record",
    "enum",
    166,
    "lote_producto",
  ),
  column(
    "fecha_inspeccion",
    "Fecha de inspección",
    "date",
    164,
    "lote_producto",
  ),
  column("estado_inspeccion", "Inspección", "enum", 132, "lote_producto"),
  column("fecha_recepcion", "Fecha de recepción", "date", 165, "lote_producto"),
  column(
    "fecha_confirmacion",
    "Fecha de confirmación",
    "date",
    175,
    "lote_producto",
  ),
  column("ubicacion", "Ubicación", "text", 180, "lote_producto"),
];
const unauthorizedKeys = [
  "no_orden",
  "codigo",
  "id_producto",
  "cantidad_solicitada",
  "precio_unitario",
  "id_proveedor",
  "fecha_elaboracion",
  "fecha_solicitada_entrega",
  "fecha_estimada_batch_record",
];
const unauthorizedColumns = unauthorizedKeys.map((key) =>
  productSheetColumns.find((col) => col.key === key)!,
);
export const columnsForSheet = (view: SheetView) =>
  view === "no_autorizadas" ? unauthorizedColumns : productSheetColumns;
export type SupplyItem = {
  order: orden_compra;
  material: string;
  quantity: number;
  state: string;
};
export type ProductSheetRow = {
  key: string;
  order: orden_compra;
  line: orden_producto;
  lot?: lote_producto;
  initialLot?: lote_producto;
  first: boolean;
  remaining: number;
  excess: number;
  globalRemaining: number;
  supply: SupplyItem[];
  documentId?: string;
  cells: Record<string, ColumnCell>;
};
const enumLabels: Record<string, string> = {
  pendiente: "Pendiente",
  recibido: "Recibido",
  validado: "Validado",
  rechazado: "Rechazado",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};
export const sheetEnumLabel = (value: string) =>
  enumLabels[value] ??
  value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
const numbers = new Intl.NumberFormat("es-CO");
const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 2,
});
const lookupCache = new WeakMap<
  Database,
  {
    products: Map<string, Database["productos"][number]>;
    providers: Map<string, Database["proveedor"][number]>;
    codes: Map<string, Database["codigos_barras"][number]>;
    invoices: Map<string, Database["factura"][number]>;
    materials: Map<string, Database["materiales"][number]>;
  }
>();
function lookup(db: Database) {
  let cache = lookupCache.get(db);
  if (!cache) {
    cache = {
      products: new Map(db.productos.map((row) => [row.id, row])),
      providers: new Map(db.proveedor.map((row) => [row.id, row])),
      codes: new Map(db.codigos_barras.map((row) => [row.id, row])),
      invoices: new Map(db.factura.map((row) => [row.id, row])),
      materials: new Map(db.materiales.map((row) => [row.id, row])),
    };
    lookupCache.set(db, cache);
  }
  return cache;
}
export function sheetRaw(row: ProductSheetRow, col: SheetColumn): unknown {
  if (col.key === "no_orden") return row.order.no_orden;
  if (!row.lot && col.key === "fecha_estimada_batch_record")
    return row.initialLot?.fecha_estimada_batch_record;
  if (col.key === "cantidad_solicitada")
    return row.lot ? row.remaining : row.line.cantidad_solicitada;
  return col.entity === "orden_compra"
    ? (row.order as Row)[col.field!]
    : col.entity === "orden_producto"
      ? (row.line as Row)[col.field!]
      : (row.lot as Row | undefined)?.[col.field!];
}
export function sheetValue(
  db: Database,
  row: ProductSheetRow,
  col: SheetColumn,
): string {
  const references = lookup(db);
  if (col.key === "codigo")
    return references.codes.get(row.line.id_codigo_barras)?.codigo ?? "";
  if (col.key === "id_producto")
    return references.products.get(row.line.id_producto)?.nombre_producto ?? "";
  if (col.key === "id_proveedor") {
    const provider = references.providers.get(row.order.id_proveedor);
    return provider?.nombre_corto ?? provider?.nombre_largo ?? "";
  }
  if (col.key === "id_factura")
    return (
      references.invoices.get(row.lot?.id_factura ?? "")?.numero_factura ?? ""
    );
  if (col.key === "ref_corrugado")
    return (
      references.materials.get(row.line.ref_corrugado ?? "")?.nombre_material ??
      ""
    );
  if (col.key === "ocm")
    return [...new Set(row.supply.map((item) => item.order.no_orden))].join(
      ", ",
    );
  const value = sheetRaw(row, col);
  if (value === null || value === undefined || value === "") return "";
  if (col.kind === "date")
    return (calendarDay(String(value)) ?? "").split("-").reverse().join("/");
  if (col.kind === "decimal") return money.format(Number(value));
  if (col.kind === "integer" && col.key !== "no_orden")
    return numbers.format(Number(value));
  return col.kind === "enum" ? sheetEnumLabel(String(value)) : String(value);
}
// Known columns are lazy, cached prototype getters. No Proxy traps or enumerable
// caches: React's development inspector can safely read arbitrary properties.
class SheetCells {
  [key: string]: ColumnCell;
  #db: Database;
  #row: ProductSheetRow;
  #cache?: Map<string, ColumnCell>;
  constructor(db: Database, row: ProductSheetRow) {
    this.#db = db;
    this.#row = row;
  }
  static {
    for (const column of productSheetColumns)
      Object.defineProperty(this.prototype, column.key, {
        get(this: SheetCells) {
          return this.#read(column);
        },
      });
  }
  #read(column: SheetColumn): ColumnCell {
    const cached = this.#cache?.get(column.key);
    if (cached) return cached;
    const label = sheetValue(this.#db, this.#row, column),
      raw = sheetRaw(this.#row, column);
    const value =
      column.kind === "date"
        ? raw
          ? calendarDay(String(raw))
          : null
        : column.kind === "integer" || column.kind === "decimal"
          ? raw == null
            ? null
            : String(raw)
          : label || null;
    const cell = {
      sortValue: value,
      values: [
        { key: value ?? EMPTY_VALUE, label: label || "Sin informar", value },
      ],
    };
    (this.#cache ??= new Map()).set(column.key, cell);
    return cell;
  }
}
export function buildProductSheet(
  db: Database,
  view: SheetView,
): ProductSheetRow[] {
  const orders = new Map(db.orden_compra.map((order) => [order.id, order]));
  const lots = new Map<string, lote_producto[]>();
  for (const lot of db.lote_producto) {
    const children = lots.get(lot.id_orden_producto) ?? [];
    children.push(lot);
    lots.set(lot.id_orden_producto, children);
  }
  const materialLines = new Map(
    db.orden_material.map((line) => [line.id, line]),
  );
  const materials = new Map(
    db.materiales.map((material) => [material.id, material]),
  );
  const supply = new Map<string, SupplyItem[]>();
  for (const link of db.abastecimiento_material) {
    const line = materialLines.get(link.id_orden_material),
      order = line && orders.get(line.id_orden_compra);
    if (line && order) {
      const items = supply.get(link.id_orden_producto) ?? [];
      items.push({
        order,
        material: materials.get(line.id_material)?.nombre_material ?? "",
        quantity: line.cantidad_solicitada,
        state: line.estado,
      });
      supply.set(link.id_orden_producto, items);
    }
  }
  const documents = new Map(
    db.documento
      .filter(
        (doc) =>
          doc.tipo_entidad === "orden_compra" &&
          doc.tipo_documento === "orden_compra_escaneada",
      )
      .map((doc) => [doc.id_entidad, doc.id]),
  );
  const rows: ProductSheetRow[] = [];
  for (const line of db.orden_producto) {
    const order = orders.get(line.id_orden_compra);
    if (
      !order ||
      order.tipo_orden !== "producto" ||
      (view === "no_autorizadas") !==
        (order.estado_autorizacion === "no_autorizada")
    )
      continue;
    const children = lots.get(line.id) ?? [],
      active = children.filter((lot) => lot.estado !== "anulado");
    const globalRemaining =
      line.cantidad_solicitada -
      active.reduce((sum, lot) => sum + (lot.cantidad_recibida ?? 0), 0);
    let received = 0;
    const append = (lot: lote_producto | undefined, first: boolean) => {
      const row: ProductSheetRow = {
        key: view === "no_autorizadas" ? `line:${line.id}` : `lot:${lot!.id}`,
        order,
        line,
        lot: view === "no_autorizadas" ? undefined : lot,
        initialLot: children[0],
        first,
        remaining: Math.max(0, line.cantidad_solicitada - received),
        excess: Math.max(0, received - line.cantidad_solicitada),
        globalRemaining,
        supply: supply.get(line.id) ?? [],
        documentId: documents.get(order.id),
        cells: {},
      };
      row.cells = new SheetCells(db, row);
      rows.push(row);
    };
    if (view === "no_autorizadas") append(undefined, true);
    else
      children.forEach((lot, index) => {
        if ((view === "anuladas") === (lot.estado === "anulado"))
          append(lot, index === 0);
        if (lot.estado !== "anulado") received += lot.cantidad_recibida ?? 0;
      });
  }
  return rows.sort(
    (a, b) =>
      Number(b.order.no_orden) - Number(a.order.no_orden) ||
      a.line.posicion - b.line.posicion,
  );
}
export function matchesSheetFilter(
  row: ProductSheetRow,
  filter: CustomFilterId | "",
  today: string,
): boolean {
  const lot = row.lot ?? row.initialLot;
  const received =
    !!lot && ((lot.cantidad_recibida ?? 0) > 0 || !!lot.fecha_recepcion);
  const delivery = calendarDay(row.order.fecha_solicitada_entrega);
  const open = lot?.estado === "en_seguimiento";
  switch (filter) {
    case "documento_con":
      return !!row.documentId;
    case "documento_sin":
      return !row.documentId;
    case "recepciones_sin_factura":
      return received && !lot?.id_factura;
    case "entrega_vencida":
      return !!delivery && delivery < today && open && row.globalRemaining > 0;
    case "proximas_7":
    case "proximas_15":
    case "proximas_30":
      return (
        !!delivery &&
        delivery >= today &&
        delivery <= addCalendarDays(today, Number(filter.slice(9))) &&
        open &&
        row.globalRemaining > 0
      );
    case "sin_recepciones":
      return !!lot && !received;
    case "batch_vencido":
      return (
        !!lot?.fecha_estimada_batch_record &&
        calendarDay(lot.fecha_estimada_batch_record)! < today &&
        !lot.fecha_entrega_batch_record &&
        open
      );
    case "recibido_sin_batch":
      return received && !lot?.fecha_entrega_batch_record;
    case "inspeccion_pendiente":
      return !!lot?.fecha_entrega_batch_record && !lot.fecha_inspeccion;
    case "recibidos_sin_inspeccion":
      return received && !lot?.fecha_inspeccion;
    case "confirmacion_pendiente":
      return received && !lot?.fecha_confirmacion;
    case "vinculos_con":
      return row.supply.length > 0;
    case "vinculos_sin":
      return !row.supply.length;
    case "ocm_pendientes":
      return (
        row.line.estado !== "anulada" &&
        row.supply.some((item) => item.state === "en_seguimiento")
      );
    default:
      return true;
  }
}
export function sheetTarget(
  row: ProductSheetRow,
  col: SheetColumn,
): Pick<SheetChange, "entity" | "id" | "field"> | null {
  return col.entity
    ? {
        entity: col.entity,
        id:
          col.entity === "orden_compra"
            ? row.order.id
            : col.entity === "orden_producto"
              ? row.line.id
              : (row.lot?.id ?? ""),
        field: col.field!,
      }
    : null;
}
export function cellPermission(
  db: Database,
  row: ProductSheetRow,
  col: SheetColumn,
): string | null {
  const target = sheetTarget(row, col);
  if (
    !target ||
    !target.id ||
    (col.key === "cantidad_solicitada" && !row.first)
  )
    return "Celda protegida: este valor es calculado o de solo lectura.";
  return sheetPermission(db, target);
}
export function parseSheetInput(
  db: Database,
  row: ProductSheetRow,
  col: SheetColumn,
  input: string,
): unknown {
  const field = col.field!,
    raw = input.trim();
  const nullable =
    col.entity && !meta.tables[col.entity].fields[field]?.required;
  if (!raw && nullable) return null;
  const reference =
    field === "id_producto"
      ? db.productos.map((p) => ({ id: p.id, labels: [p.nombre_producto] }))
      : field === "id_proveedor"
        ? db.proveedor
            .filter((provider) => provider.Es_maquila)
            .map((p) => ({
              id: p.id,
              labels: [p.nombre_corto, p.nombre_largo, p.nit],
            }))
        : field === "id_factura"
          ? db.factura
              .filter((f) => f.id_proveedor === row.order.id_proveedor)
              .map((f) => ({ id: f.id, labels: [f.numero_factura] }))
          : field === "ref_corrugado"
            ? db.materiales
                .filter(
                  (material) => materialRole(db, material.id) === "corrugado",
                )
                .map((m) => ({
                  id: m.id,
                  labels: [m.nombre_material, String(m.codigo_material ?? "")],
                }))
            : null;
  if (reference) {
    const found = reference.filter(
      (item) =>
        item.id === raw ||
        item.labels.some(
          (label) => label && canonical(label) === canonical(raw),
        ),
    );
    if (found.length !== 1)
      throw new Error(
        found.length
          ? "Referencia ambigua: selecciona una opción."
          : "Selecciona una referencia existente.",
      );
    return found[0].id;
  }
  if (col.kind === "date") {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? parseDateInput(raw.split("-").reverse().join("/"))
      : parseDateInput(raw);
    if (!date) throw new Error("Introduce una fecha válida (dd/mm/aaaa).");
    return `${date}T12:00:00.000Z`;
  }
  if (col.kind === "integer" || col.kind === "decimal") {
    let value = raw.replace(/[$\s]/g, "");
    if (value.includes(","))
      value = value.replaceAll(".", "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(value))
      value = value.replaceAll(".", "");
    if (!/^-?\d+(\.\d+)?$/.test(value))
      throw new Error("Introduce un número válido.");
    if (col.kind === "decimal") return decimal(value);
    const number = Number(value);
    if (!Number.isSafeInteger(number))
      throw new Error("Introduce una cantidad entera.");
    return number;
  }
  if (col.kind === "enum") {
    const spec = meta.tables.lote_producto.fields[field];
    const values = meta.enums[spec.type];
    const match = values?.find(
      (value) =>
        canonical(value) === canonical(raw) ||
        canonical(sheetEnumLabel(value)) === canonical(raw),
    );
    if (!match) throw new Error("Selecciona un estado válido.");
    return match;
  }
  return raw;
}
export type SheetCellIssue = {
  rowKey: string;
  column: string;
  message: string;
  protected?: boolean;
};
export function proposeSheetInput(
  db: Database,
  current: SheetChange[],
  inputs: { row: ProductSheetRow; column: SheetColumn; text: string }[],
): { changes: SheetChange[]; issues: SheetCellIssue[] } {
  const issues: SheetCellIssue[] = [],
    candidates: {
      change: SheetChange;
      row: ProductSheetRow;
      col: SheetColumn;
    }[] = [];
  for (const input of inputs) {
    const denied = cellPermission(db, input.row, input.column);
    if (denied) {
      issues.push({
        rowKey: input.row.key,
        column: input.column.key,
        message: denied,
        protected: true,
      });
      continue;
    }
    try {
      const target = sheetTarget(input.row, input.column)!;
      const prior = current.find(
        (change) => changeKey(change) === changeKey(target),
      );
      const expected = prior
        ? prior.expected
        : (db[target.entity].find((record) => record.id === target.id) as Row)[
            target.field
          ];
      candidates.push({
        change: {
          ...target,
          expected,
          value: parseSheetInput(db, input.row, input.column, input.text),
        },
        row: input.row,
        col: input.column,
      });
    } catch (error) {
      issues.push({
        rowKey: input.row.key,
        column: input.column.key,
        message: (error as Error).message,
      });
    }
  }
  const values = new Map<string, Set<string>>();
  candidates.forEach(({ change }) =>
    values.set(
      changeKey(change),
      new Set([
        ...(values.get(changeKey(change)) ?? []),
        JSON.stringify(change.value),
      ]),
    ),
  );
  const accepted = candidates.filter(({ change, row, col }) => {
    if (values.get(changeKey(change))!.size > 1) {
      issues.push({
        rowKey: row.key,
        column: col.key,
        message:
          "Valores contradictorios: estas filas comparten el mismo dato.",
      });
      return false;
    }
    return true;
  });
  const map = new Map(current.map((change) => [changeKey(change), change]));
  accepted.forEach(({ change }) => map.set(changeKey(change), change));
  const rejected = new Set<string>();
  for (let pass = 0; pass <= accepted.length; pass++) {
    const prospective = overlaySheetChanges(db, [...map.values()]);
    const invalid = new Map<string, Record<string, string>>();
    const eligible = accepted.filter(
      ({ change }) => !rejected.has(changeKey(change)),
    );
    for (const { change } of eligible) {
      const key = `${change.entity}/${change.id}`;
      if (!invalid.has(key))
        invalid.set(
          key,
          sheetRecordIssue(prospective, change.entity, change.id, db),
        );
    }
    let failures = eligible.filter(
      ({ change }) =>
        invalid.get(`${change.entity}/${change.id}`)![change.field],
    );
    const ownFields = failures.length > 0;
    if (!ownFields)
      failures = eligible.filter(
        ({ change }) =>
          change.entity === "lote_producto" &&
          invalid.get(`${change.entity}/${change.id}`)!.numero_lote,
      );
    if (!failures.length) break;
    for (const { change, row, col } of failures) {
      const problems = invalid.get(`${change.entity}/${change.id}`)!;
      issues.push({
        rowKey: row.key,
        column: col.key,
        message: ownFields ? problems[change.field] : problems.numero_lote,
      });
      rejected.add(changeKey(change));
      const old = current.find((item) => changeKey(item) === changeKey(change));
      if (old) map.set(changeKey(old), old);
      else map.delete(changeKey(change));
    }
  }
  return {
    changes: [...map.values()].filter(
      (change) =>
        JSON.stringify(change.value) !== JSON.stringify(change.expected),
    ),
    issues,
  };
}

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
