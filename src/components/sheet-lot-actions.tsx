import { ChevronDown, Plus } from "lucide-react";
import { Menu, MenuItem, MenuTrigger } from "react-aria-components/Menu";
import { Popover } from "react-aria-components/Popover";
import { Button } from "../ui";
import { ActionTooltip } from "./overlays";

export type SheetLotAction = "nuevo" | "cerrado" | "anulado" | "en_seguimiento";

export function SheetLotActions({ count, disabled, includeNew = false, available, onAction, label = "Acciones de lote" }: {
  count: number;
  disabled: boolean;
  includeNew?: boolean;
  label?: string;
  available?: Partial<Record<SheetLotAction, boolean>>;
  onAction: (action: SheetLotAction) => void;
}) {
  const options = [
    { id: "cerrado", label: "Cerrar lotes", shortcut: "C", swatch: "closed" },
    { id: "anulado", label: "Anular lotes", shortcut: "N", swatch: "cancelled" },
    { id: "en_seguimiento", label: "Reabrir lotes", shortcut: "R", swatch: "open" },
  ] as const;
  return <MenuTrigger>
    <Button className="sheet-lot-trigger" data-sheet-return-focus aria-label={label} disabled={disabled}>
      Lotes <ChevronDown size={15} aria-hidden="true" />
    </Button>
    <Popover className="aria-options custom-filter-options sheet-order-menu sheet-lot-menu" placement="bottom start" offset={4}>
      <Menu className="aria-option-list" aria-label="Acciones de lote" onAction={(key) => onAction(String(key) as SheetLotAction)}>
        {includeNew && <ActionTooltip content="(Alt+d)">
          <MenuItem id="nuevo" aria-keyshortcuts="Alt+D" className="aria-option sheet-order-menu-item">Nuevo lote <Plus size={15} aria-hidden="true" /></MenuItem>
        </ActionTooltip>}
        {options.map(({ id, label, shortcut, swatch }) => <ActionTooltip key={id} content={`(Alt+${shortcut.toLowerCase()})`}>
          <MenuItem id={id} textValue={`${label} (${count})`} aria-keyshortcuts={`Alt+${shortcut}`}
            className="aria-option sheet-order-menu-item" isDisabled={available?.[id] === false}>
            {label} ({count}) <span className={`sheet-lot-swatch ${swatch}`} aria-hidden="true" />
          </MenuItem>
        </ActionTooltip>)}
      </Menu>
    </Popover>
  </MenuTrigger>;
}
