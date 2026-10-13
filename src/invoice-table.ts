import type { Database } from "../shared/models";
import { normalizeInvoice } from "../shared/schema";
import {
  calendarDay,
  EMPTY_VALUE,
  type Column,
  type ColumnRow,
  type ColumnValue,
} from "./order-table";

export type InvoiceColumnKey =
  "numero" | "proveedor" | "registro" | "recepciones" | "documentos";

export const invoiceColumns: Column<InvoiceColumnKey>[] = [
  {
    key: "numero",
    label: "Número de factura",
    kind: "text",
    normalizeText: normalizeInvoice,
  },
  { key: "proveedor", label: "Proveedor", kind: "text" },
  { key: "registro", label: "Registro", kind: "date" },
  { key: "recepciones", label: "Recepciones", kind: "integer" },
  { key: "documentos", label: "Documentos", kind: "enum", selectionOnly: true },
];

export const invoiceDocumentOptions: ColumnValue[] = [
  { key: "con_documento", label: "Con documento", value: "con_documento" },
  { key: "sin_documento", label: "Sin documento", value: "sin_documento" },
];

export type InvoiceTableRow = ColumnRow<InvoiceColumnKey> & {
  invoice: Database["factura"][number];
  provider: Database["proveedor"][number] | undefined;
  receiptCount: number;
  document: Database["documento"][number] | undefined;
  searchText: string;
};

export function searchInvoiceRows(
  rows: InvoiceTableRow[],
  query: string,
): InvoiceTableRow[] {
  const normalized = normalizeInvoice(query);
  return rows.filter((row) => row.searchText.includes(normalized));
}

export function buildInvoiceRows(
  db: Database,
  receipts: readonly { invoice?: string | null; label?: string }[],
): InvoiceTableRow[] {
  const counts = new Map<string, number>();
  const receiptLabels = new Map<string, string[]>();
  for (const receipt of receipts)
    if (receipt.invoice) {
      counts.set(receipt.invoice, (counts.get(receipt.invoice) ?? 0) + 1);
      if (receipt.label) {
        const labels = receiptLabels.get(receipt.invoice) ?? [];
        labels.push(receipt.label);
        receiptLabels.set(receipt.invoice, labels);
      }
    }
  const providers = new Map(db.proveedor.map((row) => [row.id, row]));
  const documents = new Map(
    db.documento
      .filter(
        (row) =>
          row.tipo_entidad === "factura" &&
          row.tipo_documento === "factura_fisica",
      )
      .map((row) => [row.id_entidad, row]),
  );
  return db.factura.map((invoice) => {
    const provider = providers.get(invoice.id_proveedor);
    const supplierName =
      provider?.nombre_corto ?? provider?.nombre_largo ?? "Sin proveedor";
    const document = documents.get(invoice.id);
    const day = calendarDay(invoice.fecha_registro);
    const receiptCount = counts.get(invoice.id) ?? 0;
    const documentValue = invoiceDocumentOptions[document ? 0 : 1];
    return {
      invoice,
      provider,
      receiptCount,
      document,
      searchText: normalizeInvoice(
        [
          invoice.numero_factura,
          provider?.nombre_corto,
          provider?.nombre_largo,
          ...(receiptLabels.get(invoice.id) ?? []),
        ].join(" "),
      ),
      cells: {
        numero: {
          sortValue: invoice.numero_factura,
          values: [
            {
              key: invoice.numero_factura,
              label: invoice.numero_factura,
              value: invoice.numero_factura,
            },
          ],
        },
        proveedor: {
          sortValue: supplierName,
          searchValues: [
            provider?.nombre_corto,
            provider?.nombre_largo,
            provider?.nit,
          ].filter((value): value is string => !!value),
          values: [
            {
              key: invoice.id_proveedor,
              label: supplierName,
              value: supplierName,
            },
          ],
        },
        registro: {
          sortValue: day,
          values: [
            {
              key: day ?? EMPTY_VALUE,
              label: day ? day.split("-").reverse().join("/") : "Sin fecha",
              value: day,
            },
          ],
        },
        recepciones: {
          sortValue: String(receiptCount),
          values: [
            {
              key: String(receiptCount),
              label: String(receiptCount),
              value: String(receiptCount),
            },
          ],
        },
        documentos: { sortValue: null, values: [documentValue] },
      },
    };
  });
}
