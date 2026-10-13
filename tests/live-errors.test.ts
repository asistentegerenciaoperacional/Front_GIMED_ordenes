import test from "node:test";
import assert from "node:assert/strict";
import { makeSeed, sid } from "../shared/seed";
import {
  entityValidation,
  remainingFieldErrors,
  validEntityField,
  validPrice,
  validationSignature,
} from "../src/live-validation";

test("corregir un campo elimina solo los errores cuyo valor ya es válido", () => {
  const fields = { nombre: "Falta el nombre.", correo: "Correo inválido." };
  const invalid = entityValidation("contacto_interno", {
    nombre: "",
    correo: "incorrecto",
  });
  assert.deepEqual(remainingFieldErrors(fields, invalid), fields);
  assert.deepEqual(
    remainingFieldErrors(
      fields,
      entityValidation("contacto_interno", {
        nombre: "Ana",
        correo: "incorrecto",
      }),
    ),
    { correo: "Correo inválido." },
  );
  assert.deepEqual(
    remainingFieldErrors(
      fields,
      entityValidation("contacto_interno", {
        nombre: "Ana",
        correo: "ana@example.com",
      }),
    ),
    {},
  );
  assert.equal(
    validEntityField("contacto_interno", "nombre", { nombre: "  " }),
    false,
  );
});

test("fechas y cantidades parcialmente corregidas conservan sus errores", () => {
  for (const value of ["24/10", "31/02/2026", "2026-02-31T12:00:00.000Z"])
    assert.equal(
      validEntityField("lote_producto", "fecha_recepcion", {
        fecha_recepcion: value,
      }),
      false,
    );
  for (const value of ["24/10/2026", "2026-10-24T12:00:00.000Z", null])
    assert.equal(
      validEntityField("lote_producto", "fecha_recepcion", {
        fecha_recepcion: value,
      }),
      true,
    );
  for (const value of [1.5, NaN, Infinity])
    assert.equal(
      validEntityField("lote_producto", "cantidad_recibida", {
        cantidad_recibida: value,
      }),
      false,
    );
  assert.equal(
    validEntityField("lote_producto", "cantidad_recibida", {
      cantidad_recibida: 2,
    }),
    true,
  );
});

test("precios corregidos usan la precisión permitida y tolerancia usa su tipo declarado", () => {
  for (const value of ["", "abc", "12.555", "1234567890123.00"])
    assert.equal(validPrice(value), false);
  for (const value of ["0", "12.50", "12,50"])
    assert.equal(validPrice(value), true);
  assert.equal(
    validEntityField("parametros_seguimiento", "margen_tolerancia_pct", {
      margen_tolerancia_pct: 5.555,
    }),
    false,
  );
  assert.equal(
    validEntityField("parametros_seguimiento", "margen_tolerancia_pct", {
      margen_tolerancia_pct: 5.55,
    }),
    true,
  );
});

test("un valor con formato correcto que todavía está duplicado no retira el error", () => {
  const db = makeSeed();
  const material = { id_tipo_material: sid(40), codigo_material: "101" };
  assert.equal(
    validEntityField("materiales", "codigo_material", material, db),
    false,
  );
  assert.equal(
    validEntityField(
      "materiales",
      "codigo_material",
      { ...material, codigo_material: "12" },
      db,
    ),
    false,
  );
  assert.equal(
    validEntityField(
      "materiales",
      "codigo_material",
      { ...material, codigo_material: "901" },
      db,
    ),
    true,
  );
  const existing = db.materiales.find((row) => row.id === sid(50))!;
  assert.equal(
    validEntityField("materiales", "codigo_material", existing, db, existing),
    true,
  );
});

test("la corrección respeta relaciones, proveedor de factura y exclusión sticker/cinta", () => {
  const db = makeSeed();
  assert.equal(
    validEntityField(
      "materiales",
      "id_tipo_material",
      { id_tipo_material: sid(9999) },
      db,
    ),
    false,
  );
  assert.equal(
    validEntityField(
      "lote_producto",
      "id_factura",
      { id_orden_producto: sid(110), id_factura: sid(151) },
      db,
    ),
    false,
  );
  assert.equal(
    validEntityField(
      "lote_producto",
      "id_factura",
      { id_orden_producto: sid(110), id_factura: sid(150) },
      db,
    ),
    true,
  );
  assert.equal(
    validEntityField(
      "materiales_asociados",
      "id_material",
      { id_producto: sid(70), id_material: sid(55) },
      db,
    ),
    false,
  );
  assert.equal(
    validEntityField(
      "materiales_asociados",
      "id_material",
      { id_producto: sid(72), id_material: sid(55) },
      db,
    ),
    true,
  );
});

test("errores de campos desconocidos se conservan y las firmas distinguen cambios anidados", () => {
  const fields = { unknown: "Revisa este dato." };
  assert.deepEqual(
    remainingFieldErrors(
      fields,
      entityValidation("materiales", { codigo_material: "901" }),
    ),
    fields,
  );
  assert.equal(
    validationSignature({ lines: [{ cantidad: 1.5 }] }),
    validationSignature({ lines: [{ cantidad: 1.5 }] }),
  );
  assert.notEqual(
    validationSignature({ lines: [{ cantidad: 1.5 }] }),
    validationSignature({ lines: [{ cantidad: 2 }] }),
  );
  assert.notEqual(
    validationSignature({ cantidad: NaN }),
    validationSignature({ cantidad: null }),
  );
});
