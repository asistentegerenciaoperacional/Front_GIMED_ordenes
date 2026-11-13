import type { Database, orden_compra } from "../shared/models";
import { canonical, meta, type Row } from "../shared/schema";
import {
  materialFieldPermission,
  materialSheetIndexes,
  materialSheetRecordIssues,
  overlayMaterialSheetChanges,
  type MaterialLine,
  type MaterialLineEntity,
  type MaterialSheetChange,
  type MaterialSheetEntity,
} from "../shared/material-order-sheet";
import { addCalendarDays, type CustomFilterId } from "./order-filters";
import { hasPhysicalReceipt } from "./order-read-model";
import {
  calendarDay,
  EMPTY_VALUE,
  type Column,
  type ColumnCell,
} from "./order-table";
import {
  proposeOrderSheetInput,
  sheetScalarInput,
  type SheetInput,
} from "./order-sheet-editing";
import type { SheetView } from "./order-sheet-editing";
import { money } from "./ui";

export type MaterialSheetColumn = Column<string> & {
  width: number;
  entity?: "orden_compra" | "line";
  field?: string;
};
const column = (
  key: string,
  label: string,
  kind: MaterialSheetColumn["kind"],
  width: number,
  entity?: MaterialSheetColumn["entity"],
  field = key,
): MaterialSheetColumn => ({ key, label, kind, width, entity, field });
const columns = [
  column("no_orden", "No. de OCM", "integer", 115),
  column("tipo", "Tipo", "enum", 96),
  column("id_factura", "Factura", "text", 124, "line"),
  column("id_lote_material", "Lote", "text", 130, "line"),
  column("codigo_maia", "Código MAIA", "text", 130),
  column("item", "Material o concepto", "text", 260, "line"),
  column("cantidad_solicitada", "Cantidad solicitada", "integer", 160, "line"),
  column("cantidad_recibida", "Cantidad recibida", "integer", 154, "line"),
  column("precio_unitario", "Precio unitario", "decimal", 150, "line"),
  column("id_proveedor", "Proveedor", "text", 190),
  column(
    "fecha_elaboracion",
    "Fecha de elaboración",
    "date",
    176,
    "orden_compra",
  ),
  column(
    "fecha_solicitada_entrega",
    "Entrega solicitada",
    "date",
    164,
    "orden_compra",
  ),
  column("fecha_estimada_entrega", "Entrega estimada", "date", 158, "line"),
  column("fecha_entrega", "Fecha de recepción", "date", 168, "line"),
  column("ubicacion", "Ubicación", "text", 170, "line", "id_direccion"),
  column("vinculos", "OC vinculadas", "text", 170),
];
const pendingColumns = columns.filter(
  ({ key }) =>
    ![
      "id_factura",
      "id_lote_material",
      "cantidad_recibida",
      "fecha_entrega",
      "ubicacion",
      "vinculos",
    ].includes(key),
);
export const materialSheetColumns = (view: SheetView) =>
  view === "no_autorizadas" ? pendingColumns : columns;

export type MaterialSheetRow = {
  key: string;
  entity: MaterialLineEntity;
  order: orden_compra;
  line: MaterialLine;
  links: { id: string; number: string; products: string[] }[];
  documentId?: string;
  cells: Record<string, ColumnCell>;
};
const numbers = new Intl.NumberFormat("es-CO");
export function materialRaw(
  row: MaterialSheetRow,
  col: MaterialSheetColumn,
): unknown {
  if (col.key === "item")
    return "id_material" in row.line ? row.line.id_material : row.line.producto;
  if (col.key === "tipo") return row.order.tipo_orden;
  if (col.key === "no_orden") return row.order.no_orden;
  return ((col.entity === "orden_compra" ? row.order : row.line) as Row)[
    col.field!
  ];
}
export function materialValue(
  db: Database,
  row: MaterialSheetRow,
  col: MaterialSheetColumn,
): string {
  const index = materialSheetIndexes(db);
  const line = row.line;
  if (col.key === "item")
    return "id_material" in line
      ? (index.materials.get(line.id_material)?.nombre_material ?? "")
      : line.producto;
  if (col.key === "tipo")
    return row.entity === "orden_material" ? "Material" : "Otros";
  if (col.key === "id_proveedor") {
    const provider = index.providers.get(row.order.id_proveedor);
    return provider?.nombre_corto ?? provider?.nombre_largo ?? "";
  }
  if (col.key === "id_factura")
    return index.invoices.get(line.id_factura ?? "")?.numero_factura ?? "";
  if (col.key === "ubicacion") return line.ubicacion ?? "";
  if (col.key === "vinculos")
    return row.links.map(({ number }) => number).join(", ");
  if (col.key === "id_lote_material")
    return "id_lote_material" in line
      ? (index.lots.get(line.id_lote_material ?? "")?.numero_lote ?? "")
      : "";
  if (col.key === "codigo_maia") {
    const code =
      "id_material" in line
        ? index.materials.get(line.id_material)?.codigo_material
        : null;
    return code == null ? "" : String(code).padStart(3, "0");
  }
  const raw = materialRaw(row, col);
  if (raw == null) return "";
  if (col.kind === "date")
    return (calendarDay(String(raw)) ?? "").split("-").reverse().join("/");
  if (col.kind === "decimal") return money(String(raw));
  if (col.kind === "integer" && col.key !== "no_orden")
    return numbers.format(Number(raw));
  return String(raw);
}
class MaterialCells {
  [key: string]: ColumnCell;
  #cache?: Map<string, ColumnCell>;
  #db: Database;
  #row: MaterialSheetRow;
  constructor(db: Database, row: MaterialSheetRow) {
    this.#db = db;
    this.#row = row;
  }
  static {
    for (const col of columns)
      Object.defineProperty(this.prototype, col.key, {
        get(this: MaterialCells) {
          return this.#get(col);
        },
      });
  }
  #get(col: MaterialSheetColumn): ColumnCell {
    const existing = this.#cache?.get(col.key);
    if (existing) return existing;
    const label = materialValue(this.#db, this.#row, col);
    const raw = materialRaw(this.#row, col);
    const value =
      col.kind === "date"
        ? calendarDay(raw == null ? null : String(raw))
        : ["integer", "decimal"].includes(col.kind)
          ? raw == null
            ? null
            : String(raw)
          : label || null;
    const values =
      col.key === "vinculos" && this.#row.links.length
        ? this.#row.links.map(({ number }) => ({
            key: number,
            label: number,
            value: number,
          }))
        : [
            {
              key: value ?? EMPTY_VALUE,
              label: label || "Sin informar",
              value,
            },
          ];
    const cell = { sortValue: value, values };
    (this.#cache ??= new Map()).set(col.key, cell);
    return cell;
  }
}

export function buildMaterialSheet(
  db: Database,
  view: SheetView,
): MaterialSheetRow[] {
  const index = materialSheetIndexes(db);
  const documents = new Map(
    db.documento
      .filter(
        (doc) =>
          doc.tipo_entidad === "orden_compra" &&
          doc.tipo_documento === "orden_compra_escaneada",
      )
      .map((doc) => [doc.id_entidad, doc.id]),
  );
  const rows: MaterialSheetRow[] = [];
  for (const entity of ["orden_material", "orden_otro"] as const) {
    for (const line of db[entity]) {
      const order = index.orders.get(line.id_orden_compra);
      if (
        !order ||
        order.tipo_orden !==
          (entity === "orden_material" ? "material" : "otro") ||
        (order.estado_autorizacion === "no_autorizada") !==
          (view === "no_autorizadas") ||
        (view !== "no_autorizadas" &&
          (line.estado === "anulada") !== (view === "anuladas"))
      )
        continue;
      const links = new Map<string, MaterialSheetRow["links"][number]>();
      if (entity === "orden_material")
        for (const productLineId of index.originsByLine.get(line.id) ?? []) {
          const source = index.productLines.get(productLineId);
          const origin = source && index.orders.get(source.id_orden_compra);
          if (!source || !origin) continue;
          const link = links.get(origin.id) ?? {
            id: origin.id,
            number: origin.no_orden,
            products: [],
          };
          const name = index.products.get(source.id_producto)?.nombre_producto;
          if (name && !link.products.includes(name)) link.products.push(name);
          links.set(origin.id, link);
        }
      const row: MaterialSheetRow = {
        key: `${entity}:${line.id}`,
        entity,
        line,
        order,
        documentId: documents.get(order.id),
        links: [...links.values()],
        cells: {},
      };
      row.cells = new MaterialCells(db, row);
      rows.push(row);
    }
  }
  return rows.sort(
    (a, b) =>
      Number(b.order.no_orden) - Number(a.order.no_orden) ||
      a.line.posicion - b.line.posicion,
  );
}

export function matchesMaterialSheetFilter(
  row: MaterialSheetRow,
  filter: CustomFilterId | "",
  today: string,
) {
  const received = hasPhysicalReceipt(
    row.line.cantidad_recibida,
    row.line.fecha_entrega,
  );
  const deadline = calendarDay(row.order.fecha_solicitada_entrega);
  const pending =
    row.line.estado === "en_seguimiento" &&
    row.line.cantidad_solicitada > (row.line.cantidad_recibida ?? 0);
  switch (filter) {
    case "documento_con":
      return !!row.documentId;
    case "documento_sin":
      return !row.documentId;
    case "recepciones_sin_factura":
      return received && !row.line.id_factura;
    case "sin_recepciones":
      return !received;
    case "entrega_vencida":
      return pending && !!deadline && deadline < today;
    case "proximas_7":
    case "proximas_15":
    case "proximas_30":
      return (
        pending &&
        !!deadline &&
        deadline >= today &&
        deadline <= addCalendarDays(today, Number(filter.slice(9)))
      );
    case "vinculos_con":
      return row.entity === "orden_material" && row.links.length > 0;
    case "vinculos_sin":
      return row.entity === "orden_material" && row.links.length === 0;
    default:
      return true;
  }
}

export function materialTarget(
  row: MaterialSheetRow,
  col: MaterialSheetColumn,
) {
  const entity: MaterialSheetEntity =
    col.entity === "orden_compra" ? "orden_compra" : row.entity;
  const id = entity === "orden_compra" ? row.order.id : row.line.id;
  const field =
    col.key === "item"
      ? row.entity === "orden_material"
        ? "id_material"
        : "producto"
      : col.field!;
  return { entity, id, field };
}
export function materialCellPermission(
  row: MaterialSheetRow,
  col: MaterialSheetColumn,
) {
  if (!col.entity) return "Celda protegida: este dato es de solo lectura.";
  const target = materialTarget(row, col);
  return materialFieldPermission(row.order, target.entity, target.field);
}
function parseInput(
  db: Database,
  row: MaterialSheetRow,
  col: MaterialSheetColumn,
  input: string,
) {
  const { entity, field } = materialTarget(row, col);
  const raw = input.trim();
  if (!raw && !meta.tables[entity].fields[field].required) return null;
  const index = materialSheetIndexes(db);
  if (field === "id_direccion" && raw === row.line.id_direccion) return raw;
  const references =
    field === "id_material"
      ? [...index.materials.values()].map((m) => ({
          id: m.id,
          labels: [
            m.nombre_material,
            m.codigo_material == null
              ? ""
              : String(m.codigo_material).padStart(3, "0"),
          ],
        }))
      : field === "id_lote_material"
        ? [...index.lots.values()].map((l) => ({
            id: l.id,
            labels: [l.numero_lote],
          }))
        : field === "id_factura"
          ? [...index.invoices.values()]
              .filter((f) => f.id_proveedor === row.order.id_proveedor)
              .map((f) => ({ id: f.id, labels: [f.numero_factura] }))
          : field === "id_direccion"
            ? [...index.addresses.values()].map((a) => ({
                id: a.id,
                labels: [a.nombre_dir],
              }))
            : null;
  if (references) {
    const exact = references.find((item) => item.id === raw);
    if (exact) return exact.id;
    const found = references.filter((item) =>
      item.labels.some((label) => label && canonical(label) === canonical(raw)),
    );
    if (found.length !== 1)
      throw new Error(
        found.length
          ? "Referencia ambigua: selecciona una opción."
          : "Selecciona una referencia existente y compatible.",
      );
    return found[0].id;
  }
  return sheetScalarInput(col.kind, raw);
}
export function proposeMaterialSheetInput(
  db: Database,
  current: MaterialSheetChange[],
  inputs: SheetInput<MaterialSheetRow, MaterialSheetColumn>[],
) {
  return proposeOrderSheetInput(db, current, inputs, {
    permission: (snapshot, row, col) => {
      const index = materialSheetIndexes(snapshot);
      const order = index.orders.get(row.order.id);
      const line = (
        row.entity === "orden_material" ? index.materialLines : index.otherLines
      ).get(row.line.id);
      if (!order || !line || line.id_orden_compra !== order.id)
        return "El renglón ya no está disponible.";
      return materialCellPermission(
        order === row.order ? row : { ...row, order },
        col,
      );
    },
    target: materialTarget,
    expected: (db, { entity, id, field }) => {
      const index = materialSheetIndexes(db);
      const row =
        entity === "orden_compra"
          ? index.orders.get(id)
          : entity === "orden_material"
            ? index.materialLines.get(id)
            : index.otherLines.get(id);
      return (row as Row | undefined)?.[field];
    },
    parse: (snapshot, row, col, text) => {
      const order =
        materialSheetIndexes(snapshot).orders.get(row.order.id) ?? row.order;
      return parseInput(
        snapshot,
        order === row.order ? row : { ...row, order },
        col,
        text,
      );
    },
    overlay: overlayMaterialSheetChanges,
    validate: (next, target, original) =>
      materialSheetRecordIssues(next, target.entity, target.id, original),
    relatedError: (_target, issues) => Object.values(issues)[0],
  });
}
