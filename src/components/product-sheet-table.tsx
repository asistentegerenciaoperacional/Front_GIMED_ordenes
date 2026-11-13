import {
  isValidElement,
  memo,
  useCallback,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { SheetPoint } from "../product-sheet-selection";

export type OrderGridRow = { key: string; order: { id: string } };
export type OrderGridColumn = { key: string; width: number; entity?: string };
export type OrderGridRowPresentation = { state?: "en_seguimiento" | "cerrado" | "anulado"; label?: string };
type Props<R extends OrderGridRow, C extends OrderGridColumn> = {
  rows: R[];
  columns: C[];
  label: string;
  rowPresentation?: (row: R) => OrderGridRowPresentation;
  readOnly?: (row: R, column: C) => boolean;
  start: number;
  end: number;
  columnStart: number;
  columnEnd: number;
  width: number;
  pinnedColumn?: string | null;
  rangeAnchor: SheetPoint | null;
  renderCell: (row: R, column: C) => ReactNode;
  renderHeader: (column: C) => ReactNode;
  editing: { rowKey: string; column: string } | null;
  editor: ReactNode;
  invalid?: (row: R, column: C) => boolean;
  registerCell: (node: HTMLTableCellElement) => () => void;
  registerRow: (node: HTMLTableRowElement) => () => void;
};
type Slot<C> = { key: string; column?: C; index: number; width: number };
function SheetCellImpl<R extends OrderGridRow, C extends OrderGridColumn>({
  row,
  column,
  index,
  columnIndex,
  editing,
  editor,
  invalid,
  readOnly,
  renderCell,
  registerCell,
}: {
  row: R;
  column: C;
  index: number;
  columnIndex: number;
  editing: boolean;
  editor: ReactNode;
  invalid: boolean;
  readOnly: boolean;
  renderCell: Props<R, C>["renderCell"];
  registerCell: Props<R, C>["registerCell"];
}) {
  const cellRef = useCallback(
    (node: HTMLTableCellElement) => registerCell(node),
    [registerCell, index, columnIndex],
  );
  return (
    <td
      role="gridcell"
      ref={cellRef}
      aria-colindex={columnIndex + 1}
      data-sheet-key={row.key}
      data-sheet-row={index}
      data-sheet-column={columnIndex}
      data-column-key={column.key}
      data-rejected={invalid || undefined}
      aria-invalid={invalid || undefined}
      aria-readonly={readOnly || undefined}
    >
      {editing ? editor : renderCell(row, column)}
    </td>
  );
}
const SheetCell = memo(SheetCellImpl) as typeof SheetCellImpl;
function SheetRowImpl<R extends OrderGridRow, C extends OrderGridColumn>({
  row,
  index,
  slots,
  editingColumn,
  editor,
  renderCell,
  invalid,
  rowPresentation,
  readOnly,
  registerCell,
  registerRow,
}: {
  row: R;
  index: number;
  slots: Slot<C>[];
  editingColumn?: string;
  editor: ReactNode;
  renderCell: Props<R, C>["renderCell"];
  invalid: Props<R, C>["invalid"];
  rowPresentation: Props<R, C>["rowPresentation"];
  readOnly: Props<R, C>["readOnly"];
  registerCell: Props<R, C>["registerCell"];
  registerRow: Props<R, C>["registerRow"];
}) {
  const rowRef = useCallback(
    (node: HTMLTableRowElement) => registerRow(node),
    [registerRow, index, row.order.id],
  );
  const presentation = rowPresentation?.(row);
  return (
    <tr
      role="row"
      ref={rowRef}
      aria-rowindex={index + 2}
      data-global-row-index={index + 2}
      data-order-id={row.order.id}
      data-row-index={index}
      data-lot-state={presentation?.state}
      aria-label={presentation?.label}
    >
      {slots.map((slot) =>
        slot.column ? (
          <SheetCell
            key={slot.key}
            row={row}
            column={slot.column}
            index={index}
            columnIndex={slot.index}
            editing={editingColumn === slot.key}
            editor={editingColumn === slot.key ? editor : null}
            invalid={!!invalid?.(row, slot.column)}
            readOnly={readOnly?.(row, slot.column) ?? !slot.column.entity}
            renderCell={renderCell}
            registerCell={registerCell}
          />
        ) : (
          <td
            key={slot.key}
            role="presentation"
            aria-hidden="true"
            className="sheet-column-spacer"
          />
        ),
      )}
    </tr>
  );
}
const SheetRow = memo(SheetRowImpl) as typeof SheetRowImpl;

/** The spreadsheet owns its navigation. React Aria controls remain inside its cells and headers. */
function OrderSheetTableImpl<R extends OrderGridRow, C extends OrderGridColumn>({
  rows,
  columns,
  label,
  rowPresentation,
  readOnly,
  start,
  end,
  columnStart,
  columnEnd,
  pinnedColumn,
  rangeAnchor,
  width,
  renderCell,
  renderHeader,
  editing,
  editor,
  invalid,
  registerCell,
  registerRow,
}: Props<R, C>) {
  const slots = useMemo(() => {
    const wanted = new Set<number>();
    for (let i = columnStart; i < columnEnd; i++) wanted.add(i);
    if (rangeAnchor && rangeAnchor.column < columns.length)
      wanted.add(rangeAnchor.column);
    for (const key of [pinnedColumn, editing?.column]) {
      const index = columns.findIndex((col) => col.key === key);
      if (index >= 0) wanted.add(index);
    }
    const result: Slot<C>[] = [];
    let gap = 0;
    columns.forEach((column, index) => {
      if (!wanted.has(index)) {
        gap += column.width;
        return;
      }
      if (gap) {
        result.push({ key: `gap-${index}`, index: -1, width: gap });
        gap = 0;
      }
      result.push({ key: column.key, column, index, width: column.width });
    });
    if (gap) result.push({ key: "gap-end", index: -1, width: gap });
    return result;
  }, [
    columns,
    columnStart,
    columnEnd,
    pinnedColumn,
    rangeAnchor?.column,
    editing?.column,
  ]);
  const indices = useMemo(() => {
    const result = Array.from(
      { length: Math.max(0, end - start) },
      (_, index) => start + index,
    );
    if (
      rangeAnchor &&
      rangeAnchor.row < rows.length &&
      (rangeAnchor.row < start || rangeAnchor.row >= end)
    )
      result.push(rangeAnchor.row);
    if (editing) {
      const index = rows.findIndex((row) => row.key === editing.rowKey);
      if (
        index >= 0 &&
        index !== rangeAnchor?.row &&
        (index < start || index >= end)
      )
        result.push(index);
    }
    return result.sort((a, b) => a - b);
  }, [rows, start, end, rangeAnchor?.row, editing?.rowKey]);
  const headers = useMemo(
    () =>
      slots.map((slot) => {
        const content = slot.column ? renderHeader(slot.column) : null;
        const sort = isValidElement<{
          sort?: { column: string; direction: string };
        }>(content)
          ? content.props.sort
          : undefined;
        return slot.column ? (
          <th
            key={slot.key}
            scope="col"
            role="columnheader"
            aria-colindex={slot.index + 1}
            aria-sort={
              sort?.column === slot.key
                ? sort.direction === "asc"
                  ? "ascending"
                  : "descending"
                : undefined
            }
          >
            {content}
          </th>
        ) : (
          <th
            key={slot.key}
            role="presentation"
            aria-hidden="true"
            className="sheet-column-spacer"
          />
        );
      }),
    [slots, renderHeader],
  );
  const body: ReactNode[] = [];
  const spacer = (key: string, count: number) => {
    if (count > 0)
      body.push(
        <tr
          key={key}
          className="sheet-spacer"
          role="presentation"
          aria-hidden="true"
          style={{ "--spacer": `${count * 32}px` } as CSSProperties}
        >
          <td colSpan={slots.length} role="presentation" />
        </tr>,
      );
  };
  let previous = -1;
  for (const index of indices) {
    spacer(`gap-${index}`, index - previous - 1);
    const row = rows[index],
      editingColumn = editing?.rowKey === row.key ? editing.column : undefined;
    body.push(
      <SheetRow
        key={row.key}
        row={row}
        index={index}
        slots={slots}
        editingColumn={editingColumn}
        editor={editingColumn ? editor : null}
        renderCell={renderCell}
        invalid={invalid}
        rowPresentation={rowPresentation}
        readOnly={readOnly}
        registerCell={registerCell}
        registerRow={registerRow}
      />,
    );
    previous = index;
  }
  spacer("after", rows.length - previous - 1);
  return (
    <table
      role="grid"
      tabIndex={0}
      className="data-table product-sheet-grid"
      data-renderer="native"
      aria-label={label}
      aria-rowcount={rows.length + 1}
      aria-colcount={columns.length}
      aria-multiselectable="true"
      style={{ width, minWidth: width }}
    >
      <colgroup>
        {slots.map((slot) => (
          <col key={slot.key} style={{ width: slot.width }} />
        ))}
      </colgroup>
      <thead role="rowgroup">
        <tr role="row" aria-rowindex={1}>
          {headers}
        </tr>
      </thead>
      <tbody role="rowgroup">
        {rows.length ? (
          body
        ) : (
          <tr>
            <td colSpan={slots.length}>
              No hay filas que coincidan con esta hoja y sus filtros.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
export const OrderSheetTable = memo(OrderSheetTableImpl) as typeof OrderSheetTableImpl;
