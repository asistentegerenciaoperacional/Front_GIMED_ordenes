import React from "react";
import { I18nProvider } from "react-aria-components/I18nProvider";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./components/aria.css";
import { ConfirmationProvider } from "./components/overlays";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider locale="es-CO">
      <ConfirmationProvider>
        <App />
      </ConfirmationProvider>
    </I18nProvider>
  </React.StrictMode>,
);
