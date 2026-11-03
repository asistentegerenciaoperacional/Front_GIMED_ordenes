import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpus, totalmem } from "node:os";
import assert from "node:assert/strict";
import { summarizeKeyboardCpuProfile } from "./keyboard-cpu-profile.mjs";

const frame = {
  functionName: "recursive",
  url: "probe.js",
  lineNumber: 0,
  columnNumber: 0,
};
const probe = summarizeKeyboardCpuProfile({
  nodes: [
    { id: 1, callFrame: { ...frame, functionName: "(root)" }, children: [2] },
    { id: 2, callFrame: frame, children: [3] },
    { id: 3, callFrame: frame },
  ],
  samples: [3],
  timeDeltas: [1000],
});
assert.equal(
  probe.topInclusive[0].inclusiveMs,
  1,
  "Recursion must not double-count a sampled function",
);
const root = "tests/evidence/product-sheet-keyboard";
const sources = [
  "src/components/product-sheet-grid.tsx",
  "src/product-order-sheet.tsx",
  "src/components/data-table.tsx",
  "src/product-order-sheet.css",
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sources.map(async (file) => [
      file,
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
    ]),
  ),
);
const analysis = {
  head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sourceHashes,
  host: {
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    ramBytes: totalmem(),
  },
  modes: [],
  controls: [],
};
for (const mode of ["production", "development"]) {
  let summary;
  try {
    summary = JSON.parse(
      await readFile(`${root}/${mode}-summary.json`, "utf8"),
    );
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }
  for (const scenario of summary.scenarios)
    if (scenario.cpu) {
      scenario.cpu = summarizeKeyboardCpuProfile(
        JSON.parse(
          await readFile(`${root}/${mode}-${scenario.name}.cpuprofile`, "utf8"),
        ),
      );
      assert(
        scenario.cpu.topInclusive.every(
          (row) => row.inclusiveMs <= scenario.cpu.sampleTimeMs + 0.01,
        ),
      );
    }
  await writeFile(
    `${root}/${mode}-summary.json`,
    JSON.stringify(summary, null, 2) + "\n",
  );
  analysis.modes.push({
    mode,
    browser: summary.environment.browser,
    initialHeapMiB: summary.initial.heap.usedSize / 1048576,
    finalHeapMiB: summary.final.heap.usedSize / 1048576,
    allPositionsCorrect: summary.scenarios.every(
      (s) => JSON.stringify(s.expected) === JSON.stringify(s.actual),
    ),
    scenarios: summary.scenarios.map((s) => ({
      name: s.name,
      rate: s.hz,
      keys: s.keysSent,
      inputDelayP95Ms: s.inputDelayMs.p95,
      drainMs: s.drainMs,
      processedKeysPerSecond: s.keysSent / ((s.enqueueMs + s.drainMs) / 1000),
      commits: s.commits,
      commitsPerKey: s.commitsPerKey,
      peakHeapMiB: s.heap.peak / 1048576,
      afterGcHeapMiB: s.heap.afterGc / 1048576,
      mountedRows: s.dom.mounted.rows,
      mountedCells: s.dom.mounted.cells,
      afterGcNodes: s.dom.afterGc.nodes,
      afterGcListeners: s.dom.afterGc.jsEventListeners,
      scriptMs: s.work.scriptMs,
      layoutMs: s.work.layoutMs,
      styleMs: s.work.styleMs,
      cpu: s.cpu,
    })),
  });
}
for (const mode of ["production", "development"]) {
  const file = `tests/evidence/aria/chromium-${mode === "development" ? "development-" : ""}product-sheet-keyboard-control.browser.json`;
  try {
    const report = JSON.parse(await readFile(file, "utf8"));
    analysis.controls.push({
      mode,
      results: report.results,
      hookInfo: report.hookInfo,
      instrumentation: report.instrumentation,
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
await writeFile(
  `${root}/analysis.json`,
  JSON.stringify(analysis, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    analysis.modes.map(
      ({
        mode,
        initialHeapMiB,
        finalHeapMiB,
        allPositionsCorrect,
        scenarios,
      }) => ({
        mode,
        initialHeapMiB,
        finalHeapMiB,
        allPositionsCorrect,
        scenarios: scenarios.map(({ cpu, ...scenario }) => scenario),
      }),
    ),
  ),
);
