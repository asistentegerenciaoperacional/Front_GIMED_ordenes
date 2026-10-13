import { spawn, execFile } from "node:child_process";
import {
  mkdirSync,
  openSync,
  writeFileSync,
  closeSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:net";
import { createInterface } from "node:readline";

const root = dirname(fileURLToPath(import.meta.url));
const data = resolve(root, "data");
const lockFile = resolve(data, "portable.lock");
const noBrowser = process.env.PROTOTIPO_PORTABLE_NO_BROWSER === "1";
let ownsLock = false;
let child;
let stopping = false;
let startupTimer;
let terminal;

function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function releaseLock() {
  if (!ownsLock) return;
  try {
    const saved = JSON.parse(readFileSync(lockFile, "utf8"));
    if (saved.pid === process.pid) unlinkSync(lockFile);
  } catch {
    /* A missing lock is already released. */
  }
  ownsLock = false;
}
function openBrowser(url) {
  if (noBrowser || !/^http:\/\/127\.0\.0\.1:\d+$/.test(url)) return;
  const cmd = resolve(
    process.env.SystemRoot || "C:\\Windows",
    "System32/cmd.exe",
  );
  execFile(
    cmd,
    ["/d", "/c", 'start "" "' + url + '"'],
    { windowsHide: true },
    (error) => {
      if (error) console.log("Abre esta dirección en tu navegador: " + url);
    },
  );
}
async function acquireLock() {
  mkdirSync(data, { recursive: true });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const descriptor = openSync(lockFile, "wx");
      writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, childPid: null, url: null }),
      );
      closeSync(descriptor);
      ownsLock = true;
      return true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let saved;
      try {
        saved = JSON.parse(readFileSync(lockFile, "utf8"));
      } catch {
        if (attempt < 3) {
          await new Promise((ok) => setTimeout(ok, 150));
          continue;
        }
        throw new Error(
          "No se puede leer data\\portable.lock. Cierra las ventanas de GIMED y elimina solo ese archivo para volver a iniciar.",
        );
      }
      if (alive(saved.pid) || alive(saved.childPid)) {
        console.log("El prototipo ya se está ejecutando en esta carpeta.");
        if (saved.url) {
          console.log(saved.url);
          openBrowser(saved.url);
        } else {
          console.log("Espera a que termine de iniciar la primera ventana.");
        }
        return false;
      }
      try {
        unlinkSync(lockFile);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  throw new Error("No se pudo reservar el archivo de datos para esta sesión.");
}
async function availablePort() {
  const fixed = process.env.PROTOTIPO_API_PORT;
  if (
    fixed &&
    (!/^\d+$/.test(fixed) || Number(fixed) < 1 || Number(fixed) > 65535)
  ) {
    throw new Error("El puerto configurado debe ser un número del 1 al 65535.");
  }
  const candidates = fixed
    ? [Number(fixed)]
    : Array.from({ length: 20 }, (_, i) => 3001 + i);
  for (const port of candidates) {
    const free = await new Promise((ok, fail) => {
      const probe = createServer();
      probe.once("error", (error) =>
        error.code === "EADDRINUSE" ? ok(false) : fail(error),
      );
      probe.listen(port, "127.0.0.1", () => probe.close(() => ok(true)));
    });
    if (free) return port;
  }
  throw new Error(
    "Los puertos locales están ocupados. Cierra otra sesión o aplicación e inténtalo de nuevo.",
  );
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(startupTimer);
  terminal?.close();
  if (child && child.exitCode === null) {
    child.once("exit", () => {
      releaseLock();
      process.exit(code);
    });
    child.kill();
  } else {
    releaseLock();
    process.exit(code);
  }
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
process.on("exit", releaseLock);

async function start() {
  if (!(await acquireLock())) return;
  const port = await availablePort();
  const url = "http://127.0.0.1:" + port;
  const app = resolve(root, "app");
  const env = {
    ...process.env,
    PROTOTIPO_API_PORT: String(port),
    PROTOTIPO_DATA_FILE: resolve(data, "database.json"),
  };
  for (const key of [
    "NODE_OPTIONS",
    "NODE_PATH",
    "ESBUILD_BINARY_PATH",
    "TSX_TSCONFIG_PATH",
  ])
    delete env[key];
  console.log("GIMED · Prototipo local de órdenes de compra");
  console.log("Iniciando. Los cambios se guardan en la carpeta data.");
  child = spawn(
    process.execPath,
    [
      "--import",
      pathToFileURL(resolve(app, "node_modules/tsx/dist/loader.mjs")).href,
      resolve(app, "server/index.ts"),
    ],
    { cwd: app, env, stdio: ["ignore", "pipe", "inherit"], windowsHide: true },
  );
  writeFileSync(
    lockFile,
    JSON.stringify({ pid: process.pid, childPid: child.pid, url }),
  );
  let ready = false;
  let output = "";
  startupTimer = setTimeout(() => {
    console.error("El servicio no pudo iniciar a tiempo.");
    stop(1);
  }, 20000);
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
    if (!ready && output.includes("Servicio local:")) {
      ready = true;
      clearTimeout(startupTimer);
      console.log("\nAplicación lista: " + url);
      console.log(
        "Mantén esta ventana abierta. Pulsa Enter aquí para detener el prototipo.\n",
      );
      openBrowser(url);
      terminal = createInterface({ input: process.stdin });
      terminal.once("line", () => stop());
    }
  });
  child.once("error", (error) => {
    console.error("No se pudo ejecutar el servicio: " + error.message);
    stop(1);
  });
  child.once("exit", (code) => {
    if (!stopping) {
      clearTimeout(startupTimer);
      console.error("El servicio se ha detenido.");
      releaseLock();
      process.exit(code || 1);
    }
  });
}
start().catch((error) => {
  console.error(error.message);
  stop(1);
});
