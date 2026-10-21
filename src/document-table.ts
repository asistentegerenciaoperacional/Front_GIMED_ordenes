import type { Database, documento } from "../shared/models";
import { orderReference } from "../shared/schema";
import {
  calendarDay,
  type Column,
  type ColumnCell,
  type ColumnRow,
} from "./order-table";
import { shortDate, text } from "./ui";

export type DocumentColumnKey =
  "documento" | "propietario" | "clase" | "cargado";

export const documentColumns: Column<DocumentColumnKey>[] = [
  { key: "documento", label: "Documento", kind: "text" },
  { key: "propietario", label: "Propietario", kind: "text" },
  { key: "clase", label: "Clase", kind: "enum" },
  { key: "cargado", label: "Cargado", kind: "date" },
];

export type DocumentTableRow = ColumnRow<DocumentColumnKey> & {
  document: documento;
  owner: string | null;
  searchText: string;
};

function cell(value: string | null, label = value ?? "Sin valor"): ColumnCell {
  return {
    sortValue: value,
    values: [{ key: value ?? "__sin_valor__", label, value }],
  };
}

export function buildDocumentRows(db: Database): DocumentTableRow[] {
  return db.documento.map((document) => {
    const order =
      document.tipo_entidad === "orden_compra"
        ? db.orden_compra.find((row) => row.id === document.id_entidad)
        : undefined;
    const owner =
      document.tipo_entidad === "factura"
        ? (db.factura.find((row) => row.id === document.id_entidad)
            ?.numero_factura ?? null)
        : document.tipo_entidad === "orden_compra"
          ? order
            ? orderReference(order.tipo_orden, order.no_orden)
            : "Orden no disponible"
          : document.tipo_entidad === "lote_material"
            ? (db.lote_material.find((row) => row.id === document.id_entidad)
                ?.numero_lote ?? null)
            : "Global";
    const day = calendarDay(document.fecha_carga);
    return {
      document,
      owner,
      searchText:
        `${document.nombre_archivo} ${text(document.tipo_documento)}`.toLocaleLowerCase(
          "es-CO",
        ),
      cells: {
        documento: cell(document.nombre_archivo),
        propietario: cell(owner),
        clase: cell(document.tipo_documento, text(document.tipo_documento)),
        cargado: cell(day, day ? shortDate(document.fecha_carga) : "Sin fecha"),
      },
    };
  });
}
