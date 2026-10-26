import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { command } from "../server/domain";
import { BusinessError } from "../server/integrity";
import { JsonStore } from "../server/store";
import { sid } from "../shared/seed";
import {
  type Row,
  orderCreationDeliveryIssue,
  orderLines,
} from "../shared/schema";

const instant = "2026-10-26T20:00:00.000Z";
const base = resolve("tests/.tmp");
async function fixture(t: TestContext, at = instant) {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(at) });
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, "creation-date-"));
  assert.ok(dir.startsWith(base + sep));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return JsonStore.open(join(dir, "database.json"));
}
const execute = (store: JsonStore, payload: Row, name = "createOrder") =>
  store.transaction((db) => command(db, name, payload));
const order = (
  type: "producto" | "material" | "otro",
  delivery: string,
): Row => ({
  tipo_orden: type,
  id_proveedor: sid(type === "producto" ? 1 : type === "material" ? 3 : 5),
  fecha_elaboracion: "2000-01-01T12:00:00.000Z",
  fecha_solicitada_entrega: delivery,
  lines: [
    {
      ...(type === "producto"
        ? { id_producto: sid(70) }
        : type === "material"
          ? { id_material: sid(50) }
          : { producto: "Servicio" }),
      cantidad_solicitada: 10,
      precio_unitario: "100.00",
    },
  ],
});
const dateError = (error: unknown) => {
  assert.ok(error instanceof BusinessError);
  assert.equal(error.code, "VALIDATION");
  assert.match(error.message, /no puede ser anterior.*26\/10\/2026/);
  assert.equal(error.fields.fecha_solicitada_entrega, error.message);
  return true;
};

for (const type of ["producto", "material", "otro"] as const) {
  test(`${type}: rechaza entrega anterior al día real sin consumir consecutivo ni guardar datos`, async (t) => {
    const store = await fixture(t);
    const before = store.snapshot();
    const file = await readFile(store.file, "utf8");
    for (const delivery of [
      "2026-10-25T12:00:00.000Z",
      "2026-10-26T04:59:59.000Z",
    ])
      await assert.rejects(execute(store, order(type, delivery)), dateError);
    assert.deepEqual(store.snapshot(), before);
    assert.equal(await readFile(store.file, "utf8"), file);
  });
  test(`${type}: acepta el mismo día y fechas posteriores y registra la elaboración del servidor`, async (t) => {
    const store = await fixture(t);
    for (const delivery of [
      "2026-10-26T05:00:00.000Z",
      "2026-10-27T12:00:00.000Z",
    ]) {
      const result = await execute(store, {
        ...order(type, delivery),
        fecha_elaboracion: "2099-01-01T12:00:00.000Z",
      });
      const header = store
        .snapshot()
        .orden_compra.find((row) => row.id === result.orderId)!;
      assert.equal(header.fecha_elaboracion, instant);
      assert.equal(header.fecha_solicitada_entrega, delivery);
    }
  });
}

test("un borrador que cruza medianoche se valida con el nuevo día de Bogotá al crear", async (t) => {
  const store = await fixture(t, "2026-10-27T04:59:59.000Z");
  const payload = order("material", "2026-10-26T12:00:00.000Z");
  await execute(store, payload);
  t.mock.timers.setTime(new Date("2026-10-27T05:00:00.000Z").getTime());
  const before = store.snapshot();
  await assert.rejects(execute(store, payload), (error: unknown) => {
    assert.ok(error instanceof BusinessError);
    assert.match(error.message, /27\/10\/2026/);
    return true;
  });
  assert.deepEqual(store.snapshot(), before);
});

test("la regla de creación no impide editar una orden histórica con entrega pasada", async (t) => {
  const store = await fixture(t);
  const db = store.snapshot();
  const header = db.orden_compra.find((row) => row.id === sid(100))!;
  await execute(
    store,
    { ...header, lines: orderLines(db, header.id) },
    "editOrder",
  );
  assert.deepEqual(
    store.snapshot().orden_compra.find((row) => row.id === header.id),
    header,
  );
});

test("compara días de Bogotá y no horas ni el día UTC", () => {
  assert.equal(
    orderCreationDeliveryIssue("2026-10-26T05:00:00Z", instant),
    null,
  );
  assert.equal(
    orderCreationDeliveryIssue(
      "2026-10-26T23:00:00-05:00",
      "2026-10-27T04:59:59Z",
    ),
    null,
  );
  assert.match(
    orderCreationDeliveryIssue("2026-10-27T04:59:59Z", "2026-10-27T05:00:00Z")!,
    /27\/10\/2026/,
  );
});
