import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const root = (process.env.ARIA_EVIDENCE ?? "tests/evidence/aria").replaceAll("\\", "/").replace(/\/$/, "") + "/";
const baseline = JSON.parse(
  await readFile(root + "baseline-performance.json", "utf8"),
);
const after = JSON.parse(
  await readFile(root + "after-performance.json", "utf8"),
);
assert.equal(after.dataHash, baseline.dataHash);
assert.equal(after.browser, baseline.browser);
assert.equal(after.baselineCommit, baseline.baselineCommit);
assert.equal(baseline.cases.length, 3);
assert.equal(after.cases.length, 3);
const measurements = [];
const add = (scenario, metric, before, value, allowance) => {
  const limit = before + Math.max(before * 0.15, allowance);
  measurements.push({
    scenario,
    metric,
    before,
    after: value,
    limit,
    passed: value <= limit,
  });
};
for (let i = 0; i < 3; i++) {
  const b = baseline.cases[i],
    a = after.cases[i];
  assert.deepEqual(
    [a.lots, a.width, a.throttle],
    [b.lots, b.width, b.throttle],
  );
  if (a.fixtureHash || b.fixtureHash) assert.equal(a.fixtureHash, b.fixtureHash, "Misma colección determinista en ambas compilaciones");
  const scenario = `${a.lots} lotes / ${a.width}px / CPU ${a.throttle}x`;
  assert.equal(a.load.samples.length, 20);
  add(scenario, "load P95 ms", b.load.p95, a.load.p95, 100);
  for (const [name, value] of Object.entries(b.interactions)) {
    assert.equal(a.interactions[name].samples.length, value.samples.length);
    add(scenario, name + " P95 ms", value.p95, a.interactions[name].p95, 20);
  }
  add(
    scenario,
    "stable heap bytes",
    b.memoryAfter.usedSize,
    a.memoryAfter.usedSize,
    5_000_000,
  );
}
const report = {
  acceptance:
    "Equipo actual sin limitación de CPU; ensayo CPU 4x separado por confirmación del usuario",
  stressReport: "after-stress-performance.json",
  browser: after.browser,
  date: new Date().toISOString(),
  baselineCommit: baseline.baselineCommit,
  dataHash: after.dataHash,
  memoryAllowanceBytes: 5_000_000,
  passed: measurements.every((m) => m.passed),
  measurements,
  downloads: after.cases.map((a, i) => ({
    lots: a.lots,
    width: a.width,
    beforeBytes: baseline.cases[i].initialResources.reduce(
      (n, r) => n + r.bytes,
      0,
    ),
    afterBytes: a.initialResources.reduce((n, r) => n + r.bytes, 0),
  })),
  cycles: after.cases.map((a, i) => ({
    lots: a.lots,
    width: a.width,
    beforeGrowth:
      baseline.cases[i].memoryAfter.usedSize -
      baseline.cases[i].memoryBefore.usedSize,
    afterGrowth: a.memoryAfter.usedSize - a.memoryBefore.usedSize,
    samples: a.memoryCycleSamples,
  })),
  longTasks: after.cases.map((a, i) => ({
    lots: a.lots,
    width: a.width,
    before: baseline.cases[i].longTasks,
    after: a.longTasks,
  })),
};
await writeFile(
  root + "comparison.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.table(
  measurements.map((m) => ({
    ...m,
    before: +m.before.toFixed(2),
    after: +m.after.toFixed(2),
    limit: +m.limit.toFixed(2),
  })),
);
assert.ok(
  report.passed,
  "React Aria excede presupuestos: " +
    measurements
      .filter((m) => !m.passed)
      .map((m) => m.scenario + " " + m.metric)
      .join(", "),
);
