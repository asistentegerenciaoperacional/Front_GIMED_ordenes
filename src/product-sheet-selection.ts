export type SheetPoint = { row: number; column: number };
export type SheetRange = { anchor: SheetPoint; focus: SheetPoint };
export const rangeBounds = (range: SheetRange) => ({
  top: Math.min(range.anchor.row, range.focus.row),
  bottom: Math.max(range.anchor.row, range.focus.row),
  left: Math.min(range.anchor.column, range.focus.column),
  right: Math.max(range.anchor.column, range.focus.column),
});

type Address = { rowKey: string; columnKey: string };
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
  private addresses: { anchor: Address; focus: Address } | null = null;
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
      ? `${Math.min(r.anchor.row, r.focus.row)}:${Math.max(r.anchor.row, r.focus.row)}`
      : "";
  };
  getAddress = () => this.addresses;
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
  ) {
    if (
      this.rowKeys === rows &&
      this.columnKeys === columns &&
      this.view === view
    )
      return;
    this.rowKeys = rows;
    this.columnKeys = columns;
    this.view = view;
    this.reset();
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
    const next = { anchor: clamp(range.anchor), focus: clamp(range.focus) };
    if (
      this.current &&
      samePoint(this.current.anchor, next.anchor) &&
      samePoint(this.current.focus, next.focus)
    )
      return;
    this.current = next;
    const address = (p: SheetPoint) => ({
      rowKey: this.rowKeys[p.row],
      columnKey: this.columnKeys[p.column],
    });
    this.addresses = {
      anchor: address(next.anchor),
      focus: address(next.focus),
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
