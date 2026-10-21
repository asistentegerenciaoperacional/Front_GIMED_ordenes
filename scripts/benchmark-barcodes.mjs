import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { access } from "node:fs/promises";

const root = "tests/.tmp/barcodes-baseline";
const env = {
  ...process.env,
  ARIA_BASELINE_COMMIT: "068cae7a43f13fd2e3aa0323998eb2faba259087",
  ARIA_BASELINE_ROOT: root,
  ARIA_EVIDENCE: "tests/evidence/barcodes",
  ARIA_GUARD_FILE: "data/database-before-barcodes-20261020.bak",
};
async function run(args, extra = {}) {
  const child = spawn(process.execPath, args, {
    env: { ...env, ...extra },
    stdio: "inherit",
    windowsHide: true,
  });
  await new Promise((ok, fail) => {
    child.once("error", fail);
    child.once("exit", (code) =>
      code === 0
        ? ok()
        : fail(new Error(`Medición falló (${code}): ${args.join(" ")}`)),
    );
  });
}
try {
  await access(resolve(root, "dist/index.html"));
} catch {
  await run(["scripts/prepare-aria-baseline.mjs"]);
}
await run(
  ["node_modules/tsx/dist/cli.mjs", "scripts/measure-aria.ts", "baseline"],
  { ARIA_DIST: resolve(root, "dist") },
);
await run(
  ["node_modules/tsx/dist/cli.mjs", "scripts/measure-aria.ts", "after"],
  { ARIA_DIST: resolve("dist") },
);
await run(["scripts/compare-aria.mjs"]);
