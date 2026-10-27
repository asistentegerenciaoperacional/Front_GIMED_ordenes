import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { command } from "../server/domain";
import { BusinessError, validateDatabase } from "../server/integrity";
import { JsonStore } from "../server/store";
import { buildMaterialNeeds } from "../shared/material-demand";
import {
  materialSupplyCandidates,
  materialSupplySelection,
  materialSupplyLinkAvailable,
} from "../shared/material-supply";
import { sid } from "../shared/seed";
import type { Database } from "../shared/models";
import { makeMaterialDemandFixture } from "./fixtures/material-demand";

const sourceId = sid(2100),
  targetId = sid(140);
function payload(db: Database, source = sourceId, target = targetId) {
  return {
    id_orden_producto: source,
    id_orden_material: target,
    expected: materialSupplySelection(db, source, target),
  };
}
const supplyChanged = (error: unknown) =>
  error instanceof BusinessError && error.code === "SUPPLY_CHANGED";
test("consulta de pendientes por OC conserva exactamente las reglas generales", () => {
  const db = makeMaterialDemandFixture();
  const all = buildMaterialNeeds(db);
  for (const order of db.orden_compra)
    assert.deepEqual(
      buildMaterialNeeds(db, order.id),
      all.filter((need) => need.order.id === order.id),
    );
});
async function storeFixture(t: TestContext) {
  await mkdir("tests/.tmp", { recursive: true });
  const directory = await mkdtemp(resolve("tests/.tmp/material-supply-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return JsonStore.open(
    join(directory, "database.json"),
    makeMaterialDemandFixture,
  );
}
test("vínculo manual: solo agrega la relación, persiste y permite compartir un renglón de OCM", async (t) => {
  const store = await storeFixture(t);
  const before = store.snapshot();
  await store.transaction((db) =>
    command(db, "linkMaterialSupply", payload(before)),
  );
  await store.transaction((db) =>
    command(db, "linkMaterialSupply", payload(db, sid(2101))),
  );
  const after = store.snapshot();
  assert.equal(
    after.abastecimiento_material.length,
    before.abastecimiento_material.length + 2,
  );
  assert.equal(
    buildMaterialNeeds(after).some(
      (need) => need.line.id === sourceId && need.material.id === sid(50),
    ),
    false,
  );
  assert.deepEqual(
    { ...after, abastecimiento_material: [] },
    { ...before, abastecimiento_material: [] },
  );
  assert.deepEqual(JSON.parse(await readFile(store.file, "utf8")), after);
  assert.deepEqual((await JsonStore.open(store.file)).snapshot(), after);
});
test("vínculo manual: IDs exactos, homónimos, sin autorización OCM y exclusión de cerradas/anuladas", async () => {
  const db = makeMaterialDemandFixture();
  assert.ok(materialSupplyLinkAvailable(db, sourceId, targetId));
  const line = db.orden_material.find((line) => line.id === targetId)!;
  const order = db.orden_compra.find(
    (order) => order.id === line.id_orden_compra,
  )!;
  order.estado_autorizacion = "no_autorizada";
  assert.ok(materialSupplyLinkAvailable(db, sourceId, targetId));
  for (const state of ["anulada", "cerrada"] as const) {
    line.estado = state;
    assert.equal(materialSupplyLinkAvailable(db, sourceId, targetId), false);
  }
  line.estado = "en_seguimiento";
  db.materiales.push({
    ...db.materiales.find((m) => m.id === sid(50))!,
    id: sid(9000),
  });
  line.id_material = sid(9000);
  assert.equal(materialSupplyLinkAvailable(db, sourceId, targetId), false);
  assert.equal(
    materialSupplyCandidates(db, sid(50)).some(
      ({ line }) => line.id === targetId,
    ),
    false,
  );
  line.id_material = sid(50);
  order.tipo_orden = "otro";
  assert.equal(materialSupplyLinkAvailable(db, sourceId, targetId), false);
});
test("vínculo manual: OC autorizada, renglón en seguimiento, catálogo actual y exclusión inventario", async () => {
  for (const mutation of [
    (db: Database) => {
      db.orden_compra.find((o) => o.id === sid(2000))!.estado_autorizacion =
        "no_autorizada";
    },
    (db: Database) => {
      db.orden_producto.find((l) => l.id === sourceId)!.estado = "cerrada";
    },
    (db: Database) => {
      db.orden_producto.find((l) => l.id === sourceId)!.estado = "anulada";
    },
    (db: Database) => {
      db.materiales_asociados = db.materiales_asociados.filter(
        (r) => r.id_material !== sid(50),
      );
    },
    (db: Database) => {
      db.orden_material.find((l) => l.id === targetId)!.id_material = sid(54);
    },
  ]) {
    const db = makeMaterialDemandFixture();
    mutation(db);
    assert.equal(materialSupplyLinkAvailable(db, sourceId, targetId), false);
    await assert.rejects(
      () => command(db, "linkMaterialSupply", payload(db)),
      supplyChanged,
    );
  }
});
test("vínculo manual: cobertura cerrada o sin autorizar bloquea; anulada permite reemplazo y conserva historial", async () => {
  const db = makeMaterialDemandFixture();
  await command(db, "linkMaterialSupply", payload(db));
  const original = db.orden_material.find((line) => line.id === targetId)!;
  original.estado = "cerrada";
  assert.equal(materialSupplyLinkAvailable(db, sourceId, sid(142)), false);
  original.estado = "anulada";
  await command(db, "linkMaterialSupply", payload(db, sourceId, sid(142)));
  assert.equal(
    db.abastecimiento_material.filter((l) => l.id_orden_producto === sourceId)
      .length,
    2,
  );
});
test("vínculo manual: reintento, selección alterada y referencias inexistentes no guardan", async (t) => {
  const store = await storeFixture(t);
  const original = payload(store.snapshot());
  for (const key of [
    "cantidad",
    "fecha",
    "producto",
    "material",
    "proveedor",
    "estado",
  ] as const) {
    const db = store.snapshot();
    const line = db.orden_material.find((l) => l.id === targetId)!;
    const header = db.orden_compra.find((o) => o.id === line.id_orden_compra)!;
    if (key === "cantidad") line.cantidad_solicitada++;
    if (key === "fecha")
      header.fecha_solicitada_entrega = "2027-03-01T12:00:00.000Z";
    if (key === "producto")
      db.orden_producto.find((l) => l.id === sourceId)!.id_producto = sid(71);
    if (key === "material") line.id_material = sid(51);
    if (key === "proveedor") header.id_proveedor = sid(4);
    if (key === "estado") line.estado = "cerrada";
    await assert.rejects(
      () => command(db, "linkMaterialSupply", original),
      supplyChanged,
    );
  }
  await assert.rejects(
    () =>
      command(store.snapshot(), "linkMaterialSupply", {
        ...original,
        id_orden_material: sid(9999),
      }),
    supplyChanged,
  );
  await store.transaction((db) => command(db, "linkMaterialSupply", original));
  const saved = store.snapshot();
  await assert.rejects(
    store.transaction((db) => command(db, "linkMaterialSupply", original)),
    supplyChanged,
  );
  assert.deepEqual(store.snapshot(), saved);
});
test("vínculo manual: dos solicitudes concurrentes para el mismo pendiente solo guardan una", async (t) => {
  const store = await storeFixture(t);
  const before = store.snapshot();
  const requests = [payload(before), payload(before, sourceId, sid(142))];
  const results = await Promise.allSettled(
    requests.map((p) =>
      store.transaction((db) => command(db, "linkMaterialSupply", p)),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    store.snapshot().abastecimiento_material.length,
    before.abastecimiento_material.length + 1,
  );
  const failure = results.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  assert.ok(supplyChanged(failure.reason));
});
test("vínculo manual: concurrencia con creación consolidada tampoco duplica ni consume consecutivo", async (t) => {
  const store = await storeFixture(t);
  const before = store.snapshot();
  const need = buildMaterialNeeds(before).find(
    (n) => n.line.id === sourceId && n.material.id === sid(50),
  )!;
  await store.transaction((db) =>
    command(db, "linkMaterialSupply", payload(before)),
  );
  const saved = store.snapshot();
  await assert.rejects(
    store.transaction((db) =>
      command(db, "createOrder", {
        tipo_orden: "material",
        id_proveedor: sid(3),
        fecha_solicitada_entrega: "2027-01-20T12:00:00.000Z",
        lines: [
          {
            id_material: sid(50),
            cantidad_solicitada: 1100,
            precio_unitario: "1.00",
          },
        ],
        abastecimiento: {
          desde: "2027-02-01",
          hasta: "2027-02-28",
          fuentes: [need.source],
        },
      }),
    ),
    supplyChanged,
  );
  assert.deepEqual(store.snapshot(), saved);
});
test("vínculo manual: entrega tardía permitida solo al asociar; toda edición posterior exige corregir fecha", async (t) => {
  const store = await storeFixture(t);
  await store.transaction(async (db) => {
    db.orden_compra.find((o) => o.id === sid(120))!.fecha_solicitada_entrega =
      "2027-02-15T12:00:00.000Z";
    await command(db, "linkMaterialSupply", payload(db));
  });
  const saved = store.snapshot();
  const header = saved.orden_compra.find((o) => o.id === sid(120))!;
  const edit = {
    ...header,
    lines: saved.orden_material
      .filter((l) => l.id_orden_compra === header.id)
      .map((l) => ({ ...l, precio_unitario: "12.55" })),
  };
  await assert.rejects(
    store.transaction((db) => command(db, "editOrder", edit)),
    (error: unknown) =>
      error instanceof BusinessError && !!error.fields.fecha_solicitada_entrega,
  );
  assert.deepEqual(store.snapshot(), saved);
  // Existing historical links also participate: choose an earlier day than every source.
  await store.transaction((db) =>
    command(db, "editOrder", {
      ...edit,
      fecha_solicitada_entrega: "2026-01-01T12:00:00.000Z",
    }),
  );
});
test("vínculo manual: reactivar una compra anulada o cambiar el material no puede duplicar cobertura", async (t) => {
  const store = await storeFixture(t);
  await store.transaction(async (db) => {
    await command(db, "linkMaterialSupply", payload(db));
    db.orden_material.find((l) => l.id === targetId)!.estado = "anulada";
    await command(db, "linkMaterialSupply", payload(db, sourceId, sid(142)));
  });
  const saved = store.snapshot();
  await assert.rejects(
    store.transaction((db) =>
      command(db, "setLineState", {
        entity: "orden_material",
        id: targetId,
        estado: "en_seguimiento",
      }),
    ),
    supplyChanged,
  );
  assert.deepEqual(store.snapshot(), saved);
  const changed = structuredClone(saved);
  const cap = changed.orden_material.find((l) => l.id === sid(141))!;
  changed.abastecimiento_material.push({
    id_orden_producto: sourceId,
    id_orden_material: cap.id,
  });
  cap.id_material = sid(50);
  assert.throws(() => validateDatabase(changed, saved), supplyChanged);
});
test("vínculo manual: datos históricos incompatibles o duplicados permanecen intactos", async () => {
  const db = makeMaterialDemandFixture();
  db.materiales_asociados = db.materiales_asociados.filter(
    (r) => r.id_material !== sid(50),
  );
  const checked = validateDatabase(db, db);
  assert.deepEqual(checked.abastecimiento_material, db.abastecimiento_material);
  await assert.rejects(
    () =>
      command(db, "linkMaterialSupply", {
        id_orden_producto: sourceId,
        id_orden_material: targetId,
      }),
    (error: unknown) =>
      error instanceof BusinessError && error.code === "VALIDATION",
  );
});
