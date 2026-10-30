import {
  lazy,
  Suspense,
  useDeferredValue,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import {
  consolidateMaterialSources,
  groupMaterialSources,
  validDemandDay,
  type MaterialDemand,
} from "../shared/material-demand";
import { ColumnHeader } from "./column-filter";
import { CheckChoice, ControlForm, ControlInput } from "./components/controls";
import {
  DataTable,
  TableCell,
  TableColumn,
  TableHead,
  TableRow,
  TableRows,
} from "./components/data-table";
import { formatDateInput, parseDateInput } from "./dates";
import { OrderForm } from "./forms";
import {
  buildDemandRows,
  demandColumns,
  filterDemandRange,
  pendingPrefix,
  readDemandParams,
  searchDemandRows,
  type DemandColumnKey,
  type DemandRow,
} from "./material-demand-table";
import {
  columnOptions,
  filterTableRows,
  hasFilter,
  readColumnState,
  sortTableRows,
  tableParams,
  type TableState,
} from "./order-table";
import { replaceRoute } from "./routing";
import {
  ApiError,
  Button,
  DateInput,
  Empty,
  ErrorNotice,
  Field,
  LinkButton,
  confirmAction,
  count,
  useApp,
  useErrors,
} from "./ui";

const pageSize = 50;
const MaterialQuotationDialog = lazy(() => import("./material-quotation"));
export function PendingMaterialsPage({ params }: { params: URLSearchParams }) {
  const { db } = useApp();
  const stateKey = params.toString();
  const local = useMemo(
    () => readDemandParams(new URLSearchParams(stateKey)),
    [stateKey],
  );
  const desde = local.get("desde") ?? "",
    hasta = local.get("hasta") ?? "";
  const [from, setFrom] = useState(desde),
    [to, setTo] = useState(hasta);
  const [selected, setSelected] = useState<Map<string, DemandRow>>(
    () => new Map(),
  );
  const [draft, setDraft] = useState<MaterialDemand | null>(null);
  const [quotation, setQuotation] = useState<MaterialDemand | null>(null);
  const [status, setStatus] = useState("");
  const [opened, setOpened] = useState<DemandColumnKey | null>(null);
  const { error, setError, catchError } = useErrors({
    values: { desde: from, hasta: to },
    valid: (field) => {
      const a = parseDateInput(from),
        b = parseDateInput(to);
      return field === "desde" ? Boolean(a) : Boolean(b && a && b >= a);
    },
  });
  const all = useMemo(() => buildDemandRows(db), [db]);
  const ranged = useMemo(
    () => filterDemandRange(all, desde, hasta),
    [all, desde, hasta],
  );
  const query = local.get("q") ?? "";
  const deferredQuery = useDeferredValue(query);
  const searched = useMemo(
    () => searchDemandRows(ranged, deferredQuery),
    [ranged, deferredQuery],
  );
  const tableState = useMemo(
    () => readColumnState(local, demandColumns),
    [local],
  );
  const rows = useMemo(
    () =>
      sortTableRows(
        filterTableRows(searched, demandColumns, tableState.filters),
        demandColumns,
        tableState.sort ?? { column: "entrega", direction: "asc" },
      ),
    [searched, tableState],
  );
  const options = useMemo(() => {
    const column = demandColumns.find((column) => column.key === opened);
    if (!column) return [];
    const values = columnOptions(
      filterTableRows(searched, demandColumns, tableState.filters, column.key),
      column,
    );
    const available = new Map(
      columnOptions(ranged, column).map((value) => [value.key, value]),
    );
    for (const key of tableState.filters[column.key]?.selected ?? [])
      if (!values.some((value) => value.key === key))
        values.push(
          available.get(key) ?? {
            key,
            label: "Valor no disponible",
            value: null,
          },
        );
    return values;
  }, [opened, searched, ranged, tableState]);
  const groups = useMemo(() => {
    const materialGroups = new Map<
      string,
      { name: string; code: string; orders: Set<string> }
    >();
    for (const row of selected.values()) {
      const group = materialGroups.get(row.material.id) ?? {
        name: row.material.nombre_material ?? "Material",
        code:
          row.material.codigo_material == null
            ? "Sin código"
            : String(row.material.codigo_material).padStart(3, "0"),
        orders: new Set<string>(),
      };
      group.orders.add(row.order.id);
      materialGroups.set(row.material.id, group);
    }
    return materialGroups;
  }, [selected]);
  const selectedOrderCount = useMemo(
    () => new Set([...selected.values()].map((row) => row.order.id)).size,
    [selected],
  );
  const hasRange = Boolean(desde || hasta);
  const queried =
    !hasRange ||
    (validDemandDay(desde) && validDemandDay(hasta) && desde <= hasta);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const rawPage = Number(local.get("pagina") ?? 1);
  const page =
    Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, pages) : 1;
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);
  const filterCount = demandColumns.filter((column) =>
    hasFilter(tableState.filters[column.key]),
  ).length;
  function saveParams(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    if (!Object.hasOwn(values, "pagina")) next.delete(`${pendingPrefix}pagina`);
    for (const [key, value] of Object.entries(values))
      value
        ? next.set(`${pendingPrefix}${key}`, value)
        : next.delete(`${pendingPrefix}${key}`);
    replaceRoute(`abastecimiento?${next}`);
  }
  const saveTable = (state: TableState<DemandColumnKey>) =>
    saveParams(tableParams(state));
  async function consult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const a = parseDateInput(from),
      b = parseDateInput(to);
    if (!from && !to) {
      if (
        (desde || hasta) &&
        selected.size &&
        !(await confirmAction(
          "Quitar el rango descartará los materiales y vínculos seleccionados.",
          "Quitar rango",
          true,
        ))
      ) {
        setFrom(desde);
        setTo(hasta);
        return;
      }
      if (desde || hasta) setSelected(new Map());
      setError(null);
      setStatus("");
      saveParams({ desde: "", hasta: "" });
      return;
    }
    const fields: Record<string, string> = {};
    if (!a) fields.desde = "Indica una fecha Desde válida.";
    if (!b) fields.hasta = "Indica una fecha Hasta válida.";
    else if (a && a > b)
      fields.hasta = "Hasta debe ser posterior o igual a Desde.";
    if (Object.keys(fields).length) {
      setError(
        new ApiError({
          message: "Revisa el rango de entrega solicitada.",
          fields,
        }),
      );
      return;
    }
    if (
      (a !== desde || b !== hasta) &&
      selected.size &&
      !(await confirmAction(
        "Cambiar el rango descartará los materiales y vínculos seleccionados.",
        "Cambiar rango",
        true,
      ))
    ) {
      setFrom(desde);
      setTo(hasta);
      return;
    }
    if (a !== desde || b !== hasta) setSelected(new Map());
    setError(null);
    setStatus("");
    saveParams({ desde: a!, hasta: b! });
  }
  function toggle(row: DemandRow, checked: boolean) {
    setSelected((previous) => {
      const next = new Map(previous);
      if (checked) {
        next.set(row.key, row);
      } else next.delete(row.key);
      return next;
    });
    setStatus("");
  }
  function prepare() {
    try {
      const fuentes = [...selected.values()].map((row) => ({ ...row.source }));
      consolidateMaterialSources(fuentes);
      const days = [...selected.values()].map((row) => row.deliveryDay).sort();
      setDraft({
        desde: desde || days[0],
        hasta: hasta || days.at(-1)!,
        fuentes,
      });
      setError(null);
    } catch (error) {
      catchError(error);
    }
  }
  function review() {
    const current = new Map(ranged.map((row) => [row.key, row]));
    setSelected(
      (previous) =>
        new Map(
          [...previous.keys()].flatMap((key) =>
            current.has(key) ? [[key, current.get(key)!] as const] : [],
          ),
        ),
    );
    setDraft(null);
    setStatus(
      "Selección actualizada. Revisa los orígenes disponibles y vuelve a preparar la OCM.",
    );
  }
  return (
    <>
      <section
        className="panel material-demand-panel"
        data-range-from={desde}
        aria-label="Materiales pendientes de compra"
      >
        <ControlForm
          className="demand-range"
          onSubmit={consult}
          fieldErrors={error?.fields}
          noValidate
        >
          <ErrorNotice error={error} />
          <div className="demand-range-fields">
            <Field
              id="field-desde"
              label="Entrega solicitada desde"
              error={error?.fields.desde}
            >
              <DateInput id="field-desde" value={from} onChange={setFrom} />
            </Field>
            <Field id="field-hasta" label="Hasta" error={error?.fields.hasta}>
              <DateInput id="field-hasta" value={to} onChange={setTo} />
            </Field>
            <Button type="submit" variant="primary">
              Consultar
            </Button>
          </div>
        </ControlForm>
        <div
          className="toolbar"
          role="search"
          aria-label="Búsqueda de materiales pendientes"
        >
          <div className="search">
            <Search size={16} aria-hidden="true" />
            <ControlInput
              className="control"
              type="search"
              aria-label="Buscar OC, producto o material pendiente"
              placeholder="Buscar OC, producto o material…"
              value={query}
              disabled={!queried}
              onChange={(event) => saveParams({ q: event.target.value })}
            />
          </div>
          <div className="filter-actions">
            {query && (
              <Button variant="link" onClick={() => saveParams({ q: "" })}>
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
          <DataTable
            className="data-table catalog-table material-demand-table"
            aria-label="Necesidades de material por producto"
            onRowClick={(key) => {
              const row = visible.find((item) => item.key === key);
              if (!row) return;
              toggle(row, !selected.has(key));
            }}
          >
            <TableHead>
              <TableRow>
                <TableColumn>Selección</TableColumn>
                {demandColumns.map((column) => (
                  <ColumnHeader
                    key={column.key}
                    column={column}
                    options={opened === column.key ? options : []}
                    filter={tableState.filters[column.key]}
                    sort={tableState.sort}
                    open={opened === column.key}
                    onOpen={() => setOpened(column.key)}
                    onClose={() => setOpened(null)}
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
              {visible.map((row) => (
                <TableRow
                  key={row.key}
                  data-need={row.key}
                  data-demand-selected={selected.has(row.key) || undefined}
                >
                  <TableCell>
                    <CheckChoice
                      checked={selected.has(row.key)}
                      onChange={(checked) => toggle(row, checked)}
                      aria-label={`Seleccionar ${row.material.nombre_material} para OC ${row.order.no_orden}, renglón ${row.line.posicion}, ${row.product.nombre_producto}`}
                    >
                      <span className="visually-hidden">
                        Seleccionar material
                      </span>
                    </CheckChoice>
                  </TableCell>
                  <TableCell>
                    <strong>{row.material.nombre_material}</strong>
                    <small>
                      MAIA{" "}
                      {row.material.codigo_material == null
                        ? "Sin código"
                        : String(row.material.codigo_material).padStart(3, "0")}
                    </small>
                  </TableCell>
                  <TableCell>
                    <LinkButton
                      variant="link"
                      href={`/ordenes/${row.order.id}`}
                    >
                      OC {row.order.no_orden}
                    </LinkButton>
                  </TableCell>
                  <TableCell>
                    <strong>{row.product.nombre_producto}</strong>
                    <small>
                      {row.provider.nombre_corto ?? row.provider.nombre_largo} ·
                      Renglón {row.line.posicion}
                    </small>
                  </TableCell>
                  <TableCell className="num">
                    {count(row.line.cantidad_solicitada)}
                  </TableCell>
                  <TableCell>{formatDateInput(row.deliveryDay)}</TableCell>
                </TableRow>
              ))}
              {!visible.length && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Empty
                      title={
                        !queried
                          ? "Selecciona un rango de entrega"
                          : ranged.length
                            ? "Sin necesidades coincidentes"
                            : hasRange
                              ? "Sin materiales pendientes en este rango"
                              : "Sin materiales pendientes"
                      }
                      description={
                        !queried
                          ? "Indica Desde y Hasta y pulsa Consultar para ver los materiales que faltan por ordenar."
                          : hasRange
                            ? "Ajusta el rango, la búsqueda o los filtros para consultar otras necesidades."
                            : "No hay vínculos pendientes de compra para mostrar."
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableRows>
          </DataTable>
        </div>
        <div className="table-footer demand-pagination">
          <span role="status" aria-live="polite">
            {rows.length}{" "}
            {rows.length === 1 ? "vínculo pendiente" : "vínculos pendientes"}
            {rows.length > 0
              ? ` · ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, rows.length)}`
              : ""}
          </span>
          <div className="demand-page-actions">
            <Button
              icon={ChevronLeft}
              disabled={page === 1}
              onClick={() => saveParams({ pagina: String(page - 1) })}
            >
              Anterior
            </Button>
            <span>
              Página {page} de {pages}
            </span>
            <Button
              icon={ChevronRight}
              disabled={page === pages}
              onClick={() => saveParams({ pagina: String(page + 1) })}
            >
              Siguiente
            </Button>
          </div>
        </div>
        <div
          className="demand-selection"
          aria-label="Resumen de materiales seleccionados"
        >
          <div
            className="demand-selection-count"
            role="status"
            aria-live="polite"
          >
            <strong>{groups.size} materiales</strong>
            <span>
              {selected.size} {selected.size === 1 ? "vínculo" : "vínculos"} ·{" "}
              {selectedOrderCount} OC
            </span>
          </div>
          <div className="demand-selection-items">
            {[...groups].map(([id, group]) => (
              <div className="demand-selection-item" key={id}>
                <span>
                  {group.name}{" "}
                  <small>
                    · MAIA {group.code} · {group.orders.size} OC
                  </small>
                </span>
                <Button
                  icon={X}
                  className="icon-btn"
                  aria-label={`Quitar ${group.name} (MAIA ${group.code}) de la selección`}
                  onClick={() =>
                    setSelected(
                      (previous) =>
                        new Map(
                          [...previous].filter(
                            ([, row]) => row.material.id !== id,
                          ),
                        ),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <div className="demand-selection-actions">
            <Button
              disabled={!selected.size}
              onClick={() => {
                try {
                  const fuentes = [...selected.values()].map((row) => ({
                    ...row.source,
                  }));
                  groupMaterialSources(fuentes);
                  const days = [...selected.values()]
                    .map((row) => row.deliveryDay)
                    .sort();
                  setQuotation({
                    desde: desde || days[0],
                    hasta: hasta || days.at(-1)!,
                    fuentes,
                  });
                  setError(null);
                } catch (cause) {
                  catchError(cause);
                }
              }}
            >
              Cotizar materiales
            </Button>
            <Button
              variant="primary"
              disabled={!selected.size || groups.size > 7}
              onClick={prepare}
            >
              Elaborar OCM
            </Button>
          </div>
          {groups.size > 7 && (
            <p className="compact-note demand-limit">
              Puedes cotizar todos los materiales. Para elaborar una OCM, reduce
              la selección a un máximo de 7 materiales distintos.
            </p>
          )}
          {status && (
            <p className="compact-note demand-limit" role="status">
              {status}
            </p>
          )}
        </div>
      </section>
      {draft && (
        <OrderForm
          initialType="material"
          abastecimiento={draft}
          onClose={() => setDraft(null)}
          onReviewSupply={review}
        />
      )}
      {quotation && (
        <Suspense fallback={<p role="status">Preparando cotización…</p>}>
          <MaterialQuotationDialog
            demanda={quotation}
            onClose={() => setQuotation(null)}
          />
        </Suspense>
      )}
    </>
  );
}
