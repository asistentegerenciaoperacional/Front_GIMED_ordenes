import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog as AriaDialog,
  DialogTrigger,
} from "react-aria-components/Dialog";
import { Popover } from "react-aria-components/Popover";
import {
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  Eye,
  FileText,
  Plus,
  Printer,
  Save,
  Undo2,
  Pencil,
  FilterX,
} from "lucide-react";
import { blankRow, labels, meta, type Row } from "../shared/schema";
import type { Database } from "../shared/models";
import { materialRole } from "../shared/product-materials";
import {
  changeKey,
  isSheetDraft,
  overlaySheetChanges,
  type SheetChange,
} from "../shared/product-order-sheet";
import { productLotLifecycleSnapshot } from "../shared/product-lot-lifecycle";
import { ColumnHeader } from "./column-filter";
import {
  CheckChoice,
  ControlForm,
  ControlInput,
  ControlSelect,
  CustomFilterSelect,
} from "./components/controls";
import {
  ProductSheetGrid,
  SheetCellHint,
} from "./components/product-sheet-grid";
import { SheetSelection, rangeBounds } from "./product-sheet-selection";
import { SheetSelectionView } from "./components/sheet-selection-view";
import { InvoicePicker, OrderForm, productLotFieldOrder } from "./forms";
import { ActionTooltip } from "./components/overlays";
import { customFilters, readCustomFilter } from "./order-filters";
import {
  columnOptions,
  calendarDay,
  hasFilter,
  filterTableRows,
  readColumnState,
  sortTableRows,
  tableParams,
} from "./order-table";
import { OrderAuthorizationDialog } from "./order-authorization";
import {
  buildProductSheet,
  cellPermission,
  columnsForSheet,
  matchesSheetFilter,
  formatSheetClipboard,
  parseSheetClipboard,
  proposeSheetInput,
  productSheetColumns,
  sheetEnumLabel,
  sheetRaw,
  sheetTarget,
  sheetValue,
  type ProductSheetRow,
  type SheetCellIssue,
  type SheetColumn,
  type SheetView,
} from "./product-order-sheet-model";
import {
  PRODUCT_SHEET_DRAFT,
  readSheetLocal,
} from "./product-sheet-preferences";
import { replaceRoute } from "./routing";
import { useBogotaDay } from "./use-bogota-day";
import {
  ApiError,
  Button,
  CancelButton,
  DateInput,
  Dialog,
  ErrorNotice,
  Field,
  MaterialPicker,
  ProductPicker,
  ProviderPicker,
  count,
  isoDate,
  confirmAction,
  text,
  useApp,
} from "./ui";
import "./product-order-sheet.css";

type SavedDraft = { version: 1; timestamp: string; changes: SheetChange[] };
type Editing = { rowKey: string; column: string; value: string };
const localVisibility = "gimed:ui:product-sheet-columns:";
function loadHidden(view: SheetView): string[] {
  const saved = readSheetLocal<unknown>(localVisibility + view, []);
  return Array.isArray(saved)
    ? saved.filter((key): key is string => typeof key === "string")
    : [];
}
const problemFrom = (failure: unknown) =>
  failure instanceof ApiError
    ? failure
    : new ApiError({
        message:
          failure instanceof Error
            ? failure.message
            : "No se pudo completar la operación. El borrador se conserva.",
      });
function transitionPrompt(problem: ApiError) {
  const affected: Row[] = Array.isArray(problem.details.deviations)
    ? problem.details.deviations
    : Array.isArray(problem.details.products)
      ? problem.details.products
      : [];
  return affected.length
    ? `${problem.message} ${affected.map((product) => `OC ${product.no_orden}, ${product.producto}, renglón ${product.posicion}${typeof product.deviation === "number" ? `: ${product.deviation.toFixed(2)} %` : ""}`).join("; ")}.`
    : problem.message;
}
function Tool({
  label,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <ActionTooltip content={label}>
      <Button {...props} aria-label={label} />
    </ActionTooltip>
  );
}

export function ProductOrderSheet({ params }: { params: URLSearchParams }) {
  const { db, run, navigate, notify } = useApp();
  const view = (
    ["no_autorizadas", "seguimiento", "anuladas"].includes(
      params.get("vista") ?? "",
    )
      ? params.get("vista")
      : "seguimiento"
  ) as SheetView;
  const [changes, setChanges] = useState<SheetChange[]>([]),
    [touched, setTouched] = useState(false);
  const [recovery, setRecovery] = useState<SavedDraft | null>(() => {
    const saved = readSheetLocal<SavedDraft | null>(PRODUCT_SHEET_DRAFT, null);
    return isSheetDraft(saved) && saved.changes.length ? saved : null;
  });
  const [recoveryOpen, setRecoveryOpen] = useState(() => !!recovery);
  const [storageError, setStorageError] = useState(false),
    [error, setError] = useState<ApiError | null>(null),
    [issues, setIssues] = useState<SheetCellIssue[]>([]);
  const [issuePage, setIssuePage] = useState(0);
  useEffect(() => setIssuePage(0), [issues]);
  const issuePageSize = 50;
  const currentIssuePage = Math.min(
    issuePage,
    Math.max(0, Math.ceil(issues.length / issuePageSize) - 1),
  );
  const visibleIssues = issues.slice(
    currentIssuePage * issuePageSize,
    (currentIssuePage + 1) * issuePageSize,
  );
  const errorNotice = useMemo(
    () =>
      error ??
      (issues.length
        ? new ApiError({
            message: `Revisa ${issues.length} celdas: ${issues[0].message}`,
          })
        : null),
    [error, issues],
  );
  const [selection] = useState(() => new SheetSelection());
  const [editing, setEditing] = useState<Editing | null>(null);
  useEffect(() => () => selection.cancelPending(), [selection]);
  const [pendingInvoice, setPendingInvoice] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<SheetCellIssue | null>(null);
  const [projection, setProjection] = useState<Database>(db);
  const [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [newLots, setNewLots] = useState<string[] | null>(null),
    [authorize, setAuthorize] = useState<string[] | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [replacements, setReplacements] = useState<
    { orderId: string; providerId: string }[]
  >([]);
  const [columnsOpen, setColumnsOpen] = useState(false),
    [openedColumn, setOpenedColumn] = useState<string | null>(null);
  const columnsDialog = useRef<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(() =>
    readSheetLocal(
      "gimed:ui:product-sheet-collapsed",
      window.matchMedia("(max-width: 600px)").matches,
    ),
  );
  const [hidden, setHidden] = useState<string[]>(() => loadHidden(view));
  const [projectionRevision, setProjectionRevision] = useState(0);
  const submitting = useRef(false);
  const operationDb = useRef(db);
  operationDb.current = db;
  const draftRef = useRef<SheetChange[]>([]);
  const day = useBogotaDay();
  const [projectionDay, setProjectionDay] = useState(day);
  const filterDay = changes.length || editing ? projectionDay : day;
  const viewDb = useMemo(() => overlaySheetChanges(db, changes), [db, changes]);
  const projectionRows = useMemo(
    () => buildProductSheet(projection, view),
    [projection, view],
  );
  const currentRows = useMemo(
    () =>
      viewDb === projection ? projectionRows : buildProductSheet(viewDb, view),
    [viewDb, view, projection, projectionRows],
  );
  const currentByKey = useMemo(
    () => new Map(currentRows.map((row) => [row.key, row])),
    [currentRows],
  );
  const allColumns = columnsForSheet(view);
  const columns = useMemo(() => {
    const visible = allColumns.filter((col) => !hidden.includes(col.key));
    return visible.length ? visible : allColumns.slice(0, 1);
  }, [allColumns, hidden]);
  const modifiedKeys = useMemo(
    () => new Set(changes.map(changeKey)),
    [changes],
  );
  const invalidKeys = useMemo(
    () => new Set(issues.map((issue) => `${issue.rowKey}/${issue.column}`)),
    [issues],
  );
  const key = params.toString();
  const tableState = useMemo(
    () => readColumnState(params, allColumns),
    [key, view],
  );
  const filter = readCustomFilter(params.get("filtro"), "productos");
  const query = (params.get("q") ?? "").trim().toLocaleLowerCase("es-CO");
  const candidates = useMemo(
    () =>
      projectionRows.filter(
        (row) =>
          matchesSheetFilter(row, filter, filterDay) &&
          (!query ||
            allColumns.some((col) =>
              sheetValue(projection, row, col)
                .toLocaleLowerCase("es-CO")
                .includes(query),
            )),
      ),
    [projectionRows, filter, query, filterDay, projectionRevision],
  );
  const rows = useMemo(
    () =>
      sortTableRows(
        filterTableRows(candidates, allColumns, tableState.filters),
        allColumns,
        tableState.sort,
      ),
    [candidates, key],
  );
  const filterOptions = useMemo(() => {
    const column = allColumns.find((col) => col.key === openedColumn);
    return column
      ? columnOptions(
          filterTableRows(
            candidates,
            allColumns,
            tableState.filters,
            column.key,
          ),
          column,
        )
      : [];
  }, [openedColumn, candidates, allColumns, tableState.filters]);
  useEffect(() => {
    if (draftRef.current.length || editing) return;
    setProjection(db);
    selection.set(null);
  }, [db]);
  useEffect(() => {
    if (!focusRequest) return;
    const row = rows.findIndex((row) => row.key === focusRequest.rowKey),
      column = columns.findIndex((col) => col.key === focusRequest.column);
    if (row >= 0 && column >= 0) {
      selection.set({ anchor: { row, column }, focus: { row, column } });
      setFocusRequest(null);
    }
  }, [rows, hidden, focusRequest]);
  useEffect(() => {
    setHidden(loadHidden(view));
    selection.set(null);
    setEditing(null);
    setOpenedColumn(null);
  }, [view]);
  useEffect(() => {
    if (!touched) return;
    try {
      if (changes.length)
        localStorage.setItem(
          PRODUCT_SHEET_DRAFT,
          JSON.stringify({
            version: 1,
            timestamp: new Date().toISOString(),
            changes,
          }),
        );
      else localStorage.removeItem(PRODUCT_SHEET_DRAFT);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [changes, touched]);
  const draft = (next: SheetChange[]) => {
    draftRef.current = next;
    setChanges(next);
    setTouched(true);
  };
  const display = (row: ProductSheetRow) => currentByKey.get(row.key) ?? row;
  const selectionTargets = () => {
    const range = selection.read();
    const selected = range
      ? rows.slice(rangeBounds(range).top, rangeBounds(range).bottom + 1)
      : [];
    const orderIds = [...new Set(selected.map((row) => row.order.id))];
    const lineIds = [...new Set(selected.map((row) => row.line.id))];
    const lotIds = selected.flatMap((row) => (row.lot ? [row.lot.id] : []));
    const singleOrder =
      orderIds.length === 1
        ? db.orden_compra.find((order) => order.id === orderIds[0])
        : undefined;
    return { range, selected, orderIds, lineIds, lotIds, singleOrder };
  };
  const orderCount = useMemo(
    () => new Set(rows.map((row) => row.order.id)).size,
    [rows],
  );
  const selectionSummary = useCallback(() => {
    const range = selection.getSnapshot();
    if (!range) return "";
    const bounds = rangeBounds(range),
      orders = new Set<string>();
    let annulled = false,
      hasLot = false;
    for (let index = bounds.top; index <= bounds.bottom; index++) {
      const row = rows[index];
      if (!row) continue;
      orders.add(row.order.id);
      annulled ||= row.line.estado === "anulada";
      hasLot ||= !!row.lot;
    }
    return `${bounds.bottom - bounds.top + 1}/${[...orders].join(",")}/${annulled}/${hasLot}`;
  }, [selection, rows]);
  const printSelected = (orderId: string) => {
    const viewport = document.querySelector<HTMLElement>(
      ".product-sheet-viewport",
    );
    navigate(
      `ordenes/${orderId}/imprimir?${new URLSearchParams({ returnTo: location.pathname + location.search, returnScroll: String(Math.round(window.scrollY)), returnTableScroll: String(Math.round(viewport?.scrollLeft ?? 0)) })}`,
    );
  };
  const changeQuery = (values: Record<string, string>) => {
    if (editing && !commit()) return;
    setProjection(
      draftRef.current === changes
        ? viewDb
        : overlaySheetChanges(db, draftRef.current),
    );
    setProjectionDay(day);
    setProjectionRevision((value) => value + 1);
    selection.set(null);
    setEditing(null);
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    next.delete("pagina");
    replaceRoute("/ordenes/productos" + (next.size ? "?" + next : ""));
  };
  const cleanFirst = (action: () => void) => {
    if (editing && !commit()) return;
    if (draftRef.current.length) setPending(() => action);
    else action();
  };
  async function save(): Promise<boolean> {
    if (submitting.current) return false;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const submitted = draftRef.current;
      if (submitted.length)
        await run(
          "saveProductOrderSheet",
          { changes: submitted },
          "Cambios de la hoja guardados",
        );
      operationDb.current =
        operationDb.current === db
          ? overlaySheetChanges(db, submitted)
          : operationDb.current;
      setProjection(operationDb.current);
      setProjectionDay(day);
      draft([]);
      setIssues([]);
      selection.set(null);
      setEditing(null);
      setProjectionRevision((value) => value + 1);
      return true;
    } catch (failure) {
      const problem = problemFrom(failure);
      setError(problem);
      const targets = (problem.details.targets ??
        (problem.details.target
          ? [problem.details.target]
          : [])) as SheetChange[];
      setIssues(
        targets.flatMap((target) => {
          const col = productSheetColumns.find(
            (col) => col.entity === target.entity && col.field === target.field,
          );
          const row = currentRows.find((row) =>
            target.entity === "orden_compra"
              ? row.order.id === target.id
              : target.entity === "orden_producto"
                ? row.line.id === target.id
                : row.lot?.id === target.id,
          );
          return col && row
            ? [{ rowKey: row.key, column: col.key, message: problem.message }]
            : [];
        }),
      );
      return false;
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const discard = () => {
    draft([]);
    setEditing(null);
    setIssues([]);
    setError(null);
  };
  function edit(row: ProductSheetRow, col: SheetColumn, initial?: string) {
    setProjectionDay(day);
    const current = display(row),
      denied = cellPermission(db, current, col);
    if (denied) {
      setIssues([
        { rowKey: row.key, column: col.key, message: denied, protected: true },
      ]);
      return;
    }
    const raw = sheetRaw(current, col);
    setEditing({
      rowKey: row.key,
      column: col.key,
      value:
        initial ??
        (raw == null
          ? ""
          : col.kind === "date"
            ? (calendarDay(String(raw)) ?? "")
            : String(raw)),
    });
  }
  function commit(value?: string): boolean {
    if (!editing) return true;
    const row = currentByKey.get(editing.rowKey),
      col = allColumns.find((col) => col.key === editing.column);
    if (!row || !col) {
      setEditing(null);
      return true;
    }
    const result = proposeSheetInput(db, changes, [
      { row, column: col, text: value ?? editing.value },
    ]);
    setIssues(result.issues);
    if (result.issues.length) return false;
    if (col.key === "id_proveedor") {
      setEditing(null);
      const provider = result.changes.find(
        (change) =>
          change.entity === "orden_compra" &&
          change.id === row.order.id &&
          change.field === "id_proveedor",
      );
      if (provider) {
        const action = () =>
          setReplacements([
            { orderId: row.order.id, providerId: String(provider.value) },
          ]);
        if (draftRef.current.length) setPending(() => action);
        else action();
      }
      return !provider;
    }
    draft(result.changes);
    setEditing(null);
    return true;
  }
  useEffect(() => {
    if (
      pendingInvoice &&
      db.factura.some((invoice) => invoice.id === pendingInvoice)
    ) {
      commit(pendingInvoice);
      setPendingInvoice(null);
    }
  }, [db, pendingInvoice]);
  function copy(event?: React.ClipboardEvent) {
    const range = selection.read();
    if (!range) return;
    const bounds = rangeBounds(range);
    const matrix = rows
      .slice(bounds.top, bounds.bottom + 1)
      .map((row) =>
        columns
          .slice(bounds.left, bounds.right + 1)
          .map((col) => sheetValue(viewDb, display(row), col)),
      );
    const value = formatSheetClipboard(matrix);
    if (event) {
      event.preventDefault();
      event.clipboardData.setData("text/plain", value);
    } else
      navigator.clipboard
        .writeText(value)
        .catch(() =>
          notify("Usa Ctrl+C para copiar el rango seleccionado.", true),
        );
  }
  function paste(value: string) {
    const range = selection.read();
    if (!range) {
      notify("Selecciona primero la celda de destino.", true);
      return;
    }
    const bounds = rangeBounds(range),
      matrix = parseSheetClipboard(value);
    const inputs: {
      row: ProductSheetRow;
      column: SheetColumn;
      text: string;
    }[] = [];
    let overflow = 0;
    matrix.forEach((values, r) =>
      values.forEach((text, c) => {
        const row = rows[bounds.top + r],
          column = columns[bounds.left + c];
        if (row && column) inputs.push({ row: display(row), column, text });
        else overflow++;
      }),
    );
    const result = proposeSheetInput(db, changes, inputs);
    const replacement = result.changes.filter(
      (change) => change.field === "id_proveedor",
    );
    draft(result.changes.filter((change) => change.field !== "id_proveedor"));
    setIssues(result.issues);
    setEditing(null);
    if (replacement.length) {
      const action = () =>
        setReplacements(
          replacement.map((change) => ({
            orderId: change.id,
            providerId: String(change.value),
          })),
        );
      if (draftRef.current.length) setPending(() => action);
      else action();
    }
    if (overflow)
      notify(`${overflow} celdas fuera de la hoja no se pegaron.`, true);
  }
  function clearSelection() {
    const range = selection.read();
    if (!range) return;
    const bounds = rangeBounds(range);
    const inputs = rows
      .slice(bounds.top, bounds.bottom + 1)
      .flatMap((row) =>
        columns
          .slice(bounds.left, bounds.right + 1)
          .map((column) => ({ row: display(row), column, text: "" })),
      );
    const result = proposeSheetInput(db, changes, inputs);
    draft(result.changes);
    setIssues(result.issues);
    setError(null);
  }
  function updateHidden(next: string[]) {
    if (editing && !commit()) return;
    setHidden(next);
    selection.set(null);
    try {
      localStorage.setItem(localVisibility + view, JSON.stringify(next));
    } catch {
      setStorageError(true);
    }
  }
  function hideSelectedColumns() {
    const range = selection.read();
    if (!range) return;
    const { left, right } = rangeBounds(range);
    const selectedColumns = columns.slice(left, right + 1);
    if (selectedColumns.length >= columns.length) {
      notify("Debe permanecer visible al menos una columna.", true);
      return;
    }
    updateHidden([
      ...new Set([...hidden, ...selectedColumns.map((col) => col.key)]),
    ]);
  }
  async function states(
    scope: "lot" | "line",
    state: string,
    targets: ReturnType<typeof selectionTargets>,
  ) {
    const { lotIds, lineIds } = targets;
    const ids = scope === "lot" ? lotIds : lineIds;
    if (!ids.length) return;
    setBusy(true);
    setError(null);
    const expected = productLotLifecycleSnapshot(operationDb.current, lineIds);
    try {
      if (scope === "line" && state === "en_seguimiento") {
        const annulled = expected.filter((line) => line.estado === "anulada");
        if (
          annulled.length &&
          !(await confirmAction(
            `${annulled.length} ${annulled.length === 1 ? "producto anulado volverá" : "productos anulados volverán"} a seguimiento con todos sus lotes conservados, incluidos los cerrados o anulados. No se eliminarán ni recrearán lotes. ¿Reabrir la selección?`,
            "Reabrir productos y lotes",
          ))
        )
          return;
      }
      if (scope === "lot") {
        try {
          await run(
            "setProductLotStates",
            { ids, estado: state, expected },
            "Estados de lote actualizados",
          );
        } catch (failure) {
          const problem = problemFrom(failure);
          if (problem.code !== "CONFIRMATION") throw failure;
          if (
            await confirmAction(
              transitionPrompt(problem),
              lotIds.length > 1
                ? "Anular lotes y productos"
                : "Anular lote y producto",
              true,
            )
          )
            await run(
              "setProductLotStates",
              {
                ids,
                estado: state,
                expected: problem.details.expected,
                confirm: true,
              },
              "Lotes y productos anulados",
            );
          else return;
        }
      } else {
        try {
          await run(
            "setProductLineStates",
            { ids, estado: state, expected },
            "Seguimiento de productos actualizado",
          );
        } catch (failure) {
          const problem = problemFrom(failure);
          if (!["CONFIRMATION", "TOLERANCE"].includes(problem.code))
            throw failure;
          if (
            await confirmAction(
              transitionPrompt(problem),
              state === "anulada"
                ? "Anular productos y lotes"
                : "Confirmar cierre",
              state === "anulada",
            )
          )
            await run(
              "setProductLineStates",
              {
                ids,
                estado: state,
                expected: problem.details.expected,
                confirm: true,
              },
              "Seguimiento de productos actualizado",
            );
          else return;
        }
      }
      selection.set(null);
    } catch (failure) {
      setError(problemFrom(failure));
    } finally {
      setBusy(false);
    }
  }
  const editRow = editing && currentByKey.get(editing.rowKey),
    editCol = editing && columns.find((col) => col.key === editing.column);
  let editor: React.ReactNode = null;
  if (editing && editRow && editCol) {
    const props = {
      "aria-label": editCol.label,
      autoFocus: true,
      value: editing.value,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        setEditing({ ...editing, value: event.target.value }),
    };
    if (editCol.key === "id_proveedor")
      editor = (
        <ProviderPicker
          aria-label={editCol.label}
          autoFocus
          providers={db.proveedor.filter((provider) => provider.Es_maquila)}
          value={String(editRow.order.id_proveedor)}
          onChange={(id) => {
            if (id) commit(id);
          }}
          onQueryChange={(value) =>
            setEditing((old) => (old ? { ...old, value } : old))
          }
        />
      );
    else if (editCol.key === "id_producto")
      editor = (
        <ProductPicker
          aria-label={editCol.label}
          autoFocus
          products={db.productos.filter(
            (product) =>
              product.id_maquilador === editRow.order.id_proveedor &&
              product.activo,
          )}
          value={String(editRow.line.id_producto)}
          onChange={(id) => {
            if (id) commit(id);
          }}
          onQueryChange={(value) =>
            setEditing((old) => (old ? { ...old, value } : old))
          }
        />
      );
    else if (editCol.key === "ref_corrugado")
      editor = (
        <MaterialPicker
          aria-label={editCol.label}
          autoFocus
          materials={db.materiales.filter(
            (material) => materialRole(db, material.id) === "corrugado",
          )}
          value={editing.value}
          onChange={(id) => {
            if (id) commit(id);
          }}
        />
      );
    else if (editCol.key === "id_factura")
      editor = (
        <div className="sheet-reference-editor">
          <InvoicePicker
            provider={editRow.order.id_proveedor}
            value={editing.value || null}
            onChange={(id) => {
              if (id && !db.factura.some((invoice) => invoice.id === id))
                setPendingInvoice(id);
              else commit(id ?? "");
            }}
          />
        </div>
      );
    else if (editCol.kind === "enum")
      editor = (
        <ControlSelect
          aria-label={editCol.label}
          autoFocus
          value={editing.value}
          onChange={(event) => commit(event.target.value)}
        >
          {meta.enums[
            meta.tables.lote_producto.fields[editCol.field!].type
          ].map((value) => (
            <option key={value} value={value}>
              {sheetEnumLabel(value)}
            </option>
          ))}
        </ControlSelect>
      );
    else if (editCol.kind === "date")
      editor = (
        <DateInput
          aria-label={editCol.label}
          autoFocus
          value={editing.value}
          onChange={(value) =>
            setEditing((old) => (old ? { ...old, value } : old))
          }
        />
      );
    else
      editor = (
        <ControlInput
          {...props}
          inputMode={
            editCol.kind === "integer" || editCol.kind === "decimal"
              ? "decimal"
              : undefined
          }
        />
      );
  }
  const renderCell = useCallback(
    (projected: ProductSheetRow, col: SheetColumn) => {
      const row = display(projected),
        target = sheetTarget(row, col),
        modified = target && modifiedKeys.has(changeKey(target));
      const invalid = invalidKeys.has(`${row.key}/${col.key}`);
      if (col.key === "ocm")
        return (
          <div className="sheet-ocm-links">
            {[...new Set(row.supply.map((item) => item.order.id))].map((id) => {
              const items = row.supply.filter((item) => item.order.id === id);
              return (
                <SheetCellHint
                  key={id}
                  label={`OCM ${items[0].order.no_orden}: ${items.map((item) => `${item.material} · ${count(item.quantity)} unidades`).join("; ")}`}
                >
                  {items[0].order.no_orden}
                </SheetCellHint>
              );
            })}
          </div>
        );
      let value = sheetValue(viewDb, row, col);
      return (
        <span
          className={`sheet-cell-value ${col.kind === "integer" || col.kind === "decimal" ? "num" : ""}`}
          data-modified={modified || undefined}
          data-rejected={invalid || undefined}
          title={value}
        >
          {value || ""}
          {col.key === "cantidad_solicitada" && row.excess > 0 && (
            <SheetCellHint
              indicator
              label={`${count(row.excess)} unidades recibidas de más en lotes anteriores`}
            >
              Sobreentrega
            </SheetCellHint>
          )}
        </span>
      );
    },
    [currentByKey, viewDb, modifiedKeys, invalidKeys],
  );
  const invalidCell = useCallback(
    (row: ProductSheetRow, col: SheetColumn) =>
      invalidKeys.has(`${row.key}/${col.key}`),
    [invalidKeys],
  );
  const toolbar = (
    <SheetSelectionView selection={selection} snapshot={selectionSummary}>
      {() => {
        const { range, selected, lineIds, lotIds, orderIds, singleOrder } =
          selectionTargets();
        return (
          <>
            <div className="product-sheet-toolbar-top">
              <div className="product-sheet-tabs" aria-label="Hojas de OC">
                {(
                  [
                    ["no_autorizadas", "No autorizadas"],
                    ["seguimiento", "En seguimiento"],
                    ["anuladas", "Anuladas"],
                  ] as const
                ).map(([id, label]) => (
                  <Button
                    key={id}
                    aria-pressed={view === id}
                    variant={view === id ? "primary" : "ghost"}
                    onClick={() => changeQuery({ vista: id })}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="inline">
                <Button
                  icon={Save}
                  variant="primary"
                  disabled={(!changes.length && !editing) || busy}
                  onClick={() => {
                    if (commit()) void save();
                  }}
                >
                  Guardar{changes.length ? ` ${changes.length} cambios` : ""}
                </Button>
                <Button
                  icon={Undo2}
                  disabled={(!changes.length && !editing) || busy}
                  onClick={async () => {
                    if (
                      await confirmAction(
                        "¿Descartar las ediciones pendientes de la hoja?",
                        "Descartar",
                      )
                    )
                      discard();
                  }}
                >
                  Descartar
                </Button>
                <Button
                  icon={ChevronUp}
                  aria-label="Ocultar barra de herramientas"
                  onClick={() => {
                    setCollapsed(true);
                    try {
                      localStorage.setItem(
                        "gimed:ui:product-sheet-collapsed",
                        "true",
                      );
                    } catch {}
                  }}
                />
              </div>
            </div>
            <div className="product-sheet-tools">
              <Button
                icon={Plus}
                onClick={() => cleanFirst(() => setCreating(true))}
              >
                Nueva OC
              </Button>
              <Button
                icon={Plus}
                disabled={
                  view === "no_autorizadas" ||
                  !lineIds.length ||
                  selected.some((row) => row.line.estado === "anulada")
                }
                onClick={() => {
                  const ids = selectionTargets().lineIds;
                  cleanFirst(() => setNewLots(ids));
                }}
              >
                Nuevo lote
              </Button>
              <ControlSelect
                aria-label="Estado del lote"
                value=""
                disabled={!lotIds.length || busy}
                onChange={(event) => {
                  const value = event.target.value;
                  const targets = selectionTargets();
                  if (value)
                    cleanFirst(() => void states("lot", value, targets));
                }}
              >
                <option value="">Lotes</option>
                <option value="cerrado">Cerrar lotes</option>
                <option value="anulado">Anular lotes</option>
                <option value="en_seguimiento">Reabrir lotes</option>
              </ControlSelect>
              <ControlSelect
                aria-label="Seguimiento del producto"
                value=""
                disabled={view === "no_autorizadas" || !lineIds.length || busy}
                onChange={(event) => {
                  const value = event.target.value;
                  const targets = selectionTargets();
                  if (value)
                    cleanFirst(() => void states("line", value, targets));
                }}
              >
                <option value="">Productos</option>
                <option value="cerrada">Cerrar productos</option>
                <option value="anulada">Anular productos</option>
                <option value="en_seguimiento">Reabrir productos</option>
              </ControlSelect>
              <Button
                disabled={view !== "no_autorizadas" || !orderIds.length || busy}
                onClick={() => {
                  const ids = selectionTargets().orderIds;
                  cleanFirst(() => setAuthorize(ids));
                }}
              >
                Autorizar{orderIds.length ? ` ${orderIds.length} OC` : ""}
              </Button>
              <Tool
                icon={FileText}
                label="Ver orden escaneada"
                disabled={
                  !singleOrder ||
                  !db.documento.some(
                    (doc) =>
                      doc.tipo_entidad === "orden_compra" &&
                      doc.id_entidad === singleOrder.id &&
                      doc.tipo_documento === "orden_compra_escaneada",
                  )
                }
                onClick={() => {
                  const { singleOrder } = selectionTargets();
                  const doc = db.documento.find(
                    (doc) =>
                      doc.tipo_entidad === "orden_compra" &&
                      doc.id_entidad === singleOrder?.id &&
                      doc.tipo_documento === "orden_compra_escaneada",
                  );
                  if (doc)
                    cleanFirst(() =>
                      window.open(
                        `/api/documents/${doc.id}/content`,
                        "_blank",
                        "noopener",
                      ),
                    );
                }}
              />
              <Tool
                icon={Printer}
                label="Imprimir"
                disabled={!singleOrder}
                onClick={() => {
                  const order = selectionTargets().singleOrder;
                  if (order) cleanFirst(() => printSelected(order.id));
                }}
              />
              <Tool
                icon={Eye}
                label="Ver detalle"
                disabled={!singleOrder}
                onClick={() => {
                  const order = selectionTargets().singleOrder;
                  if (order) cleanFirst(() => navigate(`ordenes/${order.id}`));
                }}
              />
              <Tool
                icon={Pencil}
                label="Editar orden"
                disabled={!singleOrder}
                onClick={() => {
                  const order = selectionTargets().singleOrder;
                  if (order) cleanFirst(() => setEditingOrder(order.id));
                }}
              />
              <Button
                icon={Copy}
                aria-label="Copiar rango"
                title="Copiar rango (Ctrl+C)"
                disabled={!range}
                onClick={() => copy()}
              />
              <Button
                icon={ClipboardPaste}
                aria-label="Pegar rango"
                title="Pegar rango (Ctrl+V)"
                disabled={!range}
                onClick={() =>
                  navigator.clipboard
                    .readText()
                    .then(paste)
                    .catch(() =>
                      notify("Usa Ctrl+V sobre la hoja para pegar.", true),
                    )
                }
              />
              <CustomFilterSelect
                style={{ width: 200, flex: "0 0 200px" }}
                aria-label="Filtro personalizado de la hoja"
                value={filter}
                onChange={(event) =>
                  changeQuery({ filtro: event.target.value })
                }
              >
                <option value="">Sin filtro personalizado</option>
                {customFilters.map((group) => (
                  <optgroup key={group.id} label={group.name}>
                    {group.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </CustomFilterSelect>
              {(filter ||
                Object.values(tableState.filters).some(hasFilter)) && (
                <Tool
                  icon={FilterX}
                  label="Limpiar filtros"
                  onClick={() => changeQuery({ filtro: "", filtros: "" })}
                />
              )}
              <DialogTrigger isOpen={columnsOpen} onOpenChange={setColumnsOpen}>
                <Button icon={ChevronDown}>Columnas</Button>
                <Popover
                  className="product-sheet-column-popover"
                  placement="bottom start"
                  offset={4}
                >
                  <AriaDialog
                    className="product-sheet-column-menu"
                    aria-label="Columnas visibles"
                    ref={(node) => {
                      columnsDialog.current = node;
                      if (!node) return;
                      const dismiss = (event: KeyboardEvent) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                          setColumnsOpen(false);
                        }
                      };
                      node.addEventListener("keydown", dismiss, true);
                      return () => {
                        columnsDialog.current = null;
                        node.removeEventListener("keydown", dismiss, true);
                      };
                    }}
                  >
                    <div className="product-sheet-column-menu-header">
                      <strong>Columnas visibles</strong>
                      <Button
                        variant="link"
                        disabled={hidden.length === 0}
                        onClick={() => {
                          columnsDialog.current?.focus({ preventScroll: true });
                          updateHidden([]);
                        }}
                      >
                        Seleccionar todas
                      </Button>
                    </div>
                    <Button
                      className="product-sheet-hide-columns"
                      disabled={!range}
                      aria-keyshortcuts="Alt+Shift+H"
                      onClick={hideSelectedColumns}
                    >
                      Ocultar columnas seleccionadas <span>Alt+Mayús+H</span>
                    </Button>
                    <div className="product-sheet-column-list">
                      {allColumns.map((col) => (
                        <CheckChoice
                          key={col.key}
                          checked={!hidden.includes(col.key)}
                          disabled={
                            !hidden.includes(col.key) && columns.length === 1
                          }
                          onChange={(checked) =>
                            updateHidden(
                              checked
                                ? hidden.filter((key) => key !== col.key)
                                : [...hidden, col.key],
                            )
                          }
                        >
                          {col.label}
                        </CheckChoice>
                      ))}
                    </div>
                  </AriaDialog>
                </Popover>
              </DialogTrigger>
              <ControlInput
                className="control product-sheet-search"
                aria-label="Buscar en la hoja de OC"
                type="search"
                value={params.get("q") ?? ""}
                placeholder="Buscar en la hoja…"
                onChange={(event) => changeQuery({ q: event.target.value })}
              />
            </div>
          </>
        );
      }}
    </SheetSelectionView>
  );
  return (
    <section
      className="product-order-sheet"
      aria-label="Vista alternativa de OC de productos"
      aria-busy={busy}
    >
      <div className="product-sheet-title">
        <h1>Órdenes de compra</h1>
        <div className="inline">
          <Button variant="ghost" aria-pressed>
            Productos
          </Button>
          <Button
            variant="ghost"
            onClick={() => cleanFirst(() => navigate("ordenes/materiales"))}
          >
            Materiales
          </Button>
        </div>
      </div>
      <div className="product-sheet-toolbar">
        {collapsed ? (
          <div className="product-sheet-toolbar-top">
            <Button
              icon={ChevronDown}
              onClick={() => {
                setCollapsed(false);
                try {
                  localStorage.setItem(
                    "gimed:ui:product-sheet-collapsed",
                    "false",
                  );
                } catch {}
              }}
            >
              Mostrar herramientas
            </Button>
            <Button
              icon={Save}
              disabled={(!changes.length && !editing) || busy}
              onClick={() => {
                if (commit()) void save();
              }}
            >
              Guardar {changes.length || ""}
            </Button>
          </div>
        ) : (
          toolbar
        )}
      </div>
      {recovery && !recoveryOpen && (
        <div className="notice" role="status">
          Hay una copia anterior con {recovery.changes.length} cambios, del{" "}
          {new Date(recovery.timestamp).toLocaleString("es-CO")} ¿Desea
          recuperar los cambios?
          <Button onClick={() => setRecoveryOpen(true)}>
            Revisar copia guardada
          </Button>
        </div>
      )}
      {storageError && (
        <div className="notice" role="status">
          No se pudo guardar la copia local del borrador. Mantén abierta esta
          sesión hasta guardar los cambios.
        </div>
      )}
      <ErrorNotice error={errorNotice} />
      {!!issues.length && (
        <div className="product-sheet-errors" aria-label="Celdas rechazadas">
          {visibleIssues.map((issue, index) => (
            <Button
              key={index}
              variant="link"
              onClick={() => {
                setHidden((previous) =>
                  previous.filter((key) => key !== issue.column),
                );
                setFocusRequest(issue);
                if (!rows.some((row) => row.key === issue.rowKey))
                  changeQuery({ q: "", filtro: "", filtros: "" });
              }}
            >
              {issue.protected ? "Celda protegida" : "Dato rechazado"}:{" "}
              {allColumns.find((col) => col.key === issue.column)?.label} ·{" "}
              {issue.message}
            </Button>
          ))}
        </div>
      )}
      {issues.length > issuePageSize && (
        <div
          className="inline product-sheet-error-pages"
          aria-label="Páginas de errores"
        >
          <Button
            className="small"
            disabled={!currentIssuePage}
            onClick={() => setIssuePage(currentIssuePage - 1)}
            aria-label="Errores anteriores"
          >
            Anterior
          </Button>
          <span role="status">
            Errores {currentIssuePage * issuePageSize + 1}–
            {Math.min((currentIssuePage + 1) * issuePageSize, issues.length)} de{" "}
            {issues.length}
          </span>
          <Button
            className="small"
            disabled={(currentIssuePage + 1) * issuePageSize >= issues.length}
            onClick={() => setIssuePage(currentIssuePage + 1)}
            aria-label="Siguientes errores"
          >
            Siguiente
          </Button>
        </div>
      )}
      <div className="product-sheet-status" role="status">
        {changes.length
          ? `${changes.length} cambios sin guardar · ${storageError ? "Sin copia local actualizada" : "Copia local del borrador"}`
          : "Sin cambios pendientes"}
        <SheetSelectionView selection={selection} snapshot={selectionSummary}>
          {() => {
            const { orderIds, selected } = selectionTargets();
            return view === "no_autorizadas" && orderIds.length
              ? ` · ${orderIds.length} OC completas seleccionadas, incluidos sus renglones ocultos`
              : selected.length
                ? ` · ${selected.length} filas seleccionadas`
                : "";
          }}
        </SheetSelectionView>
      </div>
      <ProductSheetGrid
        invalid={invalidCell}
        rows={rows}
        columns={columns}
        selection={selection}
        view={view}
        pinnedColumn={openedColumn}
        onEdit={edit}
        editing={editing}
        editor={editor}
        onCommit={() => commit()}
        onCancel={() => setEditing(null)}
        onCopy={copy}
        onPaste={paste}
        onClear={clearSelection}
        onHideColumns={hideSelectedColumns}
        renderHeader={(col) => (
          <ColumnHeader
            asContent
            column={col}
            filter={tableState.filters[col.key]}
            sort={tableState.sort}
            options={openedColumn === col.key ? filterOptions : []}
            open={openedColumn === col.key}
            onOpen={() => setOpenedColumn(col.key)}
            onClose={() => setOpenedColumn(null)}
            onFilter={(value) =>
              changeQuery(
                tableParams({
                  ...tableState,
                  filters: { ...tableState.filters, [col.key]: value },
                }),
              )
            }
            onSort={(value) =>
              changeQuery(tableParams({ ...tableState, sort: value }))
            }
          />
        )}
        renderCell={renderCell}
      />
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        <SheetSelectionView selection={selection}>
          {(range) =>
            range && rows[range.focus.row] && columns[range.focus.column]
              ? `Fila ${range.focus.row + 1} de ${rows.length}, ${columns[range.focus.column].label}: ${sheetValue(viewDb, display(rows[range.focus.row]), columns[range.focus.column])}`
              : ""
          }
        </SheetSelectionView>
      </div>
      <div className="product-sheet-footer">
        {rows.length} {view === "no_autorizadas" ? "renglones" : "lotes"} ·{" "}
        {orderCount} OC
      </div>
      {recovery && recoveryOpen && (
        <Dialog
          title="Cambios pendientes en este navegador"
          onClose={() => setRecoveryOpen(false)}
        >
          <div className="dialog-body">
            <p>
              Última copia:{" "}
              {new Date(recovery.timestamp).toLocaleString("es-CO")}
            </p>
            <p>
              {recovery.changes.length} cambios. Recuperar sustituye el borrador
              actual y no guarda en la base.
            </p>
          </div>
          <div className="dialog-footer">
            <Button
              onClick={() => {
                setRecovery(null);
                setTouched(true);
              }}
            >
              Descartar copia
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                draft(recovery.changes);
                setRecovery(null);
                setError(null);
              }}
            >
              Recuperar
            </Button>
          </div>
        </Dialog>
      )}
      {pending && (
        <Dialog
          title="Hay cambios sin guardar"
          onClose={() => setPending(null)}
        >
          <div className="dialog-body">
            <p>Resuelve el borrador antes de continuar con la acción.</p>
          </div>
          <div className="dialog-footer">
            <CancelButton onClick={() => setPending(null)}>
              Cancelar
            </CancelButton>
            <Button
              onClick={() => {
                const action = pending;
                discard();
                setPending(null);
                action();
              }}
            >
              Descartar y continuar
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                if (await save()) {
                  const action = pending;
                  setPending(null);
                  action();
                }
              }}
            >
              Guardar y continuar
            </Button>
          </div>
        </Dialog>
      )}
      {creating && <OrderForm onClose={() => setCreating(false)} />}
      {editingOrder && (
        <OrderForm
          order={db.orden_compra.find((order) => order.id === editingOrder)}
          onClose={() => setEditingOrder(null)}
        />
      )}
      {!!replacements.length && (
        <OrderForm
          key={replacements[0].orderId}
          order={db.orden_compra.find(
            (order) => order.id === replacements[0].orderId,
          )}
          proposedSupplier={replacements[0].providerId}
          onClose={() => setReplacements((queue) => queue.slice(1))}
        />
      )}
      {newLots && (
        <NewProductLots lineIds={newLots} onClose={() => setNewLots(null)} />
      )}
      {authorize && (
        <OrderAuthorizationDialog
          ids={authorize}
          multiple
          onClose={() => setAuthorize(null)}
          onAuthorized={() => {
            setAuthorize(null);
            selection.set(null);
          }}
        />
      )}
    </section>
  );
}

function NewProductLots({
  lineIds,
  onClose,
}: {
  lineIds: string[];
  onClose: () => void;
}) {
  const { db, run } = useApp();
  const [rows, setRows] = useState<Row[]>(() =>
    lineIds.map((id) => {
      const line = db.orden_producto.find((line) => line.id === id)!;
      const order = db.orden_compra.find(
        (order) => order.id === line.id_orden_compra,
      )!;
      return {
        ...blankRow("lote_producto"),
        id_orden_producto: id,
        fecha_estimada_batch_record: order.fecha_solicitada_entrega,
      };
    }),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<ApiError | null>(null);
  const [dirty, setDirty] = useState(false);
  return (
    <Dialog
      title={`Nuevos lotes · ${rows.length} productos`}
      onClose={onClose}
      wide
      dirty={dirty}
      busy={busy}
    >
      <ControlForm
        noValidate
        fieldErrors={error?.fields}
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await run("createProductLots", { rows }, "Lotes creados");
            onClose();
          } catch (failure) {
            setError(problemFrom(failure));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-body">
          <ErrorNotice error={error} />
          {rows.map((row, index) => {
            const line = db.orden_producto.find(
              (line) => line.id === row.id_orden_producto,
            )!;
            const order = db.orden_compra.find(
              (order) => order.id === line.id_orden_compra,
            )!;
            const update = (field: string, value: unknown) => {
              setDirty(true);
              setRows((previous) =>
                previous.map((old, i) =>
                  i === index ? { ...old, [field]: value } : old,
                ),
              );
            };
            return (
              <section key={line.id} className="order-form-line">
                <h3>
                  OC {order.no_orden} · Renglón {line.posicion} ·{" "}
                  {
                    db.productos.find(
                      (product) => product.id === line.id_producto,
                    )?.nombre_producto
                  }
                </h3>
                <div className="form-grid three">
                  {Object.entries(meta.tables.lote_producto.fields)
                    .filter(
                      ([field]) =>
                        !["id", "id_orden_producto", "id_factura"].includes(
                          field,
                        ),
                    )
                    .sort(
                      ([a], [b]) =>
                        productLotFieldOrder.indexOf(a) -
                        productLotFieldOrder.indexOf(b),
                    )
                    .map(([field, spec]) => (
                      <Field
                        key={field}
                        id={`field-rows.${index}.${field}`}
                        label={labels[field] ?? field}
                        error={error?.fields[`rows.${index}.${field}`]}
                      >
                        {meta.enums[spec.type] ? (
                          <ControlSelect
                            id={`field-rows.${index}.${field}`}
                            value={row[field] ?? ""}
                            onChange={(event) =>
                              update(field, event.target.value)
                            }
                          >
                            {meta.enums[spec.type].map((value) => (
                              <option key={value} value={value}>
                                {text(value)}
                              </option>
                            ))}
                          </ControlSelect>
                        ) : spec.type === "datetime" ? (
                          <DateInput
                            id={`field-rows.${index}.${field}`}
                            value={row[field]?.slice(0, 10) ?? ""}
                            onChange={(value) => update(field, isoDate(value))}
                          />
                        ) : (
                          <ControlInput
                            id={`field-rows.${index}.${field}`}
                            type={spec.type === "integer" ? "number" : "text"}
                            value={row[field] ?? ""}
                            onChange={(event) =>
                              update(
                                field,
                                spec.type === "integer"
                                  ? event.target.value === ""
                                    ? null
                                    : Number(event.target.value)
                                  : event.target.value || null,
                              )
                            }
                          />
                        )}
                      </Field>
                    ))}
                  <Field
                    id={`field-rows.${index}.id_factura`}
                    error={error?.fields[`rows.${index}.id_factura`]}
                    label="Factura (opcional)"
                  >
                    <InvoicePicker
                      provider={order.id_proveedor}
                      value={row.id_factura}
                      onChange={(value) => update("id_factura", value)}
                    />
                  </Field>
                </div>
              </section>
            );
          })}
        </div>
        <div className="dialog-footer">
          <CancelButton onClick={onClose}>Cancelar</CancelButton>
          <Button type="submit" variant="primary" disabled={busy}>
            Crear lotes
          </Button>
        </div>
      </ControlForm>
    </Dialog>
  );
}
