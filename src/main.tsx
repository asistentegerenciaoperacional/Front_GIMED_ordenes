import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { I18nProvider } from "react-aria-components/I18nProvider";
import { createRoot } from "react-dom/client";
import { Account } from "./account";
import "./components/aria.css";
import "./styles.css";
import "./account.css";
const queryClient = new QueryClient();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider locale="es-CO">
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <Account />
        </QueryClientProvider>
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>,
);
