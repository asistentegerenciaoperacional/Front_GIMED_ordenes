export type SheetPoint = { row: number; column: number };
/** The anchor is the active cell. The extent moves as the range is extended. */
export type SheetRange = { anchor: SheetPoint; extent: SheetPoint };
export const rangeBounds = (range: SheetRange) => ({
  top: Math.min(range.anchor.row, range.extent.row),
  bottom: Math.max(range.anchor.row, range.extent.row),
  left: Math.min(range.anchor.column, range.extent.column),
  right: Math.max(range.anchor.column, range.extent.column),
});

type Address = { rowKey: string; columnKey: string };
export type SheetSelectionPosition = {
  rows: readonly string[];
  addresses: { anchor: Address; extent: Address } | null;
};
type Scheduler = {
  request: (callback: () => void) => number;
  cancel: (id: number) => void;
};
const samePoint = (a: SheetPoint, b: SheetPoint) =>
  a.row === b.row && a.column === b.column;

/** Logical input is synchronous; only its presentation is scheduled. No draft/data lives here. */
export class SheetSelection {
  private current: SheetRange | null = null;
  private published: SheetRange | null = null;
  private listeners = new Set<() => void>();
  private frame: number | null = null;
  private revision = 0;
  private rowKeys: readonly string[] = [];
  private columnKeys: readonly string[] = [];
  private view: unknown;
  private addresses: SheetSelectionPosition["addresses"] = null;
  constructor(
    private scheduler: Scheduler = {
      request: (callback) => requestAnimationFrame(callback),
      cancel: (id) => cancelAnimationFrame(id),
    },
  ) {}
  read = () => this.current;
  getSnapshot = () => this.published;
  getRowSnapshot = () => {
    const r = this.published;
    return r
      ? `${Math.min(r.anchor.row, r.extent.row)}:${Math.max(r.anchor.row, r.extent.row)}`
      : "";
  };
  getAddress = () => this.addresses;
  capture = (): SheetSelectionPosition => ({
    rows: this.rowKeys,
    addresses: this.addresses,
  });
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  configure(
    rows: readonly string[],
    columns: readonly string[],
    view: unknown,
    position?: SheetSelectionPosition,
  ) {
    if (
      this.rowKeys === rows &&
      this.columnKeys === columns &&
      this.view === view &&
      !position
    )
      return;
    this.rowKeys = rows;
    this.columnKeys = columns;
    this.view = view;
    this.cancelPending();
    this.current = null;
    this.addresses = null;
    const addresses = position?.addresses;
    if (addresses && rows.length) {
      const indexes = new Map(rows.map((key, index) => [key, index]));
      const column = columns.indexOf(addresses.anchor.columnKey);
      if (column >= 0) {
        const anchorRow = indexes.get(addresses.anchor.rowKey);
        const extentRow = indexes.get(addresses.extent.rowKey);
        const extentColumn = columns.indexOf(addresses.extent.columnKey);
        const previous = position.rows.indexOf(addresses.anchor.rowKey);
        let row = anchorRow;
        if (row === undefined) {
          for (
            let index = previous + 1;
            index < position.rows.length && row === undefined;
            index++
          )
            row = indexes.get(position.rows[index]);
          for (
            let index = previous - 1;
            index >= 0 && row === undefined;
            index--
          )
            row = indexes.get(position.rows[index]);
        }
        const anchor = {
          row: row ?? Math.max(0, Math.min(previous, rows.length - 1)),
          column,
        };
        const extent =
          anchorRow !== undefined && extentRow !== undefined && extentColumn >= 0
            ? { row: extentRow, column: extentColumn }
            : anchor;
        this.set({ anchor, extent });
      }
    }
    this.flush();
  }
  set = (range: SheetRange | null) => {
    if (!range) {
      this.reset();
      return;
    }
    if (!this.rowKeys.length || !this.columnKeys.length) return;
    const clamp = (p: SheetPoint): SheetPoint => ({
      row: Math.max(0, Math.min(this.rowKeys.length - 1, p.row)),
      column: Math.max(0, Math.min(this.columnKeys.length - 1, p.column)),
    });
    const next = { anchor: clamp(range.anchor), extent: clamp(range.extent) };
    if (
      this.current &&
      samePoint(this.current.anchor, next.anchor) &&
      samePoint(this.current.extent, next.extent)
    )
      return;
    this.current = next;
    const address = (p: SheetPoint) => ({
      rowKey: this.rowKeys[p.row],
      columnKey: this.columnKeys[p.column],
    });
    this.addresses = {
      anchor: address(next.anchor),
      extent: address(next.extent),
    };
    if (this.frame !== null) return;
    const revision = this.revision;
    this.frame = this.scheduler.request(() => {
      if (this.revision !== revision) return;
      this.frame = null;
      this.publish();
    });
  };
  private publish() {
    if (this.published === this.current) return;
    this.published = this.current;
    this.listeners.forEach((listener) => listener());
  }
  flush = () => {
    this.cancelPending();
    this.publish();
  };
  cancelPending = () => {
    this.revision++;
    if (this.frame !== null) this.scheduler.cancel(this.frame);
    this.frame = null;
  };
  reset = () => {
    this.cancelPending();
    this.current = null;
    this.addresses = null;
    this.publish();
  };
}
