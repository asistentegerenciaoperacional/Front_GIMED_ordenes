import {
  cloneElement,
  useEffect,
  memo,
  useCallback,
  useContext,
  useMemo,
  useLayoutEffect,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Cell,
  Column,
  Row,
  Table,
  TableBody,
  TableHeader,
  TableStateContext,
} from "react-aria-components/Table";
import {
  Rect,
  TableLayout,
  Virtualizer,
} from "react-aria-components/Virtualizer";
import { flatten, nodeText } from "./controls";

type Part = { children?: ReactNode } & React.HTMLAttributes<HTMLElement> & {
    colSpan?: number;
    scope?: string;
  };
function ManualTableNavigation() {
  const setDisabled =
    useContext(TableStateContext)?.setKeyboardNavigationDisabled;
  useLayoutEffect(() => {
    setDisabled?.(true);
    return () => setDisabled?.(false);
  }, [setDisabled]);
  return null;
}
// Declarative table parts are data for the adapter, never standalone DOM controls.
export function TableHead({ children }: Part) {
  return <>{children}</>;
}
export function TableRows({ children }: Part) {
  return <>{children}</>;
}
export function TableRow({ children }: Part) {
  return <>{children}</>;
}
export function TableColumn({ children }: Part) {
  return <>{children}</>;
}
export function TableCell({ children }: Part) {
  return <>{children}</>;
}
// Keep all columns reachable while React Aria windows rows against the page viewport.
class PageTableLayout extends TableLayout<unknown> {
  constructor(private table: { current: HTMLElement | null }) {
    super();
  }
  getVisibleLayoutInfos(rect: Rect) {
    const box = this.table.current?.getBoundingClientRect();
    const y = box && box.height > 0 ? Math.max(0, -box.top - 89) : rect.y;
    const height =
      box && box.height > 0
        ? Math.max(0, Math.min(box.height, innerHeight - box.top + 89) - y)
        : rect.height;
    return super.getVisibleLayoutInfos(
      new Rect(0, y, Math.max(rect.width, this.getContentSize().width), height),
    );
  }
}

type TableProps = React.ComponentPropsWithRef<"table"> & {
  rowVersion?: unknown;
  cacheKey?: unknown;
  onRowClick?: (key: string) => void;
  manualKeyboardNavigation?: boolean;
};
export const DataTable = memo(
  DataTableView,
  (previous, next) =>
    previous.cacheKey != null && previous.cacheKey === next.cacheKey,
);
function DataTableView({
  children,
  "aria-label": label,
  rowVersion,
  cacheKey,
  onRowClick,
  manualKeyboardNavigation = false,
  ...props
}: TableProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const layout = useMemo(() => new PageTableLayout(tableRef), []);
  useEffect(() => {
    const table = tableRef.current;
    if (!table || !onRowClick) return;
    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (
        event.target.closest(
          "a, button, input, select, textarea, [role='checkbox'], .aria-checkbox",
        )
      )
        return;
      const row = event.target.closest<HTMLElement>(
        "[data-selection-key], tr[data-need]",
      );
      const key = row?.dataset.selectionKey ?? row?.dataset.need;
      if (key && table.contains(row)) onRowClick(key);
    };
    table.addEventListener("click", handleClick);
    return () => table.removeEventListener("click", handleClick);
  }, [onRowClick]);
  const sections = flatten(children);
  const head = sections.find((node) => node.type === TableHead);
  const body = sections.find((node) => node.type === TableRows);
  const headerRows = flatten(head?.props.children as ReactNode);
  const columns = headerRows.flatMap((node) =>
    node.type === TableRow ? flatten(node.props.children as ReactNode) : [node],
  );
  const rows = useMemo(
    () =>
      flatten(body?.props.children as ReactNode).map((element, index) => {
        const cells = flatten(element.props.children as ReactNode);
        return { id: "row-" + String(element.key ?? index), element, cells };
      }),
    [rowVersion ?? body?.props.children],
  );
  const firstManualRow = manualKeyboardNavigation ? rows[0] : undefined;
  const renderRow = useCallback(
    (row: (typeof rows)[number]) => (
      <Row
        id={row.id}
        {...(row.element.props as React.ComponentProps<typeof Row>)}
      >
        {row.cells.map((cell, index) => {
          const {
            children: content,
            colSpan,
            scope,
            ...rest
          } = cell?.props ?? {};
          return (
            <Cell
              {...(rest as React.ComponentProps<typeof Cell>)}
              colSpan={colSpan as number | undefined}
              key={index}
              textValue={nodeText(content as ReactNode)}
            >
              {() => (
                <>
                  {manualKeyboardNavigation &&
                    row === firstManualRow &&
                    index === 0 && <ManualTableNavigation />}
                  {content as ReactNode}
                </>
              )}
            </Cell>
          );
        })}
      </Row>
    ),
    [manualKeyboardNavigation, firstManualRow],
  );
  useLayoutEffect(() => {
    if (props["aria-rowcount"] === undefined || !tableRef.current) return;
    // Manual row windows expose their total and stable indices, rather than
    // the size of React Aria's mounted collection.
    tableRef.current.setAttribute(
      "aria-rowcount",
      String(props["aria-rowcount"]),
    );
    for (const row of tableRef.current.querySelectorAll<HTMLElement>(
      "[data-global-row-index]",
    ))
      row.setAttribute("aria-rowindex", row.dataset.globalRowIndex!);
  }, [props["aria-rowcount"], rows]);
  const emptyRow =
    rows.length === 1
      ? rows.find(
          (row) =>
            row.cells.length === 1 && Number(row.cells[0].props.colSpan) > 1,
        )
      : undefined;
  const data = emptyRow ? [] : rows;
  const virtual =
    data.length >= 50 && !!props.className?.includes("orders-table");
  const sortable = columns.find((column) => !!column.props.sort);
  const sort = sortable?.props.sort as
    { column: string; direction: "asc" | "desc" } | undefined;
  const tableLabel =
    label ??
    (columns
      .map((column) => {
        const info = column.props.column as { label?: string } | undefined;
        return info?.label ?? nodeText(column.props.children as ReactNode);
      })
      .filter(Boolean)
      .join(", ") ||
      "Registros");
  const table = (
    <Table
      {...(props as unknown as React.ComponentProps<typeof Table>)}
      ref={tableRef}
      className={(props.className ?? "") + (virtual ? " virtual-table" : "")}
      aria-label={tableLabel}
      selectionMode="none"
      sortDescriptor={
        sort
          ? {
              column: sort.column,
              direction: sort.direction === "asc" ? "ascending" : "descending",
            }
          : undefined
      }
      onSortChange={(descriptor) => {
        const header = columns.find(
          (column) =>
            (column.props.column as { key?: string } | undefined)?.key ===
            descriptor.column,
        );
        (
          header?.props.onSort as
            | ((sort: { column: string; direction: "asc" | "desc" }) => void)
            | undefined
        )?.({
          column: String(descriptor.column),
          direction: descriptor.direction === "ascending" ? "asc" : "desc",
        });
      }}
    >
      <TableHeader>
        {columns.map((column, index) => {
          const info = column.props.column as
            { key?: string; label?: string } | undefined;
          const id = info?.key ?? "column-" + String(index);
          const header = info
            ? cloneElement(column as ReactElement<{ asContent?: boolean }>, {
                asContent: true,
              })
            : (column.props.children as ReactNode);
          return (
            <Column
              id={id}
              key={id}
              textValue={info?.label ?? nodeText(header) ?? "Acciones"}
              {...(virtual
                ? {
                    defaultWidth: (([149, 138, 240, 198, 179, 165, 131, 150][
                      index
                    ] ?? 150) + "fr") as `${number}fr`,
                    minWidth:
                      [127, 116, 190, 171, 154, 141, 110, 160][index] ?? 110,
                  }
                : {})}
              allowsSorting={
                !!info &&
                !(column.props.column as { selectionOnly?: boolean })
                  .selectionOnly
              }
              isRowHeader={index === 0}
              style={column.props.style as React.CSSProperties | undefined}
              className={
                info?.key === "total"
                  ? "right"
                  : (column.props.className as string | undefined)
              }
            >
              {() => header}
            </Column>
          );
        })}
      </TableHeader>
      <TableBody
        items={data}
        renderEmptyState={() => emptyRow?.cells[0].props.children as ReactNode}
      >
        {renderRow}
      </TableBody>
    </Table>
  );
  return virtual ? (
    <Virtualizer
      layout={layout}
      layoutOptions={{ estimatedRowHeight: 89, headingHeight: 47 }}
      shouldObserveItemSize={false}
    >
      {table}
    </Virtualizer>
  ) : (
    table
  );
}
