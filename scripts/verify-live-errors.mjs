import { spawn } from "node:child_process";
import { writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { createFixtureVite } from "./fixture-vite.mjs";
import {ariaBrowserFile} from "./aria-browser-source.mjs";

await mkdir(resolve("tests/.tmp"), { recursive: true });
const temporary = await mkdtemp(resolve("tests/.tmp/live-errors-"));
const server = await createFixtureVite({
  temporary,
  server: { port: 5184, strictPort: true },
});
const session = "gimed-live-errors-side";
async function cli(args) {
  return new Promise((ok, fail) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/@playwright/cli/playwright-cli.js",
        `-s=${session}`,
        ...args,
      ],
      {
        env: {
          ...process.env,
          NO_UPDATE_NOTIFIER: "1",
          PLAYWRIGHT_MCP_OUTPUT_DIR: "tests/evidence/live-errors-side",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (output += data));
    child.on("error", fail);
    child.on("exit", (code) => (code ? fail(new Error(output)) : ok(output)));
  });
}
try {
  await server.listen();
  await cli([
    "open",
    "http://127.0.0.1:5184/tests/live-errors.html",
    "--browser=chrome",
    "--profile=.playwright/live-errors-side-profile",
    "--idle-timeout=0",
  ]);
  const output = await cli([
    "run-code",
    "--filename="+await ariaBrowserFile("tests/live-errors.browser.js"),
  ]);
  const result = output.match(/### Result\r?\n(\{[^\r\n]+\})/);
  if (!result) throw new Error(output);
  const report = JSON.parse(result[1]);
  await mkdir("tests/evidence", { recursive: true });
  await writeFile(
    "tests/evidence/live-errors-side-report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `${report.checks.length} comprobaciones de corrección de errores correctas. Sin guardar registros.`,
  );
} catch (error) {
  console.error(error.message);
  await cli([
    "screenshot",
    "--filename=tests/evidence/live-errors-side-failure.png",
  ]).catch(() => {});
  process.exitCode = 1;
} finally {
  await cli(["close"]).catch(() => {});
  await server.close();
}
