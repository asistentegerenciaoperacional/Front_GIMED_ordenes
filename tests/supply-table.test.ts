import test from "node:test";
import assert from "node:assert/strict";
import { makeSeed } from "../shared/seed";
import {
  buildSupplyRows,
  supplyColumns,
  type SupplyColumnKey,
} from "../src/supply-table";
import {
  columnOptions,
  filterTableRows,
  readColumnState,
  sortTableRows,
  tableParams,
  type TableState,
} from "../src/order-table";

test("vínculos: filtros numéricos separados para OC y OCM, combinables sin perder relaciones", () => {
  const db = makeSeed();
  const before = structuredClone(db);
  const rows = buildSupplyRows(db);
  const first = rows[0];
  const filtered = filterTableRows(rows, supplyColumns, {
    producto_orden: { operator: "equals", value: first.po.no_orden },
    material_orden: { selected: [first.mo.no_orden] },
  });
  assert.ok(filtered.length > 0);
  assert.ok(
    filtered.every(
      (row) =>
        row.po.no_orden === first.po.no_orden &&
        row.mo.no_orden === first.mo.no_orden,
    ),
  );
  assert.ok(
    columnOptions(rows, supplyColumns[0]).every((option) =>
      /^OC \d+$/.test(option.label),
    ),
  );
  assert.ok(
    columnOptions(rows, supplyColumns[2]).every((option) =>
      /^OCM \d+$/.test(option.label),
    ),
  );
  assert.deepEqual(db, before);
});

test("vínculos: texto de producto, material, maquilador y proveedor; estado y selección múltiple", () => {
  const rows = buildSupplyRows(makeSeed());
  const first = rows[0];
  for (const [key, value] of [
    ["producto", first.productName],
    ["producto", first.manufacturerName],
    ["material", first.materialName],
    ["material", first.supplierName],
  ] as const) {
    const result = filterTableRows(rows, supplyColumns, {
      [key]: { operator: "contains", value },
    });
    assert.ok(result.length > 0);
    assert.ok(result.includes(first));
  }
  const states = [...new Set(rows.map((row) => row.m.estado))];
  assert.equal(
    filterTableRows(rows, supplyColumns, { estado: { selected: states } })
      .length,
    rows.length,
  );
  assert.equal(
    filterTableRows(rows, supplyColumns, { producto: { selected: [] } }).length,
    0,
  );
});

test("vínculos: ordenamiento numérico y URL conservan las columnas y rechazan condiciones de otro tipo", () => {
  const rows = buildSupplyRows(makeSeed());
  const sorted = sortTableRows(rows, supplyColumns, {
    column: "material_orden",
    direction: "desc",
  });
  assert.ok(
    sorted.every(
      (row, index) =>
        index === 0 ||
        Number(row.mo.no_orden) <= Number(sorted[index - 1].mo.no_orden),
    ),
  );
  const state: TableState<SupplyColumnKey> = {
    filters: { material_orden: { selected: [rows[0].mo.no_orden] } },
    sort: { column: "producto_orden" as const, direction: "asc" as const },
  };
  assert.deepEqual(
    readColumnState(new URLSearchParams(tableParams(state)), supplyColumns),
    state,
  );
  assert.deepEqual(
    readColumnState(
      new URLSearchParams({
        filtros: JSON.stringify({
          material_orden: { operator: "contains", value: "1601" },
          numero: { selected: ["Factura"] },
        }),
      }),
      supplyColumns,
    ).filters,
    {},
  );
});
