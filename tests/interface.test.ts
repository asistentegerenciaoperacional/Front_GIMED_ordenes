import test from "node:test";
import assert from "node:assert/strict";
import { parseDateInput, formatDateInput, maskDateInput } from "../src/dates";
import { normalizeRoute } from "../src/routing";

test("fechas digitadas: formato colombiano e ISO, bisiestos y rechazo de días inexistentes o parciales", () => {
  assert.equal(parseDateInput("6/10/2026"), "2026-10-06");
  assert.equal(parseDateInput("2026-10-06"), "2026-10-06");
  assert.equal(formatDateInput("2026-10-06"), "06/10/2026");
  assert.equal(parseDateInput("29/02/2028"), "2028-02-29");
  for (const invalid of [
    "29/02/2026",
    "31/04/2026",
    "2026-13-01",
    "0/10/2026",
    "06/10",
    "",
    "1/1/0000",
  ])
    assert.equal(parseDateInput(invalid), null);
});

test("rutas de órdenes: la entrada principal abre productos y los enlaces antiguos mantienen el grupo", () => {
  assert.equal(normalizeRoute("ordenes"), "ordenes/productos");
  assert.equal(
    normalizeRoute("/ordenes/materiales?tipo=otro"),
    "ordenes/materiales?tipo=otro",
  );
  assert.equal(
    normalizeRoute("ordenes?tipo=material"),
    "ordenes/materiales?tipo=material",
  );
  assert.equal(
    normalizeRoute("ordenes?tipo=otro"),
    "ordenes/materiales?tipo=otro",
  );
  assert.equal(
    normalizeRoute("ordenes/productos?q=2801"),
    "ordenes/productos?q=2801",
  );
});

test("fechas: separadores y avance automáticos, pegado ISO y edición sin desplazar los otros segmentos", () => {
  for (const [raw, formatted] of [
    ["2", "2"],
    ["20", "20/"],
    ["20/1", "20/1"],
    ["20/10", "20/10/"],
    ["20/10/2026", "20/10/2026"],
    ["20102026", "20/10/2026"],
    ["2026-10-20", "20/10/2026"],
    ["2026-02-31", "31/02/2026"],
    ["", ""],
  ])
    assert.equal(maskDateInput(raw).value, formatted);
  assert.equal(maskDateInput("20").caret, 3);
  assert.equal(maskDateInput("20/10").caret, 6);
  assert.deepEqual(maskDateInput("20/1/2026", 4), {
    value: "20/1/2026",
    caret: 4,
  });
  assert.deepEqual(maskDateInput("20/11/2026", 5), {
    value: "20/11/2026",
    caret: 6,
  });
  assert.deepEqual(maskDateInput("20/10", 5, true), {
    value: "20/10",
    caret: 5,
  });
  assert.deepEqual(maskDateInput("20/1/2026", 4, true), {
    value: "20/1/2026",
    caret: 4,
  });
  assert.equal(parseDateInput(maskDateInput("31022026").value), null);
});
