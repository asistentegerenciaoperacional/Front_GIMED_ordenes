import {
  useContext,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { TableStateContext } from "react-aria-components/Table";
import { Trash2 } from "lucide-react";
import {
  DataTable,
  TableCell,
  TableColumn,
  TableHead,
  TableRow,
  TableRows,
} from "./components/data-table";
import { Button } from "./ui";
import { FormErrorsContext } from "./components/controls";
import "./order-entry-sheet.css";

type SheetRow = {
  key: string;
  cells: [ReactNode, ReactNode, ReactNode, ReactNode, ReactNode];
};
function SheetNavigationMode() {
  const state = useContext(TableStateContext);
  const setDisabled = state?.setKeyboardNavigationDisabled;
  useLayoutEffect(() => {
    setDisabled?.(true);
    return () => setDisabled?.(false);
  }, [setDisabled]);
  return null;
}
export function OrderEntrySheet({
  title,
  number,
  date,
  delivery,
  provider,
  nit,
  rows,
  total,
  activeRow,
  onActiveRow,
  onClear,
  clearDisabled,
  editing = false,
}: {
  title: string;
  number: ReactNode;
  date: ReactNode;
  delivery: ReactNode;
  provider: ReactNode;
  nit: ReactNode;
  rows: SheetRow[];
  total: string;
  activeRow: number;
  onActiveRow: (index: number) => void;
  onClear: () => void;
  clearDisabled: boolean;
  editing?: boolean;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const { fields } = useContext(FormErrorsContext);
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    if (
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(
        event.key,
      )
    )
      return;
    if (!(event.target instanceof HTMLElement)) return;
    const cell = event.target.closest<HTMLElement>("[data-sheet-column]");
    if (!cell || cell.querySelector('[aria-expanded="true"]')) return;
    const row = Number(cell.dataset.sheetRow);
    const column = Number(cell.dataset.sheetColumn);
    const nextRow = Math.max(
      0,
      Math.min(
        6,
        row +
          (event.key === "ArrowUp"
            ? -1
            : ["ArrowDown", "Enter"].includes(event.key)
              ? 1
              : 0),
      ),
    );
    const nextColumn = Math.max(
      0,
      Math.min(
        4,
        column +
          (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0),
      ),
    );
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Enter") event.target.blur();
    requestAnimationFrame(() => {
      const next = grid.current?.querySelector<HTMLElement>(
        `[data-sheet-row="${nextRow}"][data-sheet-column="${nextColumn}"]`,
      );
      if (!next) return;
      const control = next.querySelector<HTMLElement>(
        "input:not(:disabled), textarea:not(:disabled)",
      );
      (control ?? next).focus({ preventScroll: true });
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }
  return (
    <>
      <div className="order-sheet-actions">
        <small>
          Fila activa: {activeRow + 1} de 7 · Flechas para navegar · Enter para
          bajar
        </small>
        <Button icon={Trash2} disabled={clearDisabled} onClick={onClear}>
          Vaciar fila
        </Button>
      </div>
      <div
        className="order-sheet-scroll"
        role="region"
        aria-label={
          editing ? "Hoja de edición de la orden" : "Hoja de creación de la orden"
        }
        tabIndex={0}
      >
        <div className="order-entry-sheet">
          <header className="order-sheet-heading">
            <div className="order-sheet-logo" aria-hidden="true" />
            <h3>
              {title} No. {number}
            </h3>
          </header>
          <div className="order-sheet-meta">
            <div className="order-sheet-dates">
              {date}
              {delivery}
            </div>
            {provider}
            <div className="order-sheet-nit">
              <span>NIT</span>
              <output aria-label="NIT del proveedor">{nit}</output>
            </div>
          </div>
          <div
            ref={grid}
            id="field-lines"
            data-field-path="lines"
            aria-invalid={fields.lines ? true : undefined}
            tabIndex={-1}
            onKeyDownCapture={navigate}
            onFocusCapture={(event) => {
              if (!(event.target instanceof HTMLElement)) return;
              const cell =
                event.target.closest<HTMLElement>("[data-sheet-row]");
              if (cell) onActiveRow(Number(cell.dataset.sheetRow));
            }}
          >
            <DataTable
              className="order-sheet-table"
              aria-label="Renglones de la orden"
            >
              <TableHead>
                <TableRow>
                  {[
                    "CÓDIGO",
                    "PRODUCTO",
                    "CANTIDAD",
                    "PRECIO UNIDAD",
                    "TOTAL",
                  ].map((label) => (
                    <TableColumn key={label}>{label}</TableColumn>
                  ))}
                </TableRow>
              </TableHead>
              <TableRows>
                {rows.map((row, index) => (
                  <TableRow key={row.key}>
                    {row.cells.map((cell, column) => (
                      <TableCell
                        key={column}
                        data-sheet-row={index}
                        data-sheet-column={column}
                      >
                        {index === 0 && column === 0 && <SheetNavigationMode />}
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableRows>
            </DataTable>
          </div>
          <div className="order-sheet-grand-total">
            <span>GRAN TOTAL</span>
            <output aria-label="Gran total de la orden" aria-live="polite">
              {total}
            </output>
          </div>
        </div>
      </div>
    </>
  );
}
