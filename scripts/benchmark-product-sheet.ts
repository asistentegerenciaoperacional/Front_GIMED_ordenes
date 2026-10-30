import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { makeSeed } from "../shared/seed";
import {
  buildProductSheet,
  productSheetColumns,
} from "../src/product-order-sheet-model";
import { filterTableRows, sortTableRows } from "../src/order-table";
import { overlaySheetChanges } from "../shared/product-order-sheet";

const stage = process.argv[2] ?? "after";
if (!["before", "after"].includes(stage)) throw new Error("Etapa inválida");
const output = [];
for (const count of [5000, 20000]) {
  const db = makeSeed();
  const source = buildProductSheet(db, "seguimiento").find(
    (row) => row.line.estado === "en_seguimiento",
  )!.lot!;
  for (let index = 0; index < count; index++)
    db.lote_producto.push({
      ...source,
      id: (800000 + index).toString(16).padStart(24, "0"),
      numero_lote: `BENCH-${index}`,
      cantidad_recibida: null,
      estado: "en_seguimiento",
    });
  const measure = (name: string, operation: () => unknown) => {
    operation();
    const timings = [];
    for (let index = 0; index < 5; index++) {
      const start = performance.now();
      operation();
      timings.push(performance.now() - start);
    }
    timings.sort((a, b) => a - b);
    return {
      name,
      medianMs: Number(timings[2].toFixed(2)),
      maxMs: Number(timings[4].toFixed(2)),
    };
  };
  const measurements = [
    measure("build", () => buildProductSheet(db, "seguimiento")),
    measure("buildAndNoFilters", () =>
      filterTableRows(
        buildProductSheet(db, "seguimiento"),
        productSheetColumns,
        {},
      ),
    ),
    measure("buildAndOneFilter", () =>
      filterTableRows(
        buildProductSheet(db, "seguimiento"),
        productSheetColumns,
        { numero_lote: { operator: "contains", value: "BENCH" } },
      ),
    ),
    measure("buildFilterAndSort", () =>
      sortTableRows(
        filterTableRows(
          buildProductSheet(db, "seguimiento"),
          productSheetColumns,
          {},
        ),
        productSheetColumns,
        { column: "cantidad_solicitada", direction: "desc" },
      ),
    ),
  ];
  output.push({
    lots: count,
    measurements,
    emptyOverlayPreservesIdentity: overlaySheetChanges(db, []) === db,
  });
}
await mkdir("tests/evidence/product-sheet-performance", { recursive: true });
const report = { stage, node: process.version, samples: 5, output };
await writeFile(
  `tests/evidence/product-sheet-performance/model-${stage}.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
