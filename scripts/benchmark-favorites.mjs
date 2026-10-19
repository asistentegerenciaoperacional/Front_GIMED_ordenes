import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { cp, mkdir, mkdtemp } from "node:fs/promises";

const env = {
  ...process.env,
  ARIA_EVIDENCE: "tests/evidence/favorites",
  ARIA_BASELINE_COMMIT: "ad313845dcb9f8aec535842d93415bfb0c751919",
  ARIA_BASELINE_ROOT: "tests/.tmp/favorites-baseline",
};
await mkdir("tests/.tmp", { recursive: true });
const guardDirectory = await mkdtemp(
  resolve("tests/.tmp/favorites-performance-"),
);
env.ARIA_GUARD_FILE = resolve(guardDirectory, "database.json");
await cp("data/database.json", env.ARIA_GUARD_FILE);
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
await run(["scripts/prepare-aria-baseline.mjs"]);
await run(
  ["node_modules/tsx/dist/cli.mjs", "scripts/measure-aria.ts", "baseline"],
  { ARIA_DIST: resolve(env.ARIA_BASELINE_ROOT, "dist") },
);
await run([
  "node_modules/tsx/dist/cli.mjs",
  "scripts/measure-aria.ts",
  "after",
]);
await run(["scripts/compare-favorites.mjs"]);
