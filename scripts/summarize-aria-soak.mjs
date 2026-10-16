import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const root = "tests/evidence/aria/";
const baseline = JSON.parse(
  await readFile(root + "baseline-quick-soak-performance.json", "utf8"),
);
const after = JSON.parse(
  await readFile(root + "after-quick-soak-performance.json", "utf8"),
);
const b = baseline.cases[0],
  a = after.cases[0];
assert.equal(baseline.browser, after.browser);
assert.equal(baseline.dataHash, after.dataHash);
assert.deepEqual([b.lots, b.width, b.throttle], [a.lots, a.width, a.throttle]);
const end = a.memoryCycleSamples.at(-1);
assert.equal(end.cycles, 600);
assert.equal(b.memoryCycleSamples.at(-1).cycles, 600);
const start = a.memoryCycleSamples.find((sample) => sample.cycles === 510);
const growth = end.usedSize - start.usedSize;
assert.ok(
  growth <= start.usedSize * 0.01,
  "La ventana final debe estabilizarse dentro del 1 %",
);
assert.ok(
  a.memoryAfter.usedSize <=
    b.memoryAfter.usedSize + Math.max(5_000_000, b.memoryAfter.usedSize * 0.15),
);
// The optional raw heap is deliberately ignored by Git; retain only this summary.
const heap = JSON.parse(
  await readFile("tests/.tmp/aria-heap.heapsnapshot", "utf8"),
);
const fields = heap.snapshot.meta.node_fields;
const width = fields.length;
const detached = fields.indexOf("detachedness"),
  name = fields.indexOf("name");
let detachedContainers = 0;
for (let i = 0; i < heap.nodes.length; i += width) {
  if (
    heap.nodes[i + detached] === 2 &&
    /^<(div|section|form|dialog)\b/.test(heap.strings[heap.nodes[i + name]])
  )
    detachedContainers++;
}
assert.equal(
  detachedContainers,
  0,
  "No conservar contenedores de formularios desmontados",
);
const report = {
  date: new Date().toISOString(),
  passed: true,
  browser: after.browser,
  cycles: end.cycles,
  baselineHeapBytes: b.memoryAfter.usedSize,
  afterHeapBytes: a.memoryAfter.usedSize,
  finalWindow: {
    from: 510,
    to: 600,
    growthBytes: growth,
    growthPercent: (growth / start.usedSize) * 100,
  },
  detachedContainers,
};
await writeFile(
  root + "soak-summary.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
