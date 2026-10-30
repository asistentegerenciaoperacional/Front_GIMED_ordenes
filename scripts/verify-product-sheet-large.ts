import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { makeSeed } from "../shared/seed";
import { buildProductSheet } from "../src/product-order-sheet-model";
import { validateDatabase } from "../server/integrity";
await mkdir("tests/.tmp", { recursive: true });
const dir = await mkdtemp(resolve("tests/.tmp/product-sheet-large-"));
const db = makeSeed(),
  source = buildProductSheet(db, "seguimiento").find(
    (row) => row.line.estado === "en_seguimiento",
  )!;
for (let index = 0; index < 5000; index++)
  db.lote_producto.push({
    ...source.lot!,
    id: (800000 + index).toString(16).padStart(24, "0"),
    numero_lote: `VIRTUAL-${index}`,
    estado: "en_seguimiento",
    cantidad_recibida: null,
    id_factura: null,
    fecha_recepcion: null,
    fecha_confirmacion: null,
    fecha_entrega_batch_record: null,
    fecha_inspeccion: null,
    estado_inspeccion: "pendiente",
    estado_batch_record: "pendiente",
  });
validateDatabase(db);
const file = join(dir, "seed.json");
await writeFile(file, JSON.stringify(db));
const child = spawn(
  process.execPath,
  [
    "scripts/verify-aria-browser.mjs",
    "tests/product-order-sheet-virtual.browser.js",
    "chromium",
  ],
  {
    env: { ...process.env, PROTOTIPO_BROWSER_SEED_FILE: file },
    windowsHide: true,
    stdio: "inherit",
  },
);
child.on("error", (error) => {
  throw error;
});
process.exitCode = await new Promise<number>((done) =>
  child.on("exit", (code) => done(code ?? 1)),
);
