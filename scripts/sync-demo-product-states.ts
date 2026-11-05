import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { readFile, writeFile, rename, rm, mkdir } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { resolve } from "node:path";
import { syncProductLineStates } from "../shared/product-line-state";
import { validateDatabase } from "../server/integrity";
import type { Database } from "../shared/models";

// Explicit maintenance operation: never invoked by startup or ordinary reads.
assert.ok(
  process.argv.includes("--apply"),
  "Usa --apply con el servicio detenido.",
);
const port = Number(process.env.PROTOTIPO_API_PORT ?? 3001);
const active = await new Promise<boolean>((done) => {
  const socket = createConnection({ host: "127.0.0.1", port });
  const finish = (value: boolean) => {
    socket.destroy();
    done(value);
  };
  socket.once("connect", () => finish(true));
  socket.once("error", () => finish(false));
  socket.setTimeout(1000, () => finish(true));
});
assert.equal(
  active,
  false,
  `Detén el servicio del puerto ${port} antes de ajustar la demo.`,
);
const file = resolve(process.env.PROTOTIPO_DATA_FILE ?? "data/database.json");
const original = await readFile(file);
const before: Database = JSON.parse(original.toString("utf8"));
const next = structuredClone(before);
syncProductLineStates(
  next,
  next.orden_producto.map((line) => line.id),
);
validateDatabase(next);
const changes = next.orden_producto.flatMap((line, index) =>
  line.estado === before.orden_producto[index].estado
    ? []
    : [
        {
          id: line.id,
          before: before.orden_producto[index].estado,
          after: line.estado,
        },
      ],
);
const unchanged = structuredClone(next);
for (let index = 0; index < unchanged.orden_producto.length; index++)
  unchanged.orden_producto[index].estado = before.orden_producto[index].estado;
assert.deepEqual(
  unchanged,
  before,
  "Solo puede cambiar orden_producto.estado.",
);
const backup = `${file}.before-product-states-${Date.now()}.bak`;
const temporary = `${file}.${randomUUID()}.tmp`;
await writeFile(backup, original, { flag: "wx" });
assert.deepEqual(await readFile(backup), original);
try {
  await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", {
    flag: "wx",
  });
  assert.deepEqual(
    await readFile(file),
    original,
    "La base cambió durante el ajuste.",
  );
  await rename(temporary, file);
} finally {
  await rm(temporary, { force: true });
}
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const report = {
  date: new Date().toISOString(),
  file,
  backup,
  changes,
  previousSha256: hash(original),
  backupSha256: hash(await readFile(backup)),
  updatedSha256: hash(await readFile(file)),
  onlyProductStatesChanged: true,
};
await mkdir("tests/evidence/lifecycle", { recursive: true });
await writeFile(
  "tests/evidence/lifecycle/demo-product-states.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
