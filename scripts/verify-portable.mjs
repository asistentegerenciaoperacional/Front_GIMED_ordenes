import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, access, rm } from "node:fs/promises";
import { resolve, dirname, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { ariaBrowserSource } from "./aria-browser-source.mjs";

const exec = promisify(execFile);
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = resolve(project, "..");
const name = "GIMED-Prototipo-Windows-x64";
const archive = process.env.PROTOTIPO_PACKAGE_ARCHIVE
  ? resolve(process.env.PROTOTIPO_PACKAGE_ARCHIVE)
  : resolve(workspace, name + ".zip");
// A sibling of prototipo prevents Node from falling back to its node_modules.
const checkRoot = resolve(workspace, ".portable-check-" + randomUUID());
const destination = resolve(checkRoot, "PC sin herramientas á prueba");
const root = resolve(destination, name);
const reportFile = resolve(project, "tests/evidence/portable-report.json");
const systemRoot = process.env.SystemRoot || "C:\\Windows";
const cmd = resolve(systemRoot, "System32/cmd.exe");
const powershell = resolve(
  systemRoot,
  "System32/WindowsPowerShell/v1.0/powershell.exe",
);
const originalFile = resolve(project, "data/database.json");
const sha = (body) => createHash("sha256").update(body).digest("hex");
const checks = [];
const children = [];
let browserOpened = false;
let report;
function check(condition, label) {
  assert.ok(condition, label);
  checks.push(label);
}
async function present(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
function start() {
  const child = spawn(cmd, ["/d", "/c", "Iniciar.cmd"], {
    cwd: root,
    env: restricted,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  child.log = "";
  child.done = new Promise((ok, fail) => {
    child.once("error", fail);
    child.once("exit", (code) => ok(code));
  });
  child.stdout.on("data", (chunk) => (child.log += String(chunk)));
  child.stderr.on("data", (chunk) => (child.log += String(chunk)));
  children.push(child);
  return child;
}
async function waitReady(child) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.log.includes("Aplicación lista:")) return;
    if (child.exitCode !== null) throw new Error(child.log);
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error("El lanzador no inició el servicio.\n" + child.log);
}
async function within(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise(
        (_, fail) =>
          (timer = setTimeout(
            () => fail(new Error("El proceso no terminó a tiempo.")),
            ms,
          )),
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function stop(child) {
  if (child.exitCode !== null) return;
  child.stdin.write("\n");
  assert.equal(await within(child.done, 7000), 0, child.log);
}
async function browser(args) {
  return exec(
    process.execPath,
    [
      resolve(project, "node_modules/@playwright/cli/playwright-cli.js"),
      "-s=gimed-portable",
      ...args,
    ],
    {
      cwd: project,
      env: {
        ...process.env,
        NO_UPDATE_NOTIFIER: "1",
        PLAYWRIGHT_MCP_OUTPUT_DIR: "tests/evidence",
      },
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
}
const originalHash = (await present(originalFile))
  ? sha(await readFile(originalFile))
  : null;
await mkdir(destination, { recursive: true });
await mkdir(resolve(checkRoot, "temp"));
const port = await new Promise((ok, fail) => {
  const probe = createServer();
  probe.once("error", fail);
  probe.listen(0, "127.0.0.1", () => {
    const value = probe.address().port;
    probe.close(() => ok(value));
  });
});
const url = "http://127.0.0.1:" + port;
const restricted = {
  ...process.env,
  PATH: resolve(systemRoot, "System32") + ";" + systemRoot,
  NODE_PATH: "",
  NODE_OPTIONS: "",
  TEMP: resolve(checkRoot, "temp"),
  TMP: resolve(checkRoot, "temp"),
  PROTOTIPO_API_PORT: String(port),
  PROTOTIPO_PORTABLE_NO_BROWSER: "1",
};
try {
  await exec(
    powershell,
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      '$ErrorActionPreference = "Stop"; Expand-Archive -LiteralPath $env:PROTOTIPO_VERIFY_ZIP -DestinationPath $env:PROTOTIPO_VERIFY_DEST',
    ],
    {
      env: {
        ...process.env,
        PROTOTIPO_VERIFY_ZIP: archive,
        PROTOTIPO_VERIFY_DEST: destination,
      },
      windowsHide: true,
    },
  );
  const manifest = JSON.parse(
    await readFile(resolve(root, "MANIFIESTO.json"), "utf8"),
  );
  const runtime = resolve(root, "runtime/node.exe");
  check(
    sha(await readFile(runtime)) === manifest.runtime.sha256,
    "Node incluido coincide con el SHA-256 oficial",
  );
  check(
    !(await present(resolve(root, "data/database.json"))),
    "ZIP sin estado de usuario: primera ejecución con semilla ficticia",
  );
  const version = await exec(runtime, ["--version"], {
    env: restricted,
    windowsHide: true,
  });
  check(
    version.stdout.trim() === manifest.runtime.version,
    "Runtime incluido ejecutado con PATH sin Node ni npm",
  );
  const process1 = start();
  await waitReady(process1);
  const initialResponse = await fetch(url + "/api/state");
  assert.equal(initialResponse.status, 200);
  const initial = await initialResponse.json();
  check(
    Object.keys(initial).length === 28,
    "Iniciar.cmd arranca las 28 colecciones desde una ruta con espacios y acentos",
  );
  check(
    await present(resolve(root, "data/database.json")),
    "Datos escritos dentro del paquete extraído",
  );
  const html = await (await fetch(url)).text();
  const scripts = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(
    (match) => match[1],
  );
  check(
    scripts.length >= 2,
    "Interfaz compilada disponible desde el servicio portable",
  );
  for (const asset of scripts)
    assert.equal((await fetch(url + asset)).status, 200);
  check(true, "JavaScript y estilos servidos sin Vite ni acceso a Internet");

  const ownerBefore = JSON.parse(
    await readFile(resolve(root, "data/portable.lock"), "utf8"),
  );
  const duplicate = start();
  assert.equal(await within(duplicate.done, 7000), 0, duplicate.log);
  check(
    duplicate.log.includes("ya se está ejecutando"),
    "Segundo doble clic reutiliza la instancia existente",
  );
  assert.deepEqual(
    JSON.parse(await readFile(resolve(root, "data/portable.lock"), "utf8")),
    ownerBefore,
  );
  check(true, "Una sola instancia conserva la propiedad del archivo de datos");

  await browser([
    "open",
    url,
    "--browser=chrome",
    "--profile=.playwright/portable-profile",
    "--idle-timeout=0",
  ]);
  browserOpened = true;
  const rendered = await browser([
    "run-code",
    'async page => { await page.getByRole("heading", { name: "Órdenes de compra", exact: true }).waitFor(); await page.getByRole("link", { name: "OC 2801", exact: true }).waitFor(); await page.screenshot({ path: "tests/evidence/portable-ordenes.png", fullPage: true }); return { title: await page.title(), orders: await page.getByRole("link", { name: "OC 2801", exact: true }).count() }; }',
  ]);
  check(
    rendered.stdout.includes('"orders":1'),
    "Navegador carga la aplicación y los datos del paquete autónomo",
  );
  const filters = await browser([
    "run-code",
    await ariaBrowserSource(`async page => {
      const selector = page.getByRole("combobox", { name: "Filtro personalizado", exact: true });
      await selector.click();
      const variants = await page.getByRole("option").count();
      await page.keyboard.press("Escape");
      await selector.selectOption("documento_con");
      await page.waitForFunction(() => new URLSearchParams(location.search).get("filtro") === "documento_con");
      const filtered = (await selector.inputValue()) === "documento_con";
      const trigger = page.getByRole("button", { name: "Ayuda de filtros personalizados", exact: true });
      await trigger.click();
      const help = await page.locator("[role=dialog] .filter-help-entry").count();
      await page.keyboard.press("Escape");
      const restored = await trigger.evaluate(button => button === document.activeElement);
      await selector.selectOption("");
      return { variants, filtered, help, restored };
    }`),
  ]);
  check(
    filters.stdout.includes('"variants":18') &&
      filters.stdout.includes('"filtered":true'),
    "Portable incluye las 17 variantes y aplica el filtro personalizado",
  );
  check(
    filters.stdout.includes('"help":13'),
    "Ayuda de los trece filtros disponible en el paquete autónomo",
  );
  check(
    filters.stdout.includes('"restored":true'),
    "Escape cierra la ayuda del portable y devuelve el foco",
  );
  const lazyControls = await browser([
    "run-code",
    await ariaBrowserSource(`async page=>{
    await page.getByRole('button',{name:'Nueva orden',exact:true}).click();
    await page.getByRole('dialog',{name:'Nueva orden de compra',exact:true}).waitFor();
    await page.getByRole('button',{name:'Abrir calendario: Entrega solicitada',exact:true}).click();
    await page.locator('.react-aria-CalendarCell').first().waitFor();
    const calendar=await page.locator('.react-aria-CalendarCell').count();
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    return {calendar};
  }`),
  ]);
  check(
    /"calendar":(?:2[89]|[3-9][0-9])/.test(lazyControls.stdout),
    "Portable carga el formulario y calendario distribuidos en módulos locales",
  );
  await browser(["close"]);
  browserOpened = false;

  const product = initial.productos[0];
  const response = await fetch(url + "/api/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "saveEntity",
      payload: {
        entity: "productos",
        key: { id: product.id },
        row: {
          ...product,
          nombre_producto: "Producto de comprobación portable",
        },
      },
    }),
  });
  assert.equal(response.status, 200, await response.text());
  const saved = await (await fetch(url + "/api/state")).json();
  check(
    saved.productos[0].nombre_producto === "Producto de comprobación portable",
    "Operación de negocio y guardado local correctos",
  );
  await stop(process1);
  check(
    !(await present(resolve(root, "data/portable.lock"))),
    "Enter detiene el servicio y libera la instancia",
  );
  const process2 = start();
  await waitReady(process2);
  const recovered = await (await fetch(url + "/api/state")).json();
  assert.deepEqual(recovered, saved);
  check(true, "Reinicio del lanzador recupera íntegramente el estado guardado");
  await stop(process2);
  const finalOriginalHash = (await present(originalFile))
    ? sha(await readFile(originalFile))
    : null;
  check(
    finalOriginalHash === originalHash,
    "El archivo de datos del proyecto permanece intacto",
  );
  const archiveBody = await readFile(archive);
  report = {
    date: new Date().toISOString(),
    passed: true,
    platform: "Windows x64",
    runtime: manifest.runtime.version,
    archive: relative(workspace, archive),
    archiveSha256: sha(archiveBody),
    archiveSizeBytes: archiveBody.length,
    packages: manifest.packages.length,
    checks,
    browser: "Chrome · Captura portable-ordenes.png",
    limitations:
      "Comprobado en una extracción aislada del mismo equipo; no en otro PC físico.",
  };
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
  console.log(
    checks.length + " comprobaciones correctas del paquete portable.",
  );
  console.log("Reporte: tests/evidence/portable-report.json");
} finally {
  if (browserOpened) await browser(["close"]).catch(() => undefined);
  for (const child of children) {
    if (child.exitCode === null) {
      await exec(
        resolve(systemRoot, "System32/taskkill.exe"),
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true },
      ).catch(() => undefined);
    }
  }
  const path = relative(workspace, checkRoot);
  if (
    path &&
    !isAbsolute(path) &&
    !path.startsWith(".." + sep) &&
    path.startsWith(".portable-check-") &&
    dirname(checkRoot) === workspace
  ) {
    await rm(checkRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  } else {
    throw new Error(
      "La carpeta de comprobación no está dentro de la ruta prevista.",
    );
  }
}
