import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ClipboardList, Pin, PinOff, X } from "lucide-react";
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
  const drawer = useRef<HTMLDialogElement>(null);
  const pinButton = useRef<HTMLButtonElement>(null);
  const previousPinned = useRef(pinned);
  useLayoutEffect(() => {
    const changedMode = previousPinned.current !== pinned;
    previousPinned.current = pinned;
    if (pinned) {
      if (changedMode) pinButton.current?.focus({ preventScroll: true });
      return;
    }
    const panel = drawer.current;
    if (!open || !panel) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.showModal();
    if (changedMode) {
      panel.getAnimations().forEach((animation) => animation.cancel());
      (
        pinButton.current ??
        panel.querySelector<HTMLButtonElement>(
          'button[aria-label="Cerrar navegación"]',
        )
      )?.focus({ preventScroll: true });
    } else {
      panel.querySelector<HTMLAnchorElement>('a[aria-current="page"]')?.focus();
    }
    return () => {
      if (panel.open) panel.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open, pinned]);

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
              ref={pinButton}
              icon={pinned ? PinOff : Pin}
              className="icon-btn drawer-pin"
              variant="ghost"
              aria-label={pinned ? "Desfijar navegación" : "Fijar navegación"}
              title={pinned ? "Desfijar navegación" : "Fijar navegación"}
              aria-pressed={pinned}
              onClick={() => onPinnedChange(!pinned)}
            />
          )}
          {!pinned && (
            <Button
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
        <dialog
          ref={drawer}
          id="app-navigation"
          className="sidebar navigation-drawer"
          aria-label="Menú de navegación"
          inert={!open}
          onKeyDown={(event) => {
            if (
              event.key !== "Tab" ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey
            )
              return;
            const controls = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                "a[href], button:not([disabled])",
              ),
            ).filter((control) => control.tabIndex >= 0);
            const first = controls[0];
            const last = controls.at(-1);
            if (
              first &&
              last &&
              ((!event.shiftKey && document.activeElement === last) ||
                (event.shiftKey && document.activeElement === first))
            ) {
              event.preventDefault();
              (event.shiftKey ? last : first).focus();
            }
          }}
          onCancel={(event) => {
            event.preventDefault();
            onClose();
          }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const box = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < box.left ||
              event.clientX > box.right ||
              event.clientY < box.top ||
              event.clientY > box.bottom
            )
              onClose();
          }}
        >
          {content}
        </dialog>
      )}
    </div>
  );
}
