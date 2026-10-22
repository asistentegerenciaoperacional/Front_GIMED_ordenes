import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { removeAuthorizedCost } from "./correct-maquila-cost";
const directory = "tests/evidence/costs";
const json = async (file: string) =>
  JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
const digest = async (file: string) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const recovery = await json(`${directory}/recovery.json`);
const correction = await json(`${directory}/data-correction.json`);
const comparison = await json(`${directory}/comparison.json`);
assert.equal(comparison.passed, true);
assert.equal(comparison.measurements.length, 60);
for (const backup of recovery.backups)
  assert.equal(
    (await digest(backup.path)).toLowerCase(),
    backup.sha256.toLowerCase(),
  );
const original = await json(recovery.backups[0].path);
const expected = removeAuthorizedCost(original);
assert.equal(
  hash(JSON.stringify(expected, null, 2) + "\n"),
  correction.afterSha256,
);
const others = (Object.keys(expected) as (keyof typeof expected)[]).filter(
  (key) => key !== "costos_maquila",
);
for (const key of others) assert.deepEqual(expected[key], original[key]);
assert.deepEqual(
  expected.costos_maquila,
  original.costos_maquila.filter(
    (row: { id: string }) => row.id !== correction.removed.id,
  ),
);
assert.match(
  await readFile(`${directory}/final-tests.txt`, "utf8"),
  /pass\s+180/,
);
const browsers = Object.fromEntries(
  await Promise.all(
    ["chromium", "firefox", "webkit"].map(async (engine) => {
      const report = await json(
        `${directory}/${engine}-maquila-costs.browser.json`,
      );
      assert.equal(report.checks.length, 66);
      assert.deepEqual(report.errors, []);
      assert.deepEqual(report.consoleMessages, []);
      return [
        engine,
        { checks: report.checks.length, errors: 0, consoleMessages: 0 },
      ];
    }),
  ),
);
const currentHash = await digest("data/database.json");
const report = {
  date: new Date().toISOString(),
  recoveryCommit: recovery.commit,
  backups: recovery.backups,
  schemaSha256: await digest("../Planeacion/db.md"),
  dataCorrection: correction,
  preservation: {
    unchangedCollections: others.length,
    otherCostsPreserved: true,
    currentDatabaseSha256: currentHash,
    changedSinceCorrection: currentHash !== correction.afterSha256,
  },
  tests: {
    baseline: { passed: 167, failed: 0 },
    final: { passed: 180, failed: 0 },
    browsers,
    fullJourney: (await json(`${directory}/full-journey.json`)).checks.length,
    formValidation: (await json(`${directory}/form-validation.json`)).checks
      .length,
    favorites: (await json(`${directory}/favorites-regression.json`)).checks
      .length,
    portable: (await json(`${directory}/portable-report.json`)).checks.length,
  },
  performance: {
    passed: comparison.passed,
    budgets: comparison.measurements.length,
    report: "comparison.json",
    cpu: "Equipo actual, CPU 1×; sin ensayo CPU 4×",
  },
  portable: {
    path: "tests/.tmp/costs-portable.zip",
    sha256: await digest("tests/.tmp/costs-portable.zip"),
  },
  screenshots: [375, 768, 1024, 1440].flatMap((width) => [
    `current-groups-${width}.png`,
    `current-add-${width}.png`,
  ]),
};
await writeFile(
  `${directory}/delivery-report.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    tests: report.tests.final,
    browsers,
    performance: report.performance,
    preservation: report.preservation,
  }),
);
