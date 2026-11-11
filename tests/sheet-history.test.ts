import assert from "node:assert/strict";
import { test } from "node:test";
import { createSheetHistory } from "../src/sheet-history";

test("undo and redo replay complete edits in stack order", () => {
  const initial = { first: "", second: "" };
  const history = createSheetHistory(
    initial,
    (a, b) => a.first === b.first && a.second === b.second,
  );
  const single = { ...initial, first: "A" };
  const group = { first: "B", second: "C" };
  history.record(single);
  history.record(group);

  history.move("undo");
  assert.strictEqual(history.getSnapshot().value, single);
  history.move("undo");
  assert.strictEqual(history.getSnapshot().value, initial);
  const emptyPast = history.getSnapshot();
  assert.equal(history.move("undo"), false);
  assert.strictEqual(history.getSnapshot(), emptyPast);

  history.move("redo");
  assert.strictEqual(history.getSnapshot().value, single);
  history.move("redo");
  assert.strictEqual(history.getSnapshot().value, group);
  const emptyFuture = history.getSnapshot();
  assert.equal(history.move("redo"), false);
  assert.strictEqual(history.getSnapshot(), emptyFuture);
});

test("a no-op keeps redo available; a real edit drops only the future", () => {
  const history = createSheetHistory<number>(0, Object.is);
  for (const value of [1, 2, 3]) history.record(value);
  history.move("undo");
  history.move("undo");
  const before = history.getSnapshot();
  assert.equal(history.record(1), false);
  assert.strictEqual(history.getSnapshot(), before);

  history.record(4);
  assert.equal(history.move("redo"), false);
  history.move("undo");
  assert.equal(history.getSnapshot().value, 1);
  history.move("undo");
  assert.equal(history.getSnapshot().value, 0);
  history.move("redo");
  history.move("redo");
  assert.equal(history.getSnapshot().value, 4);
});

test("a rejected replay leaves the draft and its history intact", () => {
  const history = createSheetHistory<number>(0, Object.is);
  history.record(1);
  history.record(2);
  history.move("undo");
  const before = history.getSnapshot();

  for (const direction of ["undo", "redo"] as const) {
    assert.throws(
      () =>
        history.move(direction, () => {
          throw new Error("Conflict");
        }),
      /Conflict/,
    );
    assert.strictEqual(history.getSnapshot(), before);
  }

  history.move("redo");
  assert.equal(history.getSnapshot().value, 2);
  history.move("undo");
  history.move("undo");
  assert.equal(history.getSnapshot().value, 0);
});
