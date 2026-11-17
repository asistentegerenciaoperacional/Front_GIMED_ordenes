import { documentUrl } from "./shared/api/routes";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  FileBadge,
  FileCheck2,
  FileText,
  MessageSquare,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { Menu, MenuItem, MenuTrigger } from "react-aria-components/Menu";
import { Popover } from "react-aria-components/Popover";
import type { Database } from "../shared/models";
import {
  isMaterialSheetTarget,
  materialChangeKey,
  materialFieldPermission,
  materialSheetIndexes,
  materialSheetRecordIssues,
  materialStateAllowed,
  materialSheetDeletionSnapshot,
  overlayMaterialSheetChanges,
  type MaterialLineState,
  type MaterialSheetChange,
  type MaterialStateTarget,
} from "../shared/material-order-sheet";
import type { Row } from "../shared/schema";
import { ColumnHeader } from "./column-filter";
import { ControlInput, ControlSelect } from "./components/controls";
import { confirmAction } from "./components/overlays";
import {
  OrderSheetGrid,
  SheetCellHint,
  type SheetViewportPosition,
} from "./components/product-sheet-grid";
import {
  SheetClipboardTools,
  SheetColumnsMenu,
  SheetFilterTools,
  SheetPendingDialog,
  SheetTool,
  SheetViewTabs,
  SheetWriteTools,
  printOrderFromSheet,
} from "./components/order-sheet-controls";
import {
  SheetHistoryControls,
  sheetHistoryShortcut,
} from "./components/sheet-history-controls";
import { SheetSelectionView } from "./components/sheet-selection-view";
import { SheetLotActions } from "./components/sheet-lot-actions";
import { DeleteLotsDialog } from "./components/delete-product-lots-dialog";
import { OrderForm } from "./forms";
import { LineComments, withCommentRemovalConfirmation } from "./line-comments";
import { Documents } from "./document-controls";
import {
  buildMaterialSheet,
  matchesMaterialSheetFilter,
  materialCellPermission,
  materialRaw,
  materialSheetColumns,
  materialTarget,
  materialValue,
  proposeMaterialSheetInput,
  type MaterialSheetColumn,
  type MaterialSheetRow,
} from "./material-order-sheet-model";
import { OrderAuthorizationDialog } from "./order-authorization";
import { readCustomFilter } from "./order-filters";
import {
  sameSheetChanges,
  sheetRangeInputs,
  type SheetCellIssue,
} from "./order-sheet-editing";
import {
  calendarDay,
  columnOptions,
  filterTableRows,
  hasFilter,
  readColumnState,
  sortTableRows,
  tableParams,
} from "./order-table";
import {
  formatSheetClipboard,
  parseSheetClipboard,
  type SheetView,
} from "./order-sheet-editing";
import { rangeBounds, SheetSelection } from "./product-sheet-selection";
import { readSheetLocal } from "./product-sheet-preferences";
import { replaceRoute } from "./routing";
import { useBogotaDay } from "./use-bogota-day";
import { useSheetHistory } from "./use-sheet-history";
import {
  ApiError,
  Button,
  DateInput,
  Dialog,
  MaterialPicker,
  ReferencePicker,
  useApp,
} from "./ui";
import {
  useOrderSheetDraftStorage,
  useOrderSheetScroll,
} from "./use-order-sheet-session";
import "./product-order-sheet.css";

type Draft = { version: 1; timestamp: string; changes: MaterialSheetChange[] };
type Editor = { rowKey: string; column: string; value: string };
const isMaterialDraft = (value: unknown): value is Draft => {
  if (!value || typeof value !== "object") return false;
  const draft = value as Draft;
  return (
    draft.version === 1 &&
    Number.isFinite(Date.parse(draft.timestamp)) &&
    Array.isArray(draft.changes) &&
    draft.changes.every(isMaterialSheetTarget)
  );
};
const states: [MaterialLineState, string][] = [
  ["cerrada", "Cerrar"],
  ["anulada", "Anular"],
  ["en_seguimiento", "Reabrir"],
];
const visibility = "gimed:ui:material-sheet-columns:";
const collapsedKey = "gimed:ui:material-sheet-collapsed";
const presentation = (row: MaterialSheetRow) => ({
  state:
    row.line.estado === "cerrada"
      ? ("cerrado" as const)
      : row.line.estado === "anulada"
        ? ("anulado" as const)
        : ("en_seguimiento" as const),
  label: `OCM ${row.order.no_orden}, renglón ${row.line.posicion}, ${row.line.estado.replaceAll("_", " ")}`,
});
const isReadOnly = (row: MaterialSheetRow, column: MaterialSheetColumn) =>
  !!materialCellPermission(row, column);
const toError = (error: unknown) =>
  error instanceof ApiError
    ? error
    : new ApiError({ message: (error as Error).message });
const visibleColumns = (view: SheetView) => {
  const saved = readSheetLocal<unknown>(visibility + view, []);
  return Array.isArray(saved)
    ? saved.filter((key): key is string => typeof key === "string")
    : [];
};

export function MaterialOrderSheet({ params }: { params: URLSearchParams }) {
  const { db, run, navigate, notify, userId } = useApp();
  const draftKey = `gimed:draft:material-order-sheet:v1:${userId}`;
  const view =
    params.get("vista") === "no_autorizadas"
      ? "no_autorizadas"
      : params.get("vista") === "anuladas"
        ? "anuladas"
        : "seguimiento";
  const type =
    params.get("tipo") === "material"
      ? "material"
      : params.get("tipo") === "otro"
        ? "otro"
        : "";
  const key = params.toString();
  const filter = readCustomFilter(params.get("filtro"), "materiales");
  const query = params.get("q") ?? "";
  const day = useBogotaDay();
  const {
    history,
    value: changes,
    canUndo,
    canRedo,
  } = useSheetHistory<MaterialSheetChange[]>([], sameSheetChanges);
  const { recovery, setRecovery, storageError, setStorageError, setTouched } =
    useOrderSheetDraftStorage(draftKey, changes, isMaterialDraft);
  const [recoverOpen, setRecoverOpen] = useState(() => !!recovery);
  const [selection] = useState(() => new SheetSelection());
  const [editing, setEditing] = useState<Editor | null>(null);
  const [issues, setIssues] = useState<SheetCellIssue[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const latestDb = useRef(db);
  latestDb.current = db;
  const [pending, setPending] = useState<{
    action: () => void;
    scope: object;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingOrder, setEditingOrder] = useState<string | null>(null);
  const [authorizing, setAuthorizing] = useState<string[] | null>(null);
  const [comments, setComments] = useState<{ tipo: "material"; id: string; name: string } | null>(null);
  const [certificateLot, setCertificateLot] = useState<{ id: string; number: string } | null>(null);
  const [deleting, setDeleting] = useState<{
    targets: { entity: MaterialSheetRow["entity"]; id: string }[];
    expected: ReturnType<typeof materialSheetDeletionSnapshot>;
    names: string[];
    scope: object;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string>();
  const orderActionsRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(() =>
    readSheetLocal(
      collapsedKey,
      window.matchMedia("(max-width: 600px)").matches,
    ),
  );
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [openedColumn, setOpenedColumn] = useState<string | null>(null);
  useEffect(() => {
    setOpenedColumn(null);
  }, [key]);
  const [hiddenState, setHidden] = useState(() => ({
    view,
    keys: visibleColumns(view),
  }));
  const hidden = useMemo(
    () => (hiddenState.view === view ? hiddenState.keys : visibleColumns(view)),
    [hiddenState, view],
  );
  const allColumns = materialSheetColumns(view);
  const columns = useMemo(() => {
    const shown = allColumns.filter((col) => !hidden.includes(col.key));
    return shown.length ? shown : allColumns.slice(0, 1);
  }, [allColumns, hidden]);
  const scope = useMemo(() => ({}), [key, columns]);
  const liveScope = useRef(scope);
  liveScope.current = scope;
  const { section, viewport, initialScroll } = useOrderSheetScroll(
    "materiales",
    userId,
    key,
    view,
  );
  useEffect(() => () => selection.cancelPending(), [selection]);

  const [projection, setProjection] = useState(db);
  const [projectionRevision, refreshProjection] = useState(0);
  const [projectionDay, setProjectionDay] = useState(day);
  const viewDb = useMemo(
    () => overlayMaterialSheetChanges(db, changes),
    [db, changes],
  );
  const projectedRows = useMemo(
    () => buildMaterialSheet(projection, view),
    [projection, view],
  );
  const currentRows = useMemo(
    () =>
      viewDb === projection ? projectedRows : buildMaterialSheet(viewDb, view),
    [viewDb, projection, projectedRows, view],
  );
  const currentByKey = useMemo(
    () => new Map(currentRows.map((row) => [row.key, row])),
    [currentRows],
  );
  const display = useCallback(
    (row: MaterialSheetRow) => currentByKey.get(row.key) ?? row,
    [currentByKey],
  );
  const tableState = useMemo(
    () => readColumnState(new URLSearchParams(key), allColumns),
    [key, allColumns],
  );
  const today = changes.length || editing ? projectionDay : day;
  const candidates = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es-CO");
    return projectedRows.filter(
      (row) =>
        (!type || row.order.tipo_orden === type) &&
        matchesMaterialSheetFilter(row, filter, today) &&
        (!term ||
          String(row.line.cantidad_solicitada).includes(term) ||
          allColumns.some((col) =>
            materialValue(projection, row, col)
              .toLocaleLowerCase("es-CO")
              .includes(term),
          )),
    );
  }, [
    projectedRows,
    type,
    filter,
    today,
    query,
    allColumns,
    projection,
    projectionRevision,
  ]);
  const rows = useMemo(
    () =>
      sortTableRows(
        filterTableRows(candidates, allColumns, tableState.filters),
        allColumns,
        tableState.sort,
      ),
    [candidates, allColumns, tableState],
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
  }, [allColumns, candidates, openedColumn, tableState.filters]);
  const orderCount = useMemo(
    () => new Set(rows.map((row) => row.order.id)).size,
    [rows],
  );
  const invalidKeys = useMemo(
    () => new Set(issues.map((issue) => `${issue.rowKey}/${issue.column}`)),
    [issues],
  );
  const modifiedKeys = useMemo(
    () => new Set(changes.map(materialChangeKey)),
    [changes],
  );
  const [restoration, setRestoration] = useState<{
    scope: object;
    position: SheetViewportPosition;
  }>();
  const modalOrigin = useRef<object | null>(null);
  const captured = useRef<
    { db: Database; scope: object; position: SheetViewportPosition } | undefined
  >(undefined);
  function capture(snapshot: Database, origin: object) {
    latestDb.current = snapshot;
    const element = viewport();
    if (element)
      captured.current = {
        db: snapshot,
        scope: liveScope.current,
        position: {
          top: element.scrollTop,
          left: element.scrollLeft,
          selection: selection.capture(),
          reveal: liveScope.current === origin,
        },
      };
  }
  function adopt(snapshot: Database) {
    const saved = captured.current;
    setProjection(snapshot);
    setRestoration(
      saved?.db === snapshot && saved.scope === liveScope.current
        ? saved
        : undefined,
    );
  }
  useLayoutEffect(() => {
    if (!history.getSnapshot().value.length && !editing) adopt(db);
  }, [db]);
  function returnFocus(origin: object) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = viewport();
        const active = document.activeElement;
        if (
          liveScope.current === origin &&
          !document.querySelector('[role="dialog"], [role="alertdialog"]') &&
          (active === document.body ||
            el?.contains(active) ||
            active?.closest("[data-sheet-return-focus]"))
        )
          el?.querySelector("table")?.focus({ preventScroll: true });
      }),
    );
  }
  function record(next: MaterialSheetChange[]) {
    if (history.record(next)) setTouched(true);
  }
  function discard() {
    history.reset([]);
    setTouched(true);
    setEditing(null);
    setIssues([]);
    setError(null);
    setProjection(latestDb.current);
    setProjectionDay(day);
  }
  function move(direction: "undo" | "redo") {
    if (busy || editing) return;
    try {
      if (
        history.move(direction, (next) => {
          const snapshot = latestDb.current;
          const index = materialSheetIndexes(snapshot);
          const prospective = overlayMaterialSheetChanges(snapshot, next);
          for (const target of next) {
            const row =
              target.entity === "orden_compra"
                ? index.orders.get(target.id)
                : target.entity === "orden_material"
                  ? index.materialLines.get(target.id)
                  : index.otherLines.get(target.id);
            const order =
              row &&
              ("tipo_orden" in row
                ? row
                : index.orders.get(row.id_orden_compra));
            const problem =
              !row || !order || (row as Row)[target.field] !== target.expected
                ? "Los datos cambiaron desde que comenzaste a editar."
                : (materialFieldPermission(
                    order,
                    target.entity,
                    target.field,
                  ) ??
                  Object.values(
                    materialSheetRecordIssues(
                      prospective,
                      target.entity,
                      target.id,
                      snapshot,
                    ),
                  )[0]);
            if (problem) throw new ApiError({ message: problem });
          }
        })
      ) {
        setIssues([]);
        setError(null);
        returnFocus(scope);
      }
    } catch (failure) {
      setError(toError(failure));
    }
  }
  function applyInputs(
    inputs: Parameters<typeof proposeMaterialSheetInput>[2],
    close = true,
  ) {
    const result = proposeMaterialSheetInput(
      latestDb.current,
      history.getSnapshot().value,
      inputs,
    );
    record(result.changes);
    setIssues(result.issues);
    setError(null);
    if (close) setEditing(null);
    return result.issues.length === 0;
  }
  function commit(value = editing?.value, allowRejected = false) {
    if (!editing) return true;
    const row = currentByKey.get(editing.rowKey);
    const column = allColumns.find((col) => col.key === editing.column);
    if (!row || !column) {
      setEditing(null);
      return true;
    }
    const ok = applyInputs([{ row, column, text: value ?? "" }], false);
    if (ok || allowRejected) setEditing(null);
    return ok || allowRejected;
  }
  function edit(
    row: MaterialSheetRow,
    column: MaterialSheetColumn,
    initial?: string,
  ) {
    if (writing.current) return;
    const current = display(row);
    const denied = materialCellPermission(current, column);
    if (denied) {
      setError(null);
      setIssues([
        {
          rowKey: row.key,
          column: column.key,
          message: denied,
          protected: true,
        },
      ]);
      return;
    }
    setProjectionDay(day);
    const raw = materialRaw(current, column);
    setEditing({
      rowKey: row.key,
      column: column.key,
      value:
        initial ??
        (column.kind === "date"
          ? (calendarDay(raw == null ? null : String(raw)) ?? "")
          : String(raw ?? "")),
    });
  }
  function cleanFirst(action: () => void) {
    if (writing.current || !commit()) return;
    if (history.getSnapshot().value.length) setPending({ action, scope });
    else action();
  }
  function openSheetDialog(open: () => void) {
    cleanFirst(() => {
      modalOrigin.current = scope;
      open();
    });
  }
  function finishSheetDialog(close: () => void) {
    const origin = modalOrigin.current;
    modalOrigin.current = null;
    close();
    if (origin) returnFocus(origin);
  }
  const openLinkedOrder = useRef((id: string) => navigate(`ordenes/${id}`));
  openLinkedOrder.current = (id) => cleanFirst(() => navigate(`ordenes/${id}`));
  async function save(origin = scope) {
    const submitted = history.getSnapshot().value;
    if (!submitted.length) return true;
    if (writing.current) return false;
    writing.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await withCommentRemovalConfirmation(
        (confirmar_comentarios) =>
          run(
            "saveMaterialOrderSheet",
            { changes: submitted, confirmar_comentarios },
            "Cambios de la hoja guardados",
            (snapshot) => capture(snapshot, origin),
          ),
      );
      if (!result) return false;
      discard();
      adopt(latestDb.current);
      setProjectionDay(day);
      return true;
    } catch (failure) {
      const problem = toError(failure);
      setError(problem);
      const targets = (problem.details.targets ??
        (problem.details.target
          ? [problem.details.target]
          : [])) as MaterialSheetChange[];
      const keys = new Set(targets.map(materialChangeKey));
      setIssues(
        currentRows.flatMap((row) =>
          allColumns
            .filter(
              (col) =>
                col.entity &&
                keys.has(materialChangeKey(materialTarget(row, col))),
            )
            .map((col) => ({
              rowKey: row.key,
              column: col.key,
              message: problem.message,
            })),
        ),
      );
      return false;
    } finally {
      writing.current = false;
      setBusy(false);
      returnFocus(origin);
    }
  }
  function changeQuery(values: Record<string, string>) {
    if (!commit(undefined, true)) return;
    setProjection(
      overlayMaterialSheetChanges(
        latestDb.current,
        history.getSnapshot().value,
      ),
    );
    setProjectionDay(day);
    selection.reset();
    setOpenedColumn(null);
    refreshProjection((revision) => revision + 1);
    const next = new URLSearchParams(params);
    for (const [name, value] of Object.entries(values))
      value ? next.set(name, value) : next.delete(name);
    next.delete("pagina");
    replaceRoute("/ordenes/materiales" + (next.size ? "?" + next : ""));
  }
  function updateHidden(next: string[]) {
    if (!commit(undefined, true)) return;
    selection.reset();
    setHidden({ view, keys: next });
    try {
      localStorage.setItem(visibility + view, JSON.stringify(next));
    } catch {
      setStorageError(true);
    }
  }
  function hideSelected() {
    const range = selection.read();
    if (!range) return;
    const { left, right } = rangeBounds(range);
    if (right - left + 1 >= columns.length) {
      notify("Debe permanecer visible al menos una columna.", true);
      return;
    }
    updateHidden([
      ...new Set([
        ...hidden,
        ...columns.slice(left, right + 1).map((col) => col.key),
      ]),
    ]);
  }
  function toggleToolbar() {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem(collapsedKey, String(!collapsed));
    } catch {
      setStorageError(true);
    }
  }
  function copy(event?: React.ClipboardEvent) {
    const range = selection.read();
    if (!range) return;
    const { top, bottom, left, right } = rangeBounds(range);
    const value = formatSheetClipboard(
      rows
        .slice(top, bottom + 1)
        .map((row) =>
          columns
            .slice(left, right + 1)
            .map((col) => materialValue(viewDb, display(row), col)),
        ),
    );
    if (event) {
      event.preventDefault();
      event.clipboardData.setData("text/plain", value);
    } else
      void navigator.clipboard
        ?.writeText(value)
        .catch(() =>
          notify("Usa Ctrl+C para copiar el rango seleccionado.", true),
        );
  }
  function paste(value: string) {
    if (writing.current) return;
    const range = selection.read();
    if (!range) {
      notify("Selecciona primero la celda de destino.", true);
      return;
    }
    const { inputs, overflow } = sheetRangeInputs(
      range,
      rows,
      columns,
      parseSheetClipboard(value),
      display,
    );
    applyInputs(inputs);
    if (overflow)
      notify(`${overflow} celdas fuera de la hoja no se pegaron.`, true);
  }
  function targets() {
    const range = selection.read();
    const bounds = range && rangeBounds(range);
    const selected = bounds ? rows.slice(bounds.top, bounds.bottom + 1) : [];
    const ids = [...new Set(selected.map((row) => row.order.id))];
    return {
      range,
      selected,
      ids,
      order: ids.length === 1 ? selected[0].order : undefined,
    };
  }
  const selectionSummary = useCallback(() => {
    const range = selection.getSnapshot();
    if (!range) return "";
    const { top, bottom } = rangeBounds(range);
    const includesCells = range.anchor.column !== range.extent.column;
    return `${top}:${bottom}:${includesCells}`;
  }, [selection]);
  async function changeStates(
    next: MaterialLineState,
    selected: MaterialSheetRow[],
    origin: object,
  ) {
    if (writing.current) return;
    const eligible: MaterialStateTarget[] = selected
      .filter(
        (row) =>
          row.order.estado_autorizacion === "autorizada" &&
          materialStateAllowed(row.line.estado, next),
      )
      .map((row) => ({
        entity: row.entity,
        id: row.line.id,
        expected: row.line.estado,
      }));
    if (!eligible.length) return;
    const omitted = selected.length - eligible.length;
    const label = states.find(([value]) => value === next)![1];
    const message = `${eligible.length} renglones incluidos y ${omitted} omitidos.`;
    writing.current = true;
    setBusy(true);
    setError(null);
    try {
      if (
        next === "anulada" &&
        !(await confirmAction(
          `¿${label} los renglones seleccionados? ${message}`,
          undefined,
          true,
        ))
      )
        return;
      await run(
        "setMaterialSheetLineStates",
        { targets: eligible, estado: next, confirm: next === "anulada" },
        message,
        (snapshot) => capture(snapshot, origin),
      );
    } catch (failure) {
      setError(toError(failure));
    } finally {
      writing.current = false;
      setBusy(false);
      returnFocus(origin);
    }
  }

  function beginDeleteLines(selected: MaterialSheetRow[], origin: object) {
    if (writing.current || !selected.length || liveScope.current !== origin) return;
    const targets = selected.map((row) => ({ entity: row.entity, id: row.line.id }));
    const snapshot = materialSheetDeletionSnapshot(latestDb.current, targets);
    if (snapshot.some(({ line, order }) => !line || order?.estado_autorizacion !== "autorizada")) {
      setError(new ApiError({ message: "Solo se pueden eliminar lotes de órdenes autorizadas. Revisa la selección." }));
      return;
    }
    const itemColumn = allColumns.find((column) => column.key === "item")!;
    setDeleteError(undefined);
    setDeleting({ targets, expected: snapshot, scope: origin,
      names: selected.map((row) => `OCM ${row.order.no_orden} · ${materialValue(latestDb.current, row, itemColumn)}`) });
  }

  async function deleteSelectedLines() {
    if (!deleting || writing.current) return;
    writing.current = true;
    setBusy(true);
    setDeleteError(undefined);
    try {
      await run("deleteMaterialSheetLines", { targets: deleting.targets, expected: deleting.expected, confirm: true }, deleting.targets.length === 1 ? "Lote eliminado" : "Lotes eliminados", (next) => capture(next, deleting.scope));
      setDeleting(null);
      returnFocus(deleting.scope);
    } catch (failure) {
      setDeleteError(toError(failure).message);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  const editRow = editing && currentByKey.get(editing.rowKey);
  const editColumn =
    editing && allColumns.find((column) => column.key === editing.column);
  let editor: React.ReactNode = null;
  if (editing && editRow && editColumn) {
    const { line, order } = editRow;
    const setValue = (value: string) =>
      setEditing((old) => old && { ...old, value });
    const { field } = materialTarget(editRow, editColumn);
    const index = materialSheetIndexes(db);
    const options =
      field === "id_factura"
        ? [...index.invoices.values()]
            .filter((invoice) => invoice.id_proveedor === order.id_proveedor)
            .map((invoice) => ({
              id: invoice.id,
              label: invoice.numero_factura,
            }))
        : field === "id_lote_material"
          ? [...index.lots.values()].map((lot) => ({
              id: lot.id,
              label: lot.numero_lote,
            }))
          : field === "id_direccion"
            ? [...index.addresses.values()].map((address) => ({
                id: address.id,
                label: address.nombre_dir ?? "",
              }))
            : null;
    if (options)
      editor = (
        <div className="sheet-reference-editor">
          <ReferencePicker
            aria-label={editColumn.label}
            autoFocus
            commitOnSelection
            options={[
              {
                id: "__sin_referencia__",
                label: "Sin " + editColumn.label.toLowerCase(),
              },
              ...options,
            ]}
            clearOptionId="__sin_referencia__"
            value={String(materialRaw(editRow, editColumn) ?? "")}
            onChange={(id) => {
              commit(id);
            }}
          />
        </div>
      );
    else if (field === "id_material" && "id_material" in line)
      editor = (
        <div className="sheet-reference-editor">
          <MaterialPicker
            aria-label={editColumn.label}
            autoFocus
            commitOnSelection
            materials={db.materiales}
            value={line.id_material}
            onChange={(id) => {
              if (id) commit(id);
            }}
          />
        </div>
      );
    else if (editColumn.kind === "date")
      editor = (
        <DateInput
          aria-label={editColumn.label}
          autoFocus
          value={editing.value}
          onChange={setValue}
        />
      );
    else
      editor = (
        <ControlInput
          aria-label={editColumn.label}
          autoFocus
          value={editing.value}
          inputMode={
            editColumn.kind === "decimal" || editColumn.kind === "integer"
              ? "decimal"
              : undefined
          }
          onChange={(event) => setValue(event.target.value)}
        />
      );
  }
  const renderCell = useCallback(
    (projected: MaterialSheetRow, column: MaterialSheetColumn) => {
      const row = display(projected);
      if (column.key === "vinculos" && row.links.length)
        return (
          <div className="sheet-ocm-links">
            {row.links.map((link) => (
              <SheetCellHint
                key={link.id}
                ariaLabel={`OC ${link.number}: ${link.products.join(", ")}`}
                content={
                  <>
                    <strong>OC {link.number}</strong>
                    {link.products.map((name) => (
                      <div key={name}>{name}</div>
                    ))}
                  </>
                }
                onActivate={() => openLinkedOrder.current(link.id)}
              >
                {link.number}
              </SheetCellHint>
            ))}
          </div>
        );
      const notApplicable =
        row.entity === "orden_otro" &&
        ["id_lote_material", "codigo_maia", "vinculos"].includes(column.key);
      const modified =
        column.entity &&
        modifiedKeys.has(materialChangeKey(materialTarget(row, column)));
      return (
        <span
          data-modified={modified || undefined}
          className="sheet-cell-value"
          aria-label={notApplicable ? "No aplica" : undefined}
        >
          {notApplicable ? "—" : materialValue(viewDb, row, column)}
        </span>
      );
    },
    [display, modifiedKeys, viewDb],
  );
  const invalid = useCallback(
    (row: MaterialSheetRow, column: MaterialSheetColumn) =>
      invalidKeys.has(`${row.key}/${column.key}`),
    [invalidKeys],
  );
  const notice =
    error?.message ??
    (issues.length
      ? `Revisa ${issues.length} celdas: ${issues[0].message}`
      : "");
  const currentOrder = db.orden_compra.find(
    (order) => order.id === editingOrder,
  );
  const historyTools = (
    <SheetHistoryControls
      canUndo={canUndo}
      canRedo={canRedo}
      disabled={busy || !!editing}
      onMove={move}
    />
  );
  const writeTools = (
      <SheetWriteTools
        count={changes.length}
        editing={!!editing}
        busy={busy}
        canDiscard={!!(changes.length || editing || canUndo || canRedo)}
        onSave={() => {
          if (commit()) void save();
        }}
        onDiscard={async () => {
          if (
            await confirmAction(
              "¿Descartar los cambios de la hoja?",
              "Descartar",
            )
          )
            discard();
          returnFocus(scope);
        }}
      >
        {historyTools}
      </SheetWriteTools>
  );

  return (
    <section
      ref={section}
      className="product-order-sheet material-order-sheet"
      aria-label="Vista alternativa de OCM"
      aria-busy={busy}
      onKeyDown={(event) => {
        if (busy || editing) return;
        const direction = sheetHistoryShortcut(event);
        if (direction) {
          event.preventDefault();
          move(direction);
          return;
        }
        if (
          !event.altKey ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          !(event.target instanceof Element) ||
          event.target.closest(
            'input, textarea, select, [role="dialog"], [role="menu"]',
          )
        )
          return;
        const key = event.key.toLowerCase();
        const next =
          key === "c"
            ? "cerrada"
            : key === "n"
              ? "anulada"
              : key === "r"
                ? "en_seguimiento"
                : null;
        if (!next && !["a", "o", "s", "delete", "del", "supr"].includes(key)) return;
        event.preventDefault();
        const selected = targets();
        if (next)
          cleanFirst(() => void changeStates(next, selected.selected, scope));
        else if (
          key === "a" &&
          view === "no_autorizadas" &&
          selected.ids.length
        )
          openSheetDialog(() => setAuthorizing(selected.ids));
        else if (key === "o") openSheetDialog(() => setCreating(true));
        else if (key === "s") updateHidden([]);
        else if (["delete", "del", "supr"].includes(key) && selected.selected.length && selected.selected.every((row) => row.order.estado_autorizacion === "autorizada"))
          cleanFirst(() => beginDeleteLines(targets().selected, scope));
      }}
    >
      <div className="product-sheet-title">
        <h1>Órdenes de compra</h1>
        <div className="inline">
          <Button
            variant="ghost"
            onClick={() => cleanFirst(() => navigate("ordenes/productos"))}
          >
            Productos
          </Button>
          <Button variant="ghost" aria-pressed>
            Materiales
          </Button>
        </div>
      </div>
      <div className="product-sheet-toolbar">
        <div className="product-sheet-toolbar-top">
          {collapsed ? (
            <Button icon={ChevronDown} onClick={toggleToolbar}>
              Mostrar herramientas
            </Button>
          ) : (
            <SheetViewTabs
              view={view}
              onChange={(vista) => changeQuery({ vista })}
            />
          )}
          <div className="inline">
            {writeTools}
            {!collapsed && (
              <SheetTool
                icon={ChevronUp}
                label="Ocultar barra de herramientas"
                onClick={toggleToolbar}
              />
            )}
          </div>
        </div>
        {!collapsed && (
          <SheetSelectionView selection={selection} snapshot={selectionSummary}>
            {() => {
              const { range, ids, selected, order } = targets();
              const single = selected.length === 1 ? selected[0] : null;
              const lotIds = [...new Set(selected.map((row) => "id_lote_material" in row.line ? row.line.id_lote_material : null))];
              const certificateLotId = lotIds.length === 1 ? lotIds[0] : null;
              const documentId = order && selected[0].documentId;
              return (
                <div className="product-sheet-tools">
                  <div className="sheet-order-actions" ref={orderActionsRef}>
                  <Button
                    icon={Plus}
                    aria-keyshortcuts="Alt+O"
                    disabled={busy}
                    onClick={() => openSheetDialog(() => setCreating(true))}
                  >
                    Nueva OCM
                  </Button>
                  <MenuTrigger>
                    <Button icon={ChevronDown} aria-label="Más acciones de órdenes" />
                    <Popover triggerRef={orderActionsRef} className="aria-options custom-filter-options sheet-order-menu" placement="bottom start" offset={4}>
                      <Menu className="aria-option-list" aria-label="Acciones de órdenes"
                        onAction={(action) => {
                          const current = targets();
                          if (action === "autorizar" && view === "no_autorizadas" && current.ids.length && !busy)
                            openSheetDialog(() => setAuthorizing(current.ids));
                        }}>
                        <MenuItem id="autorizar" textValue="Autorizar" aria-keyshortcuts="Alt+A"
                          className="aria-option sheet-order-menu-item"
                          isDisabled={view !== "no_autorizadas" || !ids.length || busy}>
                          {ids.length && view === "no_autorizadas" ? `Autorizar ${ids.length} OCM` : "Autorizar"}
                          <FileCheck2 size={15} aria-hidden="true" />
                        </MenuItem>
                      </Menu>
                    </Popover>
                  </MenuTrigger>
                  </div>
                  <SheetLotActions count={selected.length} disabled={!range || busy}
                    available={{
                      cerrado: selected.some((row) => row.order.estado_autorizacion === "autorizada" && materialStateAllowed(row.line.estado, "cerrada")),
                      anulado: selected.some((row) => row.order.estado_autorizacion === "autorizada" && materialStateAllowed(row.line.estado, "anulada")),
                      en_seguimiento: selected.some((row) => row.order.estado_autorizacion === "autorizada" && materialStateAllowed(row.line.estado, "en_seguimiento")),
                    }}
                    onAction={(action) => {
                      const state = action === "cerrado" ? "cerrada" : action === "anulado" ? "anulada" : "en_seguimiento";
                      cleanFirst(() => void changeStates(state, targets().selected, scope));
                    }} />
                  <SheetTool icon={FileBadge} label="Certificados" disabled={!certificateLotId || busy}
                    onClick={() => {
                      if (!certificateLotId) return;
                      openSheetDialog(() => {
                        const lot = latestDb.current.lote_material.find((item) => item.id === certificateLotId);
                        if (lot) setCertificateLot({ id: lot.id, number: lot.numero_lote });
                        else notify("El lote ya no está disponible.", true);
                      });
                    }} />
                  <SheetTool
                    icon={FileText}
                    label="Ver orden escaneada"
                    disabled={!documentId}
                    onClick={() => {
                      if (documentId)
                        window.open(
                          documentUrl(documentId),
                          "_blank",
                          "noopener",
                        );
                    }}
                  />
                  <SheetTool
                    icon={Printer}
                    label="Imprimir"
                    disabled={!order}
                    onClick={() => {
                      if (order)
                        cleanFirst(() =>
                          printOrderFromSheet(order.id, navigate),
                        );
                    }}
                  />
                  <SheetTool
                    icon={MessageSquare}
                    label="Comentarios"
                    disabled={!single || single.entity !== "orden_material" || busy}
                    onClick={() => {
                      if (!single || single.entity !== "orden_material") return;
                      const item = allColumns.find((column) => column.key === "item");
                      const name = item ? materialValue(db, display(single), item) : "Material";
                      openSheetDialog(() => setComments({ tipo: "material", id: single.line.id, name: `OCM ${single.order.no_orden} · ${name}` }));
                    }}
                  />
                  <SheetTool
                    icon={Eye}
                    label="Ver detalle"
                    disabled={!order}
                    onClick={() => {
                      if (order)
                        cleanFirst(() => navigate(`ordenes/${order.id}`));
                    }}
                  />
                  <SheetTool
                    icon={Pencil}
                    label="Editar orden"
                    disabled={!order || busy}
                    onClick={() => {
                      if (order)
                        openSheetDialog(() => setEditingOrder(order.id));
                    }}
                  />
                  <SheetClipboardTools
                    disabled={!range || busy}
                    onCopy={() => copy()}
                    onPaste={paste}
                    notify={notify}
                  />
                  <SheetTool icon={Trash2} label="Eliminar lotes seleccionados"
                    tooltip="Eliminar lotes (Alt+supr)" aria-keyshortcuts="Alt+Delete"
                    disabled={!selected.length || selected.some((row) => row.order.estado_autorizacion !== "autorizada") || busy}
                    onClick={() => cleanFirst(() => beginDeleteLines(targets().selected, scope))} />
                  <ControlSelect
                    className="control"
                    aria-label="Filtrar tipo de orden"
                    value={type}
                    onChange={(event) =>
                      changeQuery({ tipo: event.target.value })
                    }
                  >
                    <option value="">Todos los tipos</option>
                    <option value="material">Material</option>
                    <option value="otro">Otros</option>
                  </ControlSelect>
                  <SheetFilterTools
                    group="materiales"
                    filter={filter}
                    query={query}
                    clearable={
                      !!filter ||
                      Object.values(tableState.filters).some(hasFilter)
                    }
                    onFilter={(filtro) => changeQuery({ filtro })}
                    onSearch={(q) => changeQuery({ q })}
                    onClear={() => changeQuery({ filtro: "", filtros: "" })}
                  >
                    <SheetColumnsMenu
                      open={columnsOpen}
                      onOpen={setColumnsOpen}
                      columns={allColumns}
                      hidden={hidden}
                      canHide={!!range}
                      onHide={hideSelected}
                      onChange={updateHidden}
                    />
                  </SheetFilterTools>
                </div>
              );
            }}
          </SheetSelectionView>
        )}
      </div>
      {storageError && (
        <div className="notice" role="status">
          El navegador no pudo guardar la copia local.
        </div>
      )}
      {recovery && !recoverOpen && (
        <Button onClick={() => setRecoverOpen(true)}>
          Ver borrador recuperable
        </Button>
      )}
      {notice && (
        <div className="error-notice product-sheet-error-notice" role="alert">
          <strong>{notice}</strong>
          <Button
            onClick={() => {
              setIssues([]);
              setError(null);
            }}
          >
            Cerrar aviso de error
          </Button>
        </div>
      )}
      <div className="product-sheet-status" role="status">
        {changes.length
          ? `${changes.length} cambios pendientes`
          : "Sin cambios pendientes"}
      </div>
      <OrderSheetGrid
        rows={rows}
        columns={columns}
        view={view}
        selection={selection}
        label="Órdenes de materiales por renglón"
        regionLabel="Hoja de órdenes de materiales"
        initialScroll={initialScroll}
        restorePosition={
          restoration?.scope === scope ? restoration.position : undefined
        }
        rowPresentation={presentation}
        readOnly={isReadOnly}
        pinnedColumn={openedColumn}
        renderCell={renderCell}
        invalid={invalid}
        editing={editing}
        editor={editor}
        onEdit={edit}
        onCommit={() => commit(undefined, true)}
        onCancel={() => setEditing(null)}
        onCopy={copy}
        onPaste={paste}
        onHideColumns={hideSelected}
        onClear={() => {
          const range = selection.read();
          if (range && !busy)
            applyInputs(
              sheetRangeInputs(range, rows, columns, [[""]], display).inputs,
            );
        }}
        renderHeader={(column) => (
          <ColumnHeader
            asContent
            column={column}
            filter={tableState.filters[column.key]}
            sort={tableState.sort}
            options={openedColumn === column.key ? filterOptions : []}
            open={openedColumn === column.key}
            onOpen={() => setOpenedColumn(column.key)}
            onClose={() => setOpenedColumn(null)}
            onFilter={(value) =>
              changeQuery(
                tableParams({
                  ...tableState,
                  filters: { ...tableState.filters, [column.key]: value },
                }),
              )
            }
            onSort={(sort) => changeQuery(tableParams({ ...tableState, sort }))}
          />
        )}
      />
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        <SheetSelectionView selection={selection}>
          {(range) => {
            const row = range && rows[range.anchor.row],
              column = range && columns[range.anchor.column];
            return row && column && range
              ? `Fila ${range.anchor.row + 1} de ${rows.length}, ${column.label}: ${materialValue(viewDb, display(row), column)}`
              : "";
          }}
        </SheetSelectionView>
      </div>
      <div className="product-sheet-footer">
        {rows.length} renglones · {orderCount} OCM
      </div>
      {recovery && recoverOpen && (
        <Dialog
          title="Cambios pendientes en este navegador"
          onClose={() => setRecoverOpen(false)}
        >
          <div className="dialog-body">
            <p>
              Última copia:{" "}
              {new Date(recovery.timestamp).toLocaleString("es-CO")}
            </p>
            <p>
              {recovery.changes.length} cambios de OCM. Recuperar sustituye el
              borrador de la hoja.
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
                record(recovery.changes);
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
        <SheetPendingDialog
          busy={busy}
          onClose={() => {
            setPending(null);
            returnFocus(pending.scope);
          }}
          onDiscard={() => {
            discard();
            setPending(null);
            if (liveScope.current === pending.scope) pending.action();
          }}
          onSave={async () => {
            if (await save(pending.scope)) {
              setPending(null);
              if (liveScope.current === pending.scope) pending.action();
            }
          }}
        />
      )}
      {creating && (
        <OrderForm
          initialType={type || "material"}
          beforeSnapshot={(snapshot) =>
            capture(snapshot, modalOrigin.current ?? scope)
          }
          onClose={() => finishSheetDialog(() => setCreating(false))}
        />
      )}
      {currentOrder && (
        <OrderForm
          order={currentOrder}
          returnToDetail={false}
          beforeSnapshot={(snapshot) =>
            capture(snapshot, modalOrigin.current ?? scope)
          }
          onClose={() => finishSheetDialog(() => setEditingOrder(null))}
        />
      )}
      {comments && <LineComments {...comments} onClose={() => finishSheetDialog(() => setComments(null))} />}
      {certificateLot && <Dialog title={`Certificados · ${certificateLot.number}`}
        onClose={() => finishSheetDialog(() => setCertificateLot(null))}>
        <div className="dialog-body"><Documents owner="lote_material" ownerId={certificateLot.id} compact /></div>
      </Dialog>}
      {deleting && <DeleteLotsDialog busy={busy} error={deleteError} onConfirm={deleteSelectedLines}
        onClose={() => { const origin = deleting.scope; setDeleting(null); returnFocus(origin); }}>
        <p>Se eliminarán {deleting.targets.length === 1 ? "la siguiente fila y sus datos" : "las siguientes filas y sus datos"} de recepción. Esta acción no se puede deshacer.</p>
        <ul className="delete-lot-list">{deleting.names.map((name, index) => <li key={deleting.targets[index].id}>{name}</li>)}</ul>
        <p>También se eliminarán {deleting.expected.reduce((sum, item) => sum + item.links.length, 0)} vínculos de abastecimiento y {deleting.expected.reduce((sum, item) => sum + item.comments.length, 0)} comentarios. Las facturas, los lotes de material y sus certificados se conservan.</p>
      </DeleteLotsDialog>}
      {authorizing && (
        <OrderAuthorizationDialog
          ids={authorizing}
          multiple
          beforeSnapshot={(snapshot) =>
            capture(snapshot, modalOrigin.current ?? scope)
          }
          onClose={() => finishSheetDialog(() => setAuthorizing(null))}
          onAuthorized={() => finishSheetDialog(() => setAuthorizing(null))}
        />
      )}
    </section>
  );
}
