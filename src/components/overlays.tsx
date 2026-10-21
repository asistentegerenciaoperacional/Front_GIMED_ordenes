import { CircleHelp, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { Dialog as AriaDialog } from "react-aria-components/Dialog";
import { Heading } from "react-aria-components/Heading";
import { Modal, ModalOverlay } from "react-aria-components/Modal";
import { Tooltip, TooltipTrigger } from "react-aria-components/Tooltip";
import { Action, FieldEditContext } from "./controls";

type Confirmation = {
  message: string;
  confirmLabel: string;
  destructive: boolean;
  resolve: (answer: boolean) => void;
};
const confirmEvent = "prototipo:confirmation";
type AnnotationDocument = Document & {
  oai?: {
    annotation?: {
      isActive?: () => boolean;
    };
  };
};
export function shouldCloseOnInteractOutside(_element: Element) {
  const annotation = (document as AnnotationDocument).oai?.annotation;
  return !annotation?.isActive?.();
}
export function confirmAction(
  message: string,
  confirmLabel = "Confirmar",
  destructive = false,
): Promise<boolean> {
  return new Promise((resolve) =>
    window.dispatchEvent(
      new CustomEvent<Confirmation>(confirmEvent, {
        detail: { message, confirmLabel, destructive, resolve },
      }),
    ),
  );
}
export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<Confirmation[]>([]);
  useEffect(() => {
    const receive = (event: Event) =>
      setRequests((current) => [
        ...current,
        (event as CustomEvent<Confirmation>).detail,
      ]);
    window.addEventListener(confirmEvent, receive);
    return () => window.removeEventListener(confirmEvent, receive);
  }, []);
  const current = requests[0];
  const answer = (accepted: boolean) => {
    current.resolve(accepted);
    setRequests((rest) => rest.slice(1));
  };
  return (
    <>
      {children}
      {current && (
        <ModalOverlay
          isOpen
          isDismissable
          shouldCloseOnInteractOutside={shouldCloseOnInteractOutside}
          onOpenChange={(open) => {
            if (!open) answer(false);
          }}
          className="aria-modal-overlay"
        >
          <Modal className="aria-modal">
            <AriaDialog
              role="alertdialog"
              className="dialog"
              aria-label="Confirmar acción"
            >
              <div className="dialog-heading">
                <Heading slot="title">Confirmar acción</Heading>
              </div>
              <div className="dialog-body">
                <p>{current.message}</p>
              </div>
              <div className="dialog-footer">
                <Action
                  className="btn secondary"
                  autoFocus
                  onClick={() => answer(false)}
                >
                  Cancelar
                </Action>
                <Action
                  className={
                    "btn danger " +
                    (current.destructive ? "destructive-confirm" : "")
                  }
                  onClick={() => answer(true)}
                >
                  {current.confirmLabel}
                </Action>
              </div>
            </AriaDialog>
          </Modal>
        </ModalOverlay>
      )}
    </>
  );
}
export const DialogScope = createContext("");
const CloseGuard = createContext<null | (() => Promise<boolean>)>(null);
export function CancelAction({
  onClick,
  ...props
}: React.ComponentPropsWithRef<"button">) {
  const guard = useContext(CloseGuard);
  return (
    <Action
      {...props}
      onClick={async (event) => {
        if (!guard || (await guard())) onClick?.(event);
      }}
    />
  );
}
export function Dialog({
  title,
  subtitle,
  children,
  onClose,
  titleAction,
  wide = false,
  dirty = false,
  busy = false,
}: {
  title: string;
  titleAction?: ReactNode;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  dirty?: boolean;
  busy?: boolean;
}) {
  const titleId = useId();
  const [edited, setEdited] = useState(false);
  const unsaved = dirty || edited;
  useEffect(() => {
    if (!unsaved) return;
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [unsaved]);
  const canClose = async () =>
    !unsaved ||
    (await confirmAction(
      "Hay cambios sin guardar. ¿Cerrar el formulario?",
      "Descartar cambios",
      true,
    ));
  const close = async () => {
    if (busy) return;
    if (await canClose()) onClose();
  };
  return (
    <ModalOverlay
      isOpen
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      shouldCloseOnInteractOutside={shouldCloseOnInteractOutside}
      onOpenChange={(open) => {
        if (!open) void close();
      }}
      className="aria-modal-overlay"
    >
      <Modal className="aria-modal">
        <AriaDialog
          className={"dialog " + (wide ? "wide" : "")}
          aria-labelledby={titleId}
          data-dirty={unsaved}
        >
          <div
            className="aria-dialog-content"
            onInput={(event) => {
              event.stopPropagation();
              if ((event.target as HTMLInputElement).name) setEdited(true);
            }}
            onSubmit={(event) => event.stopPropagation()}
            onSubmitCapture={(event) => {
              const invalid = Array.from(
                (
                  event.target as HTMLFormElement
                ).querySelectorAll<HTMLInputElement>(".date-input-text"),
              ).find(
                (field) =>
                  !field.checkValidity() && !field.validity.valueMissing,
              );
              if (invalid) {
                event.preventDefault();
                event.stopPropagation();
                invalid.focus();
                invalid.reportValidity();
              }
            }}
          >
            <div className="dialog-heading">
              <div>
                <div className="dialog-title-row">
                <Heading slot="title" level={2} id={titleId}>
                  {title}
                </Heading>
                  {titleAction}
                </div>
                {subtitle && <p>{subtitle}</p>}
              </div>
              <Action
                className="btn secondary icon-btn"
                aria-label={"Cerrar " + title}
                disabled={busy}
                onClick={() => void close()}
              >
                <X size={16} aria-hidden="true" />
              </Action>
            </div>
            <CloseGuard.Provider value={canClose}>
              <FieldEditContext.Provider value={() => setEdited(true)}>
                <DialogScope.Provider value={titleId + "-"}>
                  {children}
                </DialogScope.Provider>
              </FieldEditContext.Provider>
            </CloseGuard.Provider>
          </div>
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
export function TooltipHelp({
  label,
  content,
  buttonLabel,
}: {
  label: string;
  content: string;
  buttonLabel?: string;
}) {
  return (
    <TooltipTrigger delay={500} closeDelay={80}>
      <Action
        className="field-help"
        aria-label={buttonLabel ?? "Cómo se calcula " + label}
      >
        <CircleHelp size={14} aria-hidden="true" />
      </Action>
      <Tooltip
        data-react-aria-top-layer=""
        className="field-tooltip"
        placement="top"
        offset={6}
      >
        {content}
      </Tooltip>
    </TooltipTrigger>
  );
}

export function ActionTooltip({
  content,
  children,
}: {
  content: string;
  children: ReactNode;
}) {
  return (
    <TooltipTrigger delay={400} closeDelay={80}>
      {children}
      <Tooltip
        data-react-aria-top-layer=""
        className="field-tooltip barcode-action-tooltip"
        placement="top"
        offset={6}
      >
        {content}
      </Tooltip>
    </TooltipTrigger>
  );
}
