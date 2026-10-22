import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const directory = "tests/evidence/costs";
const json = async (file) =>
  JSON.parse(await readFile(`${directory}/${file}.json`, "utf8"));
const report = await json("comparison"),
  before = await json("baseline-cost-components"),
  after = await json("after-cost-components");
assert.equal(before.browser, after.browser);
assert.equal(before.cases.length, 3);
assert.equal(after.cases.length, 3);
const measurements = [...report.measurements];
const add = (scenario, metric, oldValue, value, allowance) => {
  const limit = oldValue + Math.max(oldValue * 0.15, allowance);
  measurements.push({
    scenario,
    metric,
    before: oldValue,
    after: value,
    limit,
    passed: value <= limit,
  });
};
for (let index = 0; index < 3; index++) {
  const b = before.cases[index],
    a = after.cases[index];
  assert.equal(b.fixtureHash, a.fixtureHash);
  assert.deepEqual([b.lots, b.width], [a.lots, a.width]);
  const scenario = `Costos: ${a.lots} lotes / ${a.width}px / CPU 1x`;
  add(scenario, "load P95 ms", b.load.p95, a.load.p95, 100);
  for (const [name, measurement] of Object.entries(b.interactions)) {
    assert.equal(measurement.samples.length, 30);
    assert.equal(a.interactions[name].samples.length, 30);
    add(
      scenario,
      `${name} P95 ms`,
      measurement.p95,
      a.interactions[name].p95,
      20,
    );
  }
  add(
    scenario,
    "stable heap bytes",
    b.memoryAfter.usedSize,
    a.memoryAfter.usedSize,
    5_000_000,
  );
  add(
    scenario,
    "heap after 30 editor/search/disclosure cycles",
    a.memoryBefore.usedSize,
    a.memoryAfter.usedSize,
    5_000_000,
  );
}
report.measurements = measurements;
report.passed = measurements.every((item) => item.passed);
report.costComponents = {
  before: "baseline-cost-components.json",
  after: "after-cost-components.json",
};
report.stressReport = null;
report.stressNote =
  "CPU 4× es un ensayo separado; no se ejecutó para este cambio.";
await writeFile(
  `${directory}/comparison.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    passed: report.passed,
    checks: measurements.length,
    failures: measurements.filter((item) => !item.passed),
  }),
);
assert.ok(
  report.passed,
  "Los límites acordados deben cumplirse sin ampliarlos.",
);
