import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { readFile, writeFile, rename, rm, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { JsonStore } from "../server/store";

assert.ok(
  process.argv.includes("--confirm-reset"),
  "Restablecer toda la demo requiere --confirm-reset y el servicio detenido.",
);
const port = Number(process.env.PROTOTIPO_API_PORT ?? 3001);
const active = await new Promise<boolean>((ok) => {
  const socket = createConnection({ host: "127.0.0.1", port });
  const finish = (value: boolean) => {
    socket.destroy();
    ok(value);
  };
  socket.once("connect", () => finish(true));
  socket.once("error", () => finish(false));
  socket.setTimeout(1000, () => finish(true));
});
assert.equal(
  active,
  false,
  `Detén el servicio del puerto ${port} antes del restablecimiento.`,
);
const file = resolve(process.env.PROTOTIPO_DATA_FILE ?? "data/database.json");
const temporary = `${file}.${randomUUID()}.tmp`;
const hash = (body: Buffer) => createHash("sha256").update(body).digest("hex");
try {
  // Opening an absent temporary store creates and validates the complete seed.
  const next = await JsonStore.open(temporary);
  const original = await readFile(file);
  const backup = `${file}.before-reset-${Date.now()}.bak`;
  await writeFile(backup, original, { flag: "wx" });
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(temporary, file);
      break;
    } catch (error) {
      if (
        attempt >= 6 ||
        !["EPERM", "EACCES", "EBUSY"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw error;
      await pause(25 * 2 ** attempt);
    }
  }
  const restored = await readFile(file),
    db = next.snapshot();
  const report = {
    date: new Date().toISOString(),
    file,
    backup,
    previousSha256: hash(original),
    restoredSha256: hash(restored),
    collections: Object.fromEntries(
      Object.entries(db).map(([key, rows]) => [key, rows.length]),
    ),
    statuses: Object.fromEntries(
      [...new Set(db.codigos_barras.map((c) => c.estado))].map((status) => [
        status,
        db.codigos_barras.filter((c) => c.estado === status).length,
      ]),
    ),
  };
  await mkdir("tests/evidence/barcodes", { recursive: true });
  await writeFile(
    "tests/evidence/barcodes/demo-reset.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await rm(temporary, { force: true });
}
