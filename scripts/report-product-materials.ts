import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, access } from "node:fs/promises";
const directory = "tests/evidence/product-materials";
const json = async (path: string) =>
  JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
const hash = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
const recovery = await json(`${directory}/recovery.json`);
for (const backup of recovery.backups)
  assert.equal(await hash(backup.path), backup.sha256.toLowerCase());
const databaseHash = await hash("data/database.json");
assert.equal(
  databaseHash,
  recovery.backups[0].sha256.toLowerCase(),
  "No se ha modificado la base del usuario.",
);
assert.match(
  await readFile(`${directory}/final-tests.txt`, "utf8"),
  /pass\s+199/,
);
const browsers: Record<string, number> = {};
for (const engine of ["chromium", "firefox", "webkit"]) {
  const report = await json(
    `${directory}/${engine}-product-materials.browser.json`,
  );
  assert.equal(report.checks.length, 63);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.consoleMessages, []);
  browsers[engine] = report.checks.length;
}
const regressions: Record<string, number> = {};
for (const name of [
  "favorites-regression",
  "favorites-disclosure-regression",
  "costs-regression",
  "costs-layout-regression",
  "form-validation-regression",
  "full-journey",
  "portable-report",
]) {
  const report = await json(`${directory}/${name}.json`);
  assert.deepEqual(report.errors ?? [], []);
  assert.deepEqual(report.consoleMessages ?? [], []);
  if ("passed" in report) assert.equal(report.passed, true);
  regressions[name] = report.checks.length;
}
const comparison = await json(`${directory}/comparison.json`);
assert.equal(comparison.passed, true);
assert.equal(comparison.measurements.length, 60);
const screenshots = [375, 768, 1024, 1440]
  .flatMap((width) => [
    `current-groups-${width}.png`,
    `current-editor-${width}.png`,
  ])
  .concat("current-selection-375.png");
for (const file of screenshots) await access(`${directory}/${file}`);
const report = {
  date: new Date().toISOString(),
  recoveryCommit: recovery.commit,
  backups: recovery.backups,
  schemaSha256: await hash("../Planeacion/db.md"),
  database: {
    sha256: databaseHash,
    unchangedSinceRecovery: true,
    automaticMigrations: 0,
  },
  tests: { baseline: 180, final: 199, browsers, regressions },
  performance: {
    passed: true,
    budgets: 60,
    comparison: "comparison.json",
    cpu: "Equipo actual, CPU 1×; estrés CPU 4× separado y no ejecutado",
  },
  portable: {
    path: "tests/.tmp/product-materials-portable.zip",
    sha256: await hash("tests/.tmp/product-materials-portable.zip"),
  },
  screenshots,
};
await writeFile(
  `${directory}/delivery-report.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report.tests));
