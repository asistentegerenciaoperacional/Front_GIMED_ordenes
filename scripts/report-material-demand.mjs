import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

const root = resolve("tests/evidence/ocm");
const json = async (name) =>
  JSON.parse(
    (await readFile(resolve(root, name), "utf8")).replace(/^\uFEFF/, ""),
  );
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const comparison = await json("comparison.json");
const before = await json("baseline-performance.json");
const after = await json("after-performance.json");
const feature = await json("material-demand-performance.json");
assert.ok(comparison.passed);
assert.equal(comparison.measurements.length, 39);
assert.equal(feature.cases.length, 3);
assert.ok(
  feature.cases.every(
    (item) =>
      item.interactionPass && item.memoryPass && item.errors.length === 0,
  ),
);
assert.equal(after.browser, before.browser);
assert.equal(feature.browser, after.browser);
const userHash = hash(await readFile("data/database.json"));
assert.equal(userHash, before.dataHash);
assert.equal(userHash, after.dataHash);
assert.equal(userHash, feature.dataHash);
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  windowsHide: true,
  encoding: "utf8",
}).trim();
assert.equal(head, "2011bb9038d572f0382ee6deddf15f4680c1cc62");
const unitLog = await readFile(resolve(root, "unit-tests.txt"), "utf8");
const passed = Number(/\bpass\s+(\d+)/.exec(unitLog)?.[1]);
assert.equal(Number(/\bfail\s+(\d+)/.exec(unitLog)?.[1]), 0);
assert.ok(passed >= 213);
const browserChecks = {};
const screenshots = [];
for (const engine of ["chromium", "firefox", "webkit"]) {
  const report = await json(engine + "-material-demand.browser.json");
  assert.ok(report.isolatedData && report.checks.length >= 69);
  assert.equal(report.consoleMessages.length, 0);
  assert.ok(
    resolve(report.dataFile)
      .toLowerCase()
      .startsWith((resolve("tests/.tmp") + sep).toLowerCase()),
  );
  browserChecks[engine] = report.checks.length;
  for (const file of report.screenshots) {
    await access(file);
    screenshots.push(file);
  }
}
const documentation = [
  "../CONTEXT.md",
  "../Planeacion/requisitos.md",
  "../Planeacion/restricciones-fuera-dbml.md",
  "README.md",
  "COBERTURA.md",
  "ABASTECIMIENTO-OCM.md",
  "design-system/MASTER.md",
  "VERIFICACION.md",
  "RENDIMIENTO.md",
];
for (const file of documentation) await access(file);
const spec = await readFile("ABASTECIMIENTO-OCM.md", "utf8");
const specTargets = [];
for (const match of spec.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
  const target = decodeURIComponent(match[1].split("#")[0]);
  if (target && !/^[a-z]+:/i.test(target))
    specTargets.push(resolve(dirname(resolve("ABASTECIMIENTO-OCM.md")), target));
}
const sources = [
  "shared/material-demand.ts",
  "src/material-demand-table.ts",
  "src/pending-materials.tsx",
  "src/forms.tsx",
  "src/flows.tsx",
  "src/App.tsx",
  "src/styles.css",
  "server/domain.ts",
  "tests/material-demand.test.ts",
  "tests/material-demand.browser.js",
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sources.map(async (file) => [file, hash(await readFile(file))]),
  ),
);
const report = {
  date: new Date().toISOString(),
  baseCommit: head,
  noBackupCommit: true,
  unitTests: passed,
  browserChecks,
  browserChecksTotal: Object.values(browserChecks).reduce(
    (sum, count) => sum + count,
    0,
  ),
  generalBudgets: {
    passed: comparison.passed,
    count: comparison.measurements.length,
  },
  feature: feature.cases.map((item) => ({
    lots: item.lots,
    width: item.width,
    pendingPairs: item.pendingPairs,
    coldLoadP95: item.load.p95,
    maxInteractionP95: Math.max(
      ...Object.values(item.interactions).map((metric) => metric.p95),
    ),
    memoryGrowthBytes: item.memoryAfter.usedSize - item.memoryBefore.usedSize,
    interactionPassed: item.interactionPass,
    memoryPassed: item.memoryPass,
  })),
  userData: { before: before.dataHash, after: userHash, preserved: true },
  documentation,
  screenshots,
  sourceHashes,
};
await writeFile(
  resolve(root, "delivery-report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
const number = (value) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(value);
const lines = [
  "# Verificación de OCM desde materiales pendientes",
  "",
  `Base: 1.25 estable (${head.slice(0, 7)}). ${passed} pruebas automatizadas; ${report.browserChecksTotal} comprobaciones de navegador; 39/39 presupuestos generales cumplidos.`,
  "",
  "| Lotes / ancho | Parejas pendientes | Carga fría P95 | Mayor interacción P95 | Crecimiento de heap tras 30 ciclos |",
  "| --- | --- | --- | --- | --- |",
  ...report.feature.map(
    (item) =>
      `| ${number(item.lots)} / ${item.width} px | ${number(item.pendingPairs)} | ${number(item.coldLoadP95)} ms | ${number(item.maxInteractionP95)} ms | ${number(item.memoryGrowthBytes / 1e6)} MB |`,
  ),
  "",
  "La carga fría se mide por separado del objetivo de interacción inferior a 200 ms. Los informes incluyen muestras, fixtures, recursos descargados y memoria. Datos sintéticos; base real conservada por SHA-256. Sin commit de respaldo.",
  "",
  "[Informe completo](delivery-report.json) · [Comparación general](comparison.json) · [Medición del módulo](material-demand-performance.json)",
  "",
];
await writeFile(resolve(root, "summary.md"), lines.join("\n"));
for (const target of specTargets) await access(target);
console.log(
  JSON.stringify({
    unitTests: passed,
    browserChecks,
    generalBudgets: report.generalBudgets,
    dataPreserved: true,
    report: "tests/evidence/ocm/delivery-report.json",
  }),
);
