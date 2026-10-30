import type { Database } from "../shared/models";
import { orderLines, schemas, type Row } from "../shared/schema";
import {
  changeKey,
  sheetPermission,
  sheetRecordIssue,
  overlaySheetChanges,
  type SheetChange,
} from "../shared/product-order-sheet";
import { check, BusinessError } from "./integrity";

type Dispatch = (db: Database, name: string, payload: Row) => Promise<Row>;
export async function saveProductOrderSheet(
  db: Database,
  payload: Row,
  dispatch: Dispatch,
  applyLots: (database: Database, lots: Row[]) => Row,
) {
  check(
    Array.isArray(payload.changes) && payload.changes.length > 0,
    "No hay cambios para guardar.",
  );
  const changes = payload.changes as SheetChange[];
  const keys = new Set<string>();
  for (const change of changes) {
    check(
      change &&
        typeof change === "object" &&
        typeof change.entity === "string" &&
        typeof change.id === "string" &&
        typeof change.field === "string",
      "Destino de celda inválido.",
      "TYPE",
    );
    const denied = sheetPermission(db, change);
    check(
      !denied,
      denied ?? "Celda protegida.",
      "SHEET_PROTECTED",
      {},
      { target: change },
    );
    const parsed = schemas[change.entity].shape[change.field].safeParse(
      change.value,
    );
    check(
      parsed.success,
      "Revisa el tipo de dato de la celda.",
      "TYPE",
      {
        [change.field]:
          parsed.error?.issues[0]?.message ?? "Tipo de dato inválido.",
      },
      { target: change },
    );
    check(!keys.has(changeKey(change)), "El envío repite un dato compartido.");
    keys.add(changeKey(change));
    const current = db[change.entity].find(
      (row) => row.id === change.id,
    ) as Row;
    check(
      JSON.stringify(current[change.field]) === JSON.stringify(change.expected),
      "Los datos cambiaron desde que comenzaste a editar. Revisa el conflicto; el borrador se conserva.",
      "SHEET_CHANGED",
      {},
      { target: change, current: current[change.field] },
    );
    check(
      change.field !== "id_proveedor",
      "Cambiar proveedor requiere el reemplazo confirmado desde Editar orden.",
      "SHEET_REPLACEMENT",
    );
  }
  const prospective = overlaySheetChanges(db, changes);
  const checked = new Set<string>();
  for (const change of changes) {
    const key = `${change.entity}/${change.id}`;
    if (checked.has(key)) continue;
    checked.add(key);
    const fields = sheetRecordIssue(prospective, change.entity, change.id, db);
    check(
      !Object.keys(fields).length,
      "Revisa los campos relacionados de la celda.",
      "VALIDATION",
      fields,
      {
        targets: changes.filter(
          (target) =>
            target.entity === change.entity && target.id === change.id,
        ),
      },
    );
  }
  const orderIds = new Set<string>();
  for (const change of changes) {
    if (change.entity === "orden_compra") orderIds.add(change.id);
    if (change.entity === "orden_producto")
      orderIds.add(
        db.orden_producto.find((line) => line.id === change.id)!
          .id_orden_compra,
      );
  }
  for (const id of orderIds) {
    const order = db.orden_compra.find((row) => row.id === id)!;
    const header = {
      ...order,
      ...Object.fromEntries(
        changes
          .filter(
            (change) => change.entity === "orden_compra" && change.id === id,
          )
          .map((change) => [change.field, change.value]),
      ),
    };
    const lines = orderLines(db, id).map((line) => ({
      ...line,
      ...Object.fromEntries(
        changes
          .filter(
            (change) =>
              change.entity === "orden_producto" && change.id === line.id,
          )
          .map((change) => [change.field, change.value]),
      ),
    }));
    try {
      await dispatch(db, "editOrder", { ...header, lines });
    } catch (failure) {
      if (!(failure instanceof BusinessError)) throw failure;
      const targets = changes.filter(
        (change) =>
          (change.entity === "orden_compra" && change.id === id) ||
          (change.entity === "orden_producto" &&
            lines.some((line) => line.id === change.id)),
      );
      throw new BusinessError(failure.message, failure.code, failure.fields, {
        ...failure.details,
        targets,
      });
    }
  }
  const lotChanges = changes.filter(
    (change) => change.entity === "lote_producto",
  );
  const byLot = new Map<string, SheetChange[]>();
  for (const change of lotChanges) {
    const values = byLot.get(change.id) ?? [];
    values.push(change);
    byLot.set(change.id, values);
  }
  const lots = db.lote_producto
    .filter((lot) => byLot.has(lot.id))
    .map((lot) => {
      const row = {
        ...lot,
        ...Object.fromEntries(
          byLot.get(lot.id)!.map((change) => [change.field, change.value]),
        ),
      };
      row.numero_lote =
        typeof row.numero_lote === "string"
          ? row.numero_lote.trim() || null
          : row.numero_lote;
      return row;
    });
  if (lots.length)
    try {
      applyLots(db, lots);
    } catch (failure) {
      if (!(failure instanceof BusinessError)) throw failure;
      throw new BusinessError(failure.message, failure.code, failure.fields, {
        ...failure.details,
        targets: lotChanges,
      });
    }
  return {};
}

export async function createProductLots(
  db: Database,
  payload: Row,
  dispatch: Dispatch,
) {
  check(
    Array.isArray(payload.rows) && payload.rows.length > 0,
    "Selecciona al menos un producto.",
  );
  const ids = payload.rows.map((row: Row) => row.id_orden_producto);
  check(
    new Set(ids).size === ids.length,
    "Solo se puede preparar un lote por renglón.",
  );
  for (const [index, row] of payload.rows.entries()) {
    check(!row.id, "La creación no admite lotes existentes.");
    try {
      await dispatch(db, "saveLot", { row });
    } catch (failure) {
      if (!(failure instanceof BusinessError)) throw failure;
      throw new BusinessError(
        failure.message,
        failure.code,
        Object.fromEntries(
          Object.entries(failure.fields).map(([key, value]) => [
            `rows.${index}.${key}`,
            value,
          ]),
        ),
        failure.details,
      );
    }
  }
  return {};
}
