import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { createServer } from "node:net";
import {ariaBrowserFile} from "./aria-browser-source.mjs";

const browser = process.argv[2] || "chrome";
const journey = process.argv.includes("--journey");
const base = resolve("tests/.tmp");
await mkdir(base, { recursive: true });
const temporary = await mkdtemp(join(base, "order-detail-"));
const evidence = resolve("tests/evidence/order-detail");
await mkdir(evidence, { recursive: true });
const socket = createServer();
await new Promise((ok, fail) => {
  socket.once("error", fail);
  socket.listen(0, "127.0.0.1", ok);
});
const port = socket.address().port;
await new Promise((ok) => socket.close(ok));
const env = {
  ...process.env,
  PROTOTIPO_API_PORT: String(port),
  PROTOTIPO_DATA_FILE: join(temporary, "database.json"),
  NO_UPDATE_NOTIFIER: "1",
};
const api = spawn(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "server/index.ts"],
  {
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const session = `gimed-detail-${process.pid}`;
async function cli(args) {
  return new Promise((ok, fail) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/@playwright/cli/playwright-cli.js",
        `-s=${session}`,
        ...args,
      ],
      { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (output += data));
    child.on("error", fail);
    child.on("exit", (code) => (code ? fail(new Error(output)) : ok(output)));
  });
}
try {
  await new Promise((ok, fail) => {
    const timer = setTimeout(
      () => fail(new Error("El servicio de pruebas no inició")),
      15000,
    );
    api.once("error", fail);
    api.once("exit", (code) =>
      fail(new Error(`El servicio terminó con ${code}`)),
    );
    api.stdout.on("data", (data) => {
      if (String(data).includes("Servicio local:")) {
        clearTimeout(timer);
        ok();
      }
    });
    api.stderr.on("data", (data) => process.stderr.write(data));
  });
  await cli([
    "open",
    `http://127.0.0.1:${port}`,
    `--browser=${browser}`,
    `--profile=${join(temporary, "profile")}`,
    "--idle-timeout=0",
  ]);
  let testFile = "tests/order-detail.browser.js";
  if (journey) {
    await mkdir(join(evidence, "journey"), { recursive: true });
    testFile = join(temporary, "browser-journey.js");
    const source = await readFile("tests/browser-journey.js", "utf8");
    await writeFile(testFile, source.replaceAll("tests/evidence/", "tests/evidence/order-detail/journey/"));
  }
  const output = await cli(["run-code", `--filename=${await ariaBrowserFile(testFile)}`]);
  const result = output.match(/### Result\r?\n(\{[^\r\n]+\})/);
  if (!result) throw new Error(output);
  const report = { browser, ...JSON.parse(result[1]) };
  await writeFile(
    join(evidence, `${browser}-${journey ? "journey" : "report"}.json`),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `${report.checks.length} comprobaciones de detalle correctas (${browser}).`,
  );
  if (report.performance) console.log(JSON.stringify(report.performance));
} catch (error) {
  console.error(error.message);
  await cli([
    "screenshot",
    `--filename=${join(evidence, `${browser}-${journey ? "journey-failure" : "failure"}.png`)}`,
  ]).catch(() => {});
  process.exitCode = 1;
} finally {
  await cli(["close"]).catch(() => {});
  api.kill();
  if (!resolve(temporary).startsWith(base + sep))
    throw new Error("Directorio temporal fuera del espacio de pruebas");
  await rm(temporary, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
