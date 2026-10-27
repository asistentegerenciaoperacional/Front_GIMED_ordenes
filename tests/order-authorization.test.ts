import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { command } from "../server/domain";
import { BusinessError } from "../server/integrity";
import { JsonStore } from "../server/store";
import { lineTable, type Row } from "../shared/schema";
import { sid } from "../shared/seed";

const execute = (store: JsonStore, name: string, payload: Row) =>
  store.transaction((db) => command(db, name, payload));
async function fixture(t: test.TestContext) {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-27T15:00:00Z"),
  });
  const root = resolve("tests/.tmp");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "order-authorization-"));
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(root + sep));
    await rm(directory, { recursive: true, force: true });
  });
  const store = await JsonStore.open(join(directory, "database.json"));
  const ids: string[] = [];
  for (const type of ["producto", "material", "otro"]) {
    const result = await execute(store, "createOrder", {
      tipo_orden: type,
      id_proveedor:
        type === "producto" ? sid(1) : type === "material" ? sid(3) : sid(5),
      fecha_solicitada_entrega: "2027-02-15T12:00:00.000Z",
      lines: [
        {
          ...(type === "producto"
            ? { id_producto: sid(70) }
            : type === "material"
              ? { id_material: sid(50) }
              : { producto: "Servicio de prueba" }),
          cantidad_solicitada: 100,
          precio_unitario: "2.50",
        },
      ],
    });
    ids.push(result.orderId);
  }
  return { store, ids };
}
const isError = (code: string) => (cause: unknown) =>
  cause instanceof BusinessError && cause.code === code;

test("autoriza OC, OCM y Otros juntos con una fecha común y conserva los demás datos", async (t) => {
  const { store, ids } = await fixture(t);
  const expected = store.snapshot();
  for (const order of expected.orden_compra.filter((order) =>
    ids.includes(order.id),
  )) {
    order.estado_autorizacion = "autorizada";
    order.fecha_autorizacion = "2026-10-27T15:00:00.000Z";
  }
  assert.deepEqual(
    await execute(store, "authorizeOrders", { ids, confirm: true }),
    {},
  );
  assert.deepEqual(store.snapshot(), expected);
  assert.deepEqual((await JsonStore.open(store.file)).snapshot(), expected);
});

for (const [label, payload] of [
  ["lista vacía", { ids: [], confirm: true }],
  ["sin lista", { confirm: true }],
  ["identificador inválido", { ids: [null], confirm: true }],
  ["cadena en vez de lista", { ids: sid(101), confirm: true }],
  ["identificadores repetidos", { ids: [sid(101), sid(101)], confirm: true }],
  ["sin confirmación", { ids: [sid(101)] }],
  ["confirmación no booleana", { ids: [sid(101)], confirm: "true" }],
] as const) {
  test(`rechaza ${label} sin alterar disco ni memoria`, async (t) => {
    const { store } = await fixture(t);
    const before = store.snapshot();
    const file = await readFile(store.file, "utf8");
    await assert.rejects(
      execute(store, "authorizeOrders", payload),
      isError("VALIDATION"),
    );
    assert.deepEqual(store.snapshot(), before);
    assert.equal(await readFile(store.file, "utf8"), file);
  });
}

test("informa todas las órdenes no disponibles y rechaza el conjunto sin cambios parciales", async (t) => {
  const { store, ids } = await fixture(t);
  await execute(store, "authorizeOrder", { id: ids[1], confirm: true });
  await store.transaction((db) => {
    const order = db.orden_compra.find((row) => row.id === ids[2])!;
    db[lineTable(order.tipo_orden)]
      .filter((line) => line.id_orden_compra === order.id)
      .forEach((line) => {
        line.estado = "anulada";
      });
  });
  const before = store.snapshot();
  const file = await readFile(store.file, "utf8");
  await assert.rejects(
    execute(store, "authorizeOrders", {
      ids: [...ids, sid(9999)],
      confirm: true,
    }),
    (cause: unknown) => {
      assert.ok(cause instanceof BusinessError);
      assert.equal(cause.code, "AUTHORIZATION_CHANGED");
      assert.deepEqual(
        cause.details.orders.map((item: Row) => item.id),
        [ids[1], ids[2], sid(9999)],
      );
      assert.match(cause.details.orders[0].reference, /^OCM /);
      assert.match(cause.details.orders[1].reason, /anulada/);
      return true;
    },
  );
  assert.deepEqual(store.snapshot(), before);
  assert.equal(await readFile(store.file, "utf8"), file);
  await execute(store, "authorizeOrders", { ids: [ids[0]], confirm: true });
  assert.equal(
    store.snapshot().orden_compra.find((order) => order.id === ids[0])!
      .estado_autorizacion,
    "autorizada",
  );
});

test("la autorización individual comparte las mismas reglas y sigue siendo irreversible", async (t) => {
  const { store, ids } = await fixture(t);
  for (const id of ids) {
    await assert.rejects(
      execute(store, "authorizeOrder", { id, confirm: false }),
      isError("VALIDATION"),
    );
    assert.deepEqual(
      await execute(store, "authorizeOrder", { id, confirm: true }),
      {},
    );
    const before = store.snapshot();
    await assert.rejects(
      execute(store, "authorizeOrder", { id, confirm: true }),
      isError("AUTHORIZATION_CHANGED"),
    );
    assert.deepEqual(store.snapshot(), before);
  }
});

test("dos solicitudes concurrentes sobre la misma selección no producen autorizaciones parciales", async (t) => {
  const { store, ids } = await fixture(t);
  const results = await Promise.allSettled([
    execute(store, "authorizeOrders", { ids: ids.slice(0, 2), confirm: true }),
    execute(store, "authorizeOrders", { ids: ids.slice(1), confirm: true }),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(
    store.snapshot().orden_compra.find((order) => order.id === ids[2])!
      .estado_autorizacion,
    "no_autorizada",
  );
});
