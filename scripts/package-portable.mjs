import {
  cp,
  mkdir,
  readFile,
  writeFile,
  rename,
  realpath,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("Este empaquetado debe prepararse en Windows x64.");
}
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = resolve(project, "..");
const moduleRoot = resolve(project, "node_modules");
const name = "GIMED-Prototipo-Windows-x64";
const stage = resolve(project, ".portable-build", randomUUID());
const packageRoot = resolve(stage, name);
const app = resolve(packageRoot, "app");
const archive = resolve(workspace, name + ".zip");
const temporaryArchive = resolve(stage, name + ".zip");
const runtimeVersion = process.version;
const cache = resolve(project, ".portable-cache");
const hash = (body) => createHash("sha256").update(body).digest("hex");
function inside(parent, target) {
  const path = relative(parent, target);
  if (
    !path ||
    isAbsolute(path) ||
    path === ".." ||
    path.startsWith(".." + sep)
  ) {
    throw new Error("La ruta de salida no está dentro de la carpeta prevista.");
  }
}
inside(workspace, stage);
inside(workspace, archive);
inside(stage, packageRoot);
if (!existsSync(resolve(project, "dist/index.html"))) {
  throw new Error("Primero compila el prototipo con npm run build.");
}
await mkdir(cache, { recursive: true });
async function cachedDownload(filename, url) {
  const target = resolve(cache, filename);
  inside(cache, target);
  try {
    return await readFile(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok)
    throw new Error("No se pudo descargar " + url + ": " + response.status);
  const content = Buffer.from(await response.arrayBuffer());
  await writeFile(target, content, { flag: "wx" });
  return content;
}
const [license, officialChecksums, executable] = await Promise.all([
  cachedDownload(
    "node-" + runtimeVersion + "-LICENSE",
    "https://raw.githubusercontent.com/nodejs/node/" +
      runtimeVersion +
      "/LICENSE",
  ),
  cachedDownload(
    "node-" + runtimeVersion + "-SHASUMS256.txt",
    "https://nodejs.org/dist/" + runtimeVersion + "/SHASUMS256.txt",
  ),
  readFile(process.execPath),
]);
const officialLine = officialChecksums
  .toString("utf8")
  .split(/\r?\n/)
  .find((line) => line.trim().endsWith("win-x64/node.exe"));
const runtimeHash = hash(executable);
if (!officialLine || officialLine.split(/\s+/)[0] !== runtimeHash) {
  throw new Error(
    "El ejecutable de Node no coincide con el SHA-256 de su distribución oficial.",
  );
}

await mkdir(resolve(packageRoot, "runtime"), { recursive: true });
await mkdir(app, { recursive: true });
await mkdir(resolve(packageRoot, "data"), { recursive: true });
await writeFile(resolve(packageRoot, "runtime/node.exe"), executable);
await writeFile(resolve(packageRoot, "runtime/LICENSE.txt"), license);
for (const folder of ["dist", "server", "shared"]) {
  await cp(resolve(project, folder), resolve(app, folder), { recursive: true });
}
for (const file of ["Iniciar.cmd", "launch.mjs", "LEEME.txt"]) {
  await cp(
    resolve(project, "scripts/portable", file),
    resolve(packageRoot, file),
  );
}
await writeFile(
  resolve(packageRoot, "data/LEEME.txt"),
  "Los datos iniciales de demostracion se crean en database.json al iniciar.\r\n" +
    "Conserva esta carpeta para mantener tus cambios. Copiala con la aplicacion cerrada para hacer una copia de respaldo.\r\n",
);

// Copy dependency closures while preserving nested resolution and native binaries.
// Package exports may hide package.json, so locate it with Node's search paths.
const copied = new Set();
const packages = [];
function locate(name, from, optional) {
  const lookup =
    createRequire(resolve(from, "package.json")).resolve.paths(name) || [];
  for (const base of lookup) {
    const directory = resolve(base, name);
    if (existsSync(resolve(directory, "package.json"))) return directory;
  }
  if (optional) return null;
  throw new Error(
    "Falta la dependencia de ejecución " + name + ". Ejecuta npm ci.",
  );
}
function supports(values, current) {
  return (
    !values ||
    (!values.includes("!" + current) &&
      (values.every((value) => value.startsWith("!")) ||
        values.includes(current)))
  );
}
async function copyModule(name, from, optional = false) {
  const located = locate(name, from, optional);
  if (!located) return;
  const source = await realpath(located);
  inside(moduleRoot, source);
  if (copied.has(source)) return;
  const metadata = JSON.parse(
    await readFile(resolve(source, "package.json"), "utf8"),
  );
  if (!supports(metadata.os, "win32") || !supports(metadata.cpu, "x64")) {
    if (optional) return;
    throw new Error("Dependencia incompatible con Windows x64: " + name);
  }
  copied.add(source);
  const destination = resolve(
    app,
    "node_modules",
    relative(moduleRoot, source),
  );
  inside(app, destination);
  await cp(source, destination, {
    recursive: true,
    dereference: true,
    filter: (file) =>
      !relative(source, file).split(sep).includes("node_modules"),
  });
  packages.push({
    name: metadata.name,
    version: metadata.version,
    license: metadata.license ?? null,
    path: relative(packageRoot, destination).split(sep).join("/"),
  });
  const optionalNames = Object.keys(metadata.optionalDependencies || {});
  for (const dependency of Object.keys(metadata.dependencies || {})) {
    if (!optionalNames.includes(dependency))
      await copyModule(dependency, source);
  }
  for (const dependency of optionalNames)
    await copyModule(dependency, source, true);
}
for (const dependency of ["express", "zod", "tsx"])
  await copyModule(dependency, project);
const original = JSON.parse(
  await readFile(resolve(project, "package.json"), "utf8"),
);
await writeFile(
  resolve(app, "package.json"),
  JSON.stringify(
    {
      name: original.name,
      version: original.version,
      private: true,
      type: "module",
      description: "Distribución portable local para Windows x64",
    },
    null,
    2,
  ) + "\n",
);
await writeFile(
  resolve(packageRoot, "MANIFIESTO.json"),
  JSON.stringify(
    {
      application: "GIMED · Órdenes de compra",
      version: original.version,
      createdAt: new Date().toISOString(),
      platform: "win32",
      architecture: "x64",
      runtime: {
        version: runtimeVersion,
        sha256: runtimeHash,
        source:
          "https://nodejs.org/dist/" + runtimeVersion + "/win-x64/node.exe",
      },
      initialData:
        "Semilla ficticia; no contiene un estado de usuario guardado",
      packages: packages.sort((a, b) => a.path.localeCompare(b.path)),
    },
    null,
    2,
  ) + "\n",
);

const powershell = resolve(
  process.env.SystemRoot || "C:\\Windows",
  "System32/WindowsPowerShell/v1.0/powershell.exe",
);
await new Promise((ok, fail) => {
  const child = spawn(
    powershell,
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      '$ErrorActionPreference = "Stop"; Compress-Archive -LiteralPath $env:PROTOTIPO_PACKAGE_SOURCE -DestinationPath $env:PROTOTIPO_PACKAGE_ZIP -CompressionLevel Optimal',
    ],
    {
      windowsHide: true,
      stdio: "inherit",
      env: {
        ...process.env,
        PROTOTIPO_PACKAGE_SOURCE: packageRoot,
        PROTOTIPO_PACKAGE_ZIP: temporaryArchive,
      },
    },
  );
  child.on("error", fail);
  child.on("exit", (code) =>
    code === 0 ? ok() : fail(new Error("No se pudo crear el ZIP.")),
  );
});
await rename(temporaryArchive, archive);
const archiveBody = await readFile(archive);
await writeFile(
  resolve(workspace, name + ".sha256.txt"),
  hash(archiveBody) + "  " + name + ".zip\r\n",
);
console.log("ZIP portable: " + archive);
console.log(
  "Windows x64 · Node " +
    runtimeVersion +
    " · " +
    packages.length +
    " paquetes de ejecución",
);
console.log(
  "Tamaño: " +
    (archiveBody.length / 1024 / 1024).toFixed(1) +
    " MB · Datos ficticios iniciales",
);
