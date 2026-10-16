import test from "node:test";
import assert from "node:assert/strict";
import { makeSeed } from "../shared/seed";
import { shareSnapshotStrings } from "../src/snapshot-memory";

test("Compartir cadenas del snapshot conserva íntegramente valores e identidades de los registros", () => {
  const snapshot = JSON.parse(JSON.stringify(makeSeed()));
  const before = JSON.stringify(snapshot);
  const collections = Object.values(snapshot) as object[][];
  const records = collections.map((rows) => [...rows]);
  assert.equal(shareSnapshotStrings(snapshot), snapshot);
  assert.equal(JSON.stringify(snapshot), before);
  collections.forEach((rows, i) =>
    rows.forEach((row, j) => assert.equal(row, records[i][j])),
  );
  assert.equal(JSON.stringify(shareSnapshotStrings(snapshot)), before);
});
