import { useSyncExternalStore, type ReactNode } from "react";
import { type SheetRange, SheetSelection } from "../product-sheet-selection";

/** Subscribes only this small UI branch, never the sheet's data owner or collection. */
export function SheetSelectionView({
  selection,
  snapshot,
  children,
}: {
  selection: SheetSelection;
  snapshot?: () => string;
  children: (range: SheetRange | null) => ReactNode;
}) {
  useSyncExternalStore<SheetRange | string | null>(
    selection.subscribe,
    snapshot ?? selection.getSnapshot,
  );
  return children(selection.read());
}
