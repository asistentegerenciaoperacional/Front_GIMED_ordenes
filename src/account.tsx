import { useEffect, useState, type FormEvent } from "react";
import type { usuario } from "../shared/models";
import { App } from "./App";
import { ControlForm, ControlInput } from "./components/controls";
import { ConfirmationProvider } from "./components/overlays";
import { migrateLegacyProductSheetDraft } from "./product-sheet-preferences";
import { apiUrl, pilot } from "./shared/api/routes";
import {
  ApiError,
  Button,
  Field,
  Loading,
  LinkButton,
  request,
  sessionExpiredEvent,
} from "./ui";

export function Account() {
  const [user, setUser] = useState<usuario | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() =>
    new URLSearchParams(location.search).get("acceso") === "error"
      ? "No se pudo iniciar sesión. Usa tu cuenta corporativa de GIMED."
      : "",
  );

  useEffect(() => {
    let active = true;
    const expired = () => {
      setUser(null);
      setError("La sesión terminó. Inicia sesión para continuar.");
    };
    window.addEventListener(sessionExpiredEvent, expired);
    void request("auth/session").then(
      ({ usuario }) => {
        if (active) {
          migrateLegacyProductSheetDraft(usuario.id);
          setUser(usuario);
        }
      },
      (failure: ApiError) => {
        if (!active) return;
        setUser(null);
        if (failure.code !== "AUTH_REQUIRED") setError(failure.message);
      },
    );
    return () => {
      active = false;
      window.removeEventListener(sessionExpiredEvent, expired);
    };
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await request("auth/login", {
        email: String(data.get("email") ?? "").trim(),
        password: data.get("password"),
      });
      migrateLegacyProductSheetDraft(response.usuario.id);
      setUser(response.usuario);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined) return <Loading />;
  if (user)
    return (
      <ConfirmationProvider>
        <App
          user={user}
          onLogout={async () => {
            await request("auth/logout", {});
            setError("");
            setUser(null);
          }}
        />
      </ConfirmationProvider>
    );
  return (
    <main className="account-page">
      <ControlForm className="account-form panel" onSubmit={login}>
        <p className="mini-label">GIMED</p>
        <h1>Iniciar sesión</h1>
        {error && (
          <p role="alert" className="account-error">
            {error}
          </p>
        )}
        {pilot ? (
          <LinkButton variant="primary" href={apiUrl("auth/inicio")}>
            Continuar con Google Workspace
          </LinkButton>
        ) : <>
        <Field id="field-email" label="Correo electrónico" required>
          <ControlInput type="email" autoComplete="username" />
        </Field>
        <Field id="field-password" label="Contraseña" required>
          <ControlInput type="password" autoComplete="current-password" />
        </Field>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Ingresando…" : "Iniciar sesión"}
        </Button>
        </>}
      </ControlForm>
    </main>
  );
}
