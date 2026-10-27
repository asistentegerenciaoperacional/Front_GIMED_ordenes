import test from "node:test";
import assert from "node:assert/strict";
import { decimal } from "../shared/schema";
import {
  blankSheetLine,
  compactSheetLines,
  isEmptySheetLine,
  indexedOrderLineErrors,
  orderLinePayload,
  padSheetLines,
} from "../src/order-entry-draft";

const fresh = () => ({
  id_producto: "",
  cantidad_solicitada: 0,
  precio_unitario: "0.00",
  sticker_pct: 10,
});
test("Hoja: siete posiciones vacías, claves estables y sin activar los valores por defecto", () => {
  const rows = padSheetLines([], fresh);
  assert.equal(rows.length, 7);
  assert.equal(new Set(rows.map((row) => row._sheet.key)).size, 7);
  assert.ok(rows.every(isEmptySheetLine));
  assert.equal(compactSheetLines(rows).length, 0);
  assert.deepEqual(
    padSheetLines(rows, fresh).map((row) => row._sheet.key),
    rows.map((row) => row._sheet.key),
  );
});
for (const positions of [
  [0, 2],
  [1, 3, 4],
]) {
  test(`Hoja: compacta ${positions.map((index) => index + 1)} sin reordenar ni perder campos`, () => {
    const rows = padSheetLines([], fresh);
    positions.forEach((index) =>
      Object.assign(rows[index], {
        id_producto: `product-${index}`,
        cantidad_solicitada: index + 1,
        precio_unitario: "10.25",
        ref_corrugado: "box",
      }),
    );
    const compact = compactSheetLines(rows);
    assert.deepEqual(
      compact.map((row) => row.id_producto),
      positions.map((index) => `product-${index}`),
    );
    assert.deepEqual(
      compact.map((row) => row._sheet.key),
      positions.map((index) => rows[index]._sheet.key),
    );
    assert.ok(compact.every((row) => row.ref_corrugado === "box"));
    const restored = padSheetLines(compact, fresh);
    assert.deepEqual(restored.slice(0, positions.length), compact);
    assert.ok(restored.slice(positions.length).every(isEmptySheetLine));
    const invalid = compact.map((line, index) => ({
      ...line,
      cantidad_solicitada: index === 0 ? 1.5 : line.cantidad_solicitada,
      precio_unitario:
        index === compact.length - 1 ? "inválido" : line.precio_unitario,
    }));
    const errors = indexedOrderLineErrors(invalid, (line) => {
      const fields: Record<string, string> = {};
      if (!Number.isSafeInteger(line.cantidad_solicitada))
        fields.cantidad_solicitada = "Cantidad inválida";
      try {
        decimal(line.precio_unitario);
      } catch {
        fields.precio_unitario = "Precio inválido";
      }
      return fields;
    });
    assert.deepEqual(errors, {
      "lines.0.cantidad_solicitada": "Cantidad inválida",
      [`lines.${positions.length - 1}.precio_unitario`]: "Precio inválido",
    });
  });
}
for (const [label, update] of [
  ["cero explícito", { cantidad_solicitada: 0 }],
  ["precio cero", { precio_unitario: "0" }],
  ["precio inválido", { precio_unitario: "incorrecto" }],
  ["fracción", { cantidad_solicitada: 1.5 }],
  [
    "búsqueda sin seleccionar",
    { _sheet: { key: "query", query: "sin coincidencias" } },
  ],
  [
    "cantidad inválida",
    { _sheet: { key: "raw", query: "", quantityInput: "abc" } },
  ],
  ["material", { id_material: "material" }],
  ["concepto", { producto: "Servicio" }],
] as const) {
  test(`Hoja: conserva la fila parcial con ${label}`, () => {
    const row = { ...blankSheetLine(fresh), ...update };
    assert.equal(isEmptySheetLine(row), false);
    assert.equal(compactSheetLines([row]).length, 1);
  });
}
test("Hoja: el payload excluye metadatos visuales, conserva orígenes y valores exactos", () => {
  const row = padSheetLines(
    [
      {
        id_material: "material",
        cantidad_solicitada: 12,
        precio_unitario: "1234567890123456.25",
        fuentes: [{ id: "source" }],
        adicional_pct: 5,
      },
    ],
    fresh,
  )[0];
  const payload = orderLinePayload(row);
  assert.equal("_sheet" in payload, false);
  assert.equal(payload.precio_unitario, "1234567890123456.25");
  assert.deepEqual(payload.fuentes, [{ id: "source" }]);
  assert.ok(row._sheet);
});
