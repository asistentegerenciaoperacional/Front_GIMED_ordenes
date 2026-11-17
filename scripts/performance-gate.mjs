import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const destination = resolve("tests/.tmp/order-filter-benchmark-ci.json");
const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/benchmark-order-filters.ts"], {
  stdio: "inherit",
  env: { ...process.env, GIMED_BENCHMARK_PATH: destination },
});
if (run.status !== 0) process.exit(run.status ?? 1);
const report = JSON.parse(await readFile(destination, "utf8"));
const budgets = new Map([[6000, 200], [60000, 1250]]);
if (report.scenarios?.length !== budgets.size) throw new Error("Faltan escenarios del benchmark.");
for (const scenario of report.scenarios) {
  const limit = budgets.get(scenario.lotCount);
  if (!limit || scenario.readModel.p95Ms > limit ||
      scenario.variants.length !== 16 ||
      scenario.variants.some((check) => !check.equivalent || check.selection.p95Ms > 15)) {
    throw new Error("Regresión en la referencia de filtros para " + scenario.lotCount + " lotes.");
  }
}
console.log("Comparación de variantes y mediciones en " + destination);
