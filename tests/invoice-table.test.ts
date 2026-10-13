import test from "node:test";
import assert from "node:assert/strict";
import { makeSeed, sid } from "../shared/seed";
import {
  buildInvoiceRows,
  searchInvoiceRows,
  invoiceColumns,
  invoiceDocumentOptions,
  type InvoiceColumnKey,
} from "../src/invoice-table";
import {
  columnOptions,
  filterProblem,
  filterTableRows,
  readColumnState,
  sortTableRows,
  tableParams,
  type TableState,
} from "../src/order-table";

const column = (key: InvoiceColumnKey) =>
  invoiceColumns.find((col) => col.key === key)!;
function fixture() {
  const db = makeSeed();
  db.factura = [
    {
      id: sid(900),
      id_proveedor: sid(1),
      numero_factura: "AUR-00128",
      fecha_registro: "2026-10-02T00:30:00.000Z",
    },
    {
      id: sid(901),
      id_proveedor: sid(1),
      numero_factura: "AUR-128",
      fecha_registro: "2026-10-02T12:00:00.000Z",
    },
    {
      id: sid(902),
      id_proveedor: sid(3),
      numero_factura: "ENV-00412",
      fecha_registro: "2026-10-10T12:00:00.000Z",
    },
    {
      id: sid(903),
      id_proveedor: sid(2),
      numero_factura: "AND-00001",
      fecha_registro: "2026-09-30T12:00:00.000Z",
    },
  ];
  const document = db.documento.find((row) => row.tipo_entidad === "factura")!;
  db.documento = [{ ...document, id: sid(910), id_entidad: sid(900) }];
  const receipts = [
    { invoice: sid(900) },
    { invoice: sid(900) },
    ...Array.from({ length: 12 }, () => ({ invoice: sid(902) })),
    { invoice: null },
  ];
  return { db, receipts, rows: buildInvoiceRows(db, receipts) };
}
const numbers = (rows: ReturnType<typeof buildInvoiceRows>) =>
  rows.map((row) => row.invoice.numero_factura);

test("facturas: búsqueda normalizada por número, proveedor y datos de lotes asociados", () => {
  const { db, receipts } = fixture();
  const before = structuredClone(db);
  const rows = buildInvoiceRows(
    db,
    receipts.map((receipt) => ({
      ...receipt,
      label:
        receipt.invoice === sid(900)
          ? "OC 2801 · PRO-26-018 · Crema corporal · Aurora"
          : "OCM 1601 · MAT-26-001 · Envase ámbar · Envases del Norte",
    })),
  );
  for (const query of [
    "\u200B aur-00128 \u200B",
    "oc 2801",
    "pro-26-018",
    "Crema corporal",
  ])
    assert.deepEqual(
      numbers(searchInvoiceRows(rows, query)),
      ["AUR-00128"],
      query,
    );
  assert.deepEqual(numbers(searchInvoiceRows(rows, "AUR-128")), ["AUR-128"]);
  assert.deepEqual(
    numbers(searchInvoiceRows(rows, "  laboratorios aurora  ")),
    ["AUR-00128", "AUR-128"],
  );
  assert.deepEqual(numbers(searchInvoiceRows(rows, "ocm 1601")), ["ENV-00412"]);
  assert.equal(searchInvoiceRows(rows, "").length, rows.length);
  assert.equal(searchInvoiceRows(rows, "factura inexistente").length, 0);
  assert.deepEqual(db, before);
});

test("facturas: búsqueda y filtros comparten resultados, conservando ordenamiento numérico", () => {
  const { rows } = fixture();
  const searched = searchInvoiceRows(rows, "Aurora");
  assert.deepEqual(
    numbers(
      filterTableRows(searched, invoiceColumns, {
        recepciones: { operator: "equals", value: "0" },
      }),
    ),
    ["AUR-128"],
  );
  assert.deepEqual(
    numbers(
      sortTableRows(searched, invoiceColumns, {
        column: "recepciones",
        direction: "desc",
      }),
    ),
    ["AUR-00128", "AUR-128"],
  );
  assert.equal(columnOptions(searched, column("proveedor")).length, 1);
});

test("facturas: columnas basadas en proveedor, día visible, recepciones y documento propio", () => {
  const { db, receipts, rows } = fixture();
  const before = structuredClone(db);
  assert.equal(rows[0].provider?.nombre_corto, "Aurora");
  assert.equal(rows[0].cells.registro.sortValue, "2026-10-01");
  assert.deepEqual(
    rows.map((row) => row.receiptCount),
    [2, 0, 12, 0],
  );
  assert.deepEqual(
    rows.map((row) => row.cells.documentos.values[0].key),
    ["con_documento", "sin_documento", "sin_documento", "sin_documento"],
  );
  db.documento[0].tipo_entidad = "orden_compra";
  assert.equal(buildInvoiceRows(db, receipts)[0].document, undefined);
  db.documento = before.documento;
  assert.deepEqual(db, before);
});

test("facturas: texto normalizado conserva ceros y signos y permite consultar proveedor por NIT", () => {
  const { rows } = fixture();
  assert.deepEqual(
    numbers(
      filterTableRows(rows, invoiceColumns, {
        numero: { operator: "equals", value: "\u200B aur-00128 \u200B" },
      }),
    ),
    ["AUR-00128"],
  );
  assert.deepEqual(
    numbers(
      filterTableRows(rows, invoiceColumns, {
        numero: { operator: "equals", value: "AUR-128" },
      }),
    ),
    ["AUR-128"],
  );
  assert.deepEqual(
    numbers(
      filterTableRows(rows, invoiceColumns, {
        numero: { operator: "starts_with", value: "aur-" },
      }),
    ),
    ["AUR-00128", "AUR-128"],
  );
  assert.deepEqual(
    numbers(
      filterTableRows(rows, invoiceColumns, {
        proveedor: { operator: "contains", value: "900123403" },
      }),
    ),
    ["ENV-00412"],
  );
  assert.deepEqual(
    numbers(
      filterTableRows(rows, invoiceColumns, {
        proveedor: { operator: "not_contains", value: "aurora" },
      }),
    ),
    ["ENV-00412", "AND-00001"],
  );
});

test("facturas: fechas comparadas por día de Bogotá con límites inclusivos", () => {
  const { rows } = fixture();
  assert.deepEqual(
    numbers(
      filterTableRows(rows, invoiceColumns, {
        registro: {
          operator: "between",
          value: "01/10/2026",
          end: "02/10/2026",
        },
      }),
    ),
    ["AUR-00128", "AUR-128"],
  );
  assert.deepEqual(
    numbers(
      filterTableRows(rows, invoiceColumns, {
        registro: { operator: "less", value: "2026-10-01" },
      }),
    ),
    ["AND-00001"],
  );
  assert.ok(
    filterProblem(column("registro"), {
      operator: "between",
      value: "02/10/2026",
      end: "01/10/2026",
    }),
  );
  assert.ok(
    filterProblem(column("registro"), {
      operator: "equals",
      value: "31/02/2026",
    }),
  );
});

test("facturas: recepciones admite cero y condiciones de enteros", () => {
  const { rows } = fixture();
  assert.deepEqual(
    numbers(
      filterTableRows(rows, invoiceColumns, {
        recepciones: { operator: "equals", value: "0" },
      }),
    ),
    ["AUR-128", "AND-00001"],
  );
  assert.deepEqual(
    numbers(
      filterTableRows(rows, invoiceColumns, {
        recepciones: { operator: "greater", value: "2" },
      }),
    ),
    ["ENV-00412"],
  );
  assert.deepEqual(
    numbers(
      filterTableRows(rows, invoiceColumns, {
        recepciones: { operator: "between", value: "2", end: "12" },
      }),
    ),
    ["AUR-00128", "ENV-00412"],
  );
  assert.ok(
    filterProblem(column("recepciones"), { operator: "equals", value: "1.5" }),
  );
});

test("facturas: selección múltiple y filtros de distintas columnas se combinan", () => {
  const { rows } = fixture();
  const filters = {
    proveedor: { selected: [sid(1), sid(2)] },
    recepciones: { selected: ["0"] },
    documentos: { selected: ["sin_documento"] },
  };
  assert.deepEqual(numbers(filterTableRows(rows, invoiceColumns, filters)), [
    "AUR-128",
    "AND-00001",
  ]);
  assert.deepEqual(
    numbers(
      filterTableRows(rows, invoiceColumns, {
        ...filters,
        numero: { selected: [] },
      }),
    ),
    [],
  );
  assert.deepEqual(
    numbers(
      filterTableRows(rows, invoiceColumns, {
        documentos: { selected: ["con_documento"] },
      }),
    ),
    ["AUR-00128"],
  );
  assert.deepEqual(
    invoiceDocumentOptions.map((option) => option.label),
    ["Con documento", "Sin documento"],
  );
  assert.ok(
    filterProblem(column("documentos"), {
      operator: "equals",
      value: "con_documento",
    }),
  );
});

test("facturas: ordenamiento de texto, fechas y números, sin modificar las filas de origen", () => {
  const { rows } = fixture();
  const original = numbers(rows);
  assert.deepEqual(
    numbers(
      sortTableRows(rows, invoiceColumns, {
        column: "numero",
        direction: "asc",
      }),
    ),
    ["AND-00001", "AUR-00128", "AUR-128", "ENV-00412"],
  );
  assert.deepEqual(
    numbers(
      sortTableRows(rows, invoiceColumns, {
        column: "proveedor",
        direction: "desc",
      }),
    ),
    ["ENV-00412", "AUR-00128", "AUR-128", "AND-00001"],
  );
  assert.deepEqual(
    sortTableRows(rows, invoiceColumns, {
      column: "recepciones",
      direction: "asc",
    }).map((row) => row.receiptCount),
    [0, 0, 2, 12],
  );
  assert.deepEqual(
    numbers(
      sortTableRows(rows, invoiceColumns, {
        column: "registro",
        direction: "desc",
      }),
    ),
    ["ENV-00412", "AUR-128", "AUR-00128", "AND-00001"],
  );
  assert.equal(
    sortTableRows(rows, invoiceColumns, {
      column: "documentos",
      direction: "asc",
    }),
    rows,
  );
  assert.deepEqual(numbers(rows), original);
});

test("facturas: URL recupera filtros y ordenamiento válidos y limita Documentos a presencia", () => {
  const state: TableState<InvoiceColumnKey> = {
    filters: {
      numero: { operator: "contains", value: "AUR-" },
      documentos: { selected: ["sin_documento"] },
    },
    sort: { column: "recepciones", direction: "desc" },
  };
  assert.deepEqual(
    readColumnState(new URLSearchParams(tableParams(state)), invoiceColumns),
    state,
  );
  const invalid = new URLSearchParams({
    filtros: JSON.stringify({
      documentos: {
        selected: ["con_documento"],
        operator: "equals",
        value: "con_documento",
      },
      recepciones: { operator: "contains", value: "0" },
      orden: { selected: ["2801"] },
    }),
    ordenar: "documentos",
    direccion: "asc",
  });
  assert.deepEqual(readColumnState(invalid, invoiceColumns), {
    filters: { documentos: { selected: ["con_documento"] } },
    sort: undefined,
  });
  assert.deepEqual(
    readColumnState(
      new URLSearchParams("filtros=invalid&ordenar=desconocido&direccion=asc"),
      invoiceColumns,
    ),
    { filters: {}, sort: undefined },
  );
});

test("facturas: opciones de columna consideran las demás condiciones y agrupan valores repetidos", () => {
  const { rows } = fixture();
  const filtered = filterTableRows(
    rows,
    invoiceColumns,
    {
      proveedor: { selected: [sid(1)] },
      recepciones: { operator: "equals", value: "0" },
    },
    "proveedor",
  );
  assert.deepEqual(
    columnOptions(filtered, column("proveedor")).map((option) => option.label),
    ["Andina", "Aurora"],
  );
  assert.deepEqual(
    columnOptions(rows, column("recepciones")).map((option) => option.value),
    ["0", "2", "12"],
  );
});
