import { useState } from "react";
import {I18nProvider} from "react-aria-components/I18nProvider";
import {ConfirmationProvider} from "../src/components/overlays";
import "../src/components/aria.css";
import { createRoot } from "react-dom/client";
import { makeSeed, sid } from "../shared/seed";
import {
  blankRow,
  normalizeInvoice,
  schemas,
  type Row,
} from "../shared/schema";
import { ApiError, AppContext } from "../src/ui";
import {
  CatalogForm,
  InvoiceForm,
  LotForm,
  OrderForm,
  ReceiptForm,
} from "../src/forms";
import { ColumnHeader } from "../src/column-filter";
import { orderColumns } from "../src/order-table";
import "../src/styles.css";
import {DataTable,TableHead,TableRow,TableRows} from "../src/components/data-table";
import {AriaControlsFixture} from "./aria-controls.fixture";

function Fixture() {
  const [db] = useState(makeSeed);
  const [closed, setClosed] = useState(false);
  const [open, setOpen] = useState(false);
  const fixture = new URL(location.href).searchParams.get("fixture") ?? "order";
  // These operations only produce validation responses; no state file or real service is used.
  const run = async (name: string, payload: Row): Promise<Row> => {
    if (name === "saveReceipt") {
      const parsed = schemas.orden_otro.safeParse(payload.row);
      if (!parsed.success)
        throw new ApiError({
          message: "Revisa la recepción.",
          fields: Object.fromEntries(
            parsed.error.issues.map((issue) => [
              issue.path.join("."),
              issue.message,
            ]),
          ),
        });
    }
    if (name === "saveLot") {
      const parsed = schemas.lote_producto.safeParse({
        ...blankRow("lote_producto"),
        ...payload.row,
        id: sid(9999),
      });
      if (!parsed.success)
        throw new ApiError({
          message: "Revisa el lote.",
          code: "TYPE",
          fields: Object.fromEntries(
            parsed.error.issues.map((issue) => [
              issue.path.join("."),
              issue.message,
            ]),
          ),
        });
    }
    if (name === "createInvoice") {
      const fields: Row = {};
      if (!db.proveedor.some((row) => row.id === payload.id_proveedor))
        fields.id_proveedor = "Selecciona un proveedor.";
      const number = normalizeInvoice(payload.numero_factura);
      if (
        !number ||
        db.factura.some(
          (row) =>
            row.id_proveedor === payload.id_proveedor &&
            row.numero_factura === number,
        )
      )
        fields.numero_factura = "Revisa el número de factura.";
      if (Object.keys(fields).length)
        throw new ApiError({ message: "Revisa la factura.", fields });
    }
    throw new ApiError({ message: "Esta comprobación no guarda registros." });
  };
  const close = () => setClosed(true);
  return (
    <AppContext.Provider
      value={{ db, run, notify: () => {}, navigate: () => {} }}
    >
      {fixture==='aria' ? <AriaControlsFixture/> : closed ? (
        <p>Formulario cerrado</p>
      ) : fixture === "receipt-other" ? (
        <ReceiptForm entity="orden_otro" line={db.orden_otro[0]} onClose={close} />
      ) : fixture === "contact" ? (
        <CatalogForm entity="contacto_interno" onClose={close} />
      ) : fixture === "maia" ? (
        <CatalogForm entity="materiales" onClose={close} />
      ) : fixture === "lot" ? (
        <LotForm
          line={db.orden_producto.find((row) => row.id === sid(110))!}
          onClose={close}
        />
      ) : fixture === "invoice" ? (
        <InvoiceForm onClose={close} />
      ) : fixture.startsWith("filter") ? (
        <DataTable>
          <TableHead>
            <TableRow>
              <ColumnHeader
                column={orderColumns.find((column) =>
                  fixture === "filter-date"
                    ? column.kind === "date"
                    : column.key === "total",
                )!}
                options={[
                  { key: "100.00", label: "$ 100,00", value: "100.00" },
                ]}
                open={open}
                onOpen={() => setOpen(true)}
                onClose={() => setOpen(false)}
                onFilter={() => {}}
                onSort={() => {}}
              />
            </TableRow>
          </TableHead>
          <TableRows />
        </DataTable>
      ) : (
        <OrderForm onClose={close} />
      )}
    </AppContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<I18nProvider locale="es-CO"><ConfirmationProvider><Fixture /></ConfirmationProvider></I18nProvider>);
