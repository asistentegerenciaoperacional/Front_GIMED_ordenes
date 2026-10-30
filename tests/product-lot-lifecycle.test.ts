import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { command } from "../server/domain";
import { BusinessError } from "../server/integrity";
import { JsonStore } from "../server/store";
import { sid } from "../shared/seed";
import {
  matchesProductLotLifecycleSnapshot,
  productLotLifecycleSnapshot,
} from "../shared/product-lot-lifecycle";
import type { Database } from "../shared/models";
import type { Row } from "../shared/schema";

const base = resolve("tests/.tmp");
async function fixture(t: test.TestContext) {
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, "lot-state-"));
  assert.ok(resolve(directory).startsWith(base + sep));
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(base + sep));
    await rm(directory, { recursive: true, force: true });
  });
  return JsonStore.open(join(directory, "database.json"));
}
const execute = (store: JsonStore, name: string, payload: Row) =>
  store.transaction((db) => command(db, name, payload));
async function rejected(
  store: JsonStore,
  name: string,
  payload: Row,
  code: string,
) {
  const before = store.snapshot();
  const file = await readFile(store.file, "utf8");
  let failure: BusinessError | undefined;
  await assert.rejects(execute(store, name, payload), (error: unknown) => {
    if (!(error instanceof BusinessError) || error.code !== code) return false;
    failure = error;
    return true;
  });
  assert.deepEqual(store.snapshot(), before);
  assert.equal(await readFile(store.file, "utf8"), file);
  return failure!;
}
function changedStates(
  before: Database,
  lots: Record<string, string>,
  lines: Record<string, string>,
) {
  return {
    ...before,
    lote_producto: before.lote_producto.map((row) =>
      lots[row.id] ? { ...row, estado: lots[row.id] } : row,
    ),
    orden_producto: before.orden_producto.map((row) =>
      lines[row.id] ? { ...row, estado: lines[row.id] } : row,
    ),
  };
}

test("anulación de todos los lotes: confirma productos afectados, conserva datos e IDs y persiste sin guardado parcial", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const payload = { ids: [sid(160), sid(161)], estado: "anulado" };
  const failure = await rejected(
    store,
    "setProductLotStates",
    payload,
    "CONFIRMATION",
  );
  assert.equal(failure.details.products.length, 1);
  assert.equal(failure.details.products[0].id, sid(110));
  assert.equal(failure.details.products[0].no_orden, "2801");
  await rejected(
    store,
    "setProductLotStates",
    { ...payload, confirm: true },
    "CONFIRMATION",
  );
  await execute(store, "setProductLotStates", {
    ...payload,
    expected: failure.details.expected,
    confirm: true,
  });
  assert.deepEqual(
    store.snapshot(),
    changedStates(
      before,
      { [sid(160)]: "anulado", [sid(161)]: "anulado" },
      { [sid(110)]: "anulada" },
    ),
  );
  assert.deepEqual(
    (await JsonStore.open(store.file)).snapshot(),
    store.snapshot(),
  );
  const saved = store.snapshot();
  await execute(store, "setProductLotStates", payload);
  assert.deepEqual(store.snapshot(), saved);
});

test("anular algunos lotes no anula el producto; reabrir uno reactiva su producto sin cambiar otros lotes", async (t) => {
  const store = await fixture(t);
  let before = store.snapshot();
  await execute(store, "setProductLotStates", {
    ids: [sid(160)],
    estado: "anulado",
    expected: productLotLifecycleSnapshot(before, [sid(110)]),
  });
  assert.deepEqual(
    store.snapshot(),
    changedStates(before, { [sid(160)]: "anulado" }, {}),
  );
  await rejected(
    store,
    "setProductLotStates",
    { ids: [sid(160)], estado: "cerrado" },
    "VALIDATION",
  );
  before = store.snapshot();
  await execute(store, "setProductLotStates", {
    ids: [sid(164)],
    estado: "en_seguimiento",
    expected: productLotLifecycleSnapshot(before, [sid(113)]),
  });
  assert.deepEqual(
    store.snapshot(),
    changedStates(
      before,
      { [sid(164)]: "en_seguimiento" },
      { [sid(113)]: "en_seguimiento" },
    ),
  );
  assert.equal(
    store.snapshot().lote_producto.find((lot) => lot.id === sid(165))!.estado,
    "anulado",
  );
});

test("la confirmación masiva enumera todos los productos cuyo último lote se anula y rechaza snapshots incompletos", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const payload = { ids: [sid(160), sid(161), sid(162)], estado: "anulado" };
  const failure = await rejected(
    store,
    "setProductLotStates",
    payload,
    "CONFIRMATION",
  );
  assert.deepEqual(
    failure.details.products.map((product: Row) => product.id),
    [sid(110), sid(115)],
  );
  await rejected(
    store,
    "setProductLotStates",
    {
      ...payload,
      confirm: true,
      expected: productLotLifecycleSnapshot(before, [sid(110)]),
    },
    "LOT_STATE_CHANGED",
  );
  await execute(store, "setProductLotStates", {
    ...payload,
    confirm: true,
    expected: failure.details.expected,
  });
  assert.deepEqual(
    store.snapshot(),
    changedStates(
      before,
      { [sid(160)]: "anulado", [sid(161)]: "anulado", [sid(162)]: "anulado" },
      { [sid(110)]: "anulada", [sid(115)]: "anulada" },
    ),
  );
});

test("eliminar físicamente el último lote no anulado anula el renglón sin borrar sus otros lotes", async (t) => {
  const store = await fixture(t);
  await execute(store, "setProductLotStates", {
    ids: [sid(160)],
    estado: "anulado",
  });
  const before = store.snapshot();
  await execute(store, "deleteLot", { id: sid(161), confirm: true });
  const expected = changedStates(before, {}, { [sid(110)]: "anulada" });
  expected.lote_producto = expected.lote_producto.filter(
    (lot) => lot.id !== sid(161),
  );
  assert.deepEqual(store.snapshot(), expected);
});

test("anular/reabrir renglón propaga estados sin alterar cantidades, facturas, fechas, documentos, vínculos u orden de lotes", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const expected = productLotLifecycleSnapshot(before, [sid(110)]);
  await rejected(
    store,
    "setLineState",
    { entity: "orden_producto", id: sid(110), estado: "anulada", expected },
    "CONFIRMATION",
  );
  await execute(store, "setLineState", {
    entity: "orden_producto",
    id: sid(110),
    estado: "anulada",
    expected,
    confirm: true,
  });
  const annulled = store.snapshot();
  assert.deepEqual(
    annulled,
    changedStates(
      before,
      { [sid(160)]: "anulado", [sid(161)]: "anulado" },
      { [sid(110)]: "anulada" },
    ),
  );
  await execute(store, "setLineState", {
    entity: "orden_producto",
    id: sid(110),
    estado: "en_seguimiento",
    expected: productLotLifecycleSnapshot(annulled, [sid(110)]),
  });
  assert.deepEqual(
    store.snapshot(),
    changedStates(
      before,
      { [sid(160)]: "en_seguimiento", [sid(161)]: "en_seguimiento" },
      { [sid(110)]: "en_seguimiento" },
    ),
  );
  const reopened = store.snapshot();
  await execute(store, "setLineState", {
    entity: "orden_producto",
    id: sid(110),
    estado: "en_seguimiento",
  });
  assert.deepEqual(store.snapshot(), reopened);
});

test("saveLot clásico comparte confirmación del último lote y reapertura inversa sin recrearlo", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const original = before.lote_producto.find((lot) => lot.id === sid(162))!;
  const row = { ...original, estado: "anulado" };
  const failure = await rejected(store, "saveLot", { row }, "CONFIRMATION");
  await execute(store, "saveLot", {
    row,
    confirm: true,
    expected: failure.details.expected,
  });
  assert.deepEqual(
    store.snapshot(),
    changedStates(before, { [sid(162)]: "anulado" }, { [sid(115)]: "anulada" }),
  );
  await execute(store, "saveLot", {
    row: { ...row, estado: "en_seguimiento" },
    expected: productLotLifecycleSnapshot(store.snapshot(), [sid(115)]),
  });
  assert.deepEqual(
    store.snapshot(),
    changedStates(
      before,
      { [sid(162)]: "en_seguimiento" },
      { [sid(115)]: "en_seguimiento" },
    ),
  );
});

test("confirmación obsoleta detecta estados de lotes hermanos o conjunto modificado y no sobrescribe", async (t) => {
  const store = await fixture(t);
  const initial = store.snapshot();
  const payload = {
    ids: [sid(160), sid(161)],
    estado: "anulado",
    expected: productLotLifecycleSnapshot(initial, [sid(110)]),
    confirm: true,
  };
  await execute(store, "setProductLotStates", {
    ids: [sid(161)],
    estado: "cerrado",
  });
  await rejected(store, "setProductLotStates", payload, "LOT_STATE_CHANGED");
  const current = productLotLifecycleSnapshot(store.snapshot(), [sid(110)]);
  await execute(store, "saveLot", { row: { id_orden_producto: sid(110) } });
  await rejected(
    store,
    "setProductLotStates",
    { ...payload, expected: current },
    "LOT_STATE_CHANGED",
  );
  await rejected(
    store,
    "setLineState",
    {
      entity: "orden_producto",
      id: sid(110),
      estado: "anulada",
      expected: current,
      confirm: true,
    },
    "LOT_STATE_CHANGED",
  );
  await rejected(
    store,
    "saveLot",
    {
      row: {
        ...initial.lote_producto.find((lot) => lot.id === sid(160)),
        estado: "anulado",
      },
      expected: current,
      confirm: true,
    },
    "LOT_STATE_CHANGED",
  );
});

test("dos confirmaciones concurrentes con el mismo snapshot: solo una aplica y la otra exige revisar", async (t) => {
  const store = await fixture(t);
  const payload = {
    ids: [sid(160), sid(161)],
    estado: "anulado",
    expected: productLotLifecycleSnapshot(store.snapshot(), [sid(110)]),
    confirm: true,
  };
  const results = await Promise.allSettled([
    execute(store, "setProductLotStates", payload),
    execute(store, "setProductLotStates", payload),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const failure = results.find(
    (result) => result.status === "rejected",
  ) as PromiseRejectedResult;
  assert.equal(failure.reason.code, "LOT_STATE_CHANGED");
  assert.equal(
    store
      .snapshot()
      .lote_producto.filter((lot) => lot.id_orden_producto === sid(110)).length,
    2,
  );
});

test("acciones masivas rechazan selección duplicada, ausente, sin autorización o estado inválido sin modificar nada", async (t) => {
  const store = await fixture(t);
  const unauthorized = store
    .snapshot()
    .lote_producto.find((lot) => lot.id_orden_producto === sid(112))!;
  for (const ids of [[], [sid(160), sid(160)], ["inválido"]])
    await rejected(
      store,
      "setProductLotStates",
      { ids, estado: "anulado" },
      "VALIDATION",
    );
  await rejected(
    store,
    "setProductLotStates",
    { ids: [sid(160), sid(9999)], estado: "anulado" },
    "NOT_FOUND",
  );
  await rejected(
    store,
    "setProductLotStates",
    { ids: [sid(160), unauthorized.id], estado: "anulado" },
    "AUTHORIZATION",
  );
  await rejected(
    store,
    "setProductLotStates",
    { ids: [sid(160)], estado: "cerrada" },
    "VALIDATION",
  );
});

test("cerrar lotes conserva el cierre manual del renglón y revierte el conjunto si un lote carece de número", async (t) => {
  const store = await fixture(t);
  const empty = store
    .snapshot()
    .lote_producto.find((lot) => lot.id_orden_producto === sid(111))!;
  await rejected(
    store,
    "setProductLotStates",
    { ids: [sid(161), empty.id], estado: "cerrado" },
    "TYPE",
  );
  await execute(store, "setProductLotStates", {
    ids: [sid(161)],
    estado: "cerrado",
  });
  assert.equal(
    store.snapshot().orden_producto.find((line) => line.id === sid(110))!
      .estado,
    "en_seguimiento",
  );
});

test("el snapshot acepta orden diferente y rechaza omisiones, duplicados o propiedades ajenas", async (t) => {
  const store = await fixture(t);
  const current = productLotLifecycleSnapshot(store.snapshot(), [
    sid(110),
    sid(113),
  ]);
  assert.equal(
    matchesProductLotLifecycleSnapshot(
      [...current]
        .reverse()
        .map((line) => ({ ...line, lotes: [...line.lotes].reverse() })),
      current,
    ),
    true,
  );
  assert.equal(
    matchesProductLotLifecycleSnapshot(current.slice(1), current),
    false,
  );
  assert.equal(
    matchesProductLotLifecycleSnapshot([...current, current[0]], current),
    false,
  );
  assert.equal(
    matchesProductLotLifecycleSnapshot(
      current.map((line) => ({ ...line, otra: true })),
      current,
    ),
    false,
  );
});

test("acciones masivas de producto confirman antes de mutar y anulan/reabren todos los lotes del rango", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const ids = [sid(110), sid(115)];
  const expected = productLotLifecycleSnapshot(before, ids);
  await rejected(
    store,
    "setProductLineStates",
    { ids, estado: "anulada", confirm: true },
    "LOT_STATE_CHANGED",
  );
  const confirmation = await rejected(
    store,
    "setProductLineStates",
    { ids, estado: "anulada", expected },
    "CONFIRMATION",
  );
  assert.deepEqual(
    confirmation.details.products.map((product: Row) => product.id),
    ids,
  );
  await execute(store, "setProductLineStates", {
    ids,
    estado: "anulada",
    expected,
    confirm: true,
  });
  assert.deepEqual(
    store.snapshot(),
    changedStates(
      before,
      { [sid(160)]: "anulado", [sid(161)]: "anulado", [sid(162)]: "anulado" },
      { [sid(110)]: "anulada", [sid(115)]: "anulada" },
    ),
  );
  const after = productLotLifecycleSnapshot(store.snapshot(), ids);
  await execute(store, "setProductLineStates", {
    ids,
    estado: "en_seguimiento",
    expected: after,
  });
  assert.deepEqual(
    store.snapshot(),
    changedStates(
      before,
      {
        [sid(160)]: "en_seguimiento",
        [sid(161)]: "en_seguimiento",
        [sid(162)]: "en_seguimiento",
      },
      { [sid(110)]: "en_seguimiento", [sid(115)]: "en_seguimiento" },
    ),
  );
});

test("cierre masivo agrega advertencias de tolerancia y una confirmación obsoleta no modifica ningún producto", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const ids = [sid(110), sid(115)];
  const expected = productLotLifecycleSnapshot(before, ids);
  const confirmation = await rejected(
    store,
    "setProductLineStates",
    { ids, estado: "cerrada", expected },
    "TOLERANCE",
  );
  assert.equal(confirmation.details.deviations.length, 1);
  assert.equal(confirmation.details.deviations[0].id, sid(110));
  assert.equal(confirmation.details.deviations[0].deviation, -50);
  await execute(store, "setProductLotStates", {
    ids: [sid(161)],
    estado: "cerrado",
  });
  await rejected(
    store,
    "setProductLineStates",
    { ids, estado: "cerrada", expected, confirm: true },
    "LOT_STATE_CHANGED",
  );
  const updated = store.snapshot();
  await execute(store, "setProductLineStates", {
    ids,
    estado: "cerrada",
    expected: productLotLifecycleSnapshot(updated, ids),
    confirm: true,
  });
  assert.deepEqual(
    store.snapshot(),
    changedStates(
      updated,
      {},
      { [sid(110)]: "cerrada", [sid(115)]: "cerrada" },
    ),
  );
});

test("estado masivo de producto rechaza selección inválida, falta de autorización o transición de anulado a cerrado atómicamente", async (t) => {
  const store = await fixture(t);
  for (const ids of [[], [sid(110), sid(110)], ["incorrecto"]])
    await rejected(
      store,
      "setProductLineStates",
      { ids, estado: "anulada" },
      "VALIDATION",
    );
  await rejected(
    store,
    "setProductLineStates",
    { ids: [sid(110), sid(9999)], estado: "anulada" },
    "NOT_FOUND",
  );
  await rejected(
    store,
    "setProductLineStates",
    { ids: [sid(110), sid(112)], estado: "anulada" },
    "AUTHORIZATION",
  );
  await rejected(
    store,
    "setProductLineStates",
    { ids: [sid(110), sid(113)], estado: "cerrada" },
    "VALIDATION",
  );
  await rejected(
    store,
    "setProductLineStates",
    { ids: [sid(110)], estado: "cerrado" },
    "VALIDATION",
  );
});

test("la confirmación de tolerancia queda obsoleta si cambia una cantidad recibida o solicitada aunque los estados coincidan", async (t) => {
  const store = await fixture(t);
  const before = store.snapshot();
  const ids = [sid(110)];
  const expected = productLotLifecycleSnapshot(before, ids);
  const lot = before.lote_producto.find((row) => row.id === sid(160))!;
  await execute(store, "saveLot", { row: { ...lot, cantidad_recibida: 6001 } });
  await rejected(
    store,
    "setProductLineStates",
    { ids, estado: "cerrada", expected, confirm: true },
    "LOT_STATE_CHANGED",
  );
  const current = store.snapshot();
  const afterReceipt = productLotLifecycleSnapshot(current, ids);
  const order = current.orden_compra.find((row) => row.id === sid(100))!;
  await execute(store, "editOrder", {
    ...order,
    lines: current.orden_producto
      .filter((row) => row.id_orden_compra === order.id)
      .map((row) =>
        row.id === sid(110) ? { ...row, cantidad_solicitada: 12001 } : row,
      ),
  });
  await rejected(
    store,
    "setProductLineStates",
    { ids, estado: "cerrada", expected: afterReceipt, confirm: true },
    "LOT_STATE_CHANGED",
  );
  const afterQuantity = productLotLifecycleSnapshot(store.snapshot(), ids);
  await store.transaction((db) => {
    db.parametros_seguimiento[0].margen_tolerancia_pct += 1;
  });
  await rejected(
    store,
    "setProductLineStates",
    { ids, estado: "cerrada", expected: afterQuantity, confirm: true },
    "LOT_STATE_CHANGED",
  );
});
