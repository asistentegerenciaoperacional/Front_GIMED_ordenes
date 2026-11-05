import test from "node:test";
import assert from "node:assert/strict";
import { command } from "../server/domain";
import { validateDatabase } from "../server/integrity";
import { makeSeed, sid } from "../shared/seed";
import {
  productStateFromLots,
  syncProductLineStates,
} from "../shared/product-line-state";
import { productLotLifecycleSnapshot } from "../shared/product-lot-lifecycle";
import { cancellationMessage } from "../src/product-cancellation";
import type { lote_producto } from "../shared/models";

test("prioridad de estados: seguimiento, cerrado, anulado; incluye cerrado con tres anulados y conjunto vacío", () => {
  const cases: [lote_producto["estado"][], string][] = [
    [[], "anulada"],
    [["anulado"], "anulada"],
    [["anulado", "anulado"], "anulada"],
    [["cerrado"], "cerrada"],
    [["cerrado", "anulado", "anulado", "anulado"], "cerrada"],
    [["en_seguimiento"], "en_seguimiento"],
    [["anulado", "cerrado", "en_seguimiento"], "en_seguimiento"],
  ];
  for (const [states, expected] of cases)
    assert.equal(
      productStateFromLots(states.map((estado) => ({ estado }))),
      expected,
    );
});

test("semilla consistente y sincronización limitada a los propietarios afectados", () => {
  const db = makeSeed();
  for (const line of db.orden_producto)
    assert.equal(
      line.estado,
      productStateFromLots(
        db.lote_producto.filter((lot) => lot.id_orden_producto === line.id),
      ),
    );
  db.orden_producto[0].estado = "anulada";
  const other = db.orden_producto[1];
  other.estado = "anulada";
  syncProductLineStates(db, [db.orden_producto[0].id]);
  assert.equal(db.orden_producto[0].estado, "en_seguimiento");
  assert.equal(other.estado, "anulada");
});

test("anular el último abierto cierra si hay hermanos cerrados y el aviso distingue el resultado", async () => {
  const db = makeSeed();
  const expected = productLotLifecycleSnapshot(db, [sid(110)]);
  const message = cancellationMessage(db, "lot", expected, [sid(161)]);
  assert.match(message, /producto quedará cerrado/);
  assert.doesNotMatch(message, /también el producto/);
  await command(db, "setProductLotStates", {
    ids: [sid(161)],
    estado: "anulado",
    expected,
    confirm: true,
  });
  assert.equal(
    db.orden_producto.find((line) => line.id === sid(110))!.estado,
    "cerrada",
  );
  validateDatabase(db);
});

test("borrar el último abierto deja cerrado, borrar el cerrado deja anulado, crear lote reactiva sin tocar hermanos", async () => {
  const db = makeSeed();
  const getLine = () => db.orden_producto.find((line) => line.id === sid(110))!;
  await command(db, "deleteLot", { id: sid(161), confirm: true });
  assert.equal(getLine().estado, "cerrada");
  await command(db, "deleteLot", { id: sid(160), confirm: true });
  assert.equal(getLine().estado, "anulada");
  const others = structuredClone(db.lote_producto);
  const added = await command(db, "saveLot", {
    row: { id_orden_producto: sid(110) },
  });
  assert.equal(getLine().estado, "en_seguimiento");
  assert.equal(added.row.estado, "en_seguimiento");
  assert.deepEqual(
    db.lote_producto.filter((lot) => lot.id !== added.row.id),
    others,
  );
  validateDatabase(db);
});

test("crear varios lotes sobre productos cerrados y anulados reactiva solo sus propietarios", async () => {
  const db = makeSeed();
  const originals = structuredClone(db.lote_producto);
  await command(db, "createProductLots", {
    rows: [sid(113), sid(115)].map((id_orden_producto) => ({
      id_orden_producto,
    })),
  });
  for (const id of [sid(113), sid(115)])
    assert.equal(
      db.orden_producto.find((line) => line.id === id)!.estado,
      "en_seguimiento",
    );
  assert.deepEqual(db.lote_producto.slice(0, originals.length), originals);
  validateDatabase(db);
});
