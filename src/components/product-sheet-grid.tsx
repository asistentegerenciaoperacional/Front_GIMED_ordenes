import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ProductSheetTable } from "./product-sheet-table";
import {
  SheetSelection,
  rangeBounds,
  type SheetPoint,
} from "../product-sheet-selection";
export {
  rangeBounds,
  type SheetRange,
  type SheetPoint,
} from "../product-sheet-selection";
import type {
  ProductSheetRow,
  SheetColumn,
} from "../product-order-sheet-model";
import { Tooltip, TooltipTrigger } from "react-aria-components/Tooltip";
import { Action } from "./controls";

export function SheetCellHint({
  label,
  children,
  indicator = false,
}: {
  label: string;
  children: ReactNode;
  indicator?: boolean;
}) {
  const [hovered, setHovered] = useState(false),
    [pinned, setPinned] = useState(false);
  return (
    <TooltipTrigger
      delay={300}
      isOpen={hovered || pinned}
      onOpenChange={setHovered}
    >
      <Action
        className={indicator ? "sheet-excess-indicator" : "sheet-ocm-number"}
        aria-label={label}
        onClick={() => setPinned(!pinned)}
        onBlur={() => setPinned(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setPinned(false);
            setHovered(false);
          }
        }}
      >
        {indicator ? <span aria-hidden="true">◥</span> : children}
      </Action>
      <Tooltip
        className="field-tooltip table-action-tooltip"
        placement="top"
        offset={6}
        data-react-aria-top-layer=""
      >
        {label}
      </Tooltip>
    </TooltipTrigger>
  );
}

const rowHeight = 32,
  headerHeight = 44;
export function ProductSheetGrid({
  rows,
  columns,
  selection,
  view,
  pinnedColumn,
  renderCell,
  renderHeader,
  onEdit,
  editor,
  editing,
  onCommit,
  onCancel,
  onCopy,
  onPaste,
  onClear,
  onHideColumns,
  invalid,
}: {
  rows: ProductSheetRow[];
  columns: SheetColumn[];
  selection: SheetSelection;
  view: string;
  pinnedColumn?: string | null;
  renderCell: (row: ProductSheetRow, col: SheetColumn) => ReactNode;
  renderHeader: (col: SheetColumn) => ReactNode;
  onEdit: (row: ProductSheetRow, col: SheetColumn, initial?: string) => void;
  editor: ReactNode;
  editing: { rowKey: string; column: string; deferredClear?: boolean } | null;
  onCommit: () => boolean;
  onCancel: () => void;
  onCopy: (event?: React.ClipboardEvent) => void;
  onPaste: (text: string) => void;
  onClear: () => void;
  onHideColumns: () => void;
  invalid?: (row: ProductSheetRow, col: SheetColumn) => boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const id = useId();
  const cells = useRef(new Map<HTMLTableCellElement, SheetPoint>());
  const rowNodes = useRef(
    new Map<HTMLTableRowElement, { index: number; orderId: string }>(),
  );
  const live = useRef({ rows, columns, editing, view });
  live.current = { rows, columns, editing, view };
  const rowKeys = useMemo(() => rows.map((row) => row.key), [rows]);
  const columnKeys = useMemo(() => columns.map((col) => col.key), [columns]);
  const offsets = useMemo(() => {
    let x = 0;
    return columns.map((col) => {
      const left = x;
      x += col.width;
      return left;
    });
  }, [columns]);
  const width = useMemo(
    () => columns.reduce((sum, col) => sum + col.width, 0),
    [columns],
  );
  const setFlag = (node: Element, name: string, value: boolean) => {
    if (node.hasAttribute(name) !== value) {
      if (value) node.setAttribute(name, "true");
      else node.removeAttribute(name);
    }
  };
  const paint = useCallback(() => {
    const range = selection.read(),
      bounds = range && rangeBounds(range);
    const selectedOrders = new Set<string>();
    if (bounds && live.current.view === "no_autorizadas")
      for (let index = bounds.top; index <= bounds.bottom; index++) {
        const row = live.current.rows[index];
        if (row) selectedOrders.add(row.order.id);
      }
    let active: HTMLTableCellElement | null = null;
    for (const [node, point] of cells.current) {
      const selected =
        !!bounds &&
        point.row >= bounds.top &&
        point.row <= bounds.bottom &&
        point.column >= bounds.left &&
        point.column <= bounds.right;
      const focused =
        range?.focus.row === point.row && range.focus.column === point.column;
      setFlag(node, "data-range", selected);
      setFlag(node, "data-active", focused);
      if (node.getAttribute("aria-selected") !== String(selected))
        node.setAttribute("aria-selected", String(selected));
      if (focused) active = node;
    }
    for (const [node, row] of rowNodes.current) {
      setFlag(
        node,
        "data-active-row",
        !!bounds &&
          bounds.top === row.index &&
          bounds.bottom === row.index &&
          bounds.left === bounds.right,
      );
      setFlag(node, "data-order-selected", selectedOrders.has(row.orderId));
    }
    const table = viewport.current?.querySelector("table");
    if (active?.isConnected) {
      if (!active.id)
        active.id =
          id + "-" + active.dataset.sheetKey + "-" + active.dataset.columnKey;
      if (table?.getAttribute("aria-activedescendant") !== active.id)
        table?.setAttribute("aria-activedescendant", active.id);
    } else table?.removeAttribute("aria-activedescendant");
  }, [selection, id]);
  const registerCell = useCallback((node: HTMLTableCellElement) => {
    cells.current.set(node, {
      row: Number(node.dataset.sheetRow),
      column: Number(node.dataset.sheetColumn),
    });
    return () => {
      cells.current.delete(node);
    };
  }, []);
  const registerRow = useCallback((node: HTMLTableRowElement) => {
    node.setAttribute("aria-rowindex", node.dataset.globalRowIndex!);
    rowNodes.current.set(node, {
      index: Number(node.dataset.rowIndex),
      orderId: node.dataset.orderId!,
    });
    return () => {
      rowNodes.current.delete(node);
    };
  }, []);
  const [windowRange, setWindowRange] = useState({ start: 0, end: 32 });
  const [columnRange, setColumnRange] = useState({ start: 0, end: 12 });
  const windowFrame = useRef<number | null>(null);
  const previousRows = useRef<readonly string[] | null>(null);
  const updateWindow = useCallback((force = false) => {
    const el = viewport.current;
    if (!el) return;
    const first = Math.max(0, Math.floor(el.scrollTop / rowHeight));
    const last = Math.min(
      live.current.rows.length,
      Math.ceil((el.scrollTop + el.clientHeight - headerHeight) / rowHeight),
    );
    setWindowRange((previous) => {
      const covered =
        previous.start <= Math.max(0, first - 2) &&
        previous.end >= Math.min(live.current.rows.length, last + 2);
      if (!force && covered) return previous;
      const next = {
        start: Math.max(0, first - 6),
        end: Math.min(live.current.rows.length, last + 6),
      };
      return previous.start === next.start && previous.end === next.end
        ? previous
        : next;
    });
    const cols = live.current.columns;
    let firstColumn = 0,
      left = 0;
    while (
      firstColumn < cols.length &&
      left + cols[firstColumn].width <= el.scrollLeft
    )
      left += cols[firstColumn++].width;
    let lastColumn = firstColumn,
      right = left;
    while (lastColumn < cols.length && right < el.scrollLeft + el.clientWidth)
      right += cols[lastColumn++].width;
    const start = Math.max(0, firstColumn - 1),
      end = Math.min(cols.length, lastColumn + 1);
    setColumnRange((previous) =>
      previous.start === start && previous.end === end
        ? previous
        : { start, end },
    );
  }, []);
  const scheduleWindow = useCallback(() => {
    if (windowFrame.current !== null) return;
    windowFrame.current = requestAnimationFrame(() => {
      windowFrame.current = null;
      updateWindow();
    });
  }, [updateWindow]);
  const drag = useRef<{
    anchor: SheetPoint;
    last: SheetPoint;
    x: number;
    y: number;
  } | null>(null);
  const dragged = useRef(false);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = 0;
      const state = drag.current,
        element = viewport.current;
      if (!state || !element) return;
      const rect = element.getBoundingClientRect();
      const dx =
        state.x < rect.left + 24 ? -18 : state.x > rect.right - 24 ? 18 : 0;
      const dy =
        state.y < rect.top + headerHeight + 20
          ? -18
          : state.y > rect.bottom - 20
            ? 18
            : 0;
      if (dx || dy) element.scrollBy(dx, dy);
      const x = Math.max(rect.left + 1, Math.min(rect.right - 18, state.x));
      const y = Math.max(
        rect.top + headerHeight + 1,
        Math.min(rect.bottom - 18, state.y),
      );
      const cell = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>("[data-sheet-row]");
      if (cell && element.contains(cell)) {
        const point = {
          row: Number(cell.dataset.sheetRow),
          column: Number(cell.dataset.sheetColumn),
        };
        if (
          point.row !== state.last.row ||
          point.column !== state.last.column
        ) {
          dragged.current = true;
          state.last = point;
          selection.set({ anchor: state.anchor, focus: point });
        }
      }
      if (dx || dy) frame = requestAnimationFrame(tick);
    };
    const move = (event: PointerEvent) => {
      if (!drag.current || !(event.buttons & 1)) return;
      drag.current.x = event.clientX;
      drag.current.y = event.clientY;
      if (frame) cancelAnimationFrame(frame);
      tick();
    };
    const end = () => {
      drag.current = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      window.setTimeout(() => {
        dragged.current = false;
      }, 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [selection, rowKeys, columnKeys, view]);
  useLayoutEffect(() => {
    drag.current = null;
    selection.configure(rowKeys, columnKeys, view);
    if (viewport.current && previousRows.current !== rowKeys)
      viewport.current.scrollTop = 0;
    previousRows.current = rowKeys;
    updateWindow(true);
  }, [rowKeys, columnKeys, view, selection, updateWindow]);
  useEffect(() => {
    const observer = new ResizeObserver(() => updateWindow(true));
    if (viewport.current) observer.observe(viewport.current);
    return () => {
      observer.disconnect();
      if (windowFrame.current !== null)
        cancelAnimationFrame(windowFrame.current);
      windowFrame.current = null;
    };
  }, [updateWindow]);
  const reveal = useCallback(
    (point: SheetPoint, focusGrid = true) => {
      const el = viewport.current;
      if (!el || !live.current.columns[point.column]) return;
      const y = point.row * rowHeight,
        bottom = y + rowHeight + headerHeight;
      if (y < el.scrollTop) el.scrollTop = y;
      else if (bottom > el.scrollTop + el.clientHeight)
        el.scrollTop = bottom - el.clientHeight;
      const x = offsets[point.column],
        right = x + live.current.columns[point.column].width;
      if (x < el.scrollLeft) el.scrollLeft = x;
      else if (right > el.scrollLeft + el.clientWidth)
        el.scrollLeft = right - el.clientWidth;
      updateWindow();
      const table = el.querySelector("table");
      if (focusGrid && document.activeElement !== table)
        table?.focus({ preventScroll: true });
    },
    [offsets, updateWindow],
  );
  useLayoutEffect(
    () =>
      selection.subscribe(() => {
        const range = selection.read();
        if (range && !live.current.editing) reveal(range.focus);
        paint();
      }),
    [selection, reveal, paint],
  );
  useLayoutEffect(() => {
    paint();
  });
  useEffect(() => {
    if (!editing) return;
    const row = rowKeys.indexOf(editing.rowKey),
      column = columnKeys.indexOf(editing.column);
    if (row >= 0 && column >= 0) reveal({ row, column }, false);
    viewport.current
      ?.querySelector<HTMLInputElement>("[data-active] input")
      ?.focus({ preventScroll: true });
  }, [editing?.rowKey, editing?.column, rowKeys, columnKeys, reveal]);
  const start = Math.min(windowRange.start, Math.max(0, rows.length - 1));
  const end = Math.min(rows.length, windowRange.end);
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const range = selection.read();
    if (event.key === "Tab" && !editing) return;
    if (
      !editing &&
      event.altKey &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      event.key.toLowerCase() === "h"
    ) {
      event.preventDefault();
      event.stopPropagation();
      onHideColumns();
      return;
    }
    if (
      event.nativeEvent.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    if (
      event.target instanceof Element &&
      event.target.closest(
        '[role="listbox"], [role="dialog"], .column-filter-panel',
      )
    )
      return;
    if (editing && viewport.current?.querySelector('[aria-expanded="true"]'))
      return;
    if (event.key === "Escape" && editing) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      viewport.current
        ?.querySelector<HTMLTableElement>("table")
        ?.focus({ preventScroll: true });
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest("button") &&
      !editing
    )
      return;
    if (!editing && ["Delete", "Del", "Supr"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (range) onClear();
      return;
    }
    const current = range?.focus ?? { row: 0, column: 0 };
    if (!rows.length || !columns.length) return;
    if (event.key === "F2") {
      event.preventDefault();
      event.stopPropagation();
      onEdit(rows[current.row], columns[current.column]);
      return;
    }
    if (
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Enter",
        "Tab",
      ].includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      let row = current.row,
        column = current.column;
      if (event.key === "ArrowUp") row--;
      if (["ArrowDown", "Enter"].includes(event.key)) row++;
      if (event.key === "ArrowLeft") column--;
      if (event.key === "ArrowRight") column++;
      if (event.key === "Tab") {
        column += event.shiftKey ? -1 : 1;
        if (column >= columns.length) {
          column = 0;
          row++;
        } else if (column < 0) {
          column = columns.length - 1;
          row--;
        }
      }
      const point = {
        row: Math.max(0, Math.min(rows.length - 1, row)),
        column: Math.max(0, Math.min(columns.length - 1, column)),
      };
      if (editing?.deferredClear && point.row === current.row && point.column === current.column) return;
      if (editing && !onCommit()) return;
      selection.set({
        anchor:
          event.shiftKey && event.key !== "Tab"
            ? (range?.anchor ?? current)
            : point,
        focus: point,
      });
      return;
    }
    if (!editing && event.key.length === 1) {
      event.preventDefault();
      onEdit(rows[current.row], columns[current.column], event.key);
    }
  }
  return (
    <div
      ref={viewport}
      className="product-sheet-viewport table-scroll"
      role="region"
      aria-label="Hoja de órdenes de productos"
      tabIndex={-1}
      onScroll={scheduleWindow}
      onKeyDownCapture={navigate}
      onPointerDownCapture={(event) => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        const target = event.target as Element;
        if (target.closest('button, a, input, [role="combobox"]')) return;
        const cell = target.closest<HTMLElement>("[data-sheet-row]");
        if (!cell) return;
        if (editing?.deferredClear && cell.dataset.sheetKey === editing.rowKey && cell.dataset.columnKey === editing.column) return;
        if (editing && !onCommit()) return;
        const point = {
          row: Number(cell.dataset.sheetRow),
          column: Number(cell.dataset.sheetColumn),
        };
        const anchor = event.shiftKey
          ? (selection.read()?.anchor ?? point)
          : point;
        drag.current = {
          anchor,
          last: point,
          x: event.clientX,
          y: event.clientY,
        };
        dragged.current = false;
        selection.set({ anchor, focus: point });
        viewport.current
          ?.querySelector<HTMLTableElement>("table")
          ?.focus({ preventScroll: true });
        event.preventDefault();
      }}
      onCopy={(event) => {
        if (!editing) onCopy(event);
      }}
      onPaste={(event) => {
        if (!editing) {
          event.preventDefault();
          onPaste(event.clipboardData.getData("text/plain"));
        }
      }}
      onClickCapture={(event) => {
        if (dragged.current) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const element = event.target as Element;
        if (element.closest('button, a, input, [role="combobox"]')) return;
        const cell = element.closest<HTMLElement>("[data-sheet-row]");
        if (!cell) return;
        if (editing?.deferredClear && cell.dataset.sheetKey === editing.rowKey && cell.dataset.columnKey === editing.column) return;
        if (editing && !onCommit()) return;
        const point = {
          row: Number(cell.dataset.sheetRow),
          column: Number(cell.dataset.sheetColumn),
        };
        selection.set({
          anchor: event.shiftKey ? (selection.read()?.anchor ?? point) : point,
          focus: point,
        });
        viewport.current
          ?.querySelector<HTMLTableElement>("table")
          ?.focus({ preventScroll: true });
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        if ((event.target as Element).closest("button, a")) return;
        const cell = (event.target as Element).closest<HTMLElement>(
          "[data-sheet-row]",
        );
        if (cell)
          onEdit(
            rows[Number(cell.dataset.sheetRow)],
            columns[Number(cell.dataset.sheetColumn)],
          );
      }}
    >
      <ProductSheetTable
        rows={rows}
        columns={columns}
        start={start}
        end={end}
        columnStart={columnRange.start}
        columnEnd={columnRange.end}
        pinnedColumn={pinnedColumn}
        width={width}
        renderCell={renderCell}
        renderHeader={renderHeader}
        editing={editing}
        editor={editor}
        invalid={invalid}
        registerCell={registerCell}
        registerRow={registerRow}
      />
    </div>
  );
}
