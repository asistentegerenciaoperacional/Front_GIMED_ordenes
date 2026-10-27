import { spawn } from "node:child_process";
import { resolve } from "node:path";

const env = {
  ...process.env,
  ARIA_BASELINE_COMMIT: "d905af2b2e6a8afb5dc0b18de53cde46bd3ee067",
  ARIA_BASELINE_ROOT: resolve("tests/.tmp/manual-supply-baseline"),
  ARIA_EVIDENCE: "tests/evidence/manual-supply",
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
await run(["node_modules/typescript/bin/tsc", "--noEmit"]);
await run(["node_modules/vite/bin/vite.js", "build"]);
for (const phase of ["baseline", "after"])
  await run(
    ["node_modules/tsx/dist/cli.mjs", "scripts/measure-aria.ts", phase],
    {
      ARIA_DIST: resolve(
        phase === "baseline"
          ? "tests/.tmp/manual-supply-baseline/dist"
          : "dist",
      ),
    },
  );
await run(["scripts/compare-aria.mjs"]);
await run(["node_modules/tsx/dist/cli.mjs", "scripts/measure-manual-supply.ts"]);
