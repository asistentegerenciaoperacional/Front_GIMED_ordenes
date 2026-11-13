import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { command } from "../server/domain";
import { JsonStore } from "../server/store";
import { makeSeed } from "../shared/seed";
import {
  materialSheetIndexes,
  overlayMaterialSheetChanges,
} from "../shared/material-order-sheet";
import { orderLines } from "../shared/schema";
import {
  buildMaterialSheet,
  materialSheetColumns,
  matchesMaterialSheetFilter,
  proposeMaterialSheetInput,
  materialValue,
} from "../src/material-order-sheet-model";

const col = (key: string) =>
  materialSheetColumns("seguimiento").find((col) => col.key === key)!;
test("la hoja de OCM proyecta renglones y conserva independientes las recepciones del mismo lote", () => {
  const db = makeSeed();
  const [first, second] = buildMaterialSheet(db, "seguimiento").filter(
    (row) => row.order.no_orden === "1601",
  );
  assert.notEqual(first.key, second.key);
  assert.equal(materialValue(db, first, col("id_lote_material")), "MAT-26-041");
  assert.equal(
    materialValue(db, second, col("id_lote_material")),
    "MAT-26-041",
  );
  const result = proposeMaterialSheetInput(
    db,
    [],
    [{ row: first, column: col("cantidad_recibida"), text: "11" }],
  );
  assert.equal(result.issues.length, 0);
  const overlay = overlayMaterialSheetChanges(db, result.changes);
  assert.equal(
    overlay.orden_material.find((line) => line.id === first.line.id)
      ?.cantidad_recibida,
    11,
  );
  assert.equal(
    overlay.orden_material.find((line) => line.id === second.line.id)
      ?.cantidad_recibida,
    second.line.cantidad_recibida,
  );
  assert.strictEqual(overlay.lote_material, db.lote_material);
  assert.equal(
    buildMaterialSheet(db, "no_autorizadas").some(
      (row) => row.entity === "orden_otro",
    ),
    true,
  );
  assert.equal(
    buildMaterialSheet(db, "anuladas").every(
      (row) => row.line.estado === "anulada",
    ),
    true,
  );
});

test("los filtros y el pegado distinguen cabecera, recepción y restricciones de tipo", () => {
  const db = makeSeed();
  const [first, second] = buildMaterialSheet(db, "seguimiento").filter(
    (row) => row.order.no_orden === "1601",
  );
  const other = buildMaterialSheet(db, "no_autorizadas").find(
    (row) => row.entity === "orden_otro",
  )!;
  assert.equal(
    matchesMaterialSheetFilter(other, "vinculos_sin", "2026-10-13"),
    false,
  );
  assert.equal(
    matchesMaterialSheetFilter(first, "entrega_vencida", "2026-10-13"),
    false,
  );
  assert.equal(
    matchesMaterialSheetFilter(
      { ...first, line: { ...first.line, cantidad_recibida: null } },
      "entrega_vencida",
      "2026-10-13",
    ),
    true,
  );
  const result = proposeMaterialSheetInput(
    db,
    [],
    [
      { row: first, column: col("fecha_elaboracion"), text: "21/09/2026" },
      { row: second, column: col("fecha_elaboracion"), text: "22/09/2026" },
      { row: first, column: col("item"), text: "No interpretar" },
      { row: other, column: col("id_lote_material"), text: "MAT-26-041" },
      { row: second, column: col("cantidad_recibida"), text: "15" },
    ],
  );
  assert.equal(result.issues.length, 4);
  assert.equal(result.issues.filter((issue) => issue.protected).length, 2);
  assert.deepEqual(
    result.changes.map(({ field, value }) => [field, value]),
    [["cantidad_recibida", 15]],
  );
});

test("el servidor protege identidades autorizadas y aplica edición y estados de forma atómica", async () => {
  const root = resolve("tests/.tmp");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "material-sheet-"));
  try {
    const store = await JsonStore.open(join(directory, "data.json"));
    const run = (name: string, payload: Record<string, unknown>) =>
      store.transaction((db) => command(db, name, payload));
    const before = store.snapshot();
    const [a, b] = buildMaterialSheet(before, "seguimiento").filter(
      (row) => row.order.no_orden === "1601",
    );
    const other = before.orden_otro[0];
    await run("authorizeOrders", {
      ids: [other.id_orden_compra],
      confirm: true,
    });
    const authorizedOther = store
      .snapshot()
      .orden_compra.find((order) => order.id === other.id_orden_compra)!;
    await assert.rejects(
      run("editOrder", {
        ...authorizedOther,
        lines: [{ ...other, producto: "Otro concepto" }],
      }),
      /bloqueados|no se pueden/i,
    );
    await assert.rejects(
      run("editOrder", {
        ...a.order,
        lines: orderLines(before, a.order.id).slice(0, 1),
      }),
      /bloqueados|no se pueden/i,
    );
    const changes = [
      {
        entity: "orden_compra",
        id: a.order.id,
        field: "fecha_elaboracion",
        expected: a.order.fecha_elaboracion,
        value: "2026-09-23T12:00:00.000Z",
      },
      {
        entity: a.entity,
        id: a.line.id,
        field: "cantidad_recibida",
        expected: a.line.cantidad_recibida,
        value: 11,
      },
      {
        entity: b.entity,
        id: b.line.id,
        field: "precio_unitario",
        expected: b.line.precio_unitario,
        value: "121.00",
      },
    ];
    await assert.rejects(
      run("saveMaterialOrderSheet", {
        changes: [...changes.slice(0, 2), { ...changes[2], expected: "0.00" }],
      }),
      /cambiaron/,
    );
    assert.equal(
      materialSheetIndexes(store.snapshot()).materialLines.get(a.line.id)
        ?.cantidad_recibida,
      a.line.cantidad_recibida,
    );
    await run("saveMaterialOrderSheet", { changes });
    const stored = materialSheetIndexes(store.snapshot());
    assert.equal(
      stored.orders.get(a.order.id)?.fecha_elaboracion,
      changes[0].value,
    );
    assert.equal(stored.materialLines.get(a.line.id)?.cantidad_recibida, 11);
    assert.equal(
      stored.materialLines.get(b.line.id)?.precio_unitario,
      "121.00",
    );
    const targets = [a, b].map((row) => ({
      entity: row.entity,
      id: row.line.id,
      expected: row.line.estado,
    }));
    await assert.rejects(
      run("setMaterialSheetLineStates", { targets, estado: "anulada" }),
      /Confirma/,
    );
    await run("setMaterialSheetLineStates", {
      targets: [targets[0]],
      estado: "cerrada",
    });
    await assert.rejects(
      run("setMaterialSheetLineStates", {
        targets,
        estado: "anulada",
        confirm: true,
      }),
      /cambiaron/,
    );
    assert.equal(
      materialSheetIndexes(store.snapshot()).materialLines.get(b.line.id)
        ?.estado,
      "en_seguimiento",
    );
    await run("setMaterialSheetLineStates", {
      targets: [targets[1]],
      estado: "anulada",
      confirm: true,
    });
    await run("saveMaterialOrderSheet", {
      changes: [
        { ...changes[1], id: b.line.id, expected: b.line.cantidad_recibida },
      ],
    });
    assert.equal(
      materialSheetIndexes(store.snapshot()).materialLines.get(b.line.id)
        ?.estado,
      "anulada",
    );
    await run("setMaterialSheetLineStates", {
      targets: [
        { ...targets[0], expected: "cerrada" },
        { ...targets[1], expected: "anulada" },
      ],
      estado: "en_seguimiento",
    });
    assert.equal(
      materialSheetIndexes(store.snapshot()).materialLines.get(b.line.id)
        ?.estado,
      "en_seguimiento",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
