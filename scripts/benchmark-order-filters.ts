import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database, orden_compra } from "../shared/models";
import { entities, meta, schemas, type Row } from "../shared/schema";
import { validateDatabase } from "../server/integrity";
import {
  buildOrderReadModel,
  filterCustomOrders,
} from "../src/order-read-model";
import { customFilters, type CustomFilterId } from "../src/order-filters";
import {
  makeOrderPerformanceFixture,
  ORDER_PERFORMANCE_DAY,
} from "../tests/fixtures/order-performance";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "tests/evidence/order-filter-benchmark.json");
const variants = customFilters.flatMap((family) => family.options);
assert.equal(customFilters.length, 13);
assert.equal(variants.length, 17);
const sourceFiles = [
  "src/order-read-model.ts",
  "src/order-filters.ts",
  "scripts/benchmark-order-filters.ts",
  "tests/fixtures/order-performance.ts",
];
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (path) => [
      path,
      sha(await readFile(resolve(root, path), "utf8")),
    ]),
  ),
);
let checksum = 0;
const recordSize = (value: unknown) => {
  checksum ^= Array.isArray(value)
    ? value.length
    : typeof value === "string"
      ? value.length
      : 1;
};
function measure(operation: () => unknown, samples: number, warmups = 2) {
  for (let index = 0; index < warmups; index++) recordSize(operation());
  const times: number[] = [];
  for (let index = 0; index < samples; index++) {
    const start = performance.now();
    const value = operation();
    times.push(performance.now() - start);
    recordSize(value);
  }
  times.sort((left, right) => left - right);
  const rounded = (value: number) => Number(value.toFixed(3));
  return {
    samples,
    warmups,
    medianMs: rounded(times[Math.floor(times.length / 2)]),
    p95Ms: rounded(
      times[Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)],
    ),
    minMs: rounded(times[0]),
    maxMs: rounded(times[times.length - 1]),
  };
}

// Independent reference: grouped raw records, no production summary or predicate.
const bogota = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function referenceDay(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return bogota.format(new Date(value));
}
function referenceData(db: Database) {
  const groupedLines = new Map<string, Row[]>(),
    groupedLots = new Map<string, Database["lote_producto"]>();
  const productOrder = new Map(
    db.orden_producto.map((line) => [line.id, line.id_orden_compra]),
  );
  const materialOrder = new Map(
    db.orden_material.map((line) => [line.id, line.id_orden_compra]),
  );
  const groupedLinks = new Map<string, Database["abastecimiento_material"]>();
  const put = <T>(map: Map<string, T[]>, key: string, row: T) => {
    const rows = map.get(key);
    if (rows) rows.push(row);
    else map.set(key, [row]);
  };
  for (const line of [
    ...db.orden_producto,
    ...db.orden_material,
    ...db.orden_otro,
  ])
    put(groupedLines, line.id_orden_compra, line);
  for (const lot of db.lote_producto)
    put(groupedLots, lot.id_orden_producto, lot);
  for (const link of db.abastecimiento_material) {
    put(groupedLinks, productOrder.get(link.id_orden_producto)!, link);
    put(groupedLinks, materialOrder.get(link.id_orden_material)!, link);
  }
  return { groupedLines, groupedLots, groupedLinks };
}
function referenceOrders(
  db: Database,
  data: ReturnType<typeof referenceData>,
  filter: CustomFilterId,
) {
  const physical = (row: Row) =>
    row.cantidad_recibida > 0 || !!(row.fecha_recepcion ?? row.fecha_entrega);
  return db.orden_compra.filter((order: orden_compra) => {
    const allLines = data.groupedLines.get(order.id) ?? [],
      lines = allLines.filter((line) => line.estado !== "anulada");
    const lots =
      order.tipo_orden === "producto"
        ? lines
            .flatMap((line) => data.groupedLots.get(line.id) ?? [])
            .filter((lot) => lot.estado !== "anulado")
        : lines;
    const links = data.groupedLinks.get(order.id) ?? [];
    switch (filter) {
      case "documento_con":
      case "documento_sin": {
        const exists = db.documento.some(
          (doc) =>
            doc.tipo_entidad === "orden_compra" &&
            doc.id_entidad === order.id &&
            doc.tipo_documento === "orden_compra_escaneada",
        );
        return filter === "documento_con" ? exists : !exists;
      }
      case "recepciones_sin_factura":
        return lots.some((lot) => physical(lot) && !lot.id_factura);
      case "entrega_vencida": {
        const day = referenceDay(order.fecha_solicitada_entrega);
        return (
          !!day &&
          day < ORDER_PERFORMANCE_DAY &&
          lines.some((line) => line.estado === "en_seguimiento")
        );
      }
      case "proximas_7":
      case "proximas_15":
      case "proximas_30": {
        const day = referenceDay(order.fecha_solicitada_entrega);
        const limit = new Date(ORDER_PERFORMANCE_DAY + "T12:00:00Z");
        limit.setUTCDate(limit.getUTCDate() + Number(filter.split("_")[1]));
        return (
          !!day &&
          day >= ORDER_PERFORMANCE_DAY &&
          day <= limit.toISOString().slice(0, 10)
        );
      }
      case "sin_recepciones":
        return (
          lines.length > 0 &&
          !lots.some((lot) => lot.cantidad_recibida !== null)
        );
      case "batch_vencido":
        return (
          order.tipo_orden === "producto" &&
          lots.some((lot) => {
            const day = referenceDay(lot.fecha_estimada_batch_record);
            return (
              !!day &&
              day < ORDER_PERFORMANCE_DAY &&
              !lot.fecha_entrega_batch_record
            );
          })
        );
      case "recibido_sin_batch":
        return (
          order.tipo_orden === "producto" &&
          lots.some((lot) => physical(lot) && !lot.fecha_entrega_batch_record)
        );
      case "inspeccion_pendiente":
        return (
          order.tipo_orden === "producto" &&
          lots.some(
            (lot) => !!lot.fecha_entrega_batch_record && !lot.fecha_inspeccion,
          )
        );
      case "recibidos_sin_inspeccion":
        return (
          order.tipo_orden === "producto" &&
          lots.some((lot) => physical(lot) && !lot.fecha_inspeccion)
        );
      case "confirmacion_pendiente":
        return (
          order.tipo_orden === "producto" &&
          lots.some((lot) => physical(lot) && !lot.fecha_confirmacion)
        );
      case "seguimiento_por_cerrar":
        return (
          order.tipo_orden === "producto" &&
          lines.some((line) => {
            const rows = (data.groupedLots.get(line.id) ?? []).filter(
              (lot) => lot.estado !== "anulado",
            );
            return (
              line.estado === "en_seguimiento" &&
              rows.length > 0 &&
              rows.every((lot) => lot.estado === "cerrado")
            );
          })
        );
      case "vinculos_con":
        return links.length > 0;
      case "vinculos_sin":
        return links.length === 0;
      case "ocm_pendientes":
        return (
          order.tipo_orden === "producto" &&
          links.some(
            (link) =>
              lines.some((line) => line.id === link.id_orden_producto) &&
              db.orden_material.some(
                (line) =>
                  line.id === link.id_orden_material &&
                  line.estado === "en_seguimiento",
              ),
          )
        );
    }
  });
}

/** Full schema, keys and FK checks in linear passes, outside timed read operations. */
function validateFixture(db: Database) {
  let rows = 0;
  for (const table of entities) {
    for (const row of db[table]) {
      assert.equal(
        schemas[table].safeParse(row).success,
        true,
        "Invalid fixture row in " + table,
      );
      rows++;
    }
    for (const fields of [
      meta.tables[table].pk,
      ...meta.tables[table].unique,
    ]) {
      const used = new Set<string>();
      for (const row of db[table] as Row[]) {
        if (fields.some((field) => row[field] === null)) continue;
        const key = JSON.stringify(fields.map((field) => row[field]));
        assert(!used.has(key), "Duplicate fixture key in " + table);
        used.add(key);
      }
    }
  }
  for (const ref of meta.refs) {
    const targets = new Set(
      (db[ref.target] as Row[]).map((row) => row[ref.targetField]),
    );
    for (const row of db[ref.table] as Row[])
      if (row[ref.field] !== null)
        assert(
          targets.has(row[ref.field]),
          "Invalid fixture FK: " + ref.table + "." + ref.field,
        );
  }
  const orders = new Map(db.orden_compra.map((order) => [order.id, order]));
  const products = new Map(db.orden_producto.map((line) => [line.id, line]));
  const invoices = new Map(db.factura.map((invoice) => [invoice.id, invoice]));
  for (const receipt of [
    ...db.lote_producto,
    ...db.orden_material,
    ...db.orden_otro,
  ]) {
    if (!receipt.id_factura) continue;
    const line =
      "id_orden_producto" in receipt
        ? products.get(receipt.id_orden_producto)!
        : receipt;
    assert.equal(
      invoices.get(receipt.id_factura)!.id_proveedor,
      orders.get(line.id_orden_compra)!.id_proveedor,
    );
  }
  return {
    passed: true,
    rows,
    schemaKeysAndForeignKeys: true,
    invoiceProviderOwnership: true,
  };
}
const complexity = {
  documento: {
    relations: "orden → documento escaneado",
    naive: "O(N·D)",
    indexed: "O(N+D)",
  },
  sin_factura: {
    relations: "orden → renglones → lotes; recepción material/otros",
    naive: "O(N·(R+L))",
    indexed: "O(N+R+L)",
  },
  entrega_vencida: {
    relations: "fecha de cabecera y renglón abierto",
    naive: "O(N·R)",
    indexed: "O(N+R)",
  },
  proximas: { relations: "fecha de cabecera", naive: "O(N)", indexed: "O(N)" },
  sin_recepciones: {
    relations: "cantidades no nulas de renglones/lotes efectivos",
    naive: "O(N·(R+L))",
    indexed: "O(N+R+L)",
  },
  batch_vencido: {
    relations: "lote: estimación y fecha real BR",
    naive: "O(N·(R+L))",
    indexed: "O(N+R+L)",
  },
  recibido_sin_batch: {
    relations: "mismo lote: recepción física y fecha BR",
    naive: "O(N·(R+L))",
    indexed: "O(N+R+L)",
  },
  inspeccion: {
    relations: "mismo lote: fecha BR y fecha inspección",
    naive: "O(N·(R+L))",
    indexed: "O(N+R+L)",
  },
  recibidos_sin_inspeccion: {
    relations: "mismo lote: recepción física y fecha inspección",
    naive: "O(N·(R+L))",
    indexed: "O(N+R+L)",
  },
  confirmacion: {
    relations: "mismo lote: recepción física y fecha confirmación",
    naive: "O(N·(R+L))",
    indexed: "O(N+R+L)",
  },
  por_cerrar: {
    relations: "renglón abierto y todos sus lotes efectivos",
    naive: "O(N·R+R·L)",
    indexed: "O(N+R+L)",
  },
  vinculos: {
    relations: "relaciones existentes en ambas direcciones",
    naive: "O(N·(R+A))",
    indexed: "O(N+R+A)",
  },
  ocm_pendientes: {
    relations: "renglón producto → vínculo → renglón material",
    naive: "O(N·(R+A)+A·R)",
    indexed: "O(N+R+A)",
  },
};
const fullIntegritySmallFixture = validateDatabase(
  makeOrderPerformanceFixture(60),
);
assert.equal(fullIntegritySmallFixture.lote_producto.length, 60);
const report = {
  generatedAt: new Date().toISOString(),
  fixtureDay: ORDER_PERFORMANCE_DAY,
  environment: {
    node: process.version,
    cpu: cpus()[0]?.model,
    platform: platform(),
    osRelease: release(),
  },
  sourceSha256: sourceHashes,
  methodology: {
    implementation:
      "Actual buildOrderReadModel/filterCustomOrders, including production calendarDay normalization, totals and search text.",
    reference:
      "Independent predicates on grouped raw records; no production summary, date conversion or predicate reused. Group construction timed separately.",
    equivalence:
      "All 17 ordered ID arrays, both fixture sizes; includes the 13 filter families.",
    excluded: [
      "HTTP",
      "React/DOM",
      "disk/database persistence",
      "full JsonStore validation at production sizes",
    ],
    fullIntegritySmallFixture: { passed: true, lotCount: 60 },
    dataPolicy:
      "Only generated in-memory fixtures; never opens data/database.json.",
  },
  browser: {
    status: "pending",
    note: "Complete with the production browser measurements in VERIFICACION.md.",
  },
  scenarios: [] as unknown[],
};
for (const lotCount of [6000, 60000]) {
  const db = makeOrderPerformanceFixture(lotCount);
  const validation = validateFixture(db);
  const originalJson = JSON.stringify(db);
  const before = sha(originalJson);
  const model = buildOrderReadModel(db),
    reference = referenceData(db);
  assert.equal(db.lote_producto.length, lotCount);
  const results = variants.map((variant) => {
    const expected = referenceOrders(db, reference, variant.id).map(
      (order) => order.id,
    );
    const actual = filterCustomOrders(
      model.orders,
      variant.id,
      ORDER_PERFORMANCE_DAY,
    ).map((order) => order.id);
    assert.deepEqual(
      actual,
      expected,
      "Reference mismatch for " + variant.id + " at " + lotCount,
    );
    return {
      id: variant.id,
      label: variant.label,
      matches: actual.length,
      orderedIdsSha256: sha(JSON.stringify(actual)),
      equivalent: true,
      selection: measure(
        () =>
          filterCustomOrders(model.orders, variant.id, ORDER_PERFORMANCE_DAY),
        11,
      ),
      reference: measure(
        () => referenceOrders(db, reference, variant.id),
        3,
        1,
      ),
    };
  });
  for (const doc of db.documento.filter(
    (row) => row.tipo_entidad === "orden_compra",
  ))
    assert.equal(
      model.documentByOrderId.get(doc.id_entidad!),
      doc,
      "Indexed document must preserve record identity",
    );
  assert.equal(
    sha(JSON.stringify(db)),
    before,
    "Read model mutated its fixture",
  );
  const scenario = {
    lotCount,
    counts: Object.fromEntries(
      entities.map((table) => [table, db[table].length]),
    ),
    bytes: Buffer.byteLength(originalJson, "utf8"),
    fixtureSha256: before,
    validation,
    readModel: measure(() => buildOrderReadModel(db), 7, 1),
    snapshotClone: measure(() => structuredClone(db), 7, 1),
    jsonSerialize: measure(() => JSON.stringify(db), 7, 1),
    jsonParse: measure(() => JSON.parse(originalJson), 7, 1),
    referencePreparation: measure(() => referenceData(db), 7, 1),
    documentMapIdentity: true,
    fixtureUnchanged: true,
    variants: results,
    families: customFilters.map((family) => ({
      id: family.id,
      name: family.name,
      ...complexity[family.id as keyof typeof complexity],
      selectionComplexity: "O(N)",
      variants: family.options.map((option) => option.id),
    })),
  };
  report.scenarios.push(scenario);
  console.log(
    JSON.stringify({
      lots: lotCount,
      orders: db.orden_compra.length,
      readModel: scenario.readModel,
      selectionMedianMsRange: [
        Math.min(...results.map((row) => row.selection.medianMs)),
        Math.max(...results.map((row) => row.selection.medianMs)),
      ],
      equivalence: results.filter((row) => row.equivalent).length + "/17",
      fixtureUnchanged: true,
    }),
  );
}
for (const path of sourceFiles)
  assert.equal(
    sha(await readFile(resolve(root, path), "utf8")),
    sourceHashes[path],
    "Source changed during benchmark: rerun.",
  );
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  JSON.stringify({ ...report, checksum }, null, 2) + "\n",
  "utf8",
);
console.log("Benchmark saved: " + output);
