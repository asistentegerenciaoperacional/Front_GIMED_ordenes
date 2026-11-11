import React from "react";
import { I18nProvider } from "react-aria-components/I18nProvider";
import { createRoot } from "react-dom/client";
import { Account } from "./account";
import "./components/aria.css";
import "./styles.css";
import "./account.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider locale="es-CO">
      <Account />
    </I18nProvider>
  </React.StrictMode>,
);
