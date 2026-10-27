import { CheckChoice } from "./components/controls";
import { setAlternativeOrderEntry, useUiPreferences } from "./ui-preferences";

export function AppearanceSettings() {
  const preferences = useUiPreferences();
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
          checked={preferences.alternativeOrderEntry}
          onChange={setAlternativeOrderEntry}
        >
          <span>Vista alternativa de creación de órdenes</span>
        </CheckChoice>
        <p className="compact-note">
          Presenta el primer paso como una hoja de la orden física, con siete
          filas editables. La revisión, edición de órdenes existentes e
          impresión no cambian. Se aplica al abrir un formulario nuevo.
        </p>
        {!preferences.persistent && (
          <div className="notice" role="status">
            El navegador bloquea el almacenamiento. La preferencia se mantiene
            solo durante esta sesión.
          </div>
        )}
      </div>
    </section>
  );
}
