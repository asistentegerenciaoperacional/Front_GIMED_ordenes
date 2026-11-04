import {
  isValidElement,
  memo,
  useCallback,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  ProductSheetRow,
  SheetColumn,
} from "../product-order-sheet-model";

type Props = {
  rows: ProductSheetRow[];
  columns: SheetColumn[];
  start: number;
  end: number;
  columnStart: number;
  columnEnd: number;
  width: number;
  pinnedColumn?: string | null;
  renderCell: (row: ProductSheetRow, column: SheetColumn) => ReactNode;
  renderHeader: (column: SheetColumn) => ReactNode;
  editing: { rowKey: string; column: string } | null;
  editor: ReactNode;
  invalid?: (row: ProductSheetRow, column: SheetColumn) => boolean;
  registerCell: (node: HTMLTableCellElement) => () => void;
  registerRow: (node: HTMLTableRowElement) => () => void;
};
type Slot = { key: string; column?: SheetColumn; index: number; width: number };
const SheetCell = memo(function SheetCell({
  row,
  column,
  index,
  columnIndex,
  editing,
  editor,
  invalid,
  renderCell,
  registerCell,
}: {
  row: ProductSheetRow;
  column: SheetColumn;
  index: number;
  columnIndex: number;
  editing: boolean;
  editor: ReactNode;
  invalid: boolean;
  renderCell: Props["renderCell"];
  registerCell: Props["registerCell"];
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
    >
      {editing ? editor : renderCell(row, column)}
    </td>
  );
});
const SheetRow = memo(function SheetRow({
  row,
  index,
  slots,
  editingColumn,
  editor,
  renderCell,
  invalid,
  registerCell,
  registerRow,
}: {
  row: ProductSheetRow;
  index: number;
  slots: Slot[];
  editingColumn?: string;
  editor: ReactNode;
  renderCell: Props["renderCell"];
  invalid: Props["invalid"];
  registerCell: Props["registerCell"];
  registerRow: Props["registerRow"];
}) {
  const rowRef = useCallback(
    (node: HTMLTableRowElement) => registerRow(node),
    [registerRow, index, row.order.id],
  );
  return (
    <tr
      role="row"
      ref={rowRef}
      aria-rowindex={index + 2}
      data-global-row-index={index + 2}
      data-order-id={row.order.id}
      data-row-index={index}
      data-lot-state={row.lot?.estado}
      aria-label={
        row.lot
          ? `OC ${row.order.no_orden}, lote ${row.lot.numero_lote ?? "sin número"}, ${row.lot.estado.replaceAll("_", " ")}`
          : undefined
      }
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
});

/** The spreadsheet owns its navigation. React Aria controls remain inside its cells and headers. */
export const ProductSheetTable = memo(function ProductSheetTable({
  rows,
  columns,
  start,
  end,
  columnStart,
  columnEnd,
  pinnedColumn,
  width,
  renderCell,
  renderHeader,
  editing,
  editor,
  invalid,
  registerCell,
  registerRow,
}: Props) {
  const slots = useMemo(() => {
    const wanted = new Set<number>();
    for (let i = columnStart; i < columnEnd; i++) wanted.add(i);
    for (const key of [pinnedColumn, editing?.column]) {
      const index = columns.findIndex((col) => col.key === key);
      if (index >= 0) wanted.add(index);
    }
    const result: Slot[] = [];
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
  }, [columns, columnStart, columnEnd, pinnedColumn, editing?.column]);
  const indices = useMemo(() => {
    const result = Array.from(
      { length: Math.max(0, end - start) },
      (_, index) => start + index,
    );
    if (editing) {
      const index = rows.findIndex((row) => row.key === editing.rowKey);
      if (index >= 0 && (index < start || index >= end)) result.push(index);
    }
    return result.sort((a, b) => a - b);
  }, [rows, start, end, editing?.rowKey]);
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
      aria-label="Órdenes de productos por lote"
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
});
