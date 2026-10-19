import { ClipboardList, Pin, PinOff, X } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Dialog } from "react-aria-components/Dialog";
import { Modal, ModalOverlay } from "react-aria-components/Modal";
import { shouldCloseOnInteractOutside } from "./components/overlays";
import { Button } from "./ui";
export const PIN_NAVIGATION_QUERY = "(min-width: 1024px)";
export function NavigationDrawer({
  open,
  pinned,
  canPin,
  onClose,
  onPinnedChange,
  children,
}: {
  open: boolean;
  pinned: boolean;
  canPin: boolean;
  onClose: () => void;
  onPinnedChange: (pinned: boolean) => void;
  children: ReactNode;
}) {
  const pin = useRef<HTMLButtonElement>(null);
  const previous = useRef(pinned);
  useLayoutEffect(() => {
    if (previous.current !== pinned) {
      document
        .getElementById("app-navigation")
        ?.getAnimations()
        .forEach((animation) => animation.cancel());
      pin.current?.focus({ preventScroll: true });
    }
    previous.current = pinned;
  }, [pinned]);
  const content = (
    <>
      <div className="drawer-heading">
        <div className="brand">
          <span className="brand-symbol">
            <ClipboardList size={22} aria-hidden="true" />
          </span>
          <div>
            <strong>GIMED</strong>
            <small>Gestión de compras</small>
          </div>
        </div>
        <div className="drawer-actions">
          {canPin && (
            <Button
              ref={pin}
              icon={pinned ? PinOff : Pin}
              className="icon-btn drawer-pin"
              variant="ghost"
              aria-label={pinned ? "Desfijar navegación" : "Fijar navegación"}
              aria-pressed={pinned}
              onClick={() => onPinnedChange(!pinned)}
            />
          )}
          {!pinned && (
            <Button
              autoFocus={!canPin}
              icon={X}
              className="icon-btn drawer-close"
              variant="ghost"
              aria-label="Cerrar navegación"
              onClick={onClose}
            />
          )}
        </div>
      </div>
      <div className="drawer-scroll">{children}</div>
    </>
  );
  return (
    <div className="navigation-slot">
      {pinned ? (
        <aside
          id="app-navigation"
          className="sidebar navigation-pinned"
          aria-label="Menú de navegación"
        >
          {content}
        </aside>
      ) : (
        <ModalOverlay
          isOpen={open}
          onOpenChange={(next) => {
            if (!next) onClose();
          }}
          isDismissable
          shouldCloseOnInteractOutside={shouldCloseOnInteractOutside}
          className="aria-navigation-overlay"
        >
          <Modal className="aria-navigation-modal">
            <Dialog
              id="app-navigation"
              className="sidebar navigation-drawer"
              data-modal="true"
              aria-label="Menú de navegación"
            >
              {content}
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}
    </div>
  );
}
