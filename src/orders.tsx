import {
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileCheck2,
  FilePlus2,
  Info,
  Package,
  Pencil,
  Plus,
  Printer,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { useDeferredValue, useMemo, useState, type MouseEvent } from "react";
import {
  deviation,
  isInitialProductLot,
  lineTable,
  nextOrderNumber,
  orderItemLabel,
  orderLines,
  orderPrefix,
  orderReference,
  orderState,
  tolerance,
  totalLines,
  type Row,
} from "../shared/schema";
import { ColumnHeader } from "./column-filter";
import {
  Action,
  CheckChoice,
  ControlInput,
  ControlLink,
  ControlSelect,
} from "./components/controls";
import {
  DataTable,
  TableCell,
  TableColumn,
  TableHead,
  TableRow,
  TableRows,
} from "./components/data-table";
import {
  LotForm,
  MailForm,
  OrderForm,
  ReceiptForm,
} from "./forms";
import { confirmAction } from "./components/overlays";
import { Documents } from "./document-controls";
import {
  customFilters,
  paginateOrders,
  readCustomFilter,
} from "./order-filters";
import { LineDisclosure, OrderLineCard } from "./order-line-card";
import { cachedOrderRead } from "./order-read-cache";
import { buildOrderReadModel, filterCustomOrders } from "./order-read-model";
import {
  EMPTY_VALUE,
  calendarDay,
  columnOptions,
  filterColumnRows,
  hasFilter,
  orderColumns,
  readTableState,
  sortColumnRows,
  tableParams,
  type ColumnKey,
  type ColumnRow,
  type TableState,
} from "./order-table";
import { replaceRoute, type OrderListReturn } from "./routing";
import {
  Badge,
  Button,
  CancelButton,
  ConfirmationDialog,
  Dialog,
  Empty,
  LinkButton,
  PageHeading,
  RowLink,
  TabContent,
  TabGroup,
  TabHeader,
  count,
  money,
  shortDate,
  text,
  useApp,
} from "./ui";
import { useBogotaDay } from "./use-bogota-day";

function InvoiceDocumentLink({ invoiceId }: { invoiceId: string | null }) {
  const { db } = useApp();
  const invoice = db.factura.find((row) => row.id === invoiceId);
  if (!invoice) return <>Sin factura</>;
  const document = db.documento.find(
    (row) =>
      row.tipo_entidad === "factura" &&
      row.id_entidad === invoice.id &&
      row.tipo_documento === "factura_fisica",
  );
  return document ? (
    <ControlLink
      className="invoice-document-link"
      href={"/api/documents/" + document.id + "/content"}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={"Abrir documento de factura " + invoice.numero_factura}
    >
      {invoice.numero_factura}
    </ControlLink>
  ) : (
    <>{invoice.numero_factura}</>
  );
}

function LotDate({ label, value }: { label: string; value: string | null }) {
  const day = calendarDay(value);
  return (
    <span className="lot-date">
      <span className="lot-date-label">{label}:</span>
      {day ? (
        <time dateTime={day}>{day.split("-").reverse().join("/")}</time>
      ) : (
        <span>Sin registrar</span>
      )}
    </span>
  );
}

function capturePrintReturnPosition(event: MouseEvent<HTMLAnchorElement>) {
  const link = event.currentTarget;
  const url = new URL(link.href);
  url.searchParams.set(
    "returnTo",
    `${window.location.pathname}${window.location.search}`,
  );
  url.searchParams.set("returnScroll", String(Math.round(window.scrollY)));
  const table = link.closest(".table-scroll");
  if (table)
    url.searchParams.set(
      "returnTableScroll",
      String(Math.round(table.scrollLeft)),
    );
  link.href = `${url.pathname}${url.search}`;
}

function setParams(group: string, params: URLSearchParams, values: Row) {
  const next = new URLSearchParams(params);
  if (!Object.hasOwn(values, "pagina")) next.delete("pagina");
  Object.entries(values).forEach(([k, v]) =>
    v ? next.set(k, String(v)) : next.delete(k),
  );
  replaceRoute(`ordenes/${group}${next.size ? `?${next}` : ""}`);
}
export function OrdersPage({
  group,
  params,
}: {
  group: "productos" | "materiales";
  params: URLSearchParams;
}) {
  const { db, navigate } = useApp();
  const view = params.get("vista") ?? "seguimiento",
    type =
      group === "materiales" &&
      ["material", "otro"].includes(params.get("tipo") ?? "")
        ? params.get("tipo")!
        : "",
    query = params.get("q") ?? "";
  const stateKey = params.toString();
  const tableKey = JSON.stringify([
    params.get("filtros"),
    params.get("estado"),
    params.get("ordenar"),
    params.get("direccion"),
  ]);
  const tableState = useMemo(
    () => readTableState(new URLSearchParams(stateKey)),
    [tableKey],
  );
  const model = useMemo(() => {
    const start = performance.now();
    const prepared = cachedOrderRead(db, "model", () => {
      const { orders, documentByOrderId } = buildOrderReadModel(db);
      const strings=new Map<string,string>();
      const itemGroups=new Map<string,(typeof orders)[number]['itemValues']>();
      const intern=<T extends string|null>(value:T):T=>{
        if(value===null)return value;
        if(!strings.has(value))strings.set(value,value);
        return strings.get(value) as T;
      };
      for(const order of orders){
        order.total=intern(order.total);
        order.elaborationDay=intern(order.elaborationDay);
        order.deliveryDay=intern(order.deliveryDay);
        order.pendingBatchDay=intern(order.pendingBatchDay);
        const key=order.tipo_orden+'\0'+order.itemValues.map(item=>JSON.stringify(item)).join('\0');
        if(!itemGroups.has(key))itemGroups.set(key,order.itemValues);
        order.itemValues=itemGroups.get(key)!;
      }
      return { orders, documentByOrderId };
    });
    performance.clearMeasures("orders:prepare");
    performance.measure("orders:prepare", { start, end: performance.now() });
    return prepared;
  }, [db]);
  const day = useBogotaDay();
  const customFilter = readCustomFilter(params.get("filtro"), group);
  const columns = useMemo(
    () =>
      orderColumns.map((column) => ({
        ...column,
        label:
          column.key === "productos" && group === "materiales"
            ? "Materiales y conceptos"
            : column.label,
      })),
    [group],
  );
  const saveTable = (next: TableState, values: Row = {}) =>
    setParams(group, params, { ...tableParams(next), ...values });
  const q = useDeferredValue(query.toLowerCase());
  const searchedNumber = /^\d+$/.test(query.trim()) ? query.trim() : "";
  const initialType = group === "productos" ? "producto" : type || "material";
  const exactOrder = searchedNumber
    ? cachedOrderRead(
        model,
        "number-index",
        () =>
          new Map(
            model.orders.map((order) => [
              `${order.tipo_orden === "producto" ? "productos" : "materiales"}:${order.no_orden}`,
              order,
            ]),
          ),
      ).get(`${group}:${searchedNumber}`)
    : undefined;
  const [creating, setCreating] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [openedColumn, setOpenedColumn] = useState<ColumnKey | null>(null);
  const all = useMemo(
    () =>
      cachedOrderRead(model, group, () => {
        const shared = new Map<string, ColumnRow["cells"][ColumnKey]>();
        const shareCell = (
          key: string,
          create: () => ColumnRow["cells"][ColumnKey],
        ) => {
          if (!shared.has(key)) shared.set(key, create());
          return shared.get(key)!;
        };
        return model.orders
          .filter((o) =>
            group === "productos"
              ? o.tipo_orden === "producto"
              : o.tipo_orden !== "producto",
          )
          .map((o) => {
            const {
              p,
              itemValues,
              name,
              total,
              elaborationDay: elaboration,
              deliveryDay: delivery,
            } = o;
            const supplierName = p.nombre_corto ?? p.nombre_largo;
            const cells: ColumnRow["cells"] = {
              orden: {
                sortValue: o.no_orden,
                values: [
                  {
                    key: o.no_orden,
                    label: `${orderReference(o.tipo_orden, o.no_orden)} · ${text(o.tipo_orden)}`,
                    value: o.no_orden,
                  },
                ],
              },
              proveedor: shareCell("supplier:" + p.id, () => ({
                sortValue: supplierName,
                searchValues: [
                  p.nombre_corto,
                  p.nombre_largo,
                  p.nit,
                  `NIT ${p.nit ?? "Sin informar"}`,
                ].filter((v): v is string => !!v),
                values: [
                  {
                    key: p.id,
                    label: `${supplierName} · NIT ${p.nit ?? "Sin informar"}`,
                    value: supplierName,
                  },
                ],
              })),
              productos: shareCell(
                "products:" + itemValues.map((item) => item.key).join("|"),
                () => ({
                  sortValue: itemValues[0]?.value ?? null,
                  values: itemValues.length
                    ? itemValues
                    : [{ key: EMPTY_VALUE, label: name, value: null }],
                }),
              ),
              elaboracion: shareCell("elaboration:" + elaboration, () => ({
                sortValue: elaboration,
                values: [
                  {
                    key: elaboration ?? EMPTY_VALUE,
                    label: shortDate(o.fecha_elaboracion),
                    value: elaboration,
                  },
                ],
              })),
              entrega: shareCell("delivery:" + delivery, () => ({
                sortValue: delivery,
                values: [
                  {
                    key: delivery ?? EMPTY_VALUE,
                    label: shortDate(o.fecha_solicitada_entrega),
                    value: delivery,
                  },
                ],
              })),
              estado: shareCell("state:" + o.visible, () => ({
                sortValue: text(o.visible),
                values: [
                  { key: o.visible, label: text(o.visible), value: o.visible },
                ],
              })),
              total: shareCell("total:" + total, () => ({
                sortValue: total,
                values: [{ key: total, label: money(total), value: total }],
              })),
            };
            // Enrich our derived summary without copying every flag; saved API records are untouched.
            const row = o as typeof o & ColumnRow;
            if (itemValues.length) row.itemValues = cells.productos.values;
            row.cells = cells;
            return row;
          });
      }),
    [model, group],
  );
  const inView = (s: string) =>
    view === "no_autorizadas"
      ? s === "no_autorizada"
      : view === "anuladas"
        ? s === "anulada"
        : ["autorizada", "parcialmente_anulada", "cerrada"].includes(s);
  const candidates = useMemo(
    () =>
      filterCustomOrders(
        all.filter(
          (o) =>
            inView(o.visible) &&
            (!type || o.tipo_orden === type) &&
            o.searchText.includes(q),
        ),
        customFilter,
        day,
      ).sort(
        (a, b) =>
          (b.fecha_elaboracion ?? "").localeCompare(
            a.fecha_elaboracion ?? "",
          ) || Number(b.no_orden) - Number(a.no_orden),
      ),
    [all, view, type, q, customFilter, day],
  );
  const rows = useMemo(
    () =>
      sortColumnRows(
        filterColumnRows(candidates, tableState.filters),
        tableState.sort,
      ),
    [candidates, tableState],
  );
  const page = useMemo(
    () => paginateOrders(rows, params.get("pagina")),
    [rows, params.get("pagina")],
  );
  const openedOptions = useMemo(() => {
    const column = columns.find((column) => column.key === openedColumn);
    if (!column) return [];
    const options = columnOptions(
      filterColumnRows(candidates, tableState.filters, column.key),
      column,
    );
    const missing = (tableState.filters[column.key]?.selected ?? []).filter(
      (key) => !options.some((value) => value.key === key),
    );
    if (missing.length) {
      const available = new Map(
        columnOptions(candidates, column).map((value) => [value.key, value]),
      );
      for (const key of missing)
        options.push(
          available.get(key) ?? {
            key,
            label: "Valor no disponible en esta vista",
            value: null,
          },
        );
    }
    return options;
  }, [openedColumn, columns, candidates, tableState]);
  const tableCacheKey = useMemo(
    () => ({ page, openedColumn, openedOptions, tableState }),
    [page, openedColumn, openedOptions, tableState],
  );
  const filterCount =
    columns.filter((column) => hasFilter(tableState.filters[column.key]))
      .length + (customFilter ? 1 : 0);
  const statDefs = [
    {
      label: "Sin autorización",
      s: "no_autorizada",
      icon: Clock3,
      tone: "amber",
      hint: "Pendientes de firma",
    },
    {
      label: "En seguimiento",
      s: "autorizada",
      icon: Package,
      tone: "",
      hint: "Órdenes autorizadas",
    },
    {
      label: "Parcialmente anuladas",
      s: "parcialmente_anulada",
      icon: Ban,
      tone: "red",
      hint: "Con anulaciones parciales",
    },
    {
      label: "Cerradas",
      s: "cerrada",
      icon: CheckCircle2,
      tone: "green",
      hint: "Seguimiento finalizado",
    },
  ];
  return (
    <>
      <TabGroup
        value={group}
        onChange={(value) => navigate("ordenes/" + value)}
      >
        <PageHeading
          title="Órdenes de compra"
          description="Emite órdenes, registra entregas y consulta su seguimiento."
          action={
            <Button
              icon={Plus}
              variant="primary"
              onClick={() => setCreating(true)}
            >
              Nueva orden
            </Button>
          }
        />
        <div className="order-group-tabs">
          <TabHeader
            label="Grupos de órdenes"
            items={[
              { id: "productos", label: "Productos" },
              { id: "materiales", label: "Materiales" },
            ]}
            value={group}
            onChange={(value) => navigate(`ordenes/${value}`)}
          />
          <div
            className="order-numbering"
            aria-label="Consecutivo de órdenes"
            aria-live="polite"
          >
            <span>
              Última {orderPrefix(initialType)}:{" "}
              <strong className="num">
                {db.consecutivo_orden.find(
                  (counter) =>
                    counter.grupo ===
                    (group === "productos" ? "producto" : "material"),
                )?.ultimo_numero ?? 0}
              </strong>
            </span>
            <span>
              Próxima {orderPrefix(initialType)}:{" "}
              <strong className="num">
                {nextOrderNumber(db, initialType)}
              </strong>
            </span>
          </div>
        </div>
        <TabContent id={group}>
          <div className="stats">
            {statDefs.map((s) => (
              <Action
                type="button"
                className="stat"
                key={s.s}
                onClick={() =>
                  saveTable(
                    {
                      ...tableState,
                      filters: {
                        ...tableState.filters,
                        estado:
                          s.s === "no_autorizada"
                            ? undefined
                            : { selected: [s.s] },
                      },
                    },
                    {
                      vista:
                        s.s === "no_autorizada"
                          ? "no_autorizadas"
                          : "seguimiento",
                    },
                  )
                }
              >
                <span className="stat-top">
                  {s.label}
                  <span className={`stat-icon ${s.tone}`}>
                    <s.icon size={16} aria-hidden="true" />
                  </span>
                </span>
                <span className="stat-number num">
                  {all.filter((o) => o.visible === s.s).length}
                </span>
                <small>{s.hint}</small>
              </Action>
            ))}
          </div>
          <section className="panel">
            <TabGroup
              value={view}
              onChange={(v) =>
                saveTable(
                  {
                    ...tableState,
                    filters: { ...tableState.filters, estado: undefined },
                  },
                  { vista: v },
                )
              }
            >
              <TabHeader
                items={[
                  {
                    id: "no_autorizadas",
                    label: "No autorizadas",
                    count: all.filter((o) => o.visible === "no_autorizada")
                      .length,
                  },
                  {
                    id: "seguimiento",
                    label: "Seguimiento",
                    count: all.filter((o) =>
                      [
                        "autorizada",
                        "parcialmente_anulada",
                        "cerrada",
                      ].includes(o.visible),
                    ).length,
                  },
                  {
                    id: "anuladas",
                    label: "Anuladas",
                    count: all.filter((o) => o.visible === "anulada").length,
                  },
                ]}
                value={view}
                onChange={(v) =>
                  saveTable(
                    {
                      ...tableState,
                      filters: { ...tableState.filters, estado: undefined },
                    },
                    { vista: v },
                  )
                }
              />
              <TabContent id={view}>
                <div className="toolbar orders-toolbar">
                  <div className="search">
                    <Search size={16} aria-hidden="true" />
                    <ControlInput
                      className="control"
                      aria-label="Buscar órdenes"
                      placeholder={
                        group === "productos"
                          ? "Buscar por número, producto, código o proveedor…"
                          : "Buscar por número, material, concepto o proveedor…"
                      }
                      value={query}
                      onChange={(e) =>
                        setParams(group, params, { q: e.target.value })
                      }
                    />
                  </div>
                  <div
                    className={`toolbar-controls${group === "materiales" ? " has-order-type-filter" : ""}`}
                  >
                    {group === "materiales" && (
                      <div className="order-type-filter-wrap">
                        <ControlSelect
                          className="control order-type-filter"
                          aria-label="Filtrar tipo de orden"
                          value={type}
                          onChange={(e) =>
                            setParams(group, params, { tipo: e.target.value })
                          }
                        >
                          <option value="">Todos los tipos</option>
                          <option value="material">Material</option>
                          <option value="otro">Otros</option>
                        </ControlSelect>
                      </div>
                    )}
                    <div className="custom-filter-control">
                      <div className="custom-filter-select-wrap">
                        <ControlSelect
                          className="control custom-filter-select"
                          aria-label="Filtro personalizado"
                          value={customFilter}
                          onChange={(e) =>
                            setParams(group, params, { filtro: e.target.value })
                          }
                        >
                          <option value="">Sin filtro personalizado</option>
                          {customFilters
                            .filter(
                              (filter) =>
                                group === "productos" || !filter.productOnly,
                            )
                            .map((filter) => (
                              <optgroup key={filter.id} label={filter.name}>
                                {filter.options.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                        </ControlSelect>
                      </div>
                      <Button
                        icon={CircleHelp}
                        className="icon-btn"
                        aria-label="Ayuda de filtros personalizados"
                        title="Ayuda de filtros personalizados"
                        onClick={() => setHelpOpen(true)}
                      />
                    </div>
                    {filterCount > 0 && (
                      <Button
                        variant="link"
                        className="clear-column-filters"
                        onClick={() =>
                          saveTable(
                            { filters: {}, sort: tableState.sort },
                            { filtro: "" },
                          )
                        }
                      >
                        Limpiar filtros ({filterCount})
                      </Button>
                    )}
                  </div>
                </div>
                {searchedNumber &&
                  (!exactOrder ||
                    !rows.some((o) => o.id === exactOrder.id)) && (
                    <div className="lookup-result">
                      <p>
                        {exactOrder
                          ? inView(exactOrder.visible)
                            ? "La orden existe y está excluida por los filtros actuales."
                            : "La orden existe en otra vista."
                          : `No hay una coincidencia exacta para ${searchedNumber} en el grupo de ${initialType === "producto" ? "producto" : "material y otros"}.`}
                      </p>
                      {exactOrder ? (
                        <LinkButton href={`/ordenes/${exactOrder.id}`}>
                          Abrir orden {searchedNumber}
                        </LinkButton>
                      ) : (
                        <Button icon={Plus} onClick={() => setCreating(true)}>
                          Crear nueva orden
                        </Button>
                      )}
                    </div>
                  )}
                <div className="table-scroll">
                  <DataTable
                    className="data-table orders-table"
                    rowVersion={page.rows}
                    cacheKey={tableCacheKey}
                  >
                    <TableHead>
                      <TableRow>
                        {columns.map((column) => {
                          return (
                            <ColumnHeader
                              key={column.key}
                              column={column}
                              options={
                                openedColumn === column.key ? openedOptions : []
                              }
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
                              onSort={(sort) =>
                                saveTable({ ...tableState, sort })
                              }
                            />
                          );
                        })}
                        <TableColumn scope="col">
                          <span className="visually-hidden">Acciones</span>
                        </TableColumn>
                      </TableRow>
                    </TableHead>
                    <TableRows>
                      {page.rows.map((o) => {
                        const { ls, p, name } = o;
                        const reference = orderReference(
                          o.tipo_orden,
                          o.no_orden,
                        );
                        const returnTo = `${window.location.pathname}${window.location.search}`;
                        const signedOrder = model.documentByOrderId.get(o.id);
                        return (
                          <TableRow key={o.id}>
                            <TableCell>
                              <LinkButton
                                variant="link"
                                className="order-link"
                                href={`/ordenes/${o.id}`}
                              >
                                {orderReference(o.tipo_orden, o.no_orden)}
                              </LinkButton>
                              <small>
                                <Badge value={o.tipo_orden} />
                              </small>
                            </TableCell>
                            <TableCell>
                              <strong>
                                {p.nombre_corto ?? p.nombre_largo}
                              </strong>
                              <small>NIT {p.nit ?? "Sin informar"}</small>
                            </TableCell>
                            <TableCell className="description">
                              <strong>{name}</strong>
                              <small>
                                {ls.length}{" "}
                                {orderItemLabel(o.tipo_orden, ls.length !== 1)}{" "}
                                · {count(o.requestedQuantity)} unidades
                                solicitadas
                              </small>
                            </TableCell>
                            <TableCell className="nowrap">
                              {shortDate(o.fecha_elaboracion)}
                            </TableCell>
                            <TableCell className="nowrap">
                              {shortDate(o.fecha_solicitada_entrega)}
                            </TableCell>
                            <TableCell>
                              <Badge value={o.visible} />
                            </TableCell>
                            <TableCell className="right num nowrap">
                              {money(o.total)}
                            </TableCell>
                            <TableCell className="order-actions-cell">
                              <div className="order-row-actions">
                                <LinkButton
                                  icon={Printer}
                                  className="icon-btn table-action"
                                  href={`/ordenes/${o.id}/imprimir?returnTo=${encodeURIComponent(returnTo)}`}
                                  onClick={capturePrintReturnPosition}
                                  aria-label={`Imprimir ${reference}`}
                                  title="Imprimir orden"
                                />
                                {signedOrder ? (
                                  <LinkButton
                                    icon={FileCheck2}
                                    className="icon-btn table-action"
                                    variant="primary"
                                    href={`/api/documents/${signedOrder.id}/content`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Ver orden firmada de ${reference}`}
                                    title="Ver orden firmada"
                                  />
                                ) : (
                                  <Documents
                                    owner="orden_compra"
                                    ownerId={o.id}
                                    documents={[]}
                                    compact
                                    showList={false}
                                    renderAddTrigger={(open) => (
                                      <Button
                                        icon={FilePlus2}
                                        className="icon-btn table-action"
                                        aria-label={`Agregar orden firmada para ${reference}`}
                                        title="Agregar orden firmada"
                                        onClick={open}
                                      />
                                    )}
                                  />
                                )}
                                <RowLink
                                  label={`Ver orden ${o.no_orden}`}
                                  href={`/ordenes/${o.id}`}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableRows>
                  </DataTable>
                </div>
                {!rows.length && (
                  <Empty
                    title="No hay órdenes coincidentes"
                    description="Cambia los filtros o crea una nueva orden con el consecutivo automático."
                    action={
                      !searchedNumber ? (
                        <Button icon={Plus} onClick={() => setCreating(true)}>
                          Nueva orden
                        </Button>
                      ) : undefined
                    }
                  />
                )}
                <div className="table-footer orders-footer">
                  <span aria-live="polite">
                    {rows.length} órdenes en esta vista · Mostrando {page.start}
                    –{page.end}
                  </span>
                  <nav
                    className="orders-pagination"
                    aria-label="Paginación de órdenes"
                  >
                    <Button
                      icon={ChevronLeft}
                      className="small"
                      disabled={page.page === 1}
                      onClick={() =>
                        setParams(group, params, {
                          pagina: page.page === 2 ? "" : page.page - 1,
                        })
                      }
                    >
                      Anterior
                    </Button>
                    <span className="num">
                      Página {page.page} de {page.pageCount}
                    </span>
                    <Button
                      icon={ChevronRight}
                      className="small"
                      disabled={page.page === page.pageCount}
                      onClick={() =>
                        setParams(group, params, { pagina: page.page + 1 })
                      }
                    >
                      Siguiente
                    </Button>
                  </nav>
                </div>
              </TabContent>
            </TabGroup>
          </section>
          {helpOpen && (
            <Dialog
              title="Filtros personalizados"
              subtitle="Elige un filtro y combínalo con la búsqueda y los filtros de columna."
              onClose={() => setHelpOpen(false)}
            >
              <div className="dialog-body custom-filter-help">
                <dl>
                  {customFilters.map((filter) => (
                    <div className="filter-help-entry" key={filter.id}>
                      <dt>
                        {filter.name}
                        {filter.productOnly && (
                          <span className="filter-scope">OC de producto</span>
                        )}
                      </dt>
                      <dd>{filter.description}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="dialog-footer">
                <Button onClick={() => setHelpOpen(false)}>Entendido</Button>
              </div>
            </Dialog>
          )}
          {creating && (
            <OrderForm
              onClose={() => setCreating(false)}
              initialType={initialType}
            />
          )}
        </TabContent>
      </TabGroup>
    </>
  );
}
export function OrderDetail({
  id,
  listReturn,
}: {
  id: string;
  listReturn?: OrderListReturn | null;
}) {
  const { db, run, navigate, notify } = useApp();
  const o = db.orden_compra.find((o) => o.id === id);
  const [edit, setEdit] = useState(false),
    [authorize, setAuthorize] = useState(false),
    [signed, setSigned] = useState(false),
    [busy, setBusy] = useState(false);
  const [lot, setLot] = useState<{ line: Row; record?: Row } | null>(null),
    [receipt, setReceipt] = useState<Row | null>(null),
    [mail, setMail] = useState<Row | null>(null);
  const [pendingAction, setPendingAction] = useState<
    | { kind: "delete"; line: Row; record: Row }
    | { kind: "anular" | "reabrir"; line: Row }
    | null
  >(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();
  if (!o)
    return (
      <Empty
        title="La orden no existe"
        action={<LinkButton href="/ordenes">Volver a órdenes</LinkButton>}
      />
    );
  const lines = orderLines(db, id),
    provider = db.proveedor.find((p) => p.id === o.id_proveedor)!,
    authorized = o.estado_autorizacion === "autorizada",
    state = orderState(db, o);
  const related =
    o.tipo_orden === "producto"
      ? db.abastecimiento_material
          .filter((a) => lines.some((l) => l.id === a.id_orden_producto))
          .map(
            (a) =>
              db.orden_material.find((l) => l.id === a.id_orden_material)!
                .id_orden_compra,
          )
      : o.tipo_orden === "material"
        ? db.abastecimiento_material
            .filter((a) => lines.some((l) => l.id === a.id_orden_material))
            .map(
              (a) =>
                db.orden_producto.find((l) => l.id === a.id_orden_producto)!
                  .id_orden_compra,
            )
        : [];
  async function changeState(l: Row, s: string) {
    if (!authorized) {
      notify(
        "Autoriza la orden de compra antes de cambiar el estado del seguimiento.",
        true,
      );
      return;
    }
    let confirm = false;
    if (s === "anulada" && o!.tipo_orden === "producto") {
      setActionError(undefined);
      setPendingAction({ kind: "anular", line: l });
      return;
    }
    if (
      s === "en_seguimiento" &&
      o!.tipo_orden === "producto" &&
      l.estado === "anulada" &&
      db.lote_producto.some((record) => record.id_orden_producto === l.id)
    ) {
      setActionError(undefined);
      setPendingAction({ kind: "reabrir", line: l });
      return;
    }
    if (s === "anulada") {
      if (
        !(await confirmAction(
          `¿Anular este ${orderItemLabel(o!.tipo_orden)}? La orden conservará su número.`,
          undefined,
          true,
        ))
      )
        return;
      confirm = true;
    }
    if (s === "cerrada" && o?.tipo_orden === "producto") {
      const d = deviation(db, l);
      if (d !== null && Math.abs(d) > tolerance(db)) {
        if (
          !(await confirmAction(
            `La desviación del producto es ${d.toFixed(2)} %, fuera del margen ±${tolerance(db)} %. ¿Confirmar el cierre manual?`,
          ))
        )
          return;
        confirm = true;
      }
    }
    try {
      await run(
        "setLineState",
        { entity: lineTable(o!.tipo_orden), id: l.id, estado: s, confirm },
        `Estado del ${orderItemLabel(o!.tipo_orden)} actualizado`,
      );
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function confirmLotAction() {
    if (!pendingAction) return;
    setActionBusy(true);
    setActionError(undefined);
    try {
      if (pendingAction.kind === "delete")
        await run(
          "deleteLot",
          { id: pendingAction.record.id, confirm: true },
          "Lote eliminado",
        );
      else
        await run(
          "setLineState",
          {
            entity: "orden_producto",
            id: pendingAction.line.id,
            estado:
              pendingAction.kind === "anular" ? "anulada" : "en_seguimiento",
            confirm: true,
          },
          pendingAction.kind === "anular"
            ? "Producto anulado y lotes eliminados"
            : "Producto reabierto con un lote inicial nuevo",
        );
      setPendingAction(null);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  }
  return (
    <>
      <ControlLink
        className="back-link"
        href={
          listReturn?.path ??
          `/ordenes/${o.tipo_orden === "producto" ? "productos" : "materiales"}`
        }
        data-restore-scroll={listReturn?.top}
        data-restore-table-scroll={listReturn?.tableLeft ?? undefined}
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Volver a órdenes
      </ControlLink>
      <PageHeading
        title={`Orden de compra ${o.no_orden}`}
        description={`${provider.nombre_largo ?? provider.nombre_corto} · ${text(o.tipo_orden)}`}
        action={
          <div className="inline">
            <Button icon={Pencil} onClick={() => setEdit(true)}>
              Editar
            </Button>
            <LinkButton
              icon={Printer}
              href={`/ordenes/${id}/imprimir?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`}
              onClick={capturePrintReturnPosition}
            >
              Imprimir
            </LinkButton>
            <Button
              icon={Send}
              onClick={() =>
                setMail({ event: "envio_orden_compra", orderId: id })
              }
            >
              Correo
            </Button>
            {!authorized && state !== "anulada" && (
              <Button
                icon={FileCheck2}
                variant="primary"
                onClick={() => {
                  setSigned(false);
                  setAuthorize(true);
                }}
              >
                Autorizar
              </Button>
            )}
          </div>
        }
      />
      <div className="detail-layout">
        <div className="stack">
          <section className="panel">
            <div className="section-heading">
              <h2>Información de la orden</h2>
              <Badge value={state} />
            </div>
            <div className="panel-body">
              <dl className="summary-grid">
                <div className="long">
                  <dt>Proveedor</dt>
                  <dd>{provider.nombre_largo ?? provider.nombre_corto}</dd>
                </div>
                <div>
                  <dt>NIT</dt>
                  <dd>
                    {provider.nit ?? "—"}
                    {provider.digito_verf ? `-${provider.digito_verf}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Elaboración</dt>
                  <dd>{shortDate(o.fecha_elaboracion)}</dd>
                </div>
                <div>
                  <dt>Entrega solicitada</dt>
                  <dd>{shortDate(o.fecha_solicitada_entrega)}</dd>
                </div>
                <div>
                  <dt>Autorización</dt>
                  <dd>
                    {authorized
                      ? shortDate(o.fecha_autorizacion)
                      : "Pendiente de firma"}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>
                  {text(orderItemLabel(o.tipo_orden, true))} y recepciones
                </h2>
              </div>
              <small>{lines.length} de 7</small>
            </div>
            <div className="panel-body">
              {!authorized && (
                <div className="notice warning" style={{ marginBottom: 18 }}>
                  <Clock3 size={17} aria-hidden="true" />
                  Autoriza la orden de compra para registrar lotes o recepciones
                  y para cerrar o anular su seguimiento.
                </div>
              )}
              {lines.map((l) => {
                const name =
                  o.tipo_orden === "producto"
                    ? db.productos.find((p) => p.id === l.id_producto)
                        ?.nombre_producto
                    : o.tipo_orden === "material"
                      ? db.materiales.find((m) => m.id === l.id_material)
                          ?.nombre_material
                      : l.producto;
                const lots = db.lote_producto.filter(
                  (b) => b.id_orden_producto === l.id,
                );
                const delta =
                  o.tipo_orden === "producto" ? deviation(db, l) : null;
                const summaryMetrics = (
                  <>
                    <div>
                      <dt>Cantidad solicitada</dt>
                      <dd className="num">{count(l.cantidad_solicitada)}</dd>
                    </div>
                    <div>
                      <dt>Precio unitario</dt>
                      <dd className="num">{money(l.precio_unitario)}</dd>
                    </div>
                    <div>
                      <dt>
                        {o.tipo_orden === "producto"
                          ? "Recibido en lotes cerrados"
                          : "Cantidad recibida"}
                      </dt>
                      <dd className="num">
                        {count(
                          o.tipo_orden === "producto"
                            ? lots
                                .filter((b) => b.estado === "cerrado")
                                .reduce(
                                  (n, b) => n + (b.cantidad_recibida ?? 0),
                                  0,
                                )
                            : (l.cantidad_recibida ?? 0),
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        {o.tipo_orden === "producto"
                          ? "Desviación / margen"
                          : "Entrega recibida"}
                      </dt>
                      <dd>
                        {o.tipo_orden === "producto"
                          ? `${delta === null ? "No calculable" : delta.toFixed(1) + " %"} / ±${tolerance(db)} %`
                          : shortDate(l.fecha_entrega)}
                      </dd>
                    </div>
                  </>
                );
                return (
                  <OrderLineCard state={l.estado} key={l.id}>
                    {({ expanded }) => (
                      <>
                        <div className="line-card-head">
                          <div>
                            <span className="mini-label">
                              {text(orderItemLabel(o.tipo_orden))} {l.posicion}
                            </span>
                            <h3>{name}</h3>
                          </div>
                          <div className="inline line-card-actions">
                            <Badge value={l.estado} />
                            {l.estado === "en_seguimiento" && (
                              <>
                                <Button
                                  className="small"
                                  disabled={!authorized}
                                  onClick={() => void changeState(l, "cerrada")}
                                >
                                  Cerrar
                                </Button>
                                <Button
                                  className="small"
                                  variant="ghost"
                                  disabled={!authorized}
                                  onClick={() => void changeState(l, "anulada")}
                                >
                                  Anular
                                </Button>
                              </>
                            )}
                            {(l.estado === "cerrada" ||
                              l.estado === "anulada") && (
                              <Button
                                className="small"
                                disabled={!authorized}
                                onClick={() =>
                                  void changeState(l, "en_seguimiento")
                                }
                              >
                                Reabrir
                              </Button>
                            )}
                            {o.tipo_orden !== "otro" && (
                              <Button
                                className="small line-disclosure-toggle"
                                slot="trigger"
                                icon={ChevronDown}
                                aria-expanded={expanded}
                                aria-label={`${expanded ? "Ocultar" : "Desplegar"} ${o.tipo_orden === "producto" ? "lotes" : "documentos"} del ${orderItemLabel(o.tipo_orden)} ${l.posicion}`}
                                disabled={
                                  o.tipo_orden === "material" &&
                                  !l.id_lote_material
                                }
                                title={
                                  o.tipo_orden === "material" &&
                                  !l.id_lote_material
                                    ? "Registra un lote de material para gestionar sus documentos"
                                    : undefined
                                }
                              ></Button>
                            )}
                          </div>
                          {o.tipo_orden === "producto" ? (
                            <dl className="line-metadata product">
                              <div>
                                <dt>Código de barras</dt>
                                <dd className="line-code">
                                  {db.codigos_barras.find(
                                    (code) => code.id === l.id_codigo_barras,
                                  )?.codigo ?? "Sin informar"}
                                </dd>
                              </div>
                              {summaryMetrics}
                            </dl>
                          ) : o.tipo_orden === "material" ? (
                            <dl className="line-metadata single">
                              <div>
                                <dt>Código MAIA</dt>
                                <dd className="line-code">
                                  {db.materiales
                                    .find(
                                      (material) =>
                                        material.id === l.id_material,
                                    )
                                    ?.codigo_material?.toString()
                                    .padStart(3, "0") ?? "Sin informar"}
                                </dd>
                              </div>
                            </dl>
                          ) : (
                            <p className="compact-note">
                              Concepto sin catálogo
                            </p>
                          )}
                        </div>
                        {o.tipo_orden === "producto" ? (
                          <dl className="line-metrics line-packaging">
                            <div>
                              <dt>Ref. corrugado</dt>
                              <dd>
                                {db.materiales.find(
                                  (material) => material.id === l.ref_corrugado,
                                )?.nombre_material ??
                                  db.materiales
                                    .find(
                                      (material) =>
                                        material.id === l.ref_corrugado,
                                    )
                                    ?.codigo_material?.toString()
                                    .padStart(3, "0") ??
                                  "Sin informar"}
                              </dd>
                            </div>
                            <div>
                              <dt>Cantidad de corrugado</dt>
                              <dd className="num">
                                {count(l.cantidad_corrugado)}
                              </dd>
                            </div>
                            <div>
                              <dt>
                                {l.cantidad_cinta !== null
                                  ? "Cinta"
                                  : l.cantidad_sticker !== null
                                    ? "Sticker"
                                    : "Sticker / cinta"}
                              </dt>
                              <dd className="num">
                                {l.cantidad_cinta !== null
                                  ? count(l.cantidad_cinta)
                                  : l.cantidad_sticker !== null
                                    ? count(l.cantidad_sticker)
                                    : "Sin registrar"}
                              </dd>
                            </div>
                          </dl>
                        ) : (
                          <dl className="line-metrics">{summaryMetrics}</dl>
                        )}
                        <div className="line-content">
                          {o.tipo_orden === "producto" ? (
                            <>
                              <div className="spread">
                                <h3>Lotes de producto ({lots.length})</h3>
                                <Button
                                  icon={Plus}
                                  className="small"
                                  disabled={
                                    !authorized || l.estado === "anulada"
                                  }
                                  onClick={() => setLot({ line: l })}
                                >
                                  Agregar lote
                                </Button>
                              </div>
                              <LineDisclosure expanded={expanded}>
                                {lots.length ? (
                                  <div className="lot-list table-scroll">
                                    <DataTable
                                      className="data-table product-lots-table"
                                      role="table"
                                      aria-label={
                                        "Lotes del producto " + l.posicion
                                      }
                                    >
                                      <TableHead role="rowgroup">
                                        <TableRow role="row">
                                          <TableColumn
                                            scope="col"
                                            role="columnheader"
                                          >
                                            Lote / factura
                                          </TableColumn>
                                          <TableColumn
                                            scope="col"
                                            role="columnheader"
                                          >
                                            Recibido
                                          </TableColumn>
                                          <TableColumn
                                            scope="col"
                                            role="columnheader"
                                          >
                                            Batch record
                                          </TableColumn>
                                          <TableColumn
                                            scope="col"
                                            role="columnheader"
                                          >
                                            Inspección
                                          </TableColumn>
                                          <TableColumn
                                            scope="col"
                                            role="columnheader"
                                          >
                                            Estado
                                          </TableColumn>
                                          <TableColumn
                                            scope="col"
                                            role="columnheader"
                                          >
                                            <span className="visually-hidden">
                                              Acciones del lote
                                            </span>
                                          </TableColumn>
                                        </TableRow>
                                      </TableHead>
                                      <TableRows role="rowgroup">
                                        {lots.map((b, lotIndex) => (
                                          <TableRow key={b.id} role="row">
                                            <TableCell
                                              className="lot-identity"
                                              role="cell"
                                            >
                                              <strong>
                                                {b.numero_lote ??
                                                  "Sin número de lote"}
                                              </strong>
                                              <small>
                                                <InvoiceDocumentLink
                                                  invoiceId={b.id_factura}
                                                />
                                              </small>
                                              <small>
                                                {b.ubicacion ?? "Sin ubicación"}
                                              </small>
                                            </TableCell>
                                            <TableCell
                                              className="lot-section lot-section-received"
                                              role="cell"
                                            >
                                              <span
                                                className="lot-section-title"
                                                aria-hidden="true"
                                              >
                                                Recibido
                                              </span>
                                              <strong className="num">
                                                {b.cantidad_recibida === null
                                                  ? "Sin recepción"
                                                  : count(b.cantidad_recibida)}
                                              </strong>
                                              <LotDate
                                                label="Fecha de recepción"
                                                value={b.fecha_recepcion}
                                              />
                                            </TableCell>
                                            <TableCell
                                              className="lot-section lot-section-batch"
                                              role="cell"
                                            >
                                              <span
                                                className="lot-section-title"
                                                aria-hidden="true"
                                              >
                                                Batch record
                                              </span>
                                              <Badge
                                                value={b.estado_batch_record}
                                              />
                                              <div className="lot-batch-dates">
                                                <LotDate
                                                  label="Estimado"
                                                  value={
                                                    b.fecha_estimada_batch_record
                                                  }
                                                />
                                                <LotDate
                                                  label="Recibido"
                                                  value={
                                                    b.fecha_entrega_batch_record
                                                  }
                                                />
                                              </div>
                                            </TableCell>
                                            <TableCell
                                              className="lot-section"
                                              role="cell"
                                            >
                                              <span
                                                className="lot-section-title"
                                                aria-hidden="true"
                                              >
                                                Inspección
                                              </span>
                                              <Badge
                                                value={b.estado_inspeccion}
                                              />
                                              <LotDate
                                                label="Fecha de inspección"
                                                value={b.fecha_inspeccion}
                                              />
                                            </TableCell>
                                            <TableCell
                                              className="lot-section"
                                              role="cell"
                                            >
                                              <span
                                                className="lot-section-title"
                                                aria-hidden="true"
                                              >
                                                Estado
                                              </span>
                                              <Badge value={b.estado} />
                                              <LotDate
                                                label="Confirmación"
                                                value={b.fecha_confirmacion}
                                              />
                                            </TableCell>
                                            <TableCell
                                              className="lot-actions"
                                              role="cell"
                                            >
                                              <div className="inline">
                                                <Button
                                                  className="icon-btn table-action"
                                                  icon={Pencil}
                                                  disabled={!authorized}
                                                  aria-label={
                                                    isInitialProductLot(b)
                                                      ? `Completar lote del producto ${l.posicion}`
                                                      : `Editar lote ${b.numero_lote ?? `sin número ${lotIndex + 1} del producto ${l.posicion}`}`
                                                  }
                                                  onClick={() =>
                                                    setLot({
                                                      line: l,
                                                      record: b,
                                                    })
                                                  }
                                                />
                                                <Button
                                                  className="icon-btn table-action delete-action"
                                                  icon={Trash2}
                                                  disabled={!authorized}
                                                  aria-label={`Eliminar lote ${b.numero_lote ?? `sin número ${lotIndex + 1}`} del producto ${l.posicion}`}
                                                  onClick={() => {
                                                    setActionError(undefined);
                                                    setPendingAction({
                                                      kind: "delete",
                                                      line: l,
                                                      record: b,
                                                    });
                                                  }}
                                                />
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableRows>
                                    </DataTable>
                                  </div>
                                ) : (
                                  <p
                                    className="compact-note"
                                    style={{ marginTop: 14 }}
                                  >
                                    {l.estado === "anulada"
                                      ? "Producto anulado. Reábrelo para registrar un lote."
                                      : "No se encontraron lotes para este producto."}
                                  </p>
                                )}
                                {db.abastecimiento_material.some(
                                  (a) => a.id_orden_producto === l.id,
                                ) && (
                                  <div style={{ marginTop: 16 }}>
                                    <small>Materiales vinculados</small>
                                    <div
                                      className="inline"
                                      style={{ marginTop: 7 }}
                                    >
                                      {db.abastecimiento_material
                                        .filter(
                                          (a) => a.id_orden_producto === l.id,
                                        )
                                        .map((a) => {
                                          const m = db.orden_material.find(
                                            (m) => m.id === a.id_orden_material,
                                          )!;
                                          const mo = db.orden_compra.find(
                                            (o) => o.id === m.id_orden_compra,
                                          )!;
                                          return (
                                            <LinkButton
                                              key={m.id}
                                              className="small"
                                              href={`/ordenes/${mo.id}`}
                                            >
                                              {orderReference(
                                                mo.tipo_orden,
                                                mo.no_orden,
                                              )}{" "}
                                              ·{" "}
                                              {
                                                db.materiales.find(
                                                  (x) => x.id === m.id_material,
                                                )?.nombre_material
                                              }
                                              {m.estado === "anulada"
                                                ? " · Anulada"
                                                : ""}
                                            </LinkButton>
                                          );
                                        })}
                                    </div>
                                  </div>
                                )}
                              </LineDisclosure>
                            </>
                          ) : (
                            <>
                              <div className="spread">
                                <div>
                                  <h3>
                                    Recepción del {orderItemLabel(o.tipo_orden)}
                                  </h3>
                                  <p className="compact-note">
                                    {l.id_factura && "Factura "}
                                    <InvoiceDocumentLink
                                      invoiceId={l.id_factura}
                                    />{" "}
                                    · {l.ubicacion ?? "Sin ubicación"}
                                    {l.id_lote_material
                                      ? ` · Lote ${db.lote_material.find((b) => b.id === l.id_lote_material)?.numero_lote}`
                                      : ""}
                                  </p>
                                </div>
                                <Button
                                  icon={Pencil}
                                  className="small"
                                  disabled={!authorized}
                                  onClick={() => setReceipt(l)}
                                >
                                  Registrar / editar
                                </Button>
                              </div>
                              {o.tipo_orden === "material" &&
                                l.id_lote_material && (
                                  <LineDisclosure expanded={expanded}>
                                    <div className="line-document-content">
                                      <Documents
                                        owner="lote_material"
                                        ownerId={l.id_lote_material}
                                        compact
                                      />
                                      <div
                                        className="inline"
                                        style={{ marginTop: 12 }}
                                      >
                                        <Button
                                          className="small"
                                          icon={Send}
                                          onClick={() =>
                                            setMail({
                                              event:
                                                "envio_certificado_calidad",
                                              orderId: id,
                                              loteMaterialId:
                                                l.id_lote_material,
                                            })
                                          }
                                        >
                                          Enviar calidad
                                        </Button>
                                        <Button
                                          className="small"
                                          icon={Send}
                                          onClick={() =>
                                            setMail({
                                              event:
                                                "envio_certificado_liberacion",
                                              orderId: id,
                                              loteMaterialId:
                                                l.id_lote_material,
                                            })
                                          }
                                        >
                                          Enviar liberación
                                        </Button>
                                      </div>
                                    </div>
                                  </LineDisclosure>
                                )}
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </OrderLineCard>
                );
              })}
            </div>
            <div className="table-footer">
              <span>Total de la orden</span>
              <strong
                className="num"
                style={{ fontSize: 15, color: "var(--ink)" }}
              >
                {money(totalLines(lines))}
              </strong>
            </div>
          </section>
        </div>
        <aside className="detail-side stack">
          <section className="panel">
            <Documents owner="orden_compra" ownerId={id} />
          </section>
          <section className="panel">
            <div className="panel-body">
              <h3>
                {o.tipo_orden === "producto"
                  ? "Órdenes de material"
                  : "Órdenes de producto"}{" "}
                vinculadas
              </h3>
              {[...new Set(related)].length ? (
                [...new Set(related)].map((id) => {
                  const r = db.orden_compra.find((o) => o.id === id)!;
                  return (
                    <ControlLink
                      className="related-link"
                      key={id}
                      href={`/ordenes/${id}`}
                    >
                      <div>
                        <strong>
                          {orderReference(r.tipo_orden, r.no_orden)}
                        </strong>
                        <small>
                          {
                            db.proveedor.find((p) => p.id === r.id_proveedor)
                              ?.nombre_corto
                          }{" "}
                          · {text(orderState(db, r))}
                        </small>
                      </div>
                      <ChevronRight size={16} aria-hidden="true" />
                    </ControlLink>
                  );
                })
              ) : (
                <p className="compact-note" style={{ marginTop: 12 }}>
                  Sin órdenes vinculadas.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
      {edit && <OrderForm order={o} onClose={() => setEdit(false)} />}{" "}
      {lot && (
        <LotForm
          line={lot.line}
          record={lot.record}
          onClose={() => setLot(null)}
        />
      )}{" "}
      {receipt && o.tipo_orden !== "producto" && (
        <ReceiptForm
          entity={lineTable(o.tipo_orden) as "orden_material" | "orden_otro"}
          line={receipt}
          onClose={() => setReceipt(null)}
        />
      )}{" "}
      {mail && <MailForm context={mail} onClose={() => setMail(null)} />}{" "}
      {pendingAction && (
        <ConfirmationDialog
          title={
            pendingAction.kind === "delete"
              ? "Eliminar lote"
              : pendingAction.kind === "anular"
                ? "Anular producto"
                : "Reabrir producto"
          }
          confirmLabel={
            pendingAction.kind === "delete"
              ? "Eliminar lote"
              : pendingAction.kind === "anular"
                ? "Anular producto"
                : "Reabrir y reemplazar lotes"
          }
          onConfirm={confirmLotAction}
          onClose={() => setPendingAction(null)}
          busy={actionBusy}
          destructive={
            pendingAction.kind === "delete" ||
            pendingAction.kind === "anular"
          }
          error={actionError}
        >
          {pendingAction.kind === "delete" ? (
            <>
              <p>
                Se eliminará el lote{" "}
                <strong>
                  {pendingAction.record.numero_lote ?? "sin número"}
                </strong>{" "}
                del producto {pendingAction.line.posicion}, incluidos sus datos
                de recepción, Batch record e inspección. Esta acción no se puede
                deshacer.
              </p>
              {db.lote_producto.filter(
                (record) => record.id_orden_producto === pendingAction.line.id,
              ).length === 1 && (
                <p className="notice warning">
                  Es el último lote de este producto. Al eliminarlo, el producto
                  quedará anulado.
                </p>
              )}
            </>
          ) : pendingAction.kind === "anular" ? (
            <p>
              Se anulará el producto {pendingAction.line.posicion} y se
              eliminarán todos sus lotes (
              {
                db.lote_producto.filter(
                  (record) =>
                    record.id_orden_producto === pendingAction.line.id,
                ).length
              }
              ), incluidos sus datos de recepción, Batch record e inspección. Se
              conservarán el renglón comercial y sus vínculos de abastecimiento.
            </p>
          ) : (
            <p>
              Este producto anulado conserva lotes de una versión anterior. Se
              eliminarán todos y se creará un lote inicial nuevo con la entrega
              solicitada actual y estados pendientes.
            </p>
          )}
          <p>Las facturas y sus documentos se conservarán.</p>
        </ConfirmationDialog>
      )}
      {authorize && (
        <Dialog
          title={`Autorizar orden ${o.no_orden}`}
          subtitle="La autorización corresponde a toda la orden de compra."
          onClose={() => setAuthorize(false)}
        >
          <div className="dialog-body">
            <div className="notice warning">
              <Info size={17} aria-hidden="true" />
              Esta acción es irreversible. La orden no podrá volver a no
              autorizada.
            </div>
            <CheckChoice
              className="checkbox-row"
              checked={signed}
              onChange={setSigned}
            >
              Confirmo que la orden física tiene todas las firmas necesarias.
            </CheckChoice>
          </div>
          <div className="dialog-footer">
            <CancelButton onClick={() => setAuthorize(false)}>
              Cancelar
            </CancelButton>
            <Button
              variant="primary"
              icon={Check}
              disabled={!signed || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await run(
                    "authorizeOrder",
                    { id, confirm: true },
                    "Orden autorizada",
                  );
                  setAuthorize(false);
                } catch (e) {
                  notify((e as Error).message, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirmar autorización
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
export function PrintOrder({ id }: { id: string }) {
  const { db, navigate } = useApp();
  const previous = new URLSearchParams(window.location.search).get("returnTo");
  const previousScrollValue = new URLSearchParams(window.location.search).get(
    "returnScroll",
  );
  const previousTableScrollValue = new URLSearchParams(
    window.location.search,
  ).get("returnTableScroll");
  const previousPath = previous?.split(/[?#]/, 1)[0];
  const returnedToList =
    previousPath === "/ordenes/productos" ||
    previousPath === "/ordenes/materiales";
  const validPrevious = returnedToList || previousPath === `/ordenes/${id}`;
  const returnTo = validPrevious && previous ? previous : `/ordenes/${id}`;
  const returnScroll =
    validPrevious && previousScrollValue && /^\d+$/.test(previousScrollValue)
      ? previousScrollValue
      : undefined;
  const returnTableScroll =
    returnedToList &&
    previousTableScrollValue &&
    /^\d+$/.test(previousTableScrollValue)
      ? previousTableScrollValue
      : undefined;
  const o = db.orden_compra.find((o) => o.id === id);
  if (!o) return <Empty title="Orden no encontrada" />;
  const ls = orderLines(db, id),
    p = db.proveedor.find((p) => p.id === o.id_proveedor)!;
  return (
    <div className="print-view">
      <div className="print-toolbar">
        <LinkButton
          icon={ArrowLeft}
          href={returnTo}
          data-restore-scroll={returnScroll}
          data-restore-table-scroll={returnTableScroll}
        >
          {returnedToList ? "Volver a órdenes" : "Volver a la orden"}
        </LinkButton>
        <Button icon={Printer} variant="primary" onClick={() => window.print()}>
          Imprimir orden
        </Button>
      </div>
      <header className="print-header">
        <div className="print-brand">
          GIMED<small>Global International Medicine S.A.S.</small>
        </div>
        <h1>
          {o.tipo_orden === "producto"
            ? "ORDEN DE PRODUCCIÓN"
            : "ORDEN DE COMPRA"}{" "}
          No. {o.no_orden}
        </h1>
      </header>
      <div className="print-meta">
        <div>
          <strong>FECHA</strong>
          {shortDate(o.fecha_elaboracion)}
        </div>
        <div>
          <strong>FECHA ENTREGA</strong>
          {shortDate(o.fecha_solicitada_entrega)}
        </div>
        <div>
          <strong>PROVEEDOR</strong>
          {p.nombre_largo ?? p.nombre_corto}
        </div>
        <div>
          <strong>NIT</strong>
          {p.nit ?? "—"}
          {p.digito_verf ? `-${p.digito_verf}` : ""}
        </div>
      </div>
      <DataTable className="print-table">
        <TableHead>
          <TableRow>
            <TableColumn>CÓDIGO</TableColumn>
            <TableColumn>PRODUCTO</TableColumn>
            <TableColumn>CANTIDAD</TableColumn>
            <TableColumn>PRECIO UNIDAD</TableColumn>
            <TableColumn>TOTAL</TableColumn>
            <TableColumn>No. FACTURA</TableColumn>
            <TableColumn>REVISÓ</TableColumn>
          </TableRow>
        </TableHead>
        <TableRows>
          {Array.from({ length: 7 }, (_, i) => {
            const l = ls[i];
            if (!l)
              return (
                <TableRow key={i}>
                  {Array.from({ length: 7 }, (_, n) => (
                    <TableCell key={n}>&nbsp;</TableCell>
                  ))}
                </TableRow>
              );
            const invoiceIds =
              o.tipo_orden === "producto"
                ? db.lote_producto
                    .filter((b) => b.id_orden_producto === l.id)
                    .map((b) => b.id_factura)
                : [l.id_factura];
            return (
              <TableRow key={i}>
                <TableCell>
                  {o.tipo_orden === "producto"
                    ? db.codigos_barras.find((c) => c.id === l.id_codigo_barras)
                        ?.codigo
                    : o.tipo_orden === "material"
                      ? db.materiales
                          .find((m) => m.id === l.id_material)
                          ?.codigo_material?.toString()
                          .padStart(3, "0")
                      : ""}
                </TableCell>
                <TableCell>
                  {o.tipo_orden === "producto"
                    ? db.productos.find((p) => p.id === l.id_producto)
                        ?.nombre_producto
                    : o.tipo_orden === "material"
                      ? db.materiales.find((m) => m.id === l.id_material)
                          ?.nombre_material
                      : l.producto}
                </TableCell>
                <TableCell className="right">
                  {count(l.cantidad_solicitada)}
                </TableCell>
                <TableCell className="right">
                  {money(l.precio_unitario)}
                </TableCell>
                <TableCell className="right">
                  {money(totalLines([l]))}
                </TableCell>
                <TableCell>
                  {[...new Set(invoiceIds)]
                    .filter(Boolean)
                    .map(
                      (id) =>
                        db.factura.find((f) => f.id === id)?.numero_factura,
                    )
                    .join(", ")}
                </TableCell>
                <TableCell />
              </TableRow>
            );
          })}
        </TableRows>
      </DataTable>
      <div className="print-total">
        <strong>GRAN TOTAL: {money(totalLines(ls))}</strong>
      </div>
      <div className="print-signatures">
        <span>ELABORÓ</span>
        <span>REVISÓ</span>
        <span>AUTORIZÓ</span>
      </div>
      <p className="print-note">
        Prototipo · datos de demostración. Las firmas se recogen en la orden
        física.
      </p>
    </div>
  );
}
