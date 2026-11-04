import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { cpus, totalmem } from "node:os";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const root = "tests/evidence/product-sheet-navigation";
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const analysis = {
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  date: new Date().toISOString(),
  host: { cpu: cpus()[0]?.model, ramBytes: totalmem() },
  chosen: "B",
  sourceHashes: {},
  modes: [],
  method:
    "Trusted CDP input at 8/30/60 Hz; 3 repetitions, no CPU profiler for budgets. Separate CPU profiles and 10 memory traversals with forced GC only in tests. No DOM handles retained by waits. Temporary databases only.",
};
for (const file of [
  "src/product-order-sheet.tsx",
  "src/components/product-sheet-grid.tsx",
  "src/components/product-sheet-table.tsx",
  "src/product-sheet-selection.ts",
  "src/components/sheet-selection-view.tsx",
  "src/product-order-sheet.css",
  "src/components/data-table.tsx",
])
  analysis.sourceHashes[file] = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
const originalAnalysis = await json(
  "tests/evidence/product-sheet-keyboard/analysis.json",
);
assert.equal(
  analysis.sourceHashes["src/components/data-table.tsx"],
  originalAnalysis.sourceHashes["src/components/data-table.tsx"],
  "The shared DataTable remains unchanged",
);
for (const mode of ["production", "development"]) {
  const baseline = await json(
    `tests/evidence/product-sheet-keyboard/${mode}-summary.json`,
  );
  const control = await json(
    `tests/evidence/aria/chromium-${mode === "development" ? "development-" : ""}product-sheet-keyboard-control.browser.json`,
  );
  const acceptance = await json(`${root}/${mode}-acceptance.json`);
  const memory = await json(`${root}/${mode}-memory.json`);
  const profile = await json(`${root}/profile/${mode}-summary.json`);
  assert(acceptance.passed);
  assert.equal(acceptance.results.length, 18);
  assert.equal(memory.snapshots.length, 10);
  assert.equal(memory.errors.length, 0);
  const last = memory.snapshots.slice(-3);
  assert(
    Math.max(...last.map((s) => s.heapMiB)) -
      Math.min(...last.map((s) => s.heapMiB)) <=
      10,
  );
  const phases = acceptance.summaries
    .filter((s) => ["horizontal", "vertical"].includes(s.name))
    .map((s) => {
      const before = control.results.find(
        (r) => r.name === `full-window-${s.name}`,
      );
      return {
        name: s.name,
        beforeKeys: before.keysSent,
        afterKeys: acceptance.results.find((r) => r.name === s.name).keys,
        beforeInputP95Ms: before.inputDelayP95Ms,
        beforeDrainMs: before.drainMs,
        ...s,
      };
    });
  analysis.modes.push({
    mode,
    browser: profile.environment.browser,
    budgets: acceptance.budgets,
    phases,
    memoryTail: last,
    memoryPeakMiB: memory.peakMiB,
    profile: {
      beforePeakHeapMiB:
        Math.max(...baseline.scenarios.map((s) => s.heap.peak)) / 1048576,
      afterPeakHeapMiB:
        Math.max(...profile.scenarios.map((s) => s.heap.peak)) / 1048576,
      beforeVertical: baseline.scenarios.find((s) => s.name === "fast-vertical")
        .work,
      afterVertical: profile.scenarios.find((s) => s.name === "fast-vertical")
        .work,
      cpu: profile.scenarios.find((s) => s.name === "fast-vertical").cpu,
    },
    summaries: acceptance.summaries,
  });
}
await writeFile(
  `${root}/analysis.json`,
  JSON.stringify(analysis, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    analysis.modes.map(
      ({ mode, phases, memoryTail, memoryPeakMiB, profile }) => ({
        mode,
        phases,
        memoryTail,
        memoryPeakMiB,
        profile: {
          beforePeakHeapMiB: profile.beforePeakHeapMiB,
          afterPeakHeapMiB: profile.afterPeakHeapMiB,
          beforeVertical: profile.beforeVertical,
          afterVertical: profile.afterVertical,
        },
      }),
    ),
    null,
    2,
  ),
);
