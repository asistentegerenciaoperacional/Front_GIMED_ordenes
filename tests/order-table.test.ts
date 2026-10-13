import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_VALUE,
  calendarDay,
  columnOptions,
  filterColumnRows,
  filterProblem,
  hasFilter,
  matchesColumn,
  numericValue,
  orderColumns,
  readTableState,
  sortColumnRows,
  tableParams,
  type Column,
  type ColumnCell,
  type ColumnKey,
  type ColumnRow,
  type TableState,
} from "../src/order-table";

const column = (key: ColumnKey): Column =>
  orderColumns.find((c) => c.key === key)!;
const cell = (
  value: string | null,
  key = value ?? EMPTY_VALUE,
): ColumnCell => ({
  values: [{ key, value, label: value ?? "Sin fecha" }],
  sortValue: value,
});
const row = (id: string, changes: Partial<ColumnRow["cells"]> = {}) => ({
  id,
  cells: {
    orden: cell("10"),
    proveedor: cell("Aurora", "supplier-a"),
    productos: cell("Crema", "product-1"),
    elaboracion: cell("2026-09-21"),
    entrega: cell("2026-10-15"),
    estado: cell("autorizada"),
    total: cell("1000.00"),
    ...changes,
  },
});
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

test("selección de valores: unión dentro de la columna e intersección entre columnas", () => {
  const rows = [
    row("a"),
    row("b", { proveedor: cell("Andina", "supplier-b") }),
    row("c", {
      proveedor: cell("Andina", "supplier-b"),
      estado: cell("cerrada"),
    }),
  ];
  assert.deepEqual(
    ids(
      filterColumnRows(rows, {
        proveedor: { selected: ["supplier-a", "supplier-b"] },
        estado: { selected: ["autorizada"] },
      }),
    ),
    ["a", "b"],
  );
  assert.equal(
    filterColumnRows(rows, { proveedor: { selected: [] } }).length,
    0,
  );
  assert.equal(hasFilter({ selected: [] }), true);
  assert.deepEqual(ids(filterColumnRows(rows, {})), ["a", "b", "c"]);
});

test("productos: se filtran todos los renglones y las condiciones negativas excluyen cualquier coincidencia", () => {
  const products: ColumnCell = {
    sortValue: "Crema",
    values: [
      { key: "p1", value: "Crema", label: "Crema" },
      { key: "p2", value: "Loción · 250 ml", label: "Loción · 250 ml" },
    ],
  };
  assert.equal(
    matchesColumn(products, column("productos"), { selected: ["p2"] }),
    true,
  );
  assert.equal(
    matchesColumn(products, column("productos"), {
      operator: "contains",
      value: "LOCION",
    }),
    true,
  );
  assert.equal(
    matchesColumn(products, column("productos"), {
      operator: "not_contains",
      value: "locion",
    }),
    false,
  );
  assert.equal(
    matchesColumn(products, column("productos"), {
      operator: "not_equals",
      value: "crema",
    }),
    false,
  );
  assert.equal(
    matchesColumn(products, column("productos"), {
      operator: "starts_with",
      value: "Loc",
    }),
    true,
  );
  assert.equal(
    matchesColumn(products, column("productos"), {
      operator: "ends_with",
      value: "250 ml",
    }),
    true,
  );
});

test("proveedor: nombres y NIT disponibles para condiciones, sin afectar la búsqueda global", () => {
  const supplier = {
    ...cell("Andina", "supplier-b"),
    searchValues: ["Andina", "Laboratorios Andina S.A.S.", "900123402"],
  };
  assert.equal(
    matchesColumn(supplier, column("proveedor"), {
      operator: "contains",
      value: "900123",
    }),
    true,
  );
  assert.equal(
    matchesColumn(supplier, column("proveedor"), {
      operator: "equals",
      value: "Andina",
    }),
    true,
  );
  assert.equal(
    matchesColumn(supplier, column("proveedor"), {
      selected: ["supplier-a"],
      operator: "contains",
      value: "Andina",
    }),
    false,
  );
});

test("importe: centavos y rangos inclusivos se comparan exactamente incluso fuera del entero seguro", () => {
  assert.equal(
    numericValue("9999999999999999,99", "decimal"),
    999999999999999999n,
  );
  assert.equal(numericValue("-0.50", "decimal"), -50n);
  assert.equal(numericValue("1.001", "decimal"), null);
  assert.equal(numericValue("1.000,00", "decimal"), null);
  assert.equal(numericValue("12.1", "integer"), null);
  const value = cell("9999999999999999.99");
  assert.equal(
    matchesColumn(value, column("total"), {
      operator: "greater",
      value: "9999999999999999.98",
    }),
    true,
  );
  assert.equal(
    matchesColumn(value, column("total"), {
      operator: "equals",
      value: "9999999999999999,99",
    }),
    true,
  );
  assert.equal(
    matchesColumn(cell("10.50"), column("total"), {
      operator: "between",
      value: "10,50",
      end: "20",
    }),
    true,
  );
  assert.equal(
    matchesColumn(cell("20.00"), column("total"), {
      operator: "between",
      value: "10.50",
      end: "20",
    }),
    true,
  );
});

test("fechas: día visible en Bogotá, intervalo inclusivo y valores sin fecha", () => {
  assert.equal(calendarDay("2026-10-16T00:30:00Z"), "2026-10-15");
  assert.equal(calendarDay("2026-10-16T00:30:00-05:00"), "2026-10-16");
  assert.equal(calendarDay("2026-10-15"), "2026-10-15");
  assert.equal(calendarDay(null), null);
  assert.equal(calendarDay("invalid"), null);
  const date = cell("2026-10-15");
  assert.equal(
    matchesColumn(date, column("entrega"), {
      operator: "between",
      value: "15/10/2026",
      end: "2026-10-20",
    }),
    true,
  );
  assert.equal(
    matchesColumn(date, column("entrega"), {
      operator: "less",
      value: "16/10/2026",
    }),
    true,
  );
  assert.equal(
    matchesColumn(cell(null), column("entrega"), { operator: "empty" }),
    true,
  );
  assert.equal(
    matchesColumn(cell(null), column("entrega"), { selected: [EMPTY_VALUE] }),
    true,
  );
  assert.equal(
    matchesColumn(cell(null), column("entrega"), { operator: "not_empty" }),
    false,
  );
});

test("condiciones: se rechazan fechas inexistentes, números inválidos e intervalos invertidos", () => {
  assert.ok(
    filterProblem(column("entrega"), {
      operator: "equals",
      value: "31/02/2026",
    }),
  );
  assert.ok(
    filterProblem(column("elaboracion"), {
      operator: "between",
      value: "20/10/2026",
      end: "15/10/2026",
    }),
  );
  assert.ok(
    filterProblem(column("total"), {
      operator: "between",
      value: "20.00",
      end: "19.99",
    }),
  );
  assert.ok(
    filterProblem(column("orden"), { operator: "equals", value: "1.5" }),
  );
  assert.ok(
    filterProblem(column("proveedor"), { operator: "contains", value: "   " }),
  );
  assert.ok(
    filterProblem(column("estado"), {
      operator: "contains",
      value: "autorizada",
    }),
  );
});

test("opciones: valores únicos, orden numérico y fechas vacías al final", () => {
  const rows = [
    row("a", { orden: cell("100") }),
    row("b", { orden: cell("2") }),
    row("c", { orden: cell("10"), entrega: cell(null) }),
    row("d", { orden: cell("2") }),
  ];
  assert.deepEqual(
    columnOptions(rows, column("orden")).map((v) => v.value),
    ["2", "10", "100"],
  );
  assert.deepEqual(
    columnOptions(rows, column("entrega")).map((v) => v.value),
    ["2026-10-15", null],
  );
});

test("opciones disponibles: respetan otras columnas y omiten el filtro de la propia columna", () => {
  const rows = [
    row("a"),
    row("b", { proveedor: cell("Andina", "supplier-b") }),
    row("c", {
      proveedor: cell("Punto", "supplier-c"),
      estado: cell("cerrada"),
    }),
  ];
  const filters = {
    proveedor: { selected: ["supplier-a"] },
    estado: { selected: ["autorizada"] },
  };
  assert.deepEqual(
    columnOptions(
      filterColumnRows(rows, filters, "proveedor"),
      column("proveedor"),
    ).map((v) => v.key),
    ["supplier-b", "supplier-a"],
  );
  assert.deepEqual(ids(filterColumnRows(rows, filters)), ["a"]);
});

test("ordenamiento: números de OC, importes exactos y desempate estable sin mutar la lista", () => {
  const rows = [
    row("a", { orden: cell("100"), total: cell("9999999999999999.99") }),
    row("b", { orden: cell("2"), total: cell("9999999999999999.98") }),
    row("c", { orden: cell("10"), total: cell("9999999999999999.98") }),
  ];
  assert.deepEqual(
    ids(sortColumnRows(rows, { column: "orden", direction: "asc" })),
    ["b", "c", "a"],
  );
  assert.deepEqual(
    ids(sortColumnRows(rows, { column: "orden", direction: "desc" })),
    ["a", "c", "b"],
  );
  assert.deepEqual(
    ids(sortColumnRows(rows, { column: "total", direction: "asc" })),
    ["b", "c", "a"],
  );
  assert.deepEqual(ids(rows), ["a", "b", "c"]);
  assert.equal(sortColumnRows(rows), rows);
});

test("ordenamiento: fechas cronológicas y vacíos al final en ambas direcciones; texto según español", () => {
  const rows = [
    row("a", { entrega: cell(null), proveedor: cell("Caja 10") }),
    row("b", { entrega: cell("2027-01-19"), proveedor: cell("Ámbar") }),
    row("c", { entrega: cell("2026-10-18"), proveedor: cell("Caja 2") }),
  ];
  assert.deepEqual(
    ids(sortColumnRows(rows, { column: "entrega", direction: "asc" })),
    ["c", "b", "a"],
  );
  assert.deepEqual(
    ids(sortColumnRows(rows, { column: "entrega", direction: "desc" })),
    ["b", "c", "a"],
  );
  assert.deepEqual(
    ids(sortColumnRows(rows, { column: "proveedor", direction: "asc" })),
    ["b", "c", "a"],
  );
});

test("URL: conserva selección, condiciones y ordenamiento; acepta enlaces de estado anteriores", () => {
  const current: TableState = {
    filters: {
      entrega: { operator: "between", value: "15/10/2026", end: "20/10/2026" },
      proveedor: { selected: ["a", "b"] },
      estado: { selected: [] },
    },
    sort: { column: "total", direction: "desc" },
  };
  assert.deepEqual(
    readTableState(new URLSearchParams(tableParams(current))),
    current,
  );
  assert.deepEqual(readTableState(new URLSearchParams("estado=cerrada")), {
    filters: { estado: { selected: ["cerrada"] } },
    sort: undefined,
  });
  assert.equal(tableParams({ filters: {} }).filtros, "");
});

test("URL inválida: no bloquea la tabla ni permite operadores impropios; conserva selecciones válidas", () => {
  for (const raw of ["{", "null", "[]", "42", '"texto"'])
    assert.deepEqual(
      readTableState(
        new URLSearchParams({ filtros: raw, ordenar: "bad", direccion: "asc" }),
      ),
      { filters: {}, sort: undefined },
    );
  assert.deepEqual(
    readTableState(
      new URLSearchParams({
        filtros: JSON.stringify({
          total: { operator: "contains", value: "500" },
          entrega: {
            selected: [EMPTY_VALUE, EMPTY_VALUE],
            operator: "equals",
            value: "31/02/2026",
          },
          proveedor: { selected: [123] },
          desconocida: { selected: ["a"] },
        }),
      }),
    ),
    { filters: { entrega: { selected: [EMPTY_VALUE] } }, sort: undefined },
  );
});
