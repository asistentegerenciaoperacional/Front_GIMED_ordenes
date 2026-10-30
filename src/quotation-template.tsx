import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  quotationTemplate,
  quotationVariables,
  type QuotationTemplate,
} from "../shared/material-quotation";
import {
  ControlForm,
  ControlInput,
  ControlTextArea,
} from "./components/controls";
import { ApiError, Button, ErrorNotice, Field, useApp } from "./ui";

export function QuotationTemplateFields({
  value,
  onChange,
  fields = {},
  prefix = "",
}: {
  value: QuotationTemplate;
  onChange: (value: QuotationTemplate) => void;
  fields?: Record<string, string>;
  prefix?: string;
}) {
  return (
    <div className="stack quotation-template-fields">
      <Field
        id={`field-${prefix}asunto`}
        label="Asunto"
        required
        error={fields[`${prefix}asunto`]}
      >
        <ControlInput
          id={`field-${prefix}asunto`}
          name={`${prefix}asunto`}
          value={value.asunto}
          onChange={(event) =>
            onChange({ ...value, asunto: event.target.value })
          }
        />
      </Field>
      <Field
        id={`field-${prefix}cuerpo`}
        label="Mensaje"
        required
        error={fields[`${prefix}cuerpo`]}
      >
        <ControlTextArea
          id={`field-${prefix}cuerpo`}
          name={`${prefix}cuerpo`}
          rows={9}
          value={value.cuerpo}
          onChange={(event) =>
            onChange({ ...value, cuerpo: event.target.value })
          }
        />
      </Field>
      <p className="compact-note">
        Variables disponibles:{" "}
        {quotationVariables.map((name) => `{{${name}}}`).join(", ")}. Se
        sustituyen para cada material y proveedor.
      </p>
    </div>
  );
}

export function QuotationTemplateSettings() {
  const { db, run } = useApp();
  const [expected, setExpected] = useState(() => quotationTemplate(db));
  const [value, setValue] = useState(expected);
  const [error, setError] = useState<ApiError | null>(null);
  const guard = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const [, save, busy] = useActionState(async () => {
    try {
      await run(
        "saveQuotationTemplate",
        { plantilla: value, expected },
        "Plantilla de cotización guardada",
      );
      setExpected({ ...value });
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause
          : new ApiError({ message: (cause as Error).message }),
      );
    } finally {
      guard.current = false;
    }
    return null;
  }, null);
  useEffect(() => {
    if (!busy && error)
      form.current?.querySelector<HTMLElement>(".error-notice")?.focus();
  }, [busy, error]);
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Plantilla de cotización</h2>
          <p>
            Asunto y mensaje comunes para futuras cotizaciones de materiales.
          </p>
        </div>
      </div>
      <ControlForm
        ref={form}
        noValidate
        fieldErrors={error?.fields}
        onSubmit={(event) => {
          event.preventDefault();
          if (guard.current) return;
          guard.current = true;
          startTransition(save);
        }}
      >
        <div className="panel-body stack" inert={busy}>
          <ErrorNotice error={error} />
          {error?.code === "QUOTATION_TEMPLATE_CHANGED" && (
            <Button
              onClick={() => {
                const current = quotationTemplate(db);
                setExpected(current);
                setValue(current);
                setError(null);
              }}
            >
              Cargar plantilla actual
            </Button>
          )}
          <QuotationTemplateFields
            value={value}
            fields={error?.fields}
            onChange={(next) => {
              setValue(next);
              setError(null);
            }}
          />
          <p className="compact-note">
            Los ajustes realizados al preparar un envío no cambian esta
            plantilla global.
          </p>
        </div>
        <div className="dialog-footer">
          <Button
            type="submit"
            variant="primary"
            disabled={
              busy ||
              (db.plantilla_correo.some(
                (row) => row.tipo_evento === "cotizacion_materiales",
              ) &&
                value.asunto === expected.asunto &&
                value.cuerpo === expected.cuerpo)
            }
          >
            {busy ? "Guardando…" : "Guardar plantilla"}
          </Button>
        </div>
      </ControlForm>
    </section>
  );
}
