import assert from "node:assert/strict";
import { readFile, writeFile, cp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { migrateBarcodes } from "../server/barcode-migration";
import { migrateFavoriteSuppliers } from "../server/favorite-migration";

const directory = "tests/evidence/barcodes";
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const digest = async (file: string) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
const comparison = await json(`${directory}/comparison.json`);
assert.equal(comparison.passed, true);
// This change uses the agreed hardware budgets; no new CPU 4x claim is made.
comparison.stressReport = null;
comparison.stressNote =
  "CPU 4× es un ensayo adicional; no se repitió para este cambio.";
await writeFile(
  `${directory}/comparison.json`,
  JSON.stringify(comparison, null, 2) + "\n",
);
const browsers = Object.fromEntries(
  await Promise.all(
    ["chromium", "firefox", "webkit"].map(async (engine) => {
      const report = await json(`${directory}/${engine}-barcodes.browser.json`);
      assert.ok(report.checks.length > 0);
      assert.deepEqual(report.consoleMessages, []);
      return [
        engine,
        { checks: report.checks.length, badgeStyles: report.badgeStyles },
      ];
    }),
  ),
);
for (const [source, target] of [
  ["tests/evidence/aria/chromium-browser-journey.json", "full-journey.json"],
  [
    "tests/evidence/aria/chromium-barcode-steps.browser.json",
    "state-filters.json",
  ],
  [
    "tests/evidence/favorites/chromium-favorites.browser.json",
    "favorites-regression.json",
  ],
  ["tests/evidence/portable-report.json", "portable-report.json"],
  ["tests/evidence/restart-report.json", "restart-report.json"],
])
  await cp(source, `${directory}/${target}`);
const reset = await json(`${directory}/demo-reset.json`);
const old = await json("data/database-before-barcodes-20261020.bak");
const migration = migrateBarcodes(migrateFavoriteSuppliers(old).database);
const tests = await readFile(`${directory}/final-tests.txt`, "utf8");
assert.match(tests, /pass\s+167/);
assert.match(tests, /fail\s+0/);
const report = {
  date: new Date().toISOString(),
  recoveryCommit: "068cae7a43f13fd2e3aa0323998eb2faba259087",
  backups: [
    {
      path: "data/database-before-barcodes-20261020.bak",
      sha256: await digest("data/database-before-barcodes-20261020.bak"),
    },
    {
      path: "data/schema-before-barcodes-20261020.md.bak",
      sha256: await digest("data/schema-before-barcodes-20261020.md.bak"),
    },
    { path: reset.backup, sha256: await digest(reset.backup) },
  ],
  schemaSha256: await digest("../Planeacion/db.md"),
  originalDatabaseConversion: {
    codes: old.codigos_barras.length,
    demoted: migration.demoted,
    idempotent: !migrateBarcodes(migration.database).changed,
  },
  demoReset: reset,
  tests: {
    initial: {
      passed: 155,
      failed: 1,
      reason:
        "Descripciones de filtros y su documentación no estaban sincronizadas antes del cambio.",
    },
    final: { passed: 167, failed: 0 },
    browsers,
    fullJourney: (await json(`${directory}/full-journey.json`)).checks.length,
    favoriteRegression: (await json(`${directory}/favorites-regression.json`))
      .checks.length,
    filters: (await json(`${directory}/state-filters.json`)).checks.length,
    portable: (await json(`${directory}/portable-report.json`)).checks.length,
    persistenceCollections: 28,
  },
  performance: {
    historical: true,
    note: "Mediciones previas a la simplificación de la vista de códigos; no repetidas tras su retirada.",
    passed: comparison.passed,
    budgets: comparison.measurements.length,
    initialComparison: "comparison-initial.json",
    finalComparison: "comparison.json",
    pairedLargeCase: "after-large-performance.json",
  },
  portable: {
    file: "tests/.tmp/barcodes-portable.zip",
    sha256: await digest("tests/.tmp/barcodes-portable.zip"),
  },
  screenshots: [375, 768, 1024, 1440].map((width) => `list-${width}.png`),
};
await writeFile(
  `${directory}/delivery-report.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    tests: report.tests.final,
    browsers: Object.keys(browsers),
    budgets: report.performance.budgets,
    migrationDemoted: migration.demoted.length,
    demoStatuses: reset.statuses,
  }),
);
