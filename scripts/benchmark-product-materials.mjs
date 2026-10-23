import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const recovery = JSON.parse(
  (
    await readFile("tests/evidence/product-materials/recovery.json", "utf8")
  ).replace(/^\uFEFF/, ""),
);
const baseline = resolve("tests/.tmp/product-materials-baseline");
const env = {
  ...process.env,
  ARIA_BASELINE_COMMIT: recovery.commit,
  ARIA_BASELINE_ROOT: baseline,
  ARIA_EVIDENCE: "tests/evidence/product-materials",
  ARIA_GUARD_FILE: recovery.backups[0].path,
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
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/measure-product-materials.ts",
      phase,
    ],
    extra,
  );
}
await run(["scripts/compare-aria.mjs"]);
await run(["scripts/compare-product-materials.mjs"]);
