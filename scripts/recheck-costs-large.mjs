import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const evidence = "tests/evidence/costs";
const env = {
  ...process.env,
  ARIA_EVIDENCE: evidence,
  ARIA_BASELINE_COMMIT: "62410899848934140d0c2543962afe6c84169b7a",
  ARIA_GUARD_FILE: "data/costs-recovery-20261022T153204555Z/database.json.bak",
};
for (const name of [
  "baseline-performance",
  "after-performance",
  "comparison",
]) {
  const original = `${evidence}/${name}-before-large-recheck.json`;
  try {
    await access(original);
  } catch {
    await copyFile(`${evidence}/${name}.json`, original);
  }
}
async function run(args, extra = {}) {
  const child = spawn(process.execPath, args, {
    env: { ...env, ...extra },
    stdio: "inherit",
    windowsHide: true,
  });
  await new Promise((ok, fail) => {
    child.once("error", fail);
    child.once("exit", (code) =>
      code === 0 ? ok() : fail(new Error(`Medición falló: ${code}`)),
    );
  });
}
// Repeat both builds consecutively, retaining the first result and all thresholds.
for (const phase of ["baseline", "after"]) {
  await run(
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/measure-aria.ts",
      phase,
      "--scenario=large",
    ],
    {
      ARIA_DIST: resolve(
        phase === "baseline" ? "tests/.tmp/costs-baseline/dist" : "dist",
      ),
    },
  );
}
for (const phase of ["baseline", "after"]) {
  const path = `${evidence}/${phase}-performance.json`;
  const report = JSON.parse(await readFile(path, "utf8"));
  const recheck = JSON.parse(
    await readFile(`${evidence}/${phase}-large-performance.json`, "utf8"),
  );
  assert.equal(report.browser, recheck.browser);
  assert.equal(recheck.cases.length, 1);
  const index = report.cases.findIndex(
    (item) => item.lots === 60000 && item.width === 1440 && item.throttle === 1,
  );
  assert.ok(index >= 0);
  assert.equal(report.cases[index].fixtureHash, recheck.cases[0].fixtureHash);
  report.cases[index] = recheck.cases[0];
  report.largeRecheck = {
    date: recheck.date,
    report: `${phase}-large-performance.json`,
  };
  await writeFile(path, JSON.stringify(report, null, 2) + "\n");
}
await run(["scripts/compare-aria.mjs"]);
await run(["scripts/compare-costs.mjs"]);
