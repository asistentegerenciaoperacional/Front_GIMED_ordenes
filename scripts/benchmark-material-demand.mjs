import { spawn } from "node:child_process";
import { copyFile, access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const evidence = "tests/evidence/ocm";
await mkdir(evidence, { recursive: true });
const env = {
  ...process.env,
  ARIA_BASELINE_COMMIT: "2011bb9038d572f0382ee6deddf15f4680c1cc62",
  ARIA_BASELINE_ROOT: resolve("tests/.tmp/ocm-baseline"),
  ARIA_EVIDENCE: evidence,
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
// Preserve the planning measurement; compare both frozen builds consecutively on this run.
try {
  await access(`${evidence}/planning-baseline-performance.json`);
} catch {
  try {
    await copyFile(
      `${evidence}/baseline-performance.json`,
      `${evidence}/planning-baseline-performance.json`,
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
await run(["scripts/prepare-aria-baseline.mjs"]);
for (const phase of ["baseline", "after"])
  await run(
    ["node_modules/tsx/dist/cli.mjs", "scripts/measure-aria.ts", phase],
    {
      ARIA_DIST:
        phase === "baseline"
          ? resolve(env.ARIA_BASELINE_ROOT, "dist")
          : resolve("dist"),
    },
  );
await run(["scripts/compare-aria.mjs"]);
await run([
  "node_modules/tsx/dist/cli.mjs",
  "scripts/measure-material-demand.ts",
]);
