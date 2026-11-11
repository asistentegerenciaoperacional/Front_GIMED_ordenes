import type { Database } from "../shared/models";
import {
  changeKey,
  sheetPermission,
  type SheetChange,
} from "../shared/product-order-sheet";
import type { Row } from "../shared/schema";

const sameChange = (left: SheetChange | undefined, right: SheetChange) =>
  left && left.value === right.value && left.expected === right.expected;

export function sameProductSheetDraft(
  current: SheetChange[],
  next: SheetChange[],
): boolean {
  if (current.length !== next.length) return false;
  const byKey = new Map(current.map((change) => [changeKey(change), change]));
  return next.every((change) =>
    sameChange(byKey.get(changeKey(change)), change),
  );
}

export function checkProductSheetReplay(
  db: Database,
  next: SheetChange[],
  current: SheetChange[],
) {
  const byKey = new Map(current.map((change) => [changeKey(change), change]));
  for (const change of next) {
    if (sameChange(byKey.get(changeKey(change)), change)) continue;
    const denied = sheetPermission(db, change);
    if (denied) throw new Error(`No se pudo restaurar la edición. ${denied}`);
    const record = db[change.entity].find((row) => row.id === change.id) as Row;
    if (record[change.field] !== change.expected)
      throw new Error(
        "No se pudo restaurar la edición porque los datos de la hoja cambiaron.",
      );
  }
}
