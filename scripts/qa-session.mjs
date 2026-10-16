// Keeps the isolated CLI/browser and its fixture server alive during review.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {ariaBrowserFile} from "./aria-browser-source.mjs";
const automated = process.argv.includes("--check");
const port = process.env.PROTOTIPO_QA_PORT || "3002";
const env = {
  ...process.env,
  PROTOTIPO_API_PORT: port,
  PROTOTIPO_DATA_FILE:
    process.env.PROTOTIPO_QA_DATA_FILE ||
    resolve(
      automated
        ? `tests/.tmp/browser-${randomUUID()}/database.json`
        : "tests/evidence/qa-database.json",
    ),
  NO_UPDATE_NOTIFIER: "1",
  PLAYWRIGHT_MCP_OUTPUT_DIR: "tests/evidence",
};
const api = spawn(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "server/index.ts"],
  { env, stdio: ["ignore", "pipe", "inherit"] },
);
await new Promise((ok, fail) => {
  const timer = setTimeout(
    () => fail(new Error("No inició el servicio de pruebas.")),
    15000,
  );
  api.stdout.on("data", (d) => {
    process.stdout.write(d);
    if (String(d).includes("Servicio local:")) {
      clearTimeout(timer);
      ok();
    }
  });
  api.on("error", fail);
  api.on("exit", (code) => {
    if (code) fail(new Error("El servicio de pruebas terminó."));
  });
});
function cli(args, capture = false) {
  return new Promise((ok, fail) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/@playwright/cli/playwright-cli.js",
        "-s=gimed-prototipo",
        ...args,
      ],
      { env, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" },
    );
    let output = "";
    if (capture) {
      child.stdout.on("data", (d) => (output += d));
      child.stderr.on("data", (d) => (output += d));
    }
    child.on("error", fail);
    child.on("exit", (code) =>
      code ? fail(new Error(`CLI terminó con ${code}\n${output}`)) : ok(output),
    );
  });
}
await cli([
  "open",
  `http://127.0.0.1:${port}`,
  "--browser=chrome",
  "--profile=.playwright/qa-profile",
  "--idle-timeout=0",
]);
if (automated) {
  try {
    const output = await cli(
      ["run-code", "--filename="+await ariaBrowserFile("tests/browser-journey.js")],
      true,
    );
    const result = output.match(/### Result\r?\n(\{[^\r\n]+\})/);
    if (!result)
      throw new Error(
        `El navegador no devolvió el resultado completo.\n${output}`,
      );
    const report = {
      ...JSON.parse(result[1]),
      dataFile: env.PROTOTIPO_DATA_FILE,
    };
    await mkdir("tests/evidence", { recursive: true });
    await writeFile(
      "tests/evidence/browser-report.json",
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(
      `${report.checks.length} comprobaciones de navegador correctas. Reporte: tests/evidence/browser-report.json`,
    );
  } catch (error) {
    console.error(error.message);
    await cli([
      "screenshot",
      "--filename=tests/evidence/browser-failure.png",
    ], true).catch(() => undefined);
    const snapshot = await cli(["snapshot"], true).catch(() => "");
    if (snapshot) console.error(snapshot);
    process.exitCode = 1;
  } finally {
    await cli(["close"]).catch(() => undefined);
    api.kill();
  }
} else {
  console.log(
    "Sesión de revisión lista. Envía una línea para cerrar únicamente esta sesión y su servicio.",
  );
  process.stdin.resume();
  let ending = false;
  async function end() {
    if (ending) return;
    ending = true;
    try {
      await cli(["close"]);
    } finally {
      api.kill();
      process.exit(0);
    }
  }
  process.stdin.on("data", () => void end());
  process.on("SIGINT", () => void end());
  process.on("SIGTERM", () => void end());
}
