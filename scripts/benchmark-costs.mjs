import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
const commit = "62410899848934140d0c2543962afe6c84169b7a";
const baseline = resolve("tests/.tmp/costs-baseline");
let guard = resolve("data/database.json");
try {
  const recovery = JSON.parse(
    (await readFile("tests/evidence/costs/recovery.json", "utf8")).replace(
      /^\uFEFF/,
      "",
    ),
  );
  await access(recovery.backups[0].path);
  guard = recovery.backups[0].path;
} catch {}
const env = {
  ...process.env,
  ARIA_BASELINE_COMMIT: commit,
  ARIA_BASELINE_ROOT: baseline,
  ARIA_EVIDENCE: "tests/evidence/costs",
  ARIA_GUARD_FILE: guard,
};
async function run(args, extra = {}) {
  const child = spawn(process.execPath, args, {
    windowsHide: true,
    stdio: "inherit",
    env: { ...env, ...extra },
  });
  await new Promise((ok, fail) => {
    child.once("error", fail);
    child.once("exit", (code) =>
      code === 0 ? ok() : fail(new Error(`${args.join(" ")}: ${code}`)),
    );
  });
}
await run(["scripts/prepare-aria-baseline.mjs"]);
for (const phase of ["baseline", "after"]) {
  const extra = {
    ARIA_DIST:
      phase === "baseline" ? resolve(baseline, "dist") : resolve("dist"),
  };
  await run(
    ["node_modules/tsx/dist/cli.mjs", "scripts/measure-aria.ts", phase],
    extra,
  );
  await run(
    ["node_modules/tsx/dist/cli.mjs", "scripts/measure-costs.ts", phase],
    extra,
  );
}
await run(["scripts/compare-aria.mjs"]);
await run(["scripts/compare-costs.mjs"]);
