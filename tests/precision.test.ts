import test from "node:test";
import assert from "node:assert/strict";
import { makeSeed, sid } from "../shared/seed";
import {
  recommendations,
  increasedQuantity,
  assignedBarcode,
  type Row,
} from "../shared/schema";
import { validateDatabase, BusinessError } from "../server/integrity";
import { command } from "../server/domain";
import { money } from "../src/ui";
test("la visualización monetaria conserva decimales y el signo de importes menores a uno", () => {
  assert.equal(money("-0.50"), "$ -0,50");
  assert.equal(money("999999999999.99"), "$ 999.999.999.999,99");
});
test("redondeo exacto: resultados enteros no ganan una unidad por error de punto flotante", () => {
  const db = makeSeed();
  assert.equal(recommendations(db, sid(70), 5000, 10).cantidad_sticker, 11000);
  assert.equal(increasedQuantity(10000, 10), 11000);
  assert.equal(increasedQuantity(150, 10), 165);
  assert.equal(recommendations(db, sid(70), 5000, 5.5).cantidad_sticker, 10550);
  assert.equal(recommendations(db, sid(71), 4001).cantidad_cinta, 2);
});
test("ISO con desfase se normaliza a UTC y la emisión conserva la selección explícita", () => {
  const db = makeSeed();
  db.codigos_barras.find((c) => c.id === sid(90))!.fecha_creacion =
    "2026-10-05T12:00:00+03:00";
  db.codigos_barras.push({
    id: sid(350),
    codigo: "123456",
    estado: "activo",
    id_producto: sid(70),
    fecha_creacion: "2026-10-05T11:00:00Z",
    fecha_act: null,
  });
  const checked = validateDatabase(db);
  assert.equal(
    checked.codigos_barras.find((c) => c.id === sid(90))!.fecha_creacion,
    "2026-10-05T09:00:00.000Z",
  );
  assert.equal(assignedBarcode(checked, sid(70))!.id, sid(90));
});
test("producto de otro maquilador rechazado; cambiar el catálogo no altera el proveedor histórico", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-10T12:00:00.000Z"),
  });
  const db = makeSeed();
  await assert.rejects(
    command(db, "createOrder", {
      tipo_orden: "producto",
      id_proveedor: sid(2),
      fecha_solicitada_entrega: "2026-10-15T12:00:00.000Z",
      lines: [
        {
          id_producto: sid(70),
          cantidad_solicitada: 10,
          precio_unitario: "1.00",
        },
      ],
    }),
    (e) => e instanceof BusinessError && e.code === "VALIDATION",
  );
  const fresh = makeSeed();
  fresh.productos.find((p) => p.id === sid(70))!.id_maquilador = sid(2);
  const checked = validateDatabase(fresh);
  assert.equal(
    checked.orden_compra.find((o) => o.id === sid(100))!.id_proveedor,
    sid(1),
  );
});
test("precio inválido de un material produce un error de campo, no un error interno", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-10T12:00:00.000Z"),
  });
  await assert.rejects(
    command(makeSeed(), "createOrder", {
      tipo_orden: "material",
      id_proveedor: sid(3),
      fecha_solicitada_entrega: "2026-10-15T12:00:00.000Z",
      lines: [
        {
          id_material: sid(50),
          cantidad_solicitada: 10,
          precio_unitario: "abc",
        },
      ],
    }),
    (e) =>
      e instanceof BusinessError &&
      e.code === "TYPE" &&
      !!e.fields.precio_unitario,
  );
});
test("el simulador recibe contenido y adjuntos efímeros; el cuerpo no se guarda", async () => {
  const db = makeSeed();
  let envelope: Row = {};
  await command(
    db,
    "sendMail",
    {
      event: "envio_orden_compra",
      orderId: sid(100),
      body: "Texto preparado para el simulador",
      recipients: [{ address: "qa@demo.example", type: "para" }],
    },
    async (message) => {
      envelope = message;
      return "sim-envelope";
    },
  );
  assert.equal(envelope.body, "Texto preparado para el simulador");
  assert.equal(envelope.documents.length, 1);
  assert.equal(envelope.from, "zamira@gimed-demo.example");
  assert.equal(
    JSON.stringify(db).includes("Texto preparado para el simulador"),
    false,
  );
});
