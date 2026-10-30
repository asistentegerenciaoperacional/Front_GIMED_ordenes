import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const report = JSON.parse(
  await readFile("tests/evidence/browser-report.json", "utf8"),
);
const saved = JSON.parse(await readFile(report.dataFile, "utf8"));
const port = process.env.PROTOTIPO_RESTART_PORT || "3003";
const server = spawn(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "server/index.ts"],
  {
    env: {
      ...process.env,
      PROTOTIPO_API_PORT: port,
      PROTOTIPO_DATA_FILE: report.dataFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
try {
  await new Promise((ok, fail) => {
    const timer = setTimeout(
      () => fail(new Error("No inició el servicio de comprobación.")),
      15000,
    );
    server.stdout.on("data", (data) => {
      if (String(data).includes("Servicio local:")) {
        clearTimeout(timer);
        ok();
      }
    });
    server.stderr.on("data", (data) => {
      clearTimeout(timer);
      fail(new Error(String(data)));
    });
    server.on("error", fail);
    server.on("exit", (code) => {
      clearTimeout(timer);
      fail(new Error(`Servicio terminó con ${code}`));
    });
  });
  const response = await fetch(`http://127.0.0.1:${port}/api/state`);
  assert.equal(response.status, 200);
  const restored = await response.json();
  assert.deepEqual(restored, saved);
  const result = {
    date: new Date().toISOString(),
    passed: true,
    collections: Object.keys(restored).length,
    sha256: createHash("sha256").update(JSON.stringify(restored)).digest("hex"),
    dataFile: report.dataFile,
  };
  await writeFile(
    "tests/evidence/restart-report.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    `Reinicio correcto: las ${Object.keys(restored).length} colecciones coinciden íntegramente con el archivo guardado.`,
  );
} finally {
  server.kill();
}
