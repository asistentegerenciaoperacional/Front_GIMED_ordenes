import { spawn } from "node:child_process";
import { resolve } from "node:path";

async function run(args, extra = {}) {
  const child = spawn(process.execPath, args, {
    windowsHide: true,
    stdio: "inherit",
    env: { ...process.env, ...extra },
  });
  await new Promise((ok, fail) => {
    child.once("error", fail);
    child.once("exit", (code) =>
      code === 0 ? ok() : fail(new Error(`${args.join(" ")}: ${code}`)),
    );
  });
}
for (const engine of ["chromium", "firefox", "webkit"]) {
  const env = {};
  if (
    engine === "firefox" &&
    process.platform === "win32" &&
    !process.env.PROTOTIPO_FIREFOX_EXECUTABLE
  ) {
    await run(["scripts/prepare-firefox-runtime.mjs"]);
    env.PROTOTIPO_FIREFOX_EXECUTABLE = resolve(
      "tests/.tmp/firefox-runtime/firefox.exe",
    );
  }
  await run(
    [
      "scripts/verify-aria-browser.mjs",
      "tests/material-demand.browser.js",
      engine,
    ],
    env,
  );
}
