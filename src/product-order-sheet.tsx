import { DeleteProductLotsDialog } from "./components/delete-product-lots-dialog";
import { confirmProductCancellation } from "./product-cancellation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dialog as AriaDialog,
  DialogTrigger,
} from "react-aria-components/Dialog";
import { Popover } from "react-aria-components/Popover";
import { Menu, MenuItem, MenuTrigger } from "react-aria-components/Menu";
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
  AlertCircle,
  Trash2,
  X,
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
  type SheetViewportPosition,
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
type SheetRefresh = {
  snapshot: Database;
  scope: object;
  position: SheetViewportPosition;
};
type Editing = {
  rowKey: string;
  column: string;
  value: string;
  deferredClear?: boolean;
};
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
function Tool({
  label,
  tooltip = label,
  ...props
}: React.ComponentProps<typeof Button> & {
  label: string;
  tooltip?: string;
}) {
  return (
    <ActionTooltip content={tooltip}>
      <span className="product-sheet-tooltip-anchor">
        <Button {...props} aria-label={label} />
      </span>
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
  const [projection, setProjection] = useState<Database>(db);
  const [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [authorize, setAuthorize] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState<{
    ids: string[];
    origin: object;
    expected: ReturnType<typeof productLotLifecycleSnapshot>;
    lots: { id: string; number: string; product: string; order: string }[];
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string>();
  const deleteFocusOrigin = useRef<object | null>(null);
  const [pending, setPending] = useState<{
    action: () => void;
    focusScope?: object;
  } | null>(null);
  const [replacements, setReplacements] = useState<
    { orderId: string; providerId: string }[]
  >([]);
  const [columnsOpen, setColumnsOpen] = useState(false),
    [openedColumn, setOpenedColumn] = useState<string | null>(null);
  const columnsDialog = useRef<HTMLElement | null>(null);
  const orderActionsRef = useRef<HTMLDivElement>(null);
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
  const scope = useMemo(() => ({}), [key, columns]);
  const liveScope = useRef(scope);
  liveScope.current = scope;
  const sheetRef = useRef<HTMLElement>(null);
  const sheetSnapshot = useRef<SheetRefresh | undefined>(undefined);
  const [restoration, setRestoration] = useState<SheetRefresh>();
  const getViewport = useCallback(
    () => sheetRef.current?.querySelector<HTMLElement>(".product-sheet-viewport"),
    [],
  );
  const captureSheetSnapshot = (snapshot: Database, origin: object) => {
    const viewport = getViewport();
    if (!viewport) return;
    const refresh = {
      snapshot,
      scope: liveScope.current,
      position: {
        top: viewport.scrollTop,
        left: viewport.scrollLeft,
        selection: selection.capture(),
        reveal:
          liveScope.current === origin ||
          viewport.contains(document.activeElement),
      },
    };
    sheetSnapshot.current = refresh;
    return refresh;
  };
  const returnSheetFocus = useCallback((origin: object) => {
    const focusGrid = () => {
      const viewport = getViewport();
      const active = document.activeElement;
      if (
        viewport &&
        liveScope.current === origin &&
        !document.querySelector('[role="dialog"], [role="alertdialog"]') &&
        (active === document.body ||
          viewport.contains(active) ||
          (sheetRef.current?.contains(active) &&
            active?.closest("[data-sheet-return-focus]")))
      )
        viewport.querySelector("table")?.focus({ preventScroll: true });
    };
    // React Aria restores focus to the dialog trigger in the next frame.
    requestAnimationFrame(() => requestAnimationFrame(focusGrid));
  }, [getViewport]);
  const closeDeleteDialog = () => {
    if (!deleting) return;
    deleteFocusOrigin.current = deleting.origin;
    setDeleting(null);
  };
  useEffect(() => {
    const origin = deleteFocusOrigin.current;
    if (deleting || !origin) return;
    deleteFocusOrigin.current = null;
    returnSheetFocus(origin);
  }, [deleting, returnSheetFocus]);
  const cancelPendingAction = () => {
    setPending(null);
    if (pending?.focusScope) returnSheetFocus(pending.focusScope);
  };
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
  useLayoutEffect(() => {
    const refresh = sheetSnapshot.current;
    if (refresh?.snapshot === db) sheetSnapshot.current = undefined;
    if (draftRef.current.length || editing) return;
    setProjection(db);
    if (refresh?.snapshot === db && refresh.scope === liveScope.current) {
      setRestoration(refresh);
    } else {
      setRestoration(undefined);
      selection.set(null);
    }
  }, [db]);
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
    let hasLot = false;
    for (let index = bounds.top; index <= bounds.bottom; index++) {
      const row = rows[index];
      if (!row) continue;
      orders.add(row.order.id);
      hasLot ||= !!row.lot;
    }
    return `${bounds.bottom - bounds.top + 1}/${[...orders].join(",")}/${hasLot}`;
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
    if (editing && !commit(undefined, true)) return;
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
  const cleanFirst = (action: () => void, focusScope?: object) => {
    if (editing && !commit(undefined, true)) return;
    if (draftRef.current.length) setPending({ action, focusScope });
    else action();
  };
  async function save(origin = scope): Promise<boolean> {
    if (submitting.current) return false;
    const submitted = draftRef.current;
    if (!submitted.length) return true;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      let savedSnapshot: Database | undefined;
      let refresh: SheetRefresh | undefined;
      await run(
        "saveProductOrderSheet",
        { changes: submitted },
        "Cambios de la hoja guardados",
        (snapshot) => {
          savedSnapshot = snapshot;
          refresh = captureSheetSnapshot(snapshot, origin);
        },
      );
      operationDb.current =
        savedSnapshot ??
        (operationDb.current === db
          ? overlaySheetChanges(db, submitted)
          : operationDb.current);
      setProjection(operationDb.current);
      setRestoration(refresh);
      setProjectionDay(day);
      draft([]);
      setIssues([]);
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
      returnSheetFocus(origin);
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
      setError(null);
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
  function commit(value?: string, allowRejected = false): boolean {
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
    setError(null);
    setIssues((previous) => {
      const remaining = previous.filter(
        (issue) => issue.rowKey !== row.key || issue.column !== col.key,
      );
      return remaining.length === previous.length && !result.issues.length
        ? previous
        : [...remaining, ...result.issues];
    });
    if (result.issues.length) {
      setEditing(null);
      return allowRejected;
    }
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
        if (draftRef.current.length) setPending({ action });
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
    const message =
      bounds.top === bounds.bottom && bounds.left === bounds.right
        ? "Celda copiada."
        : "Rango copiado.";
    if (event) {
      event.preventDefault();
      event.clipboardData.setData("text/plain", value);
      notify(message);
    } else
      navigator.clipboard
        .writeText(value)
        .then(() => notify(message))
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
    const matrix = parseSheetClipboard(value);
    const inputs: {
      row: ProductSheetRow;
      column: SheetColumn;
      text: string;
    }[] = [];
    let overflow = 0;
    if (matrix.length === 1 && matrix[0].length === 1) {
      const { top, bottom, left, right } = rangeBounds(range);
      const text = matrix[0][0];
      const rowEnd = Math.min(bottom + 1, rows.length);
      const columnEnd = Math.min(right + 1, columns.length);
      for (let r = top; r < rowEnd; r++) {
        const row = display(rows[r]);
        for (let c = left; c < columnEnd; c++)
          inputs.push({ row, column: columns[c], text });
      }
    } else {
      const { row: firstRow, column: firstColumn } = range.anchor;
      const rowCount = Math.min(matrix.length, rows.length - firstRow);
      const availableColumns = columns.length - firstColumn;
      for (let r = 0; r < rowCount; r++) {
        const values = matrix[r];
        const columnCount = Math.min(values.length, availableColumns);
        overflow += values.length - columnCount;
        const row = display(rows[firstRow + r]);
        for (let c = 0; c < columnCount; c++)
          inputs.push({ row, column: columns[firstColumn + c], text: values[c] });
      }
      for (let r = rowCount; r < matrix.length; r++)
        overflow += matrix[r].length;
    }
    const result = proposeSheetInput(db, changes, inputs);
    setError(null);
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
      if (draftRef.current.length) setPending({ action });
      else action();
    }
    const message = inputs.length === 1 ? "Celda pegada." : "Rango pegado.";
    if (overflow)
      notify(
        `${inputs.length ? `${message} ` : ""}${overflow} celdas fuera de la hoja no se pegaron.`,
        true,
      );
    else if (inputs.length) notify(message);
  }
  function clearSelection() {
    const range = selection.read();
    if (!range) return;
    const bounds = rangeBounds(range);
    if (bounds.top === bounds.bottom && bounds.left === bounds.right) {
      const row = rows[bounds.top],
        column = columns[bounds.left];
      if (
        row &&
        column &&
        (column.kind === "integer" || column.kind === "decimal") &&
        !cellPermission(db, display(row), column)
      ) {
        setIssues((previous) =>
          previous.filter(
            (issue) => issue.rowKey !== row.key || issue.column !== column.key,
          ),
        );
        setEditing({
          rowKey: row.key,
          column: column.key,
          value: "",
          deferredClear: true,
        });
        return;
      }
    }
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
    if (editing && !commit(undefined, true)) return;
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
    state: string,
    targets: ReturnType<typeof selectionTargets>,
    lotScope: object,
  ) {
    const { lotIds, lineIds } = targets;
    if (!lotIds.length) return;
    setBusy(true);
    setError(null);
    const expected = productLotLifecycleSnapshot(operationDb.current, lineIds);
    try {
      if (
        state === "anulado" &&
        !(await confirmProductCancellation(
          operationDb.current,
          "lot",
          expected,
          lotIds,
        ))
      )
        return;
      await run(
        "setProductLotStates",
        { ids: lotIds, estado: state, expected, confirm: state === "anulado" },
        "Estados de lote actualizados",
        (snapshot) => captureSheetSnapshot(snapshot, lotScope),
      );
    } catch (failure) {
      setError(problemFrom(failure));
    } finally {
      setBusy(false);
      returnSheetFocus(lotScope);
    }
  }
  async function createLots(ids: string[], lotScope: object) {
    setBusy(true);
    setError(null);
    try {
      const current = operationDb.current;
      const rows = ids.map((id) => {
        const line = current.orden_producto.find((item) => item.id === id)!;
        const order = current.orden_compra.find(
          (item) => item.id === line.id_orden_compra,
        )!;
        return {
          ...blankRow("lote_producto"),
          id_orden_producto: id,
          fecha_estimada_batch_record: order.fecha_solicitada_entrega,
        };
      });
      await run("createProductLots", { rows }, "Lotes creados", (snapshot) =>
        captureSheetSnapshot(snapshot, lotScope),
      );
    } catch (failure) {
      setError(problemFrom(failure));
    } finally {
      setBusy(false);
      returnSheetFocus(lotScope);
    }
  }
  function beginDelete(ids: string[], origin: object) {
    const current = operationDb.current;
    const lots = ids.map((id) => {
      const lot = current.lote_producto.find((item) => item.id === id);
      const line = current.orden_producto.find(
        (item) => item.id === lot?.id_orden_producto,
      );
      const order = current.orden_compra.find(
        (item) => item.id === line?.id_orden_compra,
      );
      const product = current.productos.find(
        (item) => item.id === line?.id_producto,
      );
      return lot && line && order
        ? {
            id,
            number: lot.numero_lote ?? "sin número",
            product: product?.nombre_producto ?? "Producto",
            order: order.no_orden,
            lineId: line.id,
          }
        : null;
    });
    if (lots.some((lot) => !lot)) {
      notify(
        "La selección cambió. Actualiza la hoja y vuelve a seleccionar los lotes.",
        true,
      );
      return;
    }
    const selectedLots = lots.filter(
      (lot): lot is NonNullable<typeof lot> => lot !== null,
    );
    setDeleteError(undefined);
    setDeleting({
      ids,
      origin,
      lots: selectedLots,
      expected: productLotLifecycleSnapshot(current, [
        ...new Set(selectedLots.map((lot) => lot.lineId)),
      ]),
    });
  }
  async function deleteSelectedLots() {
    if (!deleting || busy) return;
    setBusy(true);
    setDeleteError(undefined);
    try {
      await run(
        "deleteLots",
        { ids: deleting.ids, expected: deleting.expected, confirm: true },
        deleting.ids.length === 1 ? "Lote eliminado" : "Lotes eliminados",
        (snapshot) => captureSheetSnapshot(snapshot, deleting.origin),
      );
      closeDeleteDialog();
    } catch (failure) {
      setDeleteError(problemFrom(failure).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    function shortcut(event: globalThis.KeyboardEvent) {
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.repeat ||
        event.isComposing ||
        busy ||
        editing
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
        )
      )
        return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]'))
        return;
      const key = event.key.toLowerCase();
      if (
        ![
          "o",
          "a",
          "h",
          "s",
          "d",
          "c",
          "n",
          "r",
          "delete",
          "del",
          "supr",
        ].includes(key)
      )
        return;
      event.preventDefault();
      const targets = selectionTargets();
      if (key === "o") cleanFirst(() => setCreating(true));
      else if (
        key === "a" &&
        view === "no_autorizadas" &&
        targets.orderIds.length
      )
        cleanFirst(() => setAuthorize(targets.orderIds));
      else if (key === "h" && targets.range) hideSelectedColumns();
      else if (key === "s" && hidden.length) updateHidden([]);
      else if (targets.lotIds.length && key === "d")
        cleanFirst(() => void createLots(targets.lineIds, scope), scope);
      else if (targets.lotIds.length && ["c", "n", "r"].includes(key)) {
        const state =
          key === "c" ? "cerrado" : key === "n" ? "anulado" : "en_seguimiento";
        cleanFirst(() => void states(state, targets, scope), scope);
      } else if (
        targets.lotIds.length &&
        targets.selected
          .filter((row) => row.lot)
          .every((row) => row.order.estado_autorizacion === "autorizada") &&
        ["delete", "del", "supr"].includes(key)
      )
        cleanFirst(() => beginDelete(targets.lotIds, scope), scope);
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });
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
        <div className="sheet-reference-editor">
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
        </div>
      );
    else if (editCol.key === "id_producto")
      editor = (
        <div className="sheet-reference-editor">
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
        </div>
      );
    else if (editCol.key === "ref_corrugado")
      editor = (
        <div className="sheet-reference-editor">
          <MaterialPicker
            aria-label={editCol.label}
            autoFocus
            materials={db.materiales.filter(
              (material) => materialRole(db, material.id) === "corrugado",
            )}
            value={String(editRow.line.ref_corrugado ?? "")}
            onChange={(id) => {
              if (id) commit(id);
            }}
            onQueryChange={(value) =>
              setEditing((old) => (old ? { ...old, value } : old))
            }
          />
        </div>
      );
    else if (editCol.key === "id_factura")
      editor = (
        <div className="sheet-reference-editor">
          <InvoicePicker
            provider={editRow.order.id_proveedor}
            value={editRow.lot?.id_factura ?? null}
            onSearchChange={(value) =>
              setEditing((old) => (old ? { ...old, value } : old))
            }
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
                  data-sheet-return-focus
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
              <div className="sheet-order-actions" ref={orderActionsRef}>
                <ActionTooltip content="(Alt+O)">
                  <Button
                    icon={Plus}
                    aria-keyshortcuts="Alt+O"
                    onClick={() => cleanFirst(() => setCreating(true))}
                  >
                    Nueva OC
                  </Button>
                </ActionTooltip>
                <MenuTrigger>
                  <Button
                    icon={ChevronDown}
                    aria-label="Más acciones de órdenes"
                  />
                  <Popover
                    triggerRef={orderActionsRef}
                    className="aria-options custom-filter-options sheet-order-menu"
                    placement="bottom start"
                    offset={4}
                  >
                    <Menu
                      className="aria-option-list"
                      aria-label="Acciones de órdenes"
                      onAction={() => {
                        const ids = selectionTargets().orderIds;
                        if (view === "no_autorizadas" && ids.length && !busy)
                          cleanFirst(() => setAuthorize(ids));
                      }}
                    >
                      <ActionTooltip content="Autorizar (alt+a)">
                        <MenuItem
                          id="autorizar"
                          aria-keyshortcuts="Alt+A"
                          className="aria-option sheet-order-menu-item"
                          isDisabled={
                            view !== "no_autorizadas" ||
                            !orderIds.length ||
                            busy
                          }
                        >
                          Autorizar
                          {orderIds.length && view === "no_autorizadas"
                            ? ` ${orderIds.length} OC`
                            : ""}
                        </MenuItem>
                      </ActionTooltip>
                    </Menu>
                  </Popover>
                </MenuTrigger>
              </div>
              <MenuTrigger>
                <Button
                  className="sheet-lot-trigger"
                  data-sheet-return-focus
                  aria-label="Estado del lote"
                  disabled={!lotIds.length || busy}
                >
                  Lotes <ChevronDown size={15} aria-hidden="true" />
                </Button>
                <Popover
                  className="aria-options custom-filter-options sheet-order-menu sheet-lot-menu"
                  placement="bottom start"
                  offset={4}
                >
                  <Menu
                    className="aria-option-list"
                    aria-label="Acciones de lote"
                    onAction={(key) => {
                      const value = String(key);
                      const targets = selectionTargets();
                      if (value === "nuevo")
                        cleanFirst(() => void createLots(targets.lineIds, scope), scope);
                      else if (value)
                        cleanFirst(() => void states(value, targets, scope), scope);
                    }}
                  >
                    <ActionTooltip content="(Alt+d)">
                      <MenuItem
                        id="nuevo"
                        aria-keyshortcuts="Alt+D"
                        className="aria-option sheet-order-menu-item"
                      >
                        Nuevo lote
                        <Plus size={15} aria-hidden="true" />
                      </MenuItem>
                    </ActionTooltip>
                    <ActionTooltip content="(Alt+c)">
                      <MenuItem
                        id="cerrado"
                        aria-keyshortcuts="Alt+C"
                        className="aria-option sheet-order-menu-item"
                      >
                        Cerrar lotes
                        <span
                          className="sheet-lot-swatch closed"
                          aria-hidden="true"
                        />
                      </MenuItem>
                    </ActionTooltip>
                    <ActionTooltip content="(Alt+n)">
                      <MenuItem
                        id="anulado"
                        aria-keyshortcuts="Alt+N"
                        className="aria-option sheet-order-menu-item"
                      >
                        Anular lotes
                        <span
                          className="sheet-lot-swatch cancelled"
                          aria-hidden="true"
                        />
                      </MenuItem>
                    </ActionTooltip>
                    <ActionTooltip content="(Alt+r)">
                      <MenuItem
                        id="en_seguimiento"
                        aria-keyshortcuts="Alt+R"
                        className="aria-option sheet-order-menu-item"
                      >
                        Reabrir lotes
                        <span
                          className="sheet-lot-swatch open"
                          aria-hidden="true"
                        />
                      </MenuItem>
                    </ActionTooltip>
                  </Menu>
                </Popover>
              </MenuTrigger>
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
              <ActionTooltip content="Copiar (Ctrl+C)">
                <span className="product-sheet-tooltip-anchor">
                  <Button
                    icon={Copy}
                    aria-label="Copiar rango"
                    disabled={!range}
                    onClick={() => copy()}
                  />
                </span>
              </ActionTooltip>
              <ActionTooltip content="Pegar (Ctrl+V)">
                <span className="product-sheet-tooltip-anchor">
                  <Button
                    icon={ClipboardPaste}
                    aria-label="Pegar rango"
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
                </span>
              </ActionTooltip>
              <Tool
                icon={Trash2}
                label="Eliminar lotes seleccionados"
                tooltip="Eliminar lotes (Alt+supr)"
                className="icon-btn delete-action"
                data-sheet-return-focus
                aria-keyshortcuts="Alt+Delete"
                disabled={
                  !lotIds.length ||
                  busy ||
                  selected
                    .filter((row) => row.lot)
                    .some(
                      (row) => row.order.estado_autorizacion !== "autorizada",
                    )
                }
                onClick={() => {
                  const ids = selectionTargets().lotIds;
                  if (ids.length) cleanFirst(() => beginDelete(ids, scope), scope);
                }}
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
                    <div className="product-sheet-column-menu-header column-filter-title">
                      <h3>Columnas visibles</h3>
                    </div>
                    <div className="product-sheet-column-list">
                      <Button
                        className="product-sheet-hide-columns"
                        disabled={!range}
                        aria-keyshortcuts="Alt+H"
                        onClick={hideSelectedColumns}
                      >
                        Ocultar columnas seleccionadas <span>Alt+H</span>
                      </Button>
                      <CheckChoice
                        className="column-value-option column-select-all"
                        aria-keyshortcuts="Alt+S"
                        checked={hidden.length === 0}
                        indeterminate={hidden.length > 0}
                        disabled={hidden.length === 0}
                        onChange={() => {
                          columnsDialog.current?.focus({ preventScroll: true });
                          updateHidden([]);
                        }}
                      >
                        Seleccionar todas (Alt+S)
                      </CheckChoice>
                      {allColumns.map((col) => (
                        <CheckChoice
                          key={col.key}
                          className="column-value-option"
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
      ref={sheetRef}
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
              data-sheet-return-focus
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
      {errorNotice && (
        <div className="error-notice product-sheet-error-notice" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <strong>{errorNotice.message}</strong>
          <Button
            icon={X}
            variant="ghost"
            aria-label="Cerrar aviso de error"
            onClick={() => {
              setError(null);
              setIssues([]);
            }}
          />
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
              ? ` · ${orderIds.length} OC seleccionadas`
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
        restorePosition={
          restoration?.scope === scope ? restoration.position : undefined
        }
        pinnedColumn={openedColumn}
        onEdit={edit}
        editing={editing}
        editor={editor}
        onCommit={() => commit(undefined, true)}
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
            range && rows[range.anchor.row] && columns[range.anchor.column]
              ? `Fila ${range.anchor.row + 1} de ${rows.length}, ${columns[range.anchor.column].label}: ${sheetValue(viewDb, display(rows[range.anchor.row]), columns[range.anchor.column])}`
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
          onClose={cancelPendingAction}
        >
          <div className="dialog-body">
            <p>Resuelve el borrador antes de continuar con la acción.</p>
          </div>
          <div className="dialog-footer">
            <CancelButton onClick={cancelPendingAction}>
              Cancelar
            </CancelButton>
            <Button
              onClick={() => {
                discard();
                setPending(null);
                pending.action();
              }}
            >
              Descartar y continuar
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                if (await save(pending.focusScope)) {
                  setPending(null);
                  pending.action();
                }
              }}
            >
              Guardar y continuar
            </Button>
          </div>
        </Dialog>
      )}
      {deleting && (
        <DeleteProductLotsDialog
          lots={deleting.lots}
          expected={deleting.expected}
          onConfirm={deleteSelectedLots}
          onClose={closeDeleteDialog}
          busy={busy}
          error={deleteError}
        />
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
