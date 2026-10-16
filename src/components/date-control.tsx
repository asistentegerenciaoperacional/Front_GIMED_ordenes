import { CalendarDays } from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Dialog, DialogTrigger } from "react-aria-components/Dialog";
import { Popover } from "react-aria-components/Popover";
import { formatDateInput, maskDateInput, parseDateInput } from "../dates";
import { Action, ControlError, ControlInput } from "./controls";
const CalendarContent = lazy(() =>
  import("./calendar-content").then((module) => ({
    default: module.CalendarContent,
  })),
);

type DateInputProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "type" | "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  calendarLabel?: string;
};
export function DateInput({
  value,
  onChange,
  calendarLabel = "fecha",
  min,
  max,
  disabled,
  readOnly,
  onBlur,
  ...props
}: DateInputProps) {
  const [draft, setDraft] = useState(() => formatDateInput(value));
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const emitted = useRef<string | undefined>(undefined);
  const nextCaret = useRef<number | null>(null);
  useEffect(() => {
    if (value !== emitted.current) setDraft(formatDateInput(value));
  }, [value]);
  useLayoutEffect(() => {
    if (
      nextCaret.current !== null &&
      input.current === document.activeElement
    ) {
      input.current?.setSelectionRange(nextCaret.current, nextCaret.current);
      nextCaret.current = null;
    }
  });
  function change(raw: string, caret: number, deleting = false) {
    const masked = maskDateInput(raw, caret, deleting);
    nextCaret.current = masked.caret;
    if (input.current) {
      input.current.value = masked.value;
      input.current.setSelectionRange(masked.caret, masked.caret);
    }
    setDraft(masked.value);
    emitted.current = parseDateInput(masked.value) ?? masked.value;
    onChange(emitted.current);
  }
  const parsed = parseDateInput(draft);
  const problem =
    draft && !parsed
      ? "Escribe una fecha válida en formato dd/mm/aaaa."
      : parsed && min && parsed < String(min)
        ? "La fecha debe ser desde " + formatDateInput(String(min)) + "."
        : parsed && max && parsed > String(max)
          ? "La fecha debe ser hasta " + formatDateInput(String(max)) + "."
          : "";
  useEffect(() => input.current?.setCustomValidity(problem), [problem]);
  const described =
    [
      props["aria-describedby"],
      touched && problem ? props.id + "-date-error" : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="date-control">
      <div className="date-input-wrap">
        <ControlInput
          {...props}
          ref={input}
          type="text"
          className={"date-input-text " + (props.className ?? "")}
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          value={draft}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={touched && problem ? true : props["aria-invalid"]}
          aria-describedby={described}
          onChange={(event) =>
            change(
              event.target.value,
              event.target.selectionStart ?? event.target.value.length,
              (event.nativeEvent as InputEvent).inputType?.startsWith("delete"),
            )
          }
          onKeyDown={(event) => {
            props.onKeyDown?.(event);
            if (event.defaultPrevented || disabled || readOnly) return;
            const control = event.currentTarget,
              start = control.selectionStart ?? 0;
            if (start !== control.selectionEnd) return;
            if (
              event.key === "/" &&
              (draft[start - 1] === "/" || draft[start] === "/")
            ) {
              event.preventDefault();
              if (draft[start] === "/")
                control.setSelectionRange(start + 1, start + 1);
            } else if (event.key === "Backspace" && draft[start - 1] === "/") {
              event.preventDefault();
              const rest = draft.slice(start);
              change(
                draft.slice(0, start - 2) + (/\d/.test(rest) ? "/" + rest : ""),
                start - 2,
                true,
              );
            } else if (event.key === "Delete" && draft[start] === "/") {
              event.preventDefault();
              change(
                draft.slice(0, start + 1) + draft.slice(start + 2),
                start + 1,
                true,
              );
            }
          }}
          onBlur={(event) => {
            setTouched(true);
            if (parsed) setDraft(formatDateInput(parsed));
            onBlur?.(event);
          }}
          onInvalid={() => setTouched(true)}
        />
        <DialogTrigger isOpen={open} onOpenChange={setOpen}>
          <Action
            className="date-calendar-button"
            aria-label={"Abrir calendario: " + calendarLabel}
            disabled={disabled || readOnly}
          >
            <CalendarDays size={17} aria-hidden="true" />
          </Action>
          <Popover
            className="aria-calendar-popover"
            placement="bottom end"
            offset={4}
          >
            <Dialog
              aria-label={"Calendario: " + calendarLabel}
              className="aria-calendar-dialog"
            >
              {open && (
                <Suspense
                  fallback={<span role="status">Cargando calendario…</span>}
                >
                  <CalendarContent
                    label={calendarLabel}
                    value={parsed}
                    min={min == null ? undefined : String(min)}
                    max={max == null ? undefined : String(max)}
                    onSelect={(next) => {
                      emitted.current = next;
                      setDraft(formatDateInput(next));
                      onChange(next);
                      setTouched(true);
                      setOpen(false);
                    }}
                  />
                </Suspense>
              )}
            </Dialog>
          </Popover>
        </DialogTrigger>
      </div>
      {touched && problem && (
        <ControlError id={props.id + "-date-error"} message={problem} />
      )}
    </div>
  );
}
