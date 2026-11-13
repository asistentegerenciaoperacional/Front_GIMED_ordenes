import type { Database } from "../shared/models";
import { schemas, type Row } from "../shared/schema";
import {
  isMaterialLineEntity,
  isMaterialSheetTarget,
  materialChangeKey,
  materialFieldPermission,
  materialReceiptFields,
  materialSheetIndexes,
  materialSheetRecordIssues,
  materialStateAllowed,
  overlayMaterialSheetChanges,
  type MaterialLineState,
  type MaterialSheetChange,
  type MaterialStateTarget,
} from "../shared/material-order-sheet";
import { BusinessError, check } from "./integrity";

type Dispatch = (db: Database, name: string, payload: Row) => Promise<Row>;
export async function saveMaterialOrderSheet(
  db: Database,
  payload: Row,
  dispatch: Dispatch,
) {
  check(
    Array.isArray(payload.changes) && payload.changes.length > 0,
    "No hay cambios para guardar.",
  );
  const { orders, materialLines, otherLines } = materialSheetIndexes(db);
  const seen = new Set<string>();
  const records = new Map<string, MaterialSheetChange[]>();
  const purchases = new Map<string, MaterialSheetChange[]>();
  const receipts: MaterialSheetChange[][] = [];
  for (const target of payload.changes as unknown[]) {
    check(
      isMaterialSheetTarget(target),
      "Destino de celda inválido o protegido.",
      "SHEET_PROTECTED",
      {},
      { target },
    );
    const current =
      target.entity === "orden_compra"
        ? orders.get(target.id)
        : target.entity === "orden_material"
          ? materialLines.get(target.id)
          : otherLines.get(target.id);
    const order =
      target.entity === "orden_compra"
        ? orders.get(target.id)
        : orders.get((current as Row | undefined)?.id_orden_compra);
    check(
      current && order,
      "El registro ya no está disponible.",
      "SHEET_CHANGED",
      {},
      { target },
    );
    const denied = materialFieldPermission(order, target.entity, target.field);
    check(
      !denied,
      denied ?? "Celda protegida.",
      "SHEET_PROTECTED",
      {},
      { target },
    );
    const parsed = (
      schemas[target.entity].shape as Record<
        string,
        typeof schemas.orden_compra.shape.id
      >
    )[target.field].safeParse(target.value);
    check(
      parsed.success,
      "Revisa el tipo de dato de la celda.",
      "TYPE",
      { [target.field]: parsed.error?.issues[0]?.message ?? "Tipo inválido." },
      { target },
    );
    const key = materialChangeKey(target);
    check(!seen.has(key), "El envío repite un dato compartido.");
    seen.add(key);
    check(
      (current as Row)[target.field] === target.expected,
      "Los datos cambiaron desde que comenzaste a editar. El borrador se conserva.",
      "SHEET_CHANGED",
      {},
      { target, current: (current as Row)[target.field] },
    );
    const recordKey = `${target.entity}/${target.id}`;
    const recordChanges = records.get(recordKey) ?? [];
    recordChanges.push(target);
    records.set(recordKey, recordChanges);
    if (!materialReceiptFields.includes(target.field)) {
      const changes = purchases.get(order.id) ?? [];
      changes.push(target);
      purchases.set(order.id, changes);
    }
  }

  const prospective = overlayMaterialSheetChanges(db, payload.changes);
  for (const targets of records.values()) {
    const { entity, id } = targets[0];
    const fields = materialSheetRecordIssues(prospective, entity, id, db);
    check(
      !Object.keys(fields).length,
      "Revisa los campos relacionados de la OCM.",
      "VALIDATION",
      fields,
      { targets },
    );
    const receipt = targets.filter(({ field }) =>
      materialReceiptFields.includes(field),
    );
    if (receipt.length) receipts.push(receipt);
  }
  const values = (changes: MaterialSheetChange[]) =>
    Object.fromEntries(changes.map(({ field, value }) => [field, value]));
  const apply = async (
    name: string,
    params: Row,
    targets: MaterialSheetChange[],
  ) => {
    try {
      await dispatch(db, name, params);
    } catch (error) {
      if (!(error instanceof BusinessError)) throw error;
      throw new BusinessError(error.message, error.code, error.fields, {
        ...error.details,
        targets,
      });
    }
  };
  const linesByOrder = new Map<string, Row[]>();
  for (const line of [...db.orden_material, ...db.orden_otro]) {
    if (!purchases.has(line.id_orden_compra)) continue;
    const siblings = linesByOrder.get(line.id_orden_compra) ?? [];
    siblings.push(line);
    linesByOrder.set(line.id_orden_compra, siblings);
  }
  for (const [id, targets] of purchases) {
    const header = values(
      targets.filter((change) => change.entity === "orden_compra"),
    );
    const lineChanges = new Map<string, MaterialSheetChange[]>();
    for (const target of targets) {
      if (target.entity === "orden_compra") continue;
      const changes = lineChanges.get(target.id) ?? [];
      changes.push(target);
      lineChanges.set(target.id, changes);
    }
    await apply(
      "editOrder",
      {
        ...orders.get(id),
        ...header,
        lines: (linesByOrder.get(id) ?? [])
          .sort((a, b) => a.posicion - b.posicion)
          .map((line) => ({
            ...line,
            ...values(lineChanges.get(line.id) ?? []),
          })),
        confirmar_comentarios: payload.confirmar_comentarios,
      },
      targets,
    );
  }
  for (const targets of receipts) {
    const { entity, id } = targets[0];
    await apply("saveReceipt", { entity, id, row: values(targets) }, targets);
  }
  return {};
}

export function setMaterialSheetLineStates(db: Database, payload: Row) {
  const { targets, estado, confirm } = payload;
  check(
    Array.isArray(targets) && targets.length > 0,
    "Selecciona renglones elegibles.",
  );
  check(
    ["en_seguimiento", "cerrada", "anulada"].includes(estado),
    "Estado inválido.",
  );
  check(
    estado !== "anulada" || confirm === true,
    "Confirma la anulación de los renglones.",
    "CONFIRMATION",
  );
  const { orders, materialLines, otherLines } = materialSheetIndexes(db);
  const seen = new Set<string>();
  const lines = (targets as MaterialStateTarget[]).map((target) => {
    check(
      target &&
        isMaterialLineEntity(target.entity) &&
        typeof target.id === "string",
      "Renglón inválido.",
      "VALIDATION",
    );
    const key = `${target.entity}/${target.id}`;
    check(!seen.has(key), "Selecciona los renglones sin repetir.");
    seen.add(key);
    const line = (
      target.entity === "orden_material" ? materialLines : otherLines
    ).get(target.id);
    const order = line && orders.get(line.id_orden_compra);
    check(
      line &&
        order?.estado_autorizacion === "autorizada" &&
        order.tipo_orden ===
          (target.entity === "orden_material" ? "material" : "otro") &&
        line.estado === target.expected &&
        materialStateAllowed(line.estado, estado),
      "Los estados cambiaron. Revisa la selección actualizada.",
      "SHEET_CHANGED",
      {},
      { target },
    );
    return line;
  });
  for (const line of lines) line.estado = estado as MaterialLineState;
  return {};
}
