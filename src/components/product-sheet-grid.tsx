import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type ReactElement,
} from "react";
import {
  DataTable,
  TableHead,
  TableRows,
  TableRow,
  TableColumn,
  TableCell,
} from "./data-table";
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

export type SheetPoint = { row: number; column: number };
export type SheetRange = { anchor: SheetPoint; focus: SheetPoint };
export const rangeBounds = (range: SheetRange) => ({
  top: Math.min(range.anchor.row, range.focus.row),
  bottom: Math.max(range.anchor.row, range.focus.row),
  left: Math.min(range.anchor.column, range.focus.column),
  right: Math.max(range.anchor.column, range.focus.column),
});
const rowHeight = 32,
  headerHeight = 44;
export function ProductSheetGrid({
  rows,
  columns,
  range,
  onRange,
  renderCell,
  renderHeader,
  onEdit,
  editor,
  editing,
  onCommit,
  onCancel,
  onCopy,
  onPaste,
  selectedOrders,
  invalid,
}: {
  rows: ProductSheetRow[];
  columns: SheetColumn[];
  range: SheetRange | null;
  onRange: (range: SheetRange) => void;
  renderCell: (row: ProductSheetRow, col: SheetColumn) => ReactNode;
  renderHeader: (col: SheetColumn) => ReactNode;
  onEdit: (row: ProductSheetRow, col: SheetColumn, initial?: string) => void;
  editor: ReactNode;
  editing: { rowKey: string; column: string } | null;
  onCommit: () => boolean;
  onCancel: () => void;
  onCopy: (event?: React.ClipboardEvent) => void;
  onPaste: (text: string) => void;
  selectedOrders: Set<string>;
  invalid?: (row: ProductSheetRow, col: SheetColumn) => boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0),
    [height, setHeight] = useState(550);
  useEffect(() => {
    const element = viewport.current!;
    const resize = new ResizeObserver(() => setHeight(element.clientHeight));
    resize.observe(element);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    viewport.current!.scrollTop = 0;
    setScroll(0);
  }, [rows]);
  useEffect(() => {
    if (range && !editing) reveal(range.focus);
  }, [range, editing?.rowKey, editing?.column]);
  useEffect(() => {
    if (!editing) return;
    viewport.current
      ?.querySelector<HTMLInputElement>("[data-active] input")
      ?.focus({ preventScroll: true });
  }, [editing?.rowKey, editing?.column]);
  const start = Math.max(
    0,
    Math.floor((scroll - headerHeight) / rowHeight) - 6,
  );
  const end = Math.min(rows.length, start + Math.ceil(height / rowHeight) + 13);
  const bounds = range && rangeBounds(range);
  function reveal(point: SheetPoint) {
    const element = viewport.current!;
    const y = headerHeight + point.row * rowHeight;
    if (y < element.scrollTop + headerHeight)
      element.scrollTop = y - headerHeight;
    else if (y + rowHeight > element.scrollTop + element.clientHeight)
      element.scrollTop = y + rowHeight - element.clientHeight;
    const x = columns
      .slice(0, point.column)
      .reduce((sum, col) => sum + col.width, 0);
    if (x < element.scrollLeft) element.scrollLeft = x;
    else if (
      x + columns[point.column].width >
      element.scrollLeft + element.clientWidth
    )
      element.scrollLeft =
        x + columns[point.column].width - element.clientWidth;
    element.focus({ preventScroll: true });
  }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab" && !editing) return;
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
      viewport.current?.focus();
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest("button") &&
      !editing
    )
      return;
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
      if (editing && !onCommit()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
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
      onRange({
        anchor:
          event.shiftKey && event.key !== "Tab"
            ? (range?.anchor ?? current)
            : point,
        focus: point,
      });
      reveal(point);
      return;
    }
    if (!editing && event.key.length === 1) {
      event.preventDefault();
      onEdit(rows[current.row], columns[current.column], event.key);
    }
  }
  const width = columns.reduce((sum, col) => sum + col.width, 0);
  return (
    <div
      ref={viewport}
      className="product-sheet-viewport table-scroll"
      role="region"
      aria-label="Hoja de órdenes de productos"
      tabIndex={0}
      onScroll={(event) => setScroll(event.currentTarget.scrollTop)}
      onKeyDownCapture={navigate}
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
        const element = event.target as Element;
        if (element.closest('button, a, input, [role="combobox"]')) return;
        const cell = element.closest<HTMLElement>("[data-sheet-row]");
        if (!cell) return;
        if (editing && !onCommit()) return;
        const point = {
          row: Number(cell.dataset.sheetRow),
          column: Number(cell.dataset.sheetColumn),
        };
        onRange({
          anchor: event.shiftKey ? (range?.anchor ?? point) : point,
          focus: point,
        });
        viewport.current?.focus({ preventScroll: true });
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
      <DataTable
        manualKeyboardNavigation
        className="data-table product-sheet-grid"
        aria-label="Órdenes de productos por lote"
        aria-rowcount={rows.length + 1}
        style={{ width, minWidth: width }}
      >
        <TableHead>
          <TableRow>
            {columns.map((col) => {
              const header = renderHeader(col);
              return isValidElement(header) ? (
                cloneElement(
                  header as ReactElement<{ style?: CSSProperties }>,
                  { key: col.key, style: { width: col.width } },
                )
              ) : (
                <TableColumn key={col.key} style={{ width: col.width }}>
                  {header}
                </TableColumn>
              );
            })}
          </TableRow>
        </TableHead>
        <TableRows>
          {start > 0 && (
            <TableRow
              key="before"
              className="sheet-spacer"
              aria-hidden="true"
              style={{ "--spacer": `${start * rowHeight}px` } as CSSProperties}
            >
              <TableCell colSpan={columns.length} />
            </TableRow>
          )}
          {rows.slice(start, end).map((row, offset) => {
            const index = start + offset;
            return (
              <TableRow
                key={row.key}
                aria-rowindex={index + 2}
                data-global-row-index={index + 2}
                aria-label={
                  row.lot
                    ? `OC ${row.order.no_orden}, lote ${row.lot.numero_lote ?? "sin número"}, ${row.lot.estado.replaceAll("_", " ")}`
                    : undefined
                }
                data-lot-state={row.lot?.estado}
                data-order-selected={
                  selectedOrders.has(row.order.id) || undefined
                }
              >
                {columns.map((col, column) => (
                  <TableCell
                    key={col.key}
                    data-sheet-key={row.key}
                    data-sheet-row={index}
                    data-sheet-column={column}
                    data-column-key={col.key}
                    data-rejected={invalid?.(row, col) || undefined}
                    aria-invalid={invalid?.(row, col) || undefined}
                    data-range={
                      (!!bounds &&
                        index >= bounds.top &&
                        index <= bounds.bottom &&
                        column >= bounds.left &&
                        column <= bounds.right) ||
                      undefined
                    }
                    data-active={
                      (range?.focus.row === index &&
                        range.focus.column === column) ||
                      undefined
                    }
                  >
                    {editing?.rowKey === row.key && editing.column === col.key
                      ? editor
                      : renderCell(row, col)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
          {end < rows.length && (
            <TableRow
              key="after"
              className="sheet-spacer"
              aria-hidden="true"
              style={
                {
                  "--spacer": `${(rows.length - end) * rowHeight}px`,
                } as CSSProperties
              }
            >
              <TableCell colSpan={columns.length} />
            </TableRow>
          )}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={columns.length}>
                No hay filas que coincidan con esta hoja y sus filtros.
              </TableCell>
            </TableRow>
          )}
        </TableRows>
      </DataTable>
    </div>
  );
}
