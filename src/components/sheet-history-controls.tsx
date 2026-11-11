import { Redo2, Undo2 } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { SheetHistoryDirection } from "../sheet-history";
import { Button } from "../ui";

export function sheetHistoryShortcut(
  event: KeyboardEvent<HTMLElement>,
): SheetHistoryDirection | undefined {
  if (
    event.defaultPrevented ||
    event.nativeEvent.isComposing ||
    event.altKey ||
    !(event.ctrlKey || event.metaKey)
  )
    return;

  const target = event.target;
  if (
    !(target instanceof Element) ||
    !event.currentTarget.contains(target) ||
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
    )
  )
    return;

  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
}

export function SheetHistoryControls({
  canUndo,
  canRedo,
  disabled,
  onMove,
}: {
  canUndo: boolean;
  canRedo: boolean;
  disabled: boolean;
  onMove: (direction: SheetHistoryDirection) => void;
}) {
  return (
    <div className="inline" role="group" aria-label="Historial de ediciones">
      <Button
        icon={Undo2}
        aria-label="Deshacer"
        aria-keyshortcuts="Control+Z Meta+Z"
        title="Deshacer (Ctrl+Z / ⌘Z)"
        disabled={disabled || !canUndo}
        data-sheet-return-focus
        onClick={() => onMove("undo")}
      />
      <Button
        icon={Redo2}
        aria-label="Rehacer"
        aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Y Meta+Shift+Z"
        title="Rehacer (Ctrl+Y, Ctrl+Mayús+Z / ⌘Mayús+Z)"
        disabled={disabled || !canRedo}
        data-sheet-return-focus
        onClick={() => onMove("redo")}
      />
    </div>
  );
}
