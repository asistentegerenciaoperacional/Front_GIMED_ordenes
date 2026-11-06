import { test } from "node:test";
import assert from "node:assert/strict";
import { SheetSelection } from "../src/product-sheet-selection";

function fixture() {
  let id = 0;
  const frames = new Map<number, () => void>();
  const selection = new SheetSelection({
    request: (fn) => {
      frames.set(++id, fn);
      return id;
    },
    cancel: (key) => {
      frames.delete(key);
    },
  });
  const rows = ["lot-a", "lot-b", "lot-c"],
    columns = ["price", "location"];
  selection.configure(rows, columns, "follow-up");
  const tick = () => {
    const queue = [...frames.values()];
    frames.clear();
    queue.forEach((fn) => fn());
  };
  return { selection, rows, columns, frames, tick };
}
test("all input is immediately available before a single presentation frame", () => {
  const { selection, frames, tick } = fixture();
  let publications = 0;
  selection.subscribe(() => publications++);
  for (let row = 0; row < 3; row++)
    selection.set({ anchor: { row, column: 0 }, focus: { row, column: 0 } });
  assert.equal(selection.read()?.focus.row, 2);
  assert.equal(selection.getSnapshot(), null);
  assert.deepEqual(selection.getAddress()?.focus, {
    rowKey: "lot-c",
    columnKey: "price",
  });
  assert.equal(frames.size, 1);
  tick();
  assert.equal(publications, 1);
  assert.equal(selection.getSnapshot()?.focus.row, 2);
});
test("unchanged clamped positions and identical ranges publish nothing", () => {
  const { selection, tick, frames } = fixture();
  selection.set({
    anchor: { row: 0, column: 0 },
    focus: { row: 0, column: 0 },
  });
  tick();
  const original = selection.read();
  for (let i = 0; i < 120; i++)
    selection.set({
      anchor: { row: -1, column: -1 },
      focus: { row: -1, column: -1 },
    });
  assert.equal(selection.read(), original);
  assert.equal(frames.size, 0);
});
test("row subscribers stay stable for horizontal motion while full snapshots change", () => {
  const { selection, tick } = fixture();
  selection.set({
    anchor: { row: 1, column: 0 },
    focus: { row: 1, column: 0 },
  });
  tick();
  const rowSummary = selection.getRowSnapshot(),
    first = selection.getSnapshot();
  selection.set({
    anchor: { row: 1, column: 1 },
    focus: { row: 1, column: 1 },
  });
  tick();
  assert.equal(selection.getRowSnapshot(), rowSummary);
  assert.notEqual(selection.getSnapshot(), first);
});
test("view replacement cancels old frames and invalidates stable addresses", () => {
  const { selection, frames, tick } = fixture();
  selection.set({
    anchor: { row: 1, column: 1 },
    focus: { row: 2, column: 1 },
  });
  const stale = [...frames.values()][0];
  selection.configure(["other"], ["quantity"], "annulled");
  stale();
  tick();
  assert.equal(selection.read(), null);
  assert.equal(selection.getSnapshot(), null);
  assert.equal(selection.getAddress(), null);
});

test("lot updates preserve both range endpoints by key after insertion and reordering", () => {
  const { selection, columns, frames } = fixture();
  selection.set({
    anchor: { row: 0, column: 0 },
    focus: { row: 1, column: 1 },
  });
  selection.configure(
    ["new", "lot-b", "lot-c", "lot-a"],
    columns,
    "follow-up",
    selection.capture(),
  );
  assert.deepEqual(selection.read(), {
    anchor: { row: 3, column: 0 },
    focus: { row: 1, column: 1 },
  });
  assert.equal(selection.getSnapshot(), selection.read());
  assert.equal(frames.size, 0);
});

test("removed active lots use the next surviving lot, then the previous lot", () => {
  const { selection, columns } = fixture();
  selection.set({
    anchor: { row: 0, column: 0 },
    focus: { row: 1, column: 1 },
  });
  selection.configure(
    ["lot-a", "new", "lot-c"],
    columns,
    "follow-up",
    selection.capture(),
  );
  assert.deepEqual(selection.getAddress(), {
    anchor: { rowKey: "lot-c", columnKey: "location" },
    focus: { rowKey: "lot-c", columnKey: "location" },
  });
  selection.configure(
    ["lot-a", "new"],
    columns,
    "follow-up",
    selection.capture(),
  );
  assert.equal(selection.getAddress()?.focus.rowKey, "new");
  selection.configure(
    ["replacement"],
    columns,
    "follow-up",
    selection.capture(),
  );
  assert.equal(selection.getAddress()?.focus.rowKey, "replacement");
  selection.configure([], columns, "follow-up", selection.capture());
  assert.equal(selection.read(), null);
});
test("flush, reset and disposal leave no delayed resurrection of selection", () => {
  const { selection, frames, tick } = fixture();
  let publications = 0;
  const unsubscribe = selection.subscribe(() => publications++);
  selection.set({
    anchor: { row: 0, column: 0 },
    focus: { row: 1, column: 1 },
  });
  selection.flush();
  assert.equal(frames.size, 0);
  assert.equal(publications, 1);
  selection.reset();
  tick();
  assert.equal(publications, 2);
  assert.equal(selection.read(), null);
  unsubscribe();
  selection.set({
    anchor: { row: 2, column: 1 },
    focus: { row: 2, column: 1 },
  });
  selection.cancelPending();
  tick();
  assert.equal(publications, 2);
  assert.equal(frames.size, 0);
});
