import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Barcode,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  FileText,
  History,
  Info,
  Paperclip,
  PackagePlus,
  Plus,
  Search,
  Send,
  Settings2,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { codigos_barras } from "../shared/models";
import { assignedBarcode } from "../shared/schema";
import {
  orderReference,
  tolerance,
  type Entity,
  type Row,
} from "../shared/schema";
import { CatalogTable } from "./catalogs";
import { ColumnHeader } from "./column-filter";
import {
  CheckChoice,
  ChoiceGroup,
  ControlForm,
  ControlInput,
  ControlLink,
  CustomFilterSelect,
} from "./components/controls";
import {
  DataTable,
  TableCell,
  TableColumn,
  TableHead,
  TableRow,
  TableRows,
} from "./components/data-table";
import { Documents, InvoiceForm, MailForm, receipts } from "./forms";
import {
  buildDocumentRows,
  documentColumns,
  type DocumentColumnKey,
} from "./document-table";
import {
  buildInvoiceRows,
  invoiceColumns,
  invoiceDocumentOptions,
  searchInvoiceRows,
  type InvoiceColumnKey,
} from "./invoice-table";
import { entityValidation } from "./live-validation";
import {
  calendarDay,
  columnOptions,
  filterTableRows,
  hasFilter,
  readColumnState,
  sortTableRows,
  tableParams,
  type Column,
  type ColumnCell,
  type ColumnFilter,
  type ColumnRow,
  type TableState,
} from "./order-table";
import { replaceRoute } from "./routing";
import { PendingMaterialsPage } from "./pending-materials";
import {
  buildSupplyRows,
  searchSupplyRows,
  supplyColumns,
  type SupplyColumnKey,
} from "./supply-table";
import {
  ApiError,
  Badge,
  Button,
  CancelButton,
  Dialog,
  Empty,
  ErrorNotice,
  Field,
  LinkButton,
  PageHeading,
  ProductPicker,
  shortDate,
  TabContent,
  TabGroup,
  TabHeader,
  Tabs,
  text,
  useApp,
  useErrors,
} from "./ui";

export function SupplyPage({ params }: { params: URLSearchParams }) {
  const tab = ["lotes", "pendientes"].includes(params.get("tab") ?? "")
    ? params.get("tab")!
    : "vinculos";
  return (
    <>
      <PageHeading
        title="Abastecimiento de materiales"
        description="Consulta materiales pendientes, vínculos entre órdenes y lotes de material."
      />
      <Tabs
        value={tab}
        label="Vistas de abastecimiento"
        className="catalog-tabs"
        items={[
          { id: "vinculos", label: "Vínculos entre órdenes" },
          { id: "pendientes", label: "Materiales pendientes" },
          { id: "lotes", label: "Lotes y certificados" },
        ]}
        onChange={(value) => {
          const next = new URLSearchParams(params);
          value === "vinculos" ? next.delete("tab") : next.set("tab", value);
          if (value !== "lotes") next.delete("lote");
          replaceRoute(`abastecimiento${next.size ? `?${next}` : ""}`);
        }}
      >
        {tab === "pendientes" ? (
          <PendingMaterialsPage params={params} />
        ) : tab === "lotes" ? (
          <CatalogTable
            entity="lote_material"
            detailsId={params.get("lote")}
            onDetailsChange={(id) => {
              const next = new URLSearchParams(params);
              id ? next.set("lote", id) : next.delete("lote");
              replaceRoute(`abastecimiento?${next}`);
            }}
          />
        ) : (
          <SupplyLinks params={params} />
        )}
      </Tabs>
    </>
  );
}
function SupplyLinks({ params }: { params: URLSearchParams }) {
  const { db } = useApp();
  const [openedColumn, setOpenedColumn] = useState<SupplyColumnKey | null>(
    null,
  );
  const all = useMemo(() => buildSupplyRows(db), [db]);
  const query = params.get("q") ?? "";
  const searched = useMemo(() => searchSupplyRows(all, query), [all, query]);
  const stateKey = params.toString();
  const tableState = useMemo(
    () => readColumnState(new URLSearchParams(stateKey), supplyColumns),
    [stateKey],
  );
  const links = useMemo(
    () =>
      sortTableRows(
        filterTableRows(searched, supplyColumns, tableState.filters),
        supplyColumns,
        tableState.sort,
      ),
    [searched, tableState],
  );
  const openedOptions = useMemo(() => {
    const column = supplyColumns.find((column) => column.key === openedColumn);
    if (!column) return [];
    const options = columnOptions(
      filterTableRows(searched, supplyColumns, tableState.filters, column.key),
      column,
    );
    const available = new Map(
      columnOptions(all, column).map((option) => [option.key, option]),
    );
    for (const key of tableState.filters[column.key]?.selected ?? [])
      if (!options.some((option) => option.key === key))
        options.push(
          available.get(key) ?? {
            key,
            label: "Valor no disponible",
            value: null,
          },
        );
    return options;
  }, [all, searched, openedColumn, tableState]);
  const search = (value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set("q", value) : next.delete("q");
    replaceRoute(`abastecimiento${next.size ? `?${next}` : ""}`);
  };
  const saveTable = (state: TableState<SupplyColumnKey>) => {
    const next = new URLSearchParams(params);
    Object.entries(tableParams(state)).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    replaceRoute(`abastecimiento${next.size ? `?${next}` : ""}`);
  };
  const filterCount = supplyColumns.filter((column) =>
    hasFilter(tableState.filters[column.key]),
  ).length;
  return (
    <section className="panel">
      <div
        className="toolbar"
        role="search"
        aria-label="Búsqueda de órdenes en abastecimiento"
      >
        <div className="search">
          <Search size={16} aria-hidden="true" />
          <ControlInput
            className="control"
            type="search"
            aria-label="Buscar órdenes de producto o material"
            placeholder="Buscar por OC de producto u OCM de material…"
            value={query}
            onChange={(event) => search(event.target.value)}
          />
        </div>
        <div className="filter-actions">
          {query && (
            <Button variant="link" onClick={() => search("")}>
              Limpiar búsqueda
            </Button>
          )}
          {filterCount > 0 && (
            <Button
              variant="link"
              onClick={() => saveTable({ filters: {}, sort: tableState.sort })}
            >
              Limpiar filtros ({filterCount})
            </Button>
          )}
        </div>
      </div>
      <div className="table-scroll">
        <DataTable className="data-table catalog-table supply-table">
          <TableHead>
            <TableRow>
              {supplyColumns.map((column) => (
                <ColumnHeader
                  key={column.key}
                  column={column}
                  options={openedColumn === column.key ? openedOptions : []}
                  filter={tableState.filters[column.key]}
                  sort={tableState.sort}
                  open={openedColumn === column.key}
                  onOpen={() => setOpenedColumn(column.key)}
                  onClose={() => setOpenedColumn(null)}
                  onFilter={(filter) =>
                    saveTable({
                      ...tableState,
                      filters: {
                        ...tableState.filters,
                        [column.key]: filter,
                      },
                    })
                  }
                  onSort={(sort) => saveTable({ ...tableState, sort })}
                />
              ))}
            </TableRow>
          </TableHead>
          <TableRows>
            {links.map(({ p, m, po, mo }) => {
              return (
                <TableRow key={`${p.id}-${m.id}`}>
                  <TableCell>
                    <LinkButton variant="link" href={`/ordenes/${po.id}`}>
                      {orderReference(po.tipo_orden, po.no_orden)}
                    </LinkButton>
                  </TableCell>
                  <TableCell>
                    <strong>
                      {
                        db.productos.find((x) => x.id === p.id_producto)
                          ?.nombre_producto
                      }
                    </strong>
                    <small>
                      {
                        db.proveedor.find((x) => x.id === po.id_proveedor)
                          ?.nombre_corto
                      }
                    </small>
                  </TableCell>
                  <TableCell>
                    <LinkButton variant="link" href={`/ordenes/${mo.id}`}>
                      {orderReference(mo.tipo_orden, mo.no_orden)}
                    </LinkButton>
                  </TableCell>
                  <TableCell>
                    <strong>
                      {
                        db.materiales.find((x) => x.id === m.id_material)
                          ?.nombre_material
                      }
                    </strong>
                    <small>
                      {
                        db.proveedor.find((x) => x.id === mo.id_proveedor)
                          ?.nombre_corto
                      }
                    </small>
                  </TableCell>
                  <TableCell>
                    <Badge value={m.estado} />
                  </TableCell>
                </TableRow>
              );
            })}
            {!links.length && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Empty
                    title={
                      all.length
                        ? "Sin vínculos coincidentes"
                        : "Sin vínculos entre órdenes"
                    }
                    description="Ajusta la búsqueda o los filtros de columna para consultar los vínculos disponibles."
                  />
                </TableCell>
              </TableRow>
            )}
          </TableRows>
        </DataTable>
      </div>
      <div className="table-footer">
        <div role="status" aria-live="polite">
          {links.length} {links.length === 1 ? "vínculo" : "vínculos"}
        </div>
      </div>
    </section>
  );
}

export function InvoicesPage({
  id,
  params,
}: {
  id?: string;
  params: URLSearchParams;
}) {
  const { db, navigate } = useApp();
  const [create, setCreate] = useState(false),
    [assign, setAssign] = useState(false);
  const [openedColumn, setOpenedColumn] = useState<InvoiceColumnKey | null>(
    null,
  );
  const rs = useMemo(() => receipts(db), [db]);
  const all = useMemo(() => buildInvoiceRows(db, rs), [db, rs]);
  const query = params.get("q") ?? "";
  const searched = useMemo(() => searchInvoiceRows(all, query), [all, query]);
  const stateKey = params.toString();
  const tableState = useMemo(
    () => readColumnState(new URLSearchParams(stateKey), invoiceColumns),
    [stateKey],
  );
  const rows = useMemo(
    () =>
      sortTableRows(
        filterTableRows(searched, invoiceColumns, tableState.filters),
        invoiceColumns,
        tableState.sort,
      ),
    [searched, tableState],
  );
  const openedOptions = useMemo(() => {
    const column = invoiceColumns.find((column) => column.key === openedColumn);
    if (!column) return [];
    if (column.selectionOnly) return invoiceDocumentOptions;
    const options = columnOptions(
      filterTableRows(searched, invoiceColumns, tableState.filters, column.key),
      column,
    );
    const available = new Map(
      columnOptions(all, column).map((option) => [option.key, option]),
    );
    for (const key of tableState.filters[column.key]?.selected ?? [])
      if (!options.some((option) => option.key === key))
        options.push(
          available.get(key) ?? {
            key,
            label: "Valor no disponible",
            value: null,
          },
        );
    return options;
  }, [all, searched, openedColumn, tableState]);
  const filterCount = invoiceColumns.filter((column) =>
    hasFilter(tableState.filters[column.key]),
  ).length;
  const saveTable = (state: TableState<InvoiceColumnKey>) => {
    const next = new URLSearchParams(params);
    Object.entries(tableParams(state)).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    replaceRoute(`facturas${next.size ? `?${next}` : ""}`);
  };
  const search = (value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set("q", value) : next.delete("q");
    replaceRoute(`facturas${next.size ? `?${next}` : ""}`);
  };
  const invoice = id ? db.factura.find((f) => f.id === id) : null;
  if (id && !invoice)
    return (
      <Empty
        title="Factura no encontrada"
        action={<LinkButton href="/facturas">Volver</LinkButton>}
      />
    );
  if (invoice) {
    const associated = rs.filter((r) => r.invoice === id);
    return (
      <>
        <ControlLink href="/facturas" className="back-link">
          <ArrowLeft size={15} aria-hidden="true" />
          Volver a facturas
        </ControlLink>
        <PageHeading
          title={`Factura ${invoice.numero_factura}`}
          description={`${db.proveedor.find((p) => p.id === invoice.id_proveedor)?.nombre_largo} · registrada el ${shortDate(invoice.fecha_registro)}`}
          action={
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => setAssign(true)}
            >
              Asignar lotes
            </Button>
          }
        />
        <div className="invoice-detail">
          <section className="panel">
            <div className="section-heading">
              <h2>Lotes asociados</h2>
              <small>{associated.length}</small>
            </div>
            {associated.length ? (
              <div className="table-scroll">
                <DataTable className="data-table">
                  <TableHead>
                    <TableRow>
                      <TableColumn>Orden</TableColumn>
                      <TableColumn>Producto o concepto</TableColumn>
                      <TableColumn>Lote</TableColumn>
                    </TableRow>
                  </TableHead>
                  <TableRows>
                    {associated.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <LinkButton
                            variant="link"
                            href={`/ordenes/${r.orderId}`}
                          >
                            {orderReference(r.orderType, r.order)}
                          </LinkButton>
                        </TableCell>
                        <TableCell>{r.item}</TableCell>
                        <TableCell>{r.lot}</TableCell>
                      </TableRow>
                    ))}
                  </TableRows>
                </DataTable>
              </div>
            ) : (
              <Empty
                title="Factura sin recepciones"
                description="Puedes asociar lotes, materiales o conceptos del mismo proveedor cuando estén disponibles."
              />
            )}
          </section>
          <section className="panel">
            <Documents owner="factura" ownerId={invoice.id} />
          </section>
        </div>
        {assign && (
          <InvoiceForm invoice={invoice} onClose={() => setAssign(false)} />
        )}
      </>
    );
  }
  return (
    <>
      <PageHeading
        title="Facturas"
        description="Registra facturas y vincula recepciones del mismo proveedor."
        action={
          <Button variant="primary" icon={Plus} onClick={() => setCreate(true)}>
            Agregar factura
          </Button>
        }
      />
      <section className="panel">
        <div
          className="toolbar"
          role="search"
          aria-label="Búsqueda de facturas"
        >
          <div className="search">
            <Search size={16} aria-hidden="true" />
            <ControlInput
              className="control"
              type="search"
              aria-label="Buscar facturas"
              placeholder="Buscar factura, orden, lote o proveedor…"
              value={query}
              onChange={(event) => search(event.target.value)}
            />
          </div>
          <div className="filter-actions">
            {query && (
              <Button variant="link" onClick={() => search("")}>
                Limpiar búsqueda
              </Button>
            )}
            {filterCount > 0 && (
              <Button
                variant="link"
                onClick={() =>
                  saveTable({ filters: {}, sort: tableState.sort })
                }
              >
                Limpiar filtros ({filterCount})
              </Button>
            )}
          </div>
        </div>
        <div className="table-scroll">
          <DataTable className="data-table catalog-table invoice-table">
            <TableHead>
              <TableRow>
                {invoiceColumns.map((column) => (
                  <ColumnHeader
                    key={column.key}
                    column={column}
                    options={openedColumn === column.key ? openedOptions : []}
                    filter={tableState.filters[column.key]}
                    sort={tableState.sort}
                    open={openedColumn === column.key}
                    onOpen={() => setOpenedColumn(column.key)}
                    onClose={() => setOpenedColumn(null)}
                    onFilter={(filter) =>
                      saveTable({
                        ...tableState,
                        filters: {
                          ...tableState.filters,
                          [column.key]: filter,
                        },
                      })
                    }
                    onSort={(sort) => saveTable({ ...tableState, sort })}
                  />
                ))}
                <TableColumn>
                  <span className="visually-hidden">Detalle</span>
                </TableColumn>
              </TableRow>
            </TableHead>
            <TableRows>
              {rows.map(({ invoice: f, provider, receiptCount, document }) => {
                return (
                  <TableRow key={f.id}>
                    <TableCell>
                      <LinkButton variant="link" href={`/facturas/${f.id}`}>
                        {f.numero_factura}
                      </LinkButton>
                    </TableCell>
                    <TableCell>
                      {provider?.nombre_corto ?? provider?.nombre_largo}
                    </TableCell>
                    <TableCell>{shortDate(f.fecha_registro)}</TableCell>
                    <TableCell className="num">{receiptCount}</TableCell>
                    <TableCell>
                      <LinkButton
                        icon={Paperclip}
                        variant="link"
                        aria-label={
                          document
                            ? `Previsualizar documento de ${f.numero_factura}`
                            : `Agregar documento a ${f.numero_factura}`
                        }
                        style={{
                          color: document ? "var(--primary)" : "var(--muted)",
                        }}
                        href={
                          document
                            ? `/api/documents/${document.id}/content`
                            : `/facturas/${f.id}`
                        }
                        target={document ? "_blank" : undefined}
                        rel={document ? "noopener noreferrer" : undefined}
                      >
                        {document ? "1 archivo" : "Sin archivo"}
                      </LinkButton>
                    </TableCell>
                    <TableCell>
                      <LinkButton
                        className="icon-btn table-action"
                        icon={ChevronRight}
                        aria-label={`Ver factura ${f.numero_factura}`}
                        href={`/facturas/${f.id}`}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Empty
                      title={
                        all.length
                          ? "No hay facturas coincidentes"
                          : "Sin facturas registradas"
                      }
                      description={
                        all.length
                          ? "Ajusta la búsqueda o los filtros de columna para consultar otras facturas."
                          : "Agrega una factura para comenzar."
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableRows>
          </DataTable>
        </div>
        <div className="table-footer">
          <span>{rows.length} facturas</span>
        </div>
      </section>
      {create && (
        <InvoiceForm
          onClose={() => setCreate(false)}
          onSaved={(f) => navigate(`facturas/${f.id}`)}
        />
      )}
    </>
  );
}

const barcodeColumns: Column<string>[] = [
  { key: "codigo", label: "Código", kind: "text" },
  { key: "producto", label: "Producto", kind: "text" },
  { key: "estado", label: "Estados", kind: "enum" },
  { key: "creacion", label: "Creación", kind: "date" },
];

const barcodeSteps = [
  { status: "creado_gs1", label: "Creado en GS1" },
  { status: "verificado_sistema", label: "Verificado en sistema" },
  { status: "activo", label: "Activo" },
  { status: "asignado", label: "Asignado" },
];

type BarcodeFilterRow = ColumnRow<string> & {
  barcode: codigos_barras;
  searchText: string;
};

function barcodeFilterCell(
  value: string | null,
  label: string,
  key = value ?? "__sin_valor__",
): ColumnCell {
  return {
    sortValue: value,
    values: [{ key, label, value }],
  };
}

export function CodesPage() {
  const { db, run } = useApp();
  const [query, setQuery] = useState(""),
    [creating, setCreating] = useState(false),
    [code, setCode] = useState(""),
    [action, setAction] = useState<Row | null>(null),
    [product, setProduct] = useState(""),
    [busy, setBusy] = useState(false),
    [mail, setMail] = useState(false),
    [mailSelection, setMailSelection] = useState(false),
    [mailCodeIds, setMailCodeIds] = useState<string[]>([]);
  const [tableState, setTableState] = useState<TableState<string>>({
    filters: {},
  });
  const [openedColumn, setOpenedColumn] = useState<string | null>(null);
  const [statusHelpOpen, setStatusHelpOpen] = useState(false);
  const { error, catchError, setError } = useErrors({
    values: { codigo: code, id_producto: product },
    valid: (field) =>
      field === "codigo"
        ? entityValidation("codigos_barras", { codigo: code }, db).valid(field)
        : field === "id_producto" &&
          db.productos.some((row) => row.id === product),
  });
  const allRows = useMemo<BarcodeFilterRow[]>(
    () =>
      db.codigos_barras.map((barcode) => {
        const productName =
          db.productos.find((row) => row.id === barcode.id_producto)
            ?.nombre_producto ?? "Sin producto asignado";
        const day = calendarDay(barcode.fecha_creacion);
        const status = barcode.estado;
        return {
          barcode,
          searchText: `${barcode.codigo} ${productName}`.toLocaleLowerCase(
            "es-CO",
          ),
          cells: {
            codigo: barcodeFilterCell(barcode.codigo, barcode.codigo),
            producto: barcodeFilterCell(
              productName,
              productName,
              barcode.id_producto ?? "sin_producto",
            ),
            estado: barcodeFilterCell(status, text(status)),
            creacion: barcodeFilterCell(
              day,
              day ? shortDate(barcode.fecha_creacion) : "Sin fecha",
            ),
          },
        };
      }),
    [db],
  );
  const searchedRows = useMemo(() => {
    const normalized = query.toLocaleLowerCase("es-CO");
    return allRows.filter((row) => row.searchText.includes(normalized));
  }, [allRows, query]);
  const rows = useMemo(() => {
    const filtered = filterTableRows(
      searchedRows,
      barcodeColumns,
      tableState.filters,
    );
    const sorted = tableState.sort
      ? sortTableRows(filtered, barcodeColumns, tableState.sort)
      : [...filtered].sort((a, b) =>
          (b.barcode.fecha_creacion ?? "").localeCompare(
            a.barcode.fecha_creacion ?? "",
          ),
        );
    return sorted.map((row) => row.barcode);
  }, [searchedRows, tableState]);
  const openedOptions = useMemo(() => {
    const column = barcodeColumns.find((item) => item.key === openedColumn);
    if (!column) return [];
    const options = columnOptions(
      filterTableRows(
        searchedRows,
        barcodeColumns,
        tableState.filters,
        column.key,
      ),
      column,
    );
    const available = new Map(
      columnOptions(allRows, column).map((option) => [option.key, option]),
    );
    for (const key of tableState.filters[column.key]?.selected ?? [])
      if (!options.some((option) => option.key === key))
        options.push(
          available.get(key) ?? {
            key,
            label: "Valor no disponible",
            value: null,
          },
        );
    return options;
  }, [allRows, searchedRows, openedColumn, tableState]);
  const filterCount = barcodeColumns.filter((column) =>
    hasFilter(tableState.filters[column.key]),
  ).length;
  function openAction(
    barcode: codigos_barras,
    next: "verificado_sistema" | "asignado" | "inactivo",
  ) {
    setError(null);
    setProduct(barcode.estado === "activo" ? barcode.id_producto! : "");
    setAction({
      ...barcode,
      next,
      expectedAssignedId: barcode.id_producto
        ? (assignedBarcode(db, barcode.id_producto)?.id ?? null)
        : null,
    });
  }
  const pendingVerificationCodes = db.codigos_barras.filter(
    (barcode) => barcode.estado === "creado_gs1",
  );
  const clearFilters = () =>
    setTableState((current) => ({ filters: {}, sort: current.sort }));
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await run("createBarcode", { codigo: code }, "Código registrado");
      setCreating(false);
      setCode("");
    } catch (e) {
      catchError(e);
    } finally {
      setBusy(false);
    }
  }
  async function advance() {
    setBusy(true);
    try {
      await run(
        action!.estado === "activo" && action!.next === "asignado"
          ? "setAssignedBarcode"
          : "advanceBarcode",
        {
          id: action!.id,
          expectedEstado: action!.estado,
          expectedAssignedId: action!.expectedAssignedId,
          estado: action!.next,
          id_producto: product,
          confirm: true,
        },
        "Código actualizado",
      );
      setAction(null);
    } catch (e) {
      catchError(e);
      if (e instanceof ApiError && e.code === "BARCODE_CHANGED") {
        setAction((current) =>
          current ? { ...current, needsReview: true } : current,
        );
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Códigos de barras"
        description="Registra códigos GS1, confirma su disponibilidad y asígnalos al producto."
        action={
          <div className="inline">
            <Button
              icon={Send}
              onClick={() => {
                setMailCodeIds(pendingVerificationCodes.map((item) => item.id));
                setMailSelection(true);
              }}
            >
              Avisar códigos nuevos
            </Button>
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => {
                setError(null);
                setCreating(true);
              }}
            >
              Registrar código
            </Button>
          </div>
        }
      />
      <div className="code-flow" style={{ marginBottom: 24 }}>
        {barcodeSteps.map((step, index) => (
          <Fragment key={step.status}>
            {index > 0 && (
              <ChevronRight
                size={16}
                className="flow-arrow"
                aria-hidden="true"
              />
            )}
            <Button
              className="code-step"
              aria-pressed={
                tableState.filters.estado?.selected?.length === 1 &&
                tableState.filters.estado.selected[0] === step.status
              }
              onClick={() =>
                setTableState((current) => ({
                  ...current,
                  filters: {
                    ...current.filters,
                    estado: { selected: [step.status] },
                  },
                }))
              }
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {step.label}
            </Button>
          </Fragment>
        ))}
      </div>
      <section className="panel barcode-panel">
        <div className="toolbar">
          <div className="search">
            <Search size={16} aria-hidden="true" />
            <ControlInput
              className="control"
              aria-label="Buscar códigos de barras"
              placeholder="Buscar código o producto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="filter-actions">
            {query && (
              <Button variant="link" onClick={() => setQuery("")}>
                Limpiar búsqueda
              </Button>
            )}
            {filterCount > 0 && (
              <Button variant="link" onClick={clearFilters}>
                Limpiar filtros ({filterCount})
              </Button>
            )}
            <Button
              icon={CircleHelp}
              className="icon-btn"
              aria-label="Ayuda sobre los estados de códigos de barras"
              aria-haspopup="dialog"
              aria-expanded={statusHelpOpen}
              title="Ayuda sobre los estados"
              onClick={() => setStatusHelpOpen(true)}
            />
          </div>
        </div>
        <div className="table-scroll">
          <DataTable className="data-table catalog-table">
            <TableHead>
              <TableRow>
                {barcodeColumns.map((column) => (
                  <ColumnHeader
                    key={column.key}
                    column={column}
                    options={openedColumn === column.key ? openedOptions : []}
                    filter={tableState.filters[column.key]}
                    sort={tableState.sort}
                    open={openedColumn === column.key}
                    onOpen={() => setOpenedColumn(column.key)}
                    onClose={() => setOpenedColumn(null)}
                    onFilter={(filter?: ColumnFilter) =>
                      setTableState((current) => {
                        const filters = { ...current.filters };
                        if (filter) filters[column.key] = filter;
                        else delete filters[column.key];
                        return { ...current, filters };
                      })
                    }
                    onSort={(sort) =>
                      setTableState((current) => ({ ...current, sort }))
                    }
                  />
                ))}
                <TableColumn scope="col">Historial y acciones</TableColumn>
              </TableRow>
            </TableHead>
            <TableRows>
              {rows.length ? (
                rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.codigo}</TableCell>
                    <TableCell>
                      {db.productos.find((p) => p.id === c.id_producto)
                        ?.nombre_producto ?? "Sin producto asignado"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        value={c.estado}
                        tone={c.estado === "activo" ? "validado" : undefined}
                      />
                    </TableCell>
                    <TableCell>{shortDate(c.fecha_creacion)}</TableCell>
                    <TableCell>
                      <div className="inline">
                        {c.estado === "creado_gs1" && (
                          <Button
                            className="icon-btn table-action barcode-action-verify"
                            icon={BadgeCheck}
                            aria-label="Confirmar verificación en el sistema"
                            onClick={() => openAction(c, "verificado_sistema")}
                          />
                        )}
                        {c.estado === "verificado_sistema" && (
                          <Button
                            className="icon-btn table-action barcode-action-assign-product"
                            icon={PackagePlus}
                            aria-label="Asignar a producto"
                            onClick={() => openAction(c, "asignado")}
                          />
                        )}
                        {c.estado === "activo" && (
                          <Button
                            className="icon-btn table-action barcode-action-assign-code"
                            icon={Barcode}
                            aria-label="Asignar código activo"
                            onClick={() => openAction(c, "asignado")}
                          />
                        )}
                        {(c.estado === "asignado" || c.estado === "activo") && (
                          <Button
                            className="icon-btn table-action barcode-action-inactivate"
                            icon={Ban}
                            aria-label="Inactivar"
                            onClick={() => openAction(c, "inactivo")}
                          />
                        )}
                        <LinkButton
                          className="icon-btn table-action"
                          href={`/ordenes?q=${encodeURIComponent(c.codigo)}`}
                          icon={History}
                          aria-label="Ver órdenes"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Empty
                      title={
                        allRows.length
                          ? "Sin códigos coincidentes"
                          : "Sin códigos registrados"
                      }
                      description="Ajusta la búsqueda o los filtros de columna para consultar los códigos disponibles."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableRows>
          </DataTable>
        </div>
        <div className="table-footer">
          <span>{rows.length} códigos</span>
        </div>
      </section>
      {statusHelpOpen && (
        <Dialog
          title="Estados de los códigos de barras"
          subtitle="Consulta qué significa cada etapa del ciclo del código."
          onClose={() => setStatusHelpOpen(false)}
        >
          <div className="dialog-body custom-filter-help">
            <dl>
              <div className="filter-help-entry">
                <dt>Creado en GS1</dt>
                <dd>
                  El código fue registrado en GS1 y está pendiente de confirmar
                  su disponibilidad en el sistema.
                </dd>
              </div>
              <div className="filter-help-entry">
                <dt>Verificado en sistema</dt>
                <dd>
                  Se confirmó que el código está disponible; queda listo para
                  asignarlo a un producto.
                </dd>
              </div>
              <div className="filter-help-entry">
                <dt>Activo</dt>
                <dd>
                  Es un código vigente asociado al producto. Puede elegirse como
                  Asignado para nuevas órdenes.
                </dd>
              </div>
              <div className="filter-help-entry">
                <dt>Asignado</dt>
                <dd>
                  Es el único código seleccionado para emitir nuevas órdenes del
                  producto. Asociar un código nuevo sustituye al asignado
                  anterior, que queda Activo.
                </dd>
              </div>
              <div className="filter-help-entry">
                <dt>Inactivo</dt>
                <dd>
                  El código fue retirado del uso y no se selecciona para nuevas
                  órdenes.
                </dd>
              </div>
            </dl>
          </div>
          <div className="dialog-footer">
            <Button onClick={() => setStatusHelpOpen(false)}>Entendido</Button>
          </div>
        </Dialog>
      )}
      {mailSelection && (
        <Dialog
          title="Avisar códigos nuevos"
          subtitle="Selecciona los códigos creados en GS1 que se enviarán para verificar en el sistema."
          onClose={() => setMailSelection(false)}
        >
          <div className="dialog-body">
            {pendingVerificationCodes.length ? (
              <>
                <div className="barcode-mail-selection">
                  <strong>
                    Códigos por verificar ({mailCodeIds.length} de{" "}
                    {pendingVerificationCodes.length})
                  </strong>
                  <CheckChoice
                    id="select-all-new-barcodes"
                    checked={
                      mailCodeIds.length === pendingVerificationCodes.length
                    }
                    indeterminate={
                      mailCodeIds.length > 0 &&
                      mailCodeIds.length < pendingVerificationCodes.length
                    }
                    onChange={(checked) =>
                      setMailCodeIds(
                        checked
                          ? pendingVerificationCodes.map((item) => item.id)
                          : [],
                      )
                    }
                  >
                    Seleccionar todos
                  </CheckChoice>
                </div>
                <ChoiceGroup
                  aria-label="Códigos para enviar a verificación"
                  className="check-list"
                  value={mailCodeIds}
                  onChange={(value) => setMailCodeIds(value as string[])}
                >
                  {pendingVerificationCodes.map((item) => (
                    <CheckChoice key={item.id} value={item.id}>
                      <span className="mono">{item.codigo}</span>
                    </CheckChoice>
                  ))}
                </ChoiceGroup>
              </>
            ) : (
              <Empty
                title="No hay códigos pendientes de verificación"
                description="Los códigos deben estar en estado «Creado en GS1» para incluirse en este aviso."
              />
            )}
          </div>
          <div className="dialog-footer">
            <CancelButton onClick={() => setMailSelection(false)}>
              Cancelar
            </CancelButton>
            <Button
              variant="primary"
              icon={Send}
              disabled={!mailCodeIds.length || !pendingVerificationCodes.length}
              onClick={() => {
                setMailCodeIds((current) =>
                  pendingVerificationCodes
                    .filter((item) => current.includes(item.id))
                    .map((item) => item.id),
                );
                setMailSelection(false);
                setMail(true);
              }}
            >
              Preparar correo
            </Button>
          </div>
        </Dialog>
      )}
      {creating && (
        <Dialog
          title="Registrar código GS1"
          subtitle="La creación en GS1 ocurre fuera de la aplicación."
          onClose={() => setCreating(false)}
        >
          <ControlForm onSubmit={create} fieldErrors={error?.fields}>
            <div className="dialog-body">
              <ErrorNotice error={error} />
              <Field
                id="field-codigo"
                label="Código de barras"
                required
                error={error?.fields.codigo}
              >
                <ControlInput
                  id="field-codigo"
                  required
                  autoComplete="off"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </Field>
              <p className="compact-note">
                Se registrará sin producto y con estado «Creado en GS1».
              </p>
            </div>
            <div className="dialog-footer">
              <CancelButton onClick={() => setCreating(false)}>
                Cancelar
              </CancelButton>
              <Button type="submit" variant="primary" disabled={busy}>
                Registrar código
              </Button>
            </div>
          </ControlForm>
        </Dialog>
      )}
      {action && (
        <Dialog
          title={
            action.next === "asignado"
              ? action.estado === "activo"
                ? "Cambiar código asignado"
                : "Asignar código a producto"
              : action.next === "inactivo"
                ? "Marcar código inactivo"
                : "Confirmar disponibilidad"
          }
          subtitle={`Código ${action.codigo}`}
          onClose={() => setAction(null)}
          busy={busy}
        >
          <div className="dialog-body">
            <ErrorNotice error={error} />
            {action.needsReview && (
              <Button
                onClick={() => {
                  const updated = db.codigos_barras.find(
                    (c) => c.id === action.id,
                  );
                  if (updated)
                    setAction({
                      ...updated,
                      next: action.next,
                      expectedAssignedId:
                        assignedBarcode(
                          db,
                          product || updated.id_producto || "",
                        )?.id ?? null,
                      needsReview: false,
                    });
                  setError(null);
                }}
              >
                Revisar datos actualizados
              </Button>
            )}
            {action.next === "asignado" ? (
              <>
                <Field
                  id="field-id_producto"
                  label="Producto"
                  required
                  error={error?.fields.id_producto}
                >
                  <ProductPicker
                    id="field-id_producto"
                    value={product}
                    products={db.productos}
                    disabled={action.estado === "activo"}
                    onChange={(id) => {
                      setProduct(id);
                      setAction((current) =>
                        current
                          ? {
                              ...current,
                              expectedAssignedId:
                                assignedBarcode(db, id)?.id ?? null,
                            }
                          : current,
                      );
                    }}
                  />
                </Field>
                <Field id="field-proveedor_producto" label="Proveedor" required>
                  <ControlInput
                    id="field-proveedor_producto"
                    value={
                      db.proveedor.find(
                        (provider) =>
                          provider.id ===
                          db.productos.find((p) => p.id === product)
                            ?.id_maquilador,
                      )?.nombre_largo ??
                      db.proveedor.find(
                        (provider) =>
                          provider.id ===
                          db.productos.find((p) => p.id === product)
                            ?.id_maquilador,
                      )?.nombre_corto ??
                      ""
                    }
                    readOnly
                  />
                </Field>
                {product && (
                  <p className="compact-note">
                    Código asignado actual:{" "}
                    {assignedBarcode(db, product)?.codigo ??
                      "Sin código asignado"}
                    . Se asignará {action.codigo}; el anterior conservará el
                    estado Activo.
                  </p>
                )}
              </>
            ) : (
              <p>
                {action.next === "inactivo"
                  ? `Confirma que el código está inactivo en GS1. Las órdenes históricas conservarán el código utilizado.${action.estado === "asignado" ? " El producto quedará sin código asignado y no se podrán emitir nuevas órdenes hasta asignar otro." : ""}`
                  : "Confirma que se comprobó la disponibilidad del código en el sistema."}
              </p>
            )}
          </div>
          <div className="dialog-footer">
            <CancelButton onClick={() => setAction(null)}>
              Cancelar
            </CancelButton>
            <Button
              variant={action.next === "inactivo" ? "danger" : "primary"}
              className={
                action.next === "inactivo" ? "destructive-confirm" : ""
              }
              icon={action.next === "inactivo" ? undefined : Check}
              disabled={
                busy ||
                action.needsReview ||
                (action.next === "asignado" &&
                  (!product ||
                    !["activo", "verificado_sistema"].includes(
                      action.estado,
                    ))) ||
                (action.next === "verificado_sistema" &&
                  action.estado !== "creado_gs1") ||
                (action.next === "inactivo" && action.estado === "inactivo")
              }
              onClick={() => void advance()}
            >
              {action.next === "inactivo" ? "Inactivar código" : "Confirmar"}
            </Button>
          </div>
        </Dialog>
      )}
      {mail && (
        <MailForm
          context={{ event: "codigos_barras_nuevos", barcodeIds: mailCodeIds }}
          onClose={() => {
            setMail(false);
            setMailCodeIds([]);
          }}
        />
      )}
    </>
  );
}

export function EmailsPage() {
  const { db } = useApp();
  const [compose, setCompose] = useState(false);
  return (
    <>
      <PageHeading
        title="Correos"
        description="Prepara los avisos y consulta el registro básico de los envíos simulados."
        action={
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => setCompose(true)}
          >
            Preparar correo
          </Button>
        }
      />
      <section className="panel">
        <div className="section-heading">
          <h2>Historial de envíos simulados</h2>
          <small>{db.correo_enviado.length} mensajes</small>
        </div>
        {db.correo_enviado.length ? (
          <div className="table-scroll">
            <DataTable className="data-table catalog-table">
              <TableHead>
                <TableRow>
                  <TableColumn>Evento</TableColumn>
                  <TableColumn>Fecha</TableColumn>
                  <TableColumn>Remitente</TableColumn>
                  <TableColumn>Destinatarios utilizados</TableColumn>
                </TableRow>
              </TableHead>
              <TableRows>
                {[...db.correo_enviado]
                  .sort((a, b) => b.fecha_envio.localeCompare(a.fecha_envio))
                  .map((m) => (
                    <TableRow key={m.id_correo + "-" + m.remitente}>
                      <TableCell>
                        <strong>{text(m.tipo_evento)}</strong>
                        <small className="mono">{m.id_correo}</small>
                      </TableCell>
                      <TableCell>{shortDate(m.fecha_envio)}</TableCell>
                      <TableCell>{m.remitente}</TableCell>
                      <TableCell>
                        {db.correo_enviado_destinatario
                          .filter(
                            (r) =>
                              r.id_correo === m.id_correo &&
                              r.remitente === m.remitente,
                          )
                          .map((r) => (
                            <small key={r.destinatario}>
                              <strong>{text(r.tipo_destinatario)}:</strong>{" "}
                              {r.destinatario}
                            </small>
                          ))}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableRows>
            </DataTable>
          </div>
        ) : (
          <Empty title="Todavía no hay envíos" />
        )}
      </section>
      {compose && <MailForm onClose={() => setCompose(false)} />}
    </>
  );
}

export function SettingsPage() {
  const { db, run } = useApp();
  const [tab, setTab] = useState("tolerancia"),
    [value, setValue] = useState(tolerance(db)),
    [busy, setBusy] = useState(false);
  const { error, catchError } = useErrors(
    entityValidation("parametros_seguimiento", {
      margen_tolerancia_pct: value,
    }),
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await run("setTolerance", { value }, "Nueva tolerancia vigente");
    } catch (e) {
      catchError(e);
    } finally {
      setBusy(false);
    }
  }
  const groups = [
    { id: "tolerancia", label: "Tolerancia de seguimiento" },
    { id: "contacto_interno", label: "Contactos internos" },
    { id: "destinatario_evento", label: "Destinatarios sugeridos" },
    { id: "adjunto_evento", label: "Adjuntos por evento" },
    { id: "plantilla", label: "Plantilla de liberación" },
    { id: "pendientes", label: "Pendientes documentados" },
  ];
  return (
    <>
      <PageHeading
        title="Configuración"
        description="Parámetros de seguimiento, contactos y sugerencias por proceso."
      />
      <TabGroup
        value={tab}
        onChange={setTab}
        className="settings-layout"
        orientation="vertical"
      >
        <TabHeader
          items={groups}
          value={tab}
          className="settings-nav"
          label="Apartados de configuración"
        />
        <TabContent id={tab}>
          {[
            "contacto_interno",
            "destinatario_evento",
            "adjunto_evento",
          ].includes(tab) ? (
            <CatalogTable key={tab} entity={tab as Entity} />
          ) : tab === "plantilla" ? (
            <section className="panel">
              <Documents owner={null} ownerId={null} />
            </section>
          ) : tab === "pendientes" ? (
            <div className="stack">
              <div className="notice subtle">
                <Info size={17} aria-hidden="true" />
                <div>
                  <strong>Pendientes documentados</strong>
                  <p>
                    Los campos de sticker y cinta son provisionales en este
                    prototipo. La integración del certificado de análisis para
                    Colompack está prevista a futuro. El stack de producción
                    continúa pendiente.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Tolerancia de seguimiento</h2>
                  <p>La configuración más reciente es la vigente.</p>
                </div>
                <Badge value="autorizada">±{tolerance(db)} % vigente</Badge>
              </div>
              <ControlForm onSubmit={submit} fieldErrors={error?.fields}>
                <div className="panel-body stack">
                  <ErrorNotice error={error} />
                  <Field
                    id="field-margen_tolerancia_pct"
                    label="Nueva tolerancia (%)"
                    hint="La configuración vigente se conserva en el historial."
                    error={error?.fields.margen_tolerancia_pct}
                  >
                    <ControlInput
                      id="field-margen_tolerancia_pct"
                      type="number"
                      step="0.01"
                      value={value}
                      onChange={(e) => setValue(Number(e.target.value))}
                    />
                  </Field>
                  <div className="notice subtle">
                    <Info size={17} aria-hidden="true" />
                    El margen genera una advertencia al cerrar manualmente. No
                    bloquea el cierre ni compensa cantidades entre productos.
                  </div>
                  <div>
                    <Button type="submit" variant="primary" disabled={busy}>
                      Guardar nueva configuración
                    </Button>
                  </div>
                </div>
              </ControlForm>
              <div className="table-scroll">
                <DataTable className="data-table">
                  <TableHead>
                    <TableRow>
                      <TableColumn>Margen</TableColumn>
                      <TableColumn>Inicio de vigencia</TableColumn>
                      <TableColumn>Configuración</TableColumn>
                    </TableRow>
                  </TableHead>
                  <TableRows>
                    {[...db.parametros_seguimiento]
                      .sort((a, b) =>
                        b.fecha_inicio.localeCompare(a.fecha_inicio),
                      )
                      .map((p, i) => (
                        <TableRow key={p.id}>
                          <TableCell>±{p.margen_tolerancia_pct} %</TableCell>
                          <TableCell>{shortDate(p.fecha_inicio)}</TableCell>
                          <TableCell>
                            {i === 0 ? (
                              <Badge value="autorizada">Vigente</Badge>
                            ) : (
                              <span className="muted">Histórica</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableRows>
                </DataTable>
              </div>
            </section>
          )}
        </TabContent>
      </TabGroup>
    </>
  );
}

export function DocumentsPage() {
  const { db } = useApp();
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Row | null>(null);
  const [tableState, setTableState] = useState<TableState<DocumentColumnKey>>({
    filters: {},
  });
  const [openedColumn, setOpenedColumn] = useState<DocumentColumnKey | null>(
    null,
  );
  const allRows = useMemo(() => buildDocumentRows(db), [db]);
  const searchedRows = useMemo(
    () =>
      allRows.filter((row) =>
        row.searchText.includes(query.toLocaleLowerCase("es-CO")),
      ),
    [allRows, query],
  );
  const rows = useMemo(
    () =>
      sortTableRows(
        filterTableRows(searchedRows, documentColumns, tableState.filters),
        documentColumns,
        tableState.sort,
      ),
    [searchedRows, tableState],
  );
  const openedOptions = useMemo(() => {
    const column = documentColumns.find((item) => item.key === openedColumn);
    if (!column) return [];
    const options = columnOptions(
      filterTableRows(
        searchedRows,
        documentColumns,
        tableState.filters,
        column.key,
      ),
      column,
    );
    const available = new Map(
      columnOptions(allRows, column).map((option) => [option.key, option]),
    );
    for (const key of tableState.filters[column.key]?.selected ?? [])
      if (!options.some((option) => option.key === key))
        options.push(
          available.get(key) ?? {
            key,
            label: "Valor no disponible",
            value: null,
          },
        );
    return options;
  }, [allRows, searchedRows, openedColumn, tableState]);
  const filterCount = documentColumns.filter((column) =>
    hasFilter(tableState.filters[column.key]),
  ).length;
  const kind =
    tableState.filters.clase?.selected?.length === 1 &&
    !tableState.filters.clase.operator
      ? tableState.filters.clase.selected[0]
      : hasFilter(tableState.filters.clase)
        ? "__column_filter__"
        : "";
  return (
    <>
      <PageHeading
        title="Documentos"
        description="Archivos de demostración asociados a facturas, órdenes y lotes de material."
      />
      <section className="panel">
        <div
          className="toolbar documents-toolbar"
          role="search"
          aria-label="Búsqueda de documentos"
        >
          <div className="search">
            <Search size={16} aria-hidden="true" />
            <ControlInput
              className="control"
              aria-label="Buscar documentos"
              type="search"
              placeholder="Buscar nombre o clase de documento…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="filter-actions">
            {query && (
              <Button variant="link" onClick={() => setQuery("")}>
                Limpiar búsqueda
              </Button>
            )}
            <CustomFilterSelect
              className="control filter-select"
              aria-label="Filtrar clase de documento"
              value={kind}
              onChange={(e) => {
                const value = e.target.value;
                setTableState((current) => ({
                  ...current,
                  filters: {
                    ...current.filters,
                    clase: value ? { selected: [value] } : undefined,
                  },
                }));
              }}
            >
              <option value="">Todas las clases</option>
              {kind === "__column_filter__" && (
                <option value="__column_filter__" disabled>
                  Filtro de columna aplicado
                </option>
              )}
              {[
                "factura_fisica",
                "orden_compra_escaneada",
                "certificado_calidad",
                "certificado_liberacion",
                "plantilla_certificado_liberacion",
              ].map((t) => (
                <option key={t} value={t}>
                  {text(t)}
                </option>
              ))}
            </CustomFilterSelect>
          </div>
        </div>
        <div className="table-scroll">
          <DataTable className="data-table catalog-table">
            <TableHead>
              <TableRow>
                {documentColumns.map((column) => (
                  <ColumnHeader
                    key={column.key}
                    column={column}
                    options={openedColumn === column.key ? openedOptions : []}
                    filter={tableState.filters[column.key]}
                    sort={tableState.sort}
                    open={openedColumn === column.key}
                    onOpen={() => setOpenedColumn(column.key)}
                    onClose={() => setOpenedColumn(null)}
                    onFilter={(filter) =>
                      setTableState((current) => ({
                        ...current,
                        filters: { ...current.filters, [column.key]: filter },
                      }))
                    }
                    onSort={(sort) =>
                      setTableState((current) => ({ ...current, sort }))
                    }
                  />
                ))}
                <TableColumn>Acciones</TableColumn>
              </TableRow>
            </TableHead>
            <TableRows>
              {rows.length ? (
                rows.map(({ document: d, owner }) => {
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <ControlLink
                          href={`/api/documents/${d.id}/content`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <FileText
                            size={14}
                            aria-hidden="true"
                            style={{ verticalAlign: "middle", marginRight: 6 }}
                          />
                          {d.nombre_archivo}
                        </ControlLink>
                        <small>Placeholder · {d.tipo_mime}</small>
                      </TableCell>
                      <TableCell>
                        {d.tipo_entidad === "factura" ||
                        d.tipo_entidad === "orden_compra" ? (
                          <LinkButton
                            variant="link"
                            href={`/${d.tipo_entidad === "factura" ? "facturas" : "ordenes"}/${d.id_entidad}`}
                          >
                            {owner}
                          </LinkButton>
                        ) : d.tipo_entidad === "lote_material" &&
                          d.id_entidad ? (
                          <LinkButton
                            variant="link"
                            href={`/abastecimiento?${new URLSearchParams({ tab: "lotes", lote: d.id_entidad })}`}
                          >
                            {owner}
                          </LinkButton>
                        ) : (
                          owner
                        )}
                      </TableCell>
                      <TableCell>{text(d.tipo_documento)}</TableCell>
                      <TableCell>{shortDate(d.fecha_carga)}</TableCell>
                      <TableCell>
                        <div className="inline">
                          <LinkButton
                            href={`/api/documents/${d.id}/content?download=1`}
                            className="icon-btn table-action"
                            icon={Download}
                            aria-label={`Descargar ${d.nombre_archivo}`}
                          />
                          <Button
                            className="icon-btn table-action"
                            icon={Settings2}
                            aria-label={`Gestionar ${d.nombre_archivo}`}
                            onClick={() => setSelected(d)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Empty
                      title={
                        db.documento.length
                          ? "Sin documentos coincidentes"
                          : "Sin documentos"
                      }
                      description="Ajusta la búsqueda o los filtros de columna para consultar los documentos disponibles."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableRows>
          </DataTable>
        </div>
        <div className="table-footer">
          <span>{rows.length} documentos</span>
          {filterCount > 0 && (
            <Button
              variant="link"
              onClick={() =>
                setTableState((current) => ({
                  filters: {},
                  sort: current.sort,
                }))
              }
            >
              Limpiar filtros ({filterCount})
            </Button>
          )}
        </div>
      </section>
      {selected && (
        <Dialog
          title="Gestionar documentos del propietario"
          onClose={() => setSelected(null)}
        >
          <Documents
            owner={selected.tipo_entidad}
            ownerId={selected.id_entidad}
          />
        </Dialog>
      )}
    </>
  );
}
