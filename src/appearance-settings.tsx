import { useId } from "react";
import { CheckChoice } from "./components/controls";
import { setAlternativeOrderEntry, useUiPreferences } from "./ui-preferences";
import {
  setProductSheetPreference,
  useProductSheetPreference,
} from "./product-sheet-preferences";

export function AppearanceSettings() {
  const preferences = useUiPreferences();
  const sheet = useProductSheetPreference();
  const optionId = useId();
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Apariencia</h2>
          <p>Preferencias visuales de este navegador.</p>
        </div>
      </div>
      <div className="panel-body stack">
        <CheckChoice
          className="appearance-option"
          aria-labelledby={optionId + "-title"}
          aria-describedby={optionId + "-description"}
          checked={preferences.alternativeOrderEntry}
          onChange={setAlternativeOrderEntry}
        >
          <span className="appearance-option-copy">
            <strong id={optionId + "-title"}>
              Vista alternativa de creación de órdenes
            </strong>
            <span
              id={optionId + "-description"}
              className="appearance-option-description"
            >
              Visualizar la creación y edición de órdenes como el boceto de
              elaboración.
            </span>
          </span>
        </CheckChoice>
        <CheckChoice
          className="appearance-option"
          checked={sheet.enabled}
          onChange={setProductSheetPreference}
          aria-labelledby={optionId + "-sheet-title"}
          aria-describedby={optionId + "-sheet-description"}
        >
          <span className="appearance-option-copy">
            <strong id={optionId + "-sheet-title"}>
              Vista alternativa de la tabla de OC de productos
            </strong>
            <span
              id={optionId + "-sheet-description"}
              className="appearance-option-description"
            >
              Hoja editable por lotes, con herramientas, selección de celdas y
              recuperación del borrador en este navegador.
            </span>
          </span>
        </CheckChoice>
        {(!preferences.persistent || !sheet.persistent) && (
          <div className="notice" role="status">
            El navegador bloquea el almacenamiento. La preferencia se mantiene
            solo durante esta sesión.
          </div>
        )}
      </div>
    </section>
  );
}
