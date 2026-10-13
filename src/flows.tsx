import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Paperclip,
  Send,
  Check,
  ArrowLeft,
  Info,
  ChevronRight,
  FileText,
  SlidersHorizontal,
} from "lucide-react";
import {
  titles,
  words,
  latestBarcode,
  tolerance,
  normalizeInvoice,
  orderReference,
  type Entity,
  type Row,
} from "../shared/schema";
import {
  useApp,
  PageHeading,
  Button,
  LinkButton,
  Badge,
  Empty,
  Dialog,
  Field,
  ErrorNotice,
  useErrors,
  text,
  shortDate,
  count,
  money,
} from "./ui";
import { CatalogTable } from "./catalogs";
import { entityValidation } from "./live-validation";
import {
  buildSupplyRows,
  searchSupplyRows,
  supplyColumns,
  type SupplyColumnKey,
} from "./supply-table";
import { ColumnHeader } from "./column-filter";
import { replaceRoute } from "./routing";
import {
  columnOptions,
  filterTableRows,
  hasFilter,
  readColumnState,
  sortTableRows,
  tableParams,
  type TableState,
} from "./order-table";
import {
  buildInvoiceRows,
  searchInvoiceRows,
  invoiceColumns,
  invoiceDocumentOptions,
  type InvoiceColumnKey,
} from "./invoice-table";
import {
  CatalogForm,
  Documents,
  InvoiceForm,
  MailForm,
  receipts,
} from "./forms";

export function SupplyPage({ params }: { params: URLSearchParams }) {
  const { db } = useApp();
  const [tab, setTab] = useState<"vinculos" | "lotes">("vinculos");
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
    <>
      <PageHeading
        title="Abastecimiento de materiales"
        description="Consulta vínculos entre órdenes y lotes de material."
      />
      <div className="catalog-tabs">
        <button
          type="button"
          className={tab === "vinculos" ? "active" : ""}
          onClick={() => setTab("vinculos")}
        >
          Vínculos entre órdenes
        </button>
        <button
          type="button"
          className={tab === "lotes" ? "active" : ""}
          onClick={() => setTab("lotes")}
        >
          Lotes y certificados
        </button>
      </div>
      {tab === "lotes" ? (
        <CatalogTable entity="lote_material" />
      ) : (
        <section className="panel">
          <div
            className="toolbar"
            role="search"
            aria-label="Búsqueda de órdenes en abastecimiento"
          >
            <div className="search">
              <Search size={16} aria-hidden="true" />
              <input
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
            <table className="data-table catalog-table supply-table">
              <thead>
                <tr>
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
                </tr>
              </thead>
              <tbody>
                {links.map(({ p, m, po, mo }) => {
                  return (
                    <tr key={`${p.id}-${m.id}`}>
                      <td>
                        <LinkButton variant="link" href={`/ordenes/${po.id}`}>
                          {orderReference(po.tipo_orden, po.no_orden)}
                        </LinkButton>
                      </td>
                      <td>
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
                      </td>
                      <td>
                        <LinkButton variant="link" href={`/ordenes/${mo.id}`}>
                          {orderReference(mo.tipo_orden, mo.no_orden)}
                        </LinkButton>
                      </td>
                      <td>
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
                      </td>
                      <td>
                        <Badge value={m.estado} />
                      </td>
                    </tr>
                  );
                })}
                {!links.length && (
                  <tr>
                    <td colSpan={5}>
                      <Empty
                        title={
                          all.length
                            ? "Sin vínculos coincidentes"
                            : "Sin vínculos entre órdenes"
                        }
                        description="Ajusta la búsqueda o los filtros de columna para consultar los vínculos disponibles."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <div role="status" aria-live="polite">
              {links.length} {links.length === 1 ? "vínculo" : "vínculos"}
            </div>
          </div>
        </section>
      )}
    </>
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
        <a href="/facturas" className="back-link">
          <ArrowLeft size={15} aria-hidden="true" />
          Volver a facturas
        </a>
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
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Orden</th>
                      <th>Producto o concepto</th>
                      <th>Lote</th>
                    </tr>
                  </thead>
                  <tbody>
                    {associated.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <LinkButton
                            variant="link"
                            href={`/ordenes/${r.orderId}`}
                          >
                            {orderReference(r.orderType, r.order)}
                          </LinkButton>
                        </td>
                        <td>{r.item}</td>
                        <td>{r.lot}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
            <input
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
          <table className="data-table catalog-table invoice-table">
            <thead>
              <tr>
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
                <th>
                  <span className="visually-hidden">Detalle</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ invoice: f, provider, receiptCount, document }) => {
                return (
                  <tr key={f.id}>
                    <td>
                      <LinkButton variant="link" href={`/facturas/${f.id}`}>
                        {f.numero_factura}
                      </LinkButton>
                    </td>
                    <td>{provider?.nombre_corto ?? provider?.nombre_largo}</td>
                    <td>{shortDate(f.fecha_registro)}</td>
                    <td className="num">{receiptCount}</td>
                    <td>
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
                    </td>
                    <td>
                      <LinkButton
                        className="icon-btn"
                        icon={ChevronRight}
                        aria-label={`Ver factura ${f.numero_factura}`}
                        href={`/facturas/${f.id}`}
                      />
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={6}>
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
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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

export function CodesPage() {
  const { db, run, navigate } = useApp();
  const [query, setQuery] = useState(""),
    [state, setState] = useState(""),
    [creating, setCreating] = useState(false),
    [code, setCode] = useState(""),
    [action, setAction] = useState<Row | null>(null),
    [product, setProduct] = useState(""),
    [busy, setBusy] = useState(false),
    [mail, setMail] = useState(false);
  const { error, catchError, setError } = useErrors({
    values: { codigo: code, id_producto: product },
    valid: (field) =>
      field === "codigo"
        ? entityValidation("codigos_barras", { codigo: code }, db).valid(field)
        : field === "id_producto" &&
          db.productos.some((row) => row.id === product),
  });
  const rows = db.codigos_barras
    .filter(
      (c) =>
        (!state || c.estado === state) &&
        [
          c.codigo,
          db.productos.find((p) => p.id === c.id_producto)?.nombre_producto,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      (b.fecha_creacion ?? "").localeCompare(a.fecha_creacion ?? ""),
    );
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
        "advanceBarcode",
        {
          id: action!.id,
          estado: action!.next,
          id_producto: product,
          confirm: true,
        },
        "Código actualizado",
      );
      setAction(null);
    } catch (e) {
      catchError(e);
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
            <Button icon={Send} onClick={() => setMail(true)}>
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
        <div className="code-step">
          <span>01</span>Creado en GS1
        </div>
        <ChevronRight size={16} className="flow-arrow" aria-hidden="true" />
        <div className="code-step">
          <span>02</span>Verificado en sistema
        </div>
        <ChevronRight size={16} className="flow-arrow" aria-hidden="true" />
        <div className="code-step">
          <span>03</span>Asignado al producto
        </div>
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="search">
            <Search size={16} aria-hidden="true" />
            <input
              className="control"
              aria-label="Buscar códigos de barras"
              placeholder="Buscar código o producto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="control filter-select"
            aria-label="Filtrar estado de código"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">Todos los estados</option>
            {["creado_gs1", "verificado_sistema", "asignado", "inactivo"].map(
              (s) => (
                <option key={s} value={s}>
                  {text(s)}
                </option>
              ),
            )}
          </select>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table className="data-table catalog-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Estado GS1 / sistema</th>
                  <th>Creación</th>
                  <th>Historial y acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">
                      <strong>{c.codigo}</strong>
                    </td>
                    <td>
                      {db.productos.find((p) => p.id === c.id_producto)
                        ?.nombre_producto ?? "Sin producto asignado"}
                    </td>
                    <td>
                      <Badge value={c.estado} />
                    </td>
                    <td>{shortDate(c.fecha_creacion)}</td>
                    <td>
                      <div className="inline">
                        {c.estado === "creado_gs1" && (
                          <Button
                            className="small"
                            onClick={() => {
                              setError(null);
                              setAction({ ...c, next: "verificado_sistema" });
                            }}
                          >
                            Confirmar disponibilidad
                          </Button>
                        )}
                        {c.estado === "verificado_sistema" && (
                          <Button
                            className="small"
                            onClick={() => {
                              setError(null);
                              setProduct("");
                              setAction({ ...c, next: "asignado" });
                            }}
                          >
                            Asignar producto
                          </Button>
                        )}
                        {c.estado === "asignado" && (
                          <Button
                            className="small"
                            onClick={() => {
                              setError(null);
                              setAction({ ...c, next: "inactivo" });
                            }}
                          >
                            Marcar inactivo
                          </Button>
                        )}
                        <LinkButton
                          variant="link"
                          href={`/ordenes?q=${c.codigo}`}
                        >
                          Ver órdenes
                        </LinkButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
        <div className="table-footer">
          <span>{rows.length} códigos</span>
          <span>
            La selección para nuevas órdenes usa el código activo más reciente.
          </span>
        </div>
      </section>
      {creating && (
        <Dialog
          title="Registrar código GS1"
          subtitle="La creación en GS1 ocurre fuera de la aplicación."
          onClose={() => setCreating(false)}
        >
          <form onSubmit={create}>
            <div className="dialog-body">
              <ErrorNotice error={error} />
              <Field
                id="field-codigo"
                label="Código de barras"
                required
                error={error?.fields.codigo}
              >
                <input
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
              <Button onClick={() => setCreating(false)}>Cancelar</Button>
              <Button type="submit" variant="primary" disabled={busy}>
                Registrar código
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {action && (
        <Dialog
          title={
            action.next === "asignado"
              ? "Asignar código a producto"
              : action.next === "inactivo"
                ? "Marcar código inactivo"
                : "Confirmar disponibilidad"
          }
          subtitle={`Código ${action.codigo}`}
          onClose={() => setAction(null)}
        >
          <div className="dialog-body">
            <ErrorNotice error={error} />
            {action.next === "asignado" ? (
              <Field id="field-id_producto" label="Producto" required>
                <select
                  id="field-id_producto"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                >
                  <option value="">Seleccionar…</option>
                  {db.productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre_producto}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <p>
                {action.next === "inactivo"
                  ? "Confirma que el código está inactivo en GS1. Las órdenes históricas conservarán el código utilizado."
                  : "Confirma que se comprobó la disponibilidad del código en el sistema."}
              </p>
            )}
          </div>
          <div className="dialog-footer">
            <Button onClick={() => setAction(null)}>Cancelar</Button>
            <Button
              variant="primary"
              icon={Check}
              disabled={busy || (action.next === "asignado" && !product)}
              onClick={() => void advance()}
            >
              Confirmar
            </Button>
          </div>
        </Dialog>
      )}
      {mail && (
        <MailForm
          context={{ event: "codigos_barras_nuevos" }}
          onClose={() => setMail(false)}
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
      <div className="notice" style={{ marginBottom: 20 }}>
        <Info size={18} aria-hidden="true" />
        <div>
          Todos los envíos se confirman mediante un simulador local. Se conserva
          el mensaje y sus destinatarios; el cuerpo y las versiones de adjuntos
          no se guardan.
        </div>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Historial de envíos simulados</h2>
          <small>{db.correo_enviado.length} mensajes</small>
        </div>
        {db.correo_enviado.length ? (
          <div className="table-scroll">
            <table className="data-table catalog-table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Fecha</th>
                  <th>Remitente</th>
                  <th>Destinatarios utilizados</th>
                </tr>
              </thead>
              <tbody>
                {[...db.correo_enviado]
                  .sort((a, b) => b.fecha_envio.localeCompare(a.fecha_envio))
                  .map((m) => (
                    <tr key={m.id_correo + "-" + m.remitente}>
                      <td>
                        <strong>{text(m.tipo_evento)}</strong>
                        <small className="mono">{m.id_correo}</small>
                      </td>
                      <td>{shortDate(m.fecha_envio)}</td>
                      <td>{m.remitente}</td>
                      <td>
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
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
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
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Apartados de configuración">
          {groups.map((g) => (
            <button
              type="button"
              key={g.id}
              className={tab === g.id ? "selected" : ""}
              aria-current={tab === g.id ? "page" : undefined}
              onClick={() => setTab(g.id)}
            >
              {g.label}
            </button>
          ))}
        </nav>
        <div>
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
              <form onSubmit={submit}>
                <div className="panel-body stack">
                  <ErrorNotice error={error} />
                  <Field
                    id="field-margen_tolerancia_pct"
                    label="Nueva tolerancia (%)"
                    hint="La configuración vigente se conserva en el historial."
                    error={error?.fields.margen_tolerancia_pct}
                  >
                    <input
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
              </form>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Margen</th>
                      <th>Inicio de vigencia</th>
                      <th>Configuración</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...db.parametros_seguimiento]
                      .sort((a, b) =>
                        b.fecha_inicio.localeCompare(a.fecha_inicio),
                      )
                      .map((p, i) => (
                        <tr key={p.id}>
                          <td>±{p.margen_tolerancia_pct} %</td>
                          <td>{shortDate(p.fecha_inicio)}</td>
                          <td>
                            {i === 0 ? (
                              <Badge value="autorizada">Vigente</Badge>
                            ) : (
                              <span className="muted">Histórica</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

export function DocumentsPage() {
  const { db, navigate } = useApp();
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState(""),
    [selected, setSelected] = useState<Row | null>(null);
  const rows = db.documento.filter(
    (d) =>
      (!kind || d.tipo_documento === kind) &&
      [d.nombre_archivo, text(d.tipo_documento)]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        title="Documentos"
        description="Archivos de demostración asociados a facturas, órdenes y lotes de material."
      />
      <section className="panel">
        <div className="toolbar">
          <div className="search">
            <Search size={16} aria-hidden="true" />
            <input
              className="control"
              aria-label="Buscar documentos"
              placeholder="Buscar nombre o clase de documento…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="control filter-select"
            aria-label="Filtrar clase de documento"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">Todas las clases</option>
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
          </select>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table className="data-table catalog-table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Propietario</th>
                  <th>Clase</th>
                  <th>Cargado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const order =
                    d.tipo_entidad === "orden_compra"
                      ? db.orden_compra.find((o) => o.id === d.id_entidad)
                      : undefined;
                  const owner =
                    d.tipo_entidad === "factura"
                      ? db.factura.find((f) => f.id === d.id_entidad)
                          ?.numero_factura
                      : d.tipo_entidad === "orden_compra"
                        ? order
                          ? orderReference(order.tipo_orden, order.no_orden)
                          : "Orden no disponible"
                        : d.tipo_entidad === "lote_material"
                          ? db.lote_material.find((l) => l.id === d.id_entidad)
                              ?.numero_lote
                          : "Global";
                  return (
                    <tr key={d.id}>
                      <td>
                        <a
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
                        </a>
                        <small>Placeholder · {d.tipo_mime}</small>
                      </td>
                      <td>
                        {d.tipo_entidad === "factura" ||
                        d.tipo_entidad === "orden_compra" ? (
                          <LinkButton
                            variant="link"
                            href={`/${d.tipo_entidad === "factura" ? "facturas" : "ordenes"}/${d.id_entidad}`}
                          >
                            {owner}
                          </LinkButton>
                        ) : (
                          owner
                        )}
                      </td>
                      <td>{text(d.tipo_documento)}</td>
                      <td>{shortDate(d.fecha_carga)}</td>
                      <td>
                        <div className="inline">
                          <a
                            href={`/api/documents/${d.id}/content?download=1`}
                            style={{ fontSize: 11 }}
                          >
                            Descargar
                          </a>
                          <Button
                            className="small"
                            onClick={() => setSelected(d)}
                          >
                            Gestionar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
        <div className="table-footer">
          <span>{rows.length} documentos</span>
          <span>
            Los certificados vigentes se sustituyen sin historial de versiones.
          </span>
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
