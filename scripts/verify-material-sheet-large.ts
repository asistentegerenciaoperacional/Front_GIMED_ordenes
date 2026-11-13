import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { makeSeed } from "../shared/seed";
import { validateDatabase } from "../server/integrity";

const root = resolve("tests/.tmp");
await mkdir(root, { recursive: true });
const directory = await mkdtemp(join(root, "material-sheet-large-"));
const db = makeSeed();
const source = db.orden_material[0];
const order = db.orden_compra.find((row) => row.id === source.id_orden_compra)!;
const id = (number: number) => number.toString(16).padStart(24, "0");
for (let i = 0; i < 1000; i++) {
  const orderId = id(600000 + i);
  db.orden_compra.push({ ...order, id: orderId, no_orden: String(5000 + i) });
  for (let position = 1; position <= 5; position++)
    db.orden_material.push({
      ...source,
      id: id(700000 + i * 5 + position),
      id_orden_compra: orderId,
      posicion: position,
      id_factura: null,
      id_lote_material: null,
      fecha_entrega: null,
      cantidad_recibida: null,
      ubicacion: null,
    });
}
const fixture = join(directory, "seed.json");
await writeFile(fixture, JSON.stringify(validateDatabase(db)));
const child = spawn(
  process.execPath,
  [
    "scripts/verify-aria-browser.mjs",
    "tests/material-order-sheet-load.browser.js",
    process.argv[2] ?? "chromium",
  ],
  {
    windowsHide: true,
    stdio: "inherit",
    env: { ...process.env, PROTOTIPO_BROWSER_SEED_FILE: fixture },
  },
);
child.on("error", (error) => {
  throw error;
});
process.exitCode = await new Promise<number>((resolve) =>
  child.on("exit", (code) => resolve(code ?? 1)),
);
