import { Check, ChevronDown } from "lucide-react";
import {
  Children,
  Fragment,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import { Button as AriaButton } from "react-aria-components/Button";
import { Checkbox } from "react-aria-components/Checkbox";
import { CheckboxGroup } from "react-aria-components/CheckboxGroup";
import { ComboBox } from "react-aria-components/ComboBox";
import { Collection } from "react-aria-components/Collection";
import {
  FieldError,
  FieldErrorContext,
} from "react-aria-components/FieldError";
import { Form as AriaForm, FormContext } from "react-aria-components/Form";
import { I18nProvider } from "react-aria-components/I18nProvider";
import { Input } from "react-aria-components/Input";
import { Label } from "react-aria-components/Label";
import { Link as AriaLink } from "react-aria-components/Link";
import {
  ListBox,
  ListBoxItem,
  ListBoxSection,
} from "react-aria-components/ListBox";
import { Header } from "react-aria-components/Header";
import { NumberField } from "react-aria-components/NumberField";
import { Popover } from "react-aria-components/Popover";
import { SearchField } from "react-aria-components/SearchField";
import { Select, SelectValue } from "react-aria-components/Select";
import { TextContext } from "react-aria-components/Text";
import { TextArea } from "react-aria-components/TextArea";
import { TextField } from "react-aria-components/TextField";
import { ToggleButton } from "react-aria-components/ToggleButton";
export const FieldEditContext = createContext<() => void>(() => {});
export const FormErrorsContext = createContext<{
  id?: string;
  fields: Record<string, string>;
  constraints: Record<string, string>;
  focusKey?: object;
}>({ fields: {}, constraints: {} });

export function Action({
  disabled,
  ...props
}: React.ComponentPropsWithRef<"button">) {
  if (props["aria-pressed"] !== undefined) {
    const { "aria-pressed": pressed, ...attributes } = props;
    return (
      <ToggleButton
        {...(attributes as unknown as React.ComponentProps<
          typeof ToggleButton
        >)}
        isDisabled={disabled}
        isSelected={pressed === true || pressed === "true"}
      />
    );
  }
  return (
    <AriaButton
      {...(props as unknown as React.ComponentProps<typeof AriaButton>)}
      isDisabled={disabled}
    />
  );
}
export function ControlLink(props: React.ComponentPropsWithRef<"a">) {
  return (
    <AriaLink
      {...(props as unknown as React.ComponentProps<typeof AriaLink>)}
      onPress={(event) => event.continuePropagation()}
    />
  );
}
export function ControlForm({
  fieldErrors = {},
  ref,
  onSubmitCapture,
  onBlurCapture,
  children,
  ...props
}: React.ComponentPropsWithRef<"form"> & {
  fieldErrors?: Record<string, string>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const [constraints, setConstraints] = useState<Record<string, string>>({});
  const [focusKey, setFocusKey] = useState<object>();
  const invalidFields = () =>
    Object.fromEntries(
      Array.from(
        form.current?.querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >("input,textarea,select") ?? [],
      )
        .filter((control) => control.willValidate && !control.validity.valid)
        .map((control) => [
          control.dataset.fieldPath || control.name || control.id,
          control.validationMessage,
        ])
        .filter(([path]) => Boolean(path)),
    );
  useEffect(() => {
    if (!Object.keys(constraints).length) return;
    const pending = invalidFields();
    const remaining = Object.fromEntries(
      Object.keys(constraints)
        .filter((path) => pending[path])
        .map((path) => [path, pending[path]]),
    );
    if (JSON.stringify(remaining) !== JSON.stringify(constraints))
      setConstraints(remaining);
  });
  const formProps: React.ComponentPropsWithRef<"form"> = {
    ...props,
    ref: (node) => {
      form.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    noValidate: true,
    onSubmitCapture: (event) => {
      onSubmitCapture?.(event);
      if (event.defaultPrevented) return;
      const invalid = invalidFields();
      setConstraints(invalid);
      if (Object.keys(invalid).length) {
        event.preventDefault();
        event.stopPropagation();
        setFocusKey({});
      }
    },
    onBlurCapture: (event) => {
      onBlurCapture?.(event);
      const control = event.target;
      if (
        control instanceof HTMLInputElement &&
        control.classList.contains("date-input-text") &&
        control.validity.customError
      )
        setConstraints(invalidFields());
    },
  };
  return (
    <FormErrorsContext.Provider
      value={{
        id,
        fields: { ...constraints, ...fieldErrors },
        constraints,
        focusKey,
      }}
    >
      <FormContext.Provider value={null}>
        <AriaForm
          {...(formProps as unknown as React.ComponentProps<typeof AriaForm>)}
          validationBehavior="aria"
        >
          {children}
        </AriaForm>
      </FormContext.Provider>
    </FormErrorsContext.Provider>
  );
}
export function ControlLabel({
  htmlFor,
  id,
  ...props
}: React.ComponentPropsWithRef<"label">) {
  return (
    <Label
      {...props}
      htmlFor={htmlFor}
      id={id ?? (htmlFor ? htmlFor + "-label" : undefined)}
    />
  );
}
export function ControlError({
  message,
  id,
}: {
  message: string;
  id?: string;
}) {
  return (
    <FieldErrorContext.Provider
      value={{
        isInvalid: true,
        validationErrors: [message],
        validationDetails: {
          badInput: false,
          customError: true,
          patternMismatch: false,
          rangeOverflow: false,
          rangeUnderflow: false,
          stepMismatch: false,
          tooLong: false,
          tooShort: false,
          typeMismatch: false,
          valueMissing: false,
          valid: false,
        },
      }}
    >
      <TextContext.Provider value={null}>
        <FieldError id={id} className="field-error visually-hidden">
          {message}
        </FieldError>
      </TextContext.Provider>
    </FieldErrorContext.Provider>
  );
}
// Existing business forms keep their event contract while controls use value-based Aria state.
function changeEvent<T extends HTMLInputElement | HTMLSelectElement>(
  value: string,
  target?: T | null,
) {
  const element = target ?? ({ value } as T);
  element.value = value;
  return {
    target: element,
    currentTarget: element,
    nativeEvent: new Event("input"),
    preventDefault() {},
    stopPropagation() {},
  } as unknown as React.ChangeEvent<T>;
}
function labelProps(props: {
  "aria-label"?: string;
  "aria-labelledby"?: string;
  id?: string;
}) {
  return {
    id: props.id,
    "aria-label": props["aria-label"],
    "aria-labelledby":
      props["aria-labelledby"] ??
      (!props["aria-label"] && props.id ? props.id + "-label" : undefined),
  };
}
function useControlValidation<
  Props extends {
    name?: string;
    "aria-invalid"?: React.AriaAttributes["aria-invalid"];
    "aria-describedby"?: string;
  },
>(props: Props): Props {
  const validation = useContext(FormErrorsContext);
  const path =
    (props as Record<string, unknown>)["data-field-path"] ?? props.name;
  if (typeof path !== "string" || !validation.fields[path]) return props;
  return {
    ...props,
    "aria-invalid": true,
    "aria-describedby":
      props["aria-describedby"] ?? `${validation.id}summary-${path}-error`,
  };
}
export type Choice = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  section?: string;
};
export function flatten(
  nodes: ReactNode,
): ReactElement<Record<string, unknown>>[] {
  const result: ReactElement<Record<string, unknown>>[] = [];
  Children.forEach(nodes, (node) => {
    if (!isValidElement(node)) return;
    if (node.type === Fragment)
      result.push(
        ...flatten((node.props as { children?: ReactNode }).children),
      );
    else result.push(node as ReactElement<Record<string, unknown>>);
  });
  return result;
}
export function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(" ");
  if (isValidElement(node))
    return nodeText((node.props as { children?: ReactNode }).children);
  return "";
}
function readChoices(children: ReactNode, section?: string): Choice[] {
  return flatten(children).flatMap((node) => {
    if (node.type === "optgroup")
      return readChoices(
        node.props.children as ReactNode,
        String(node.props.label ?? ""),
      );
    const label =
      nodeText(node.props.children as ReactNode) ||
      String(node.props.value ?? "");
    return [
      {
        id: String(node.props.value ?? label),
        label,
        disabled: !!node.props.disabled,
        section,
      },
    ];
  });
}
export function ControlSelect({
  children,
  value,
  onChange,
  disabled,
  required,
  className,
  id,
  name,
  ...props
}: React.ComponentPropsWithoutRef<"select">) {
  props = useControlValidation({ ...props, name });
  const edited = useContext(FieldEditContext);
  const options = useMemo(() => readChoices(children), [children]);
  const selection = String(value ?? "");
  const generatedLabel = useId();
  const accessibleLabel =
    props["aria-labelledby"] ??
    (props["aria-label"]
      ? generatedLabel
      : id
        ? id + "-label"
        : generatedLabel);
  return (
    <Select
      className="aria-select-root"
      {...labelProps({ id, ...props })}
      selectedKey={selection}
      isDisabled={disabled}
      isRequired={required}
      name={name}
      isInvalid={
        props["aria-invalid"] === true || props["aria-invalid"] === "true"
      }
      validationBehavior="aria"
      onSelectionChange={(key) => {
        edited();
        onChange?.(changeEvent<HTMLSelectElement>(String(key ?? "")));
      }}
    >
      {accessibleLabel === generatedLabel && (
        <span id={generatedLabel} className="visually-hidden">
          {props["aria-label"] ?? "Seleccionar"}
        </span>
      )}
      <AriaButton
        id={id}
        className={"control aria-select-control " + (className ?? "")}
        aria-labelledby={accessibleLabel}
        aria-invalid={props["aria-invalid"]}
        aria-describedby={props["aria-describedby"]}
        data-field-path={(props as Record<string, unknown>)["data-field-path"]}
        data-value={selection}
        autoFocus={props.autoFocus}
      >
        <SelectValue />
        <ChevronDown size={15} aria-hidden="true" />
      </AriaButton>
      <Popover className="aria-options" placement="bottom start" offset={1}>
        <ListBox className="aria-option-list">
          {[...new Set(options.map((option) => option.section))].map(
            (section) => {
              const items = options.filter(
                (option) => option.section === section,
              );
              const render = (option: Choice) => (
                <ListBoxItem
                  key={option.id}
                  id={option.id}
                  textValue={option.label}
                  isDisabled={option.disabled}
                  className="aria-option"
                >
                  {option.label}
                </ListBoxItem>
              );
              return section ? (
                <ListBoxSection key={section} id={section}>
                  <Header className="aria-option-section">{section}</Header>
                  {items.map(render)}
                </ListBoxSection>
              ) : (
                items.map(render)
              );
            },
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}
const suggestions = new Map<string, Choice[]>();
const listeners = new Map<string, Set<() => void>>();
const empty: Choice[] = [];
export function SuggestionList({
  id,
  children,
}: {
  id: string;
  children?: ReactNode;
}) {
  const choices = useMemo(() => readChoices(children), [children]);
  useEffect(() => {
    suggestions.set(id, choices);
    listeners.get(id)?.forEach((fn) => fn());
    return () => {
      suggestions.delete(id);
      listeners.get(id)?.forEach((fn) => fn());
    };
  }, [id, choices]);
  return null;
}
function useSuggestions(id: string) {
  return useSyncExternalStore(
    (listener) => {
      const set = listeners.get(id) ?? new Set();
      set.add(listener);
      listeners.set(id, set);
      return () => {
        set.delete(listener);
        if (!set.size) listeners.delete(id);
      };
    },
    () => suggestions.get(id) ?? empty,
    () => empty,
  );
}
type ComboProps = {
  options: Choice[];
  value: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSelectionChange: (id: string) => void;
  allowsCustomValue?: boolean;
  inputProps?: React.ComponentPropsWithRef<"input">;
};
export function ChoiceCombo({
  options,
  value,
  inputValue,
  onInputChange,
  onSelectionChange,
  allowsCustomValue = false,
  inputProps = {},
}: ComboProps) {
  inputProps = useControlValidation(inputProps);
  const edited = useContext(FieldEditContext);
  type Section = { id: string; label: string; children: Choice[] };
  const items = useMemo<(Choice | Section)[]>(() => {
    if (!options.some((option) => option.section)) return options;
    return [...new Set(options.map((option) => option.section))].map(
      (section) => ({
        id: `section-${section ?? "ungrouped"}`,
        label: section ?? "Opciones",
        children: options.filter((option) => option.section === section),
      }),
    );
  }, [options]);
  const renderOption = (option: Choice) => (
    <ListBoxItem
      id={option.id}
      textValue={option.label}
      isDisabled={option.disabled}
      className="aria-option"
    >
      <span>{option.label}</span>
      {option.description && <small>{option.description}</small>}
    </ListBoxItem>
  );
  const {
    id,
    name,
    disabled,
    required,
    className,
    placeholder,
    ref,
    ...attrs
  } = inputProps;
  return (
    <ComboBox
      className="aria-combo-root"
      {...labelProps({ id, ...attrs })}
      selectedKey={value || null}
      inputValue={inputValue}
      onInputChange={(value) => {
        edited();
        onInputChange(value);
      }}
      onSelectionChange={(key) => {
        edited();
        onSelectionChange(String(key ?? ""));
      }}
      defaultItems={items}
      allowsCustomValue={allowsCustomValue}
      allowsEmptyCollection
      menuTrigger="input"
      isDisabled={disabled}
      isRequired={required}
      name={name}
      isInvalid={
        attrs["aria-invalid"] === true || attrs["aria-invalid"] === "true"
      }
      validationBehavior="aria"
    >
      <div className="aria-combo-field">
        <Input
          {...attrs}
          ref={ref}
          id={id}
          className={className}
          placeholder={placeholder}
          autoComplete="off"
        />
        <AriaButton
          className="aria-combo-trigger"
          aria-label="Mostrar opciones"
        >
          <ChevronDown size={15} aria-hidden="true" />
        </AriaButton>
      </div>
      <Popover className="aria-options" placement="bottom start" offset={1}>
        <ListBox
          className="aria-option-list"
          renderEmptyState={() => (
            <span className="aria-options-empty">Sin coincidencias</span>
          )}
        >
          {(item: Choice | Section) =>
            "children" in item ? (
              <ListBoxSection id={item.id}>
                <Header className="aria-option-section">{item.label}</Header>
                <Collection items={item.children}>{renderOption}</Collection>
              </ListBoxSection>
            ) : (
              renderOption(item)
            )
          }
        </ListBox>
      </Popover>
    </ComboBox>
  );
}
function FreeTextInput(
  props: React.ComponentPropsWithRef<"input"> & { list: string },
) {
  const options = useSuggestions(props.list);
  const value = String(props.value ?? "");
  return (
    <ChoiceCombo
      options={options}
      value=""
      inputValue={value}
      onInputChange={(next) =>
        props.onChange?.(changeEvent<HTMLInputElement>(next))
      }
      onSelectionChange={(key) => {
        const option = options.find((o) => o.id === key);
        if (option) props.onChange?.(changeEvent<HTMLInputElement>(option.id));
      }}
      allowsCustomValue
      inputProps={{ ...props, list: undefined }}
    />
  );
}
function NumericInput({
  value,
  onChange,
  disabled,
  readOnly,
  required,
  ref,
  ...props
}: React.ComponentPropsWithRef<"input">) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <I18nProvider locale="en-US">
      <NumberField
        className="aria-text-root"
        commitBehavior="validate"
        {...labelProps(props)}
        value={value === "" || value == null ? NaN : Number(value)}
        onChange={(next) =>
          onChange?.(
            changeEvent(Number.isNaN(next) ? "" : String(next), input.current),
          )
        }
        isDisabled={disabled}
        isReadOnly={readOnly}
        isRequired={required}
        formatOptions={{ useGrouping: false, maximumFractionDigits: 20 }}
        step={
          props.step === "any" || props.step == null ? 1 : Number(props.step)
        }
        validationBehavior="aria"
      >
        <Input
          {...props}
          onChange={onChange}
          type="text"
          inputMode="decimal"
          ref={(node) => {
            input.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
          }}
        />
      </NumberField>
    </I18nProvider>
  );
}
export function ControlInput(props: React.ComponentPropsWithRef<"input">) {
  props = useControlValidation(props);
  if (props.list) return <FreeTextInput {...props} list={props.list} />;
  if (
    props.type === "number" &&
    !/precio|costo/.test(props.name ?? props.id ?? "")
  )
    return <NumericInput {...props} />;
  const { disabled, readOnly, required, value, defaultValue, ...attrs } = props;
  const Root = props.type === "search" ? SearchField : TextField;
  return (
    <Root
      className="aria-text-root"
      {...labelProps(props)}
      value={value == null ? undefined : String(value)}
      defaultValue={defaultValue == null ? undefined : String(defaultValue)}
      isDisabled={disabled}
      isReadOnly={readOnly}
      isRequired={required}
      validationBehavior="aria"
    >
      <Input
        {...attrs}
        type={props.type === "number" ? "text" : props.type}
        inputMode={props.type === "number" ? "decimal" : props.inputMode}
      />
    </Root>
  );
}
export function ControlTextArea({
  disabled,
  readOnly,
  required,
  value,
  defaultValue,
  ...props
}: React.ComponentPropsWithRef<"textarea">) {
  props = useControlValidation(props);
  return (
    <TextField
      className="aria-text-root"
      {...labelProps(props)}
      value={value == null ? undefined : String(value)}
      defaultValue={defaultValue == null ? undefined : String(defaultValue)}
      isDisabled={disabled}
      isReadOnly={readOnly}
      isRequired={required}
      validationBehavior="aria"
    >
      <TextArea {...props} />
    </TextField>
  );
}
export function ChoiceGroup(props: React.ComponentProps<typeof CheckboxGroup>) {
  const edited = useContext(FieldEditContext);
  return (
    <CheckboxGroup
      {...props}
      onChange={(value) => {
        edited();
        props.onChange?.(value);
      }}
    />
  );
}
export function CheckChoice({
  children,
  checked,
  onChange,
  disabled,
  indeterminate = false,
  className,
  value,
  id,
  ...props
}: {
  children: ReactNode;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  indeterminate?: boolean;
  className?: string;
  value?: string;
  id?: string;
  autoFocus?: boolean;
} & Omit<React.HTMLAttributes<HTMLLabelElement>, "onChange">) {
  const edited = useContext(FieldEditContext);
  return (
    <Checkbox
      {...(props as unknown as React.ComponentProps<typeof Checkbox>)}
      slot={null}
      id={id}
      value={value}
      isSelected={checked}
      isDisabled={disabled}
      isIndeterminate={indeterminate}
      onChange={(value) => {
        edited();
        onChange?.(value);
      }}
      className={"aria-checkbox " + (className ?? "")}
    >
      <span className="aria-check-indicator" aria-hidden="true">
        <Check size={12} />
      </span>
      {children}
    </Checkbox>
  );
}
