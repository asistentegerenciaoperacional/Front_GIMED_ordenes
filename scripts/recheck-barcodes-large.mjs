import { spawn } from "node:child_process";
import { access, cp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const evidence = "tests/evidence/barcodes";
const env = {
  ...process.env,
  ARIA_EVIDENCE: evidence,
  ARIA_BASELINE_COMMIT: "068cae7a43f13fd2e3aa0323998eb2faba259087",
  ARIA_GUARD_FILE: "data/database-before-barcodes-20261020.bak",
};
for (const name of [
  "baseline-performance",
  "after-performance",
  "comparison",
]) {
  try {
    await access(`${evidence}/${name}-initial.json`);
  } catch {
    await cp(`${evidence}/${name}.json`, `${evidence}/${name}-initial.json`, {
      force: false,
      errorOnExist: true,
    });
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
      code === 0 ? ok() : fail(new Error("Medición falló: " + code)),
    );
  });
}
await run(
  [
    "node_modules/tsx/dist/cli.mjs",
    "scripts/measure-aria.ts",
    "baseline",
    "--scenario=large",
  ],
  { ARIA_DIST: resolve("tests/.tmp/barcodes-baseline/dist") },
);
await run(
  [
    "node_modules/tsx/dist/cli.mjs",
    "scripts/measure-aria.ts",
    "after",
    "--scenario=large",
  ],
  { ARIA_DIST: resolve("dist") },
);
for (const phase of ["baseline", "after"]) {
  const report = JSON.parse(
    await readFile(`${evidence}/${phase}-performance.json`, "utf8"),
  );
  const recheck = JSON.parse(
    await readFile(`${evidence}/${phase}-large-performance.json`, "utf8"),
  );
  report.cases[2] = recheck.cases[0];
  report.largeRecheck = {
    date: recheck.date,
    report: `${phase}-large-performance.json`,
  };
  await writeFile(
    `${evidence}/${phase}-performance.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
}
await run(["scripts/compare-aria.mjs"]);
