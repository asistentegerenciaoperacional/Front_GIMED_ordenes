import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, rename, rm, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "../shared/models";
import { costDay } from "../shared/maquila-costs";
import { validateDatabase } from "../server/integrity";

export function removeAuthorizedCost(database: Database): Database {
  const id = "e86e766ec339006bdbb45239";
  const row = database.costos_maquila.find((cost) => cost.id === id);
  assert.ok(
    row,
    "No se encontró el registro autorizado; no se modificó la base.",
  );
  assert.equal(row.id_producto, "000000000000000000000046");
  assert.equal(row.costo, 2000);
  assert.equal(costDay(row.fecha_inicio), "2025-11-01");
  assert.equal(costDay(row.fecha_fin), "2026-11-01");
  assert.equal(
    database.productos.find((product) => product.id === row.id_producto)
      ?.nombre_producto,
    "Crema corporal · 250 ml",
  );
  const next = structuredClone(database);
  next.costos_maquila = next.costos_maquila.filter((cost) => cost.id !== id);
  validateDatabase(next); // Verify the complete result without rewriting unrelated values.
  return next;
}

export async function correctCostFile(
  file: string,
  backup: string,
  reportFile: string,
) {
  const original = await readFile(file);
  assert.deepEqual(
    original,
    await readFile(backup),
    "La base cambió desde el respaldo; no se modificó.",
  );
  const previous = JSON.parse(original.toString("utf8")) as Database;
  const next = removeAuthorizedCost(previous);
  const temporary = `${file}.costs-${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", {
      flag: "wx",
    });
    assert.deepEqual(
      await readFile(file),
      original,
      "La base cambió durante la revisión; no se modificó.",
    );
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
  const hash = (value: Buffer) =>
    createHash("sha256").update(value).digest("hex");
  const report = {
    date: new Date().toISOString(),
    backup,
    file,
    beforeSha256: hash(original),
    afterSha256: hash(await readFile(file)),
    removed: previous.costos_maquila.find(
      (cost) => !next.costos_maquila.some((item) => item.id === cost.id),
    ),
    before: previous.costos_maquila.length,
    after: next.costos_maquila.length,
    unchangedCollections: Object.keys(previous).filter(
      (key) => key !== "costos_maquila",
    ),
    otherCostsPreserved: true,
  };
  await mkdir(resolve(reportFile, ".."), { recursive: true });
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assert.equal(
    process.argv[2],
    "--confirm-authorized-removal",
    "Requiere confirmación explícita y servicio detenido.",
  );
  assert.ok(process.argv[3], "Indica el respaldo exacto de la base.");
  console.log(
    JSON.stringify(
      await correctCostFile(
        resolve("data/database.json"),
        resolve(process.argv[3]),
        "tests/evidence/costs/data-correction.json",
      ),
    ),
  );
}
