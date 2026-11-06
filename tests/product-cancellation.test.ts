import test from "node:test";
import assert from "node:assert/strict";
import { makeSeed, sid } from "../shared/seed";
import { productLotLifecycleSnapshot } from "../shared/product-lot-lifecycle";
import { cancellationMessage, cancellationProducts } from "../src/product-cancellation";

test("mensajes de anulación distinguen lote parcial, último y producto", () => {
  const db = makeSeed();
  const expected = productLotLifecycleSnapshot(db, [sid(110)]);
  assert.ok(expected[0].lotes.length >= 2);
  const ids = expected[0].lotes.map((lot) => lot.id);
  const partial = cancellationMessage(db, "lot", expected, [ids[0]]);
  assert.equal(
    partial,
    "Se anulará el lote seleccionado. La información de los lotes se conservará. ¿Está seguro?",
  );
  assert.deepEqual(cancellationProducts(db, expected, [ids[0]]), []);
  const last = cancellationMessage(db, "lot", expected, ids);
  assert.match(
    last,
    /Esta acción anulará el último lote y también el producto/,
  );
  assert.equal(cancellationProducts(db, expected, ids).length, 1);
  assert.equal(
    cancellationMessage(db, "product", expected),
    "Se anulará el producto y todos sus lotes. La información de los lotes se conservará. ¿Está seguro?",
  );
});

test("selección múltiple identifica únicamente productos que quedan sin lotes vigentes", () => {
  const db = makeSeed();
  const sibling = db.lote_producto.find(
    (lot) => lot.id_orden_producto === sid(111),
  )!;
  db.lote_producto.push({
    ...sibling,
    id: sid(9999),
    estado: "en_seguimiento",
  });
  const expected = productLotLifecycleSnapshot(db, [sid(110), sid(111)]);
  assert.equal(expected.length, 2);
  const ids = [
    ...expected[0].lotes.map((lot) => lot.id),
    expected[1].lotes[0].id,
  ];
  const message = cancellationMessage(db, "lot", expected, ids);
  assert.match(message, /Se anularán los lotes seleccionados/);
  const line = db.orden_producto.find((row) => row.id === expected[0].id)!;
  const order = db.orden_compra.find((row) => row.id === line.id_orden_compra)!;
  const product = db.productos.find((row) => row.id === line.id_producto)!;
  assert.deepEqual(cancellationProducts(db, expected, ids), [
    `OC ${order.no_orden}, ${product.nombre_producto}`,
  ]);
  const allIds = expected.flatMap((line) => line.lotes.map((lot) => lot.id));
  assert.equal(cancellationProducts(db, expected, allIds).length, 2);
  assert.doesNotMatch(message, /renglón/i);
});
