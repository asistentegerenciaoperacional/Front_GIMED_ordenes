import {
  Barcode,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  FolderOpen,
  Mail,
  Menu,
  LogOut,
  Package,
  ReceiptText,
  RefreshCw,
  Settings2,
  Truck,
  X,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Database, usuario } from "../shared/models";
import type { Row } from "../shared/schema";
import { shareSnapshotStrings } from "./snapshot-memory";
import { ControlLink } from "./components/controls";
import { confirmAction } from "./components/overlays";
import { NavigationDrawer, PIN_NAVIGATION_QUERY } from "./navigation-drawer";
import { OrderDetail, OrdersPage, PrintOrder } from "./orders";
import {
  currentRoute,
  normalizeRoute,
  orderListReturnAfterNavigation,
  routeEvent,
  type OrderListReturn,
  type ScrollPosition,
} from "./routing";
import { ApiError, AppContext, Button, Empty, Loading, request } from "./ui";
import { commandRoutes, pilot } from "./shared/api/routes";
import { applyChanges, type Changes } from "./shared/api/changes";
import { useQueryClient } from "@tanstack/react-query";
const CatalogPage = lazy(() =>
  import("./catalogs").then((module) => ({ default: module.CatalogPage })),
);
const SupplyPage = lazy(() =>
  import("./flows").then((module) => ({ default: module.SupplyPage })),
);
const InvoicesPage = lazy(() =>
  import("./flows").then((module) => ({ default: module.InvoicesPage })),
);
const CodesPage = lazy(() =>
  import("./flows").then((module) => ({ default: module.CodesPage })),
);
const EmailsPage = lazy(() =>
  import("./flows").then((module) => ({ default: module.EmailsPage })),
);
const SettingsPage = lazy(() =>
  import("./flows").then((module) => ({ default: module.SettingsPage })),
);
const DocumentsPage = lazy(() =>
  import("./flows").then((module) => ({ default: module.DocumentsPage })),
);
const navigation = [
  { id: "ordenes", label: "Órdenes de compra", icon: ClipboardList },
  { id: "abastecimiento", label: "Abastecimiento", icon: Boxes },
  { id: "catalogos", label: "Catálogos", icon: Package },
  { id: "codigos", label: "Códigos de barras", icon: Barcode },
  { id: "proveedores", label: "Proveedores", icon: Truck },
  { id: "facturas", label: "Facturas", icon: ReceiptText },
  { id: "documentos", label: "Documentos", icon: FolderOpen },
  { id: "correos", label: "Correos", icon: Mail },
];
export function App({ user, onLogout }: { user: usuario; onLogout: () => Promise<void> }) {
  const queryClient = useQueryClient();
  const modelRef = useRef<Database | null>(null);
  const revisionRef = useRef(0);
  const [db, setDb] = useState<Database | null>(null),
    [loadError, setLoadError] = useState(""),
    [route, setRoute] = useState(currentRoute),
    [navOpen, setNavOpen] = useState(false),
    [navPinned, setNavPinned] = useState(false),
    [saving, setSaving] = useState(0);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [canPinNavigation, setCanPinNavigation] = useState(
    () => window.matchMedia(PIN_NAVIGATION_QUERY).matches,
  );
  useLayoutEffect(() => {
    const media = window.matchMedia(PIN_NAVIGATION_QUERY);
    const update = () => {
      setCanPinNavigation(media.matches);
      if (!media.matches && navPinned) {
        setNavPinned(false);
        setNavOpen(true);
      }
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [navPinned]);
  const pendingScrollRestore = useRef<ScrollPosition | null>(null);
  const orderListReturn = useRef<OrderListReturn | null>(null);
  const navigationFocus = useRef<"menu" | "content" | null>(null);
  const closeNavigation = useCallback(() => {
    navigationFocus.current = "menu";
    setNavOpen(false);
  }, []);
  const changeNavigationPinned = useCallback(
    (pinned: boolean) => {
      if (pinned && !canPinNavigation) return;
      setNavPinned(pinned);
      setNavOpen(!pinned);
    },
    [canPinNavigation],
  );
  useLayoutEffect(() => {
    if (navOpen || !navigationFocus.current) return;
    const target =
      navigationFocus.current === "menu"
        ? menuRef.current
        : document.getElementById("main-content");
    navigationFocus.current = null;
    let followup = 0;
    const frame = requestAnimationFrame(() => {
      followup = requestAnimationFrame(() =>
        target?.focus({ preventScroll: true }),
      );
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(followup);
    };
  }, [navOpen, route]);
  useLayoutEffect(() => {
    const position = pendingScrollRestore.current;
    if (position === null) return;
    pendingScrollRestore.current = null;
    let followup = 0;
    const frame = requestAnimationFrame(() => {
      followup = requestAnimationFrame(() => {
        if (position.tableLeft !== null)
          document
            .querySelector(".orders-table")
            ?.closest(".table-scroll")
            ?.scrollTo({ left: position.tableLeft, behavior: "instant" });
        window.scrollTo({ top: position.top, behavior: "instant" });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(followup);
    };
  }, [route]);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousRoute = useRef(route);
  const intentionalNavigation = useRef(false);
  const notify = useCallback((message: string, error = false) => {
    setToast({ message, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 7000);
  }, []);
  const load = useCallback(
    async (beforeSnapshot?: (snapshot: Database) => void) => {
      try {
        const response = pilot
          ? await queryClient.fetchQuery({ queryKey: ["contexto", user.id], queryFn: () => request("contexto"), staleTime: 0 })
          : null;
        if (response && response.revision < revisionRef.current && modelRef.current) {
          beforeSnapshot?.(modelRef.current);
          return;
        }
        const snapshot = shareSnapshotStrings(response ? response.data : await request("state"));
        if (response) revisionRef.current = response.revision;
        beforeSnapshot?.(snapshot);
        modelRef.current = snapshot;
        setDb(snapshot);
        setLoadError("");
      } catch (e) {
        setLoadError((e as Error).message);
      }
    },
    [queryClient, user.id],
  );
  useEffect(() => {
    void load();
    window.history.replaceState(null, "", `/${previousRoute.current}`);
    const changed = async () => {
      if (
        !intentionalNavigation.current &&
        document.querySelector('.dialog[data-dirty="true"]') &&
        !(await confirmAction(
          "Hay cambios sin guardar. ¿Salir del formulario?",
        ))
      ) {
        window.history.replaceState(null, "", `/${previousRoute.current}`);
        return;
      }
      intentionalNavigation.current = false;
      const next = currentRoute();
      const table = document
        .querySelector(".orders-table")
        ?.closest(".table-scroll");
      orderListReturn.current = orderListReturnAfterNavigation(
        orderListReturn.current,
        previousRoute.current,
        next,
        {
          top: Math.round(window.scrollY),
          tableLeft: table ? Math.round(table.scrollLeft) : null,
        },
      );
      const fromDrawer = document
        .getElementById("app-navigation")
        ?.matches('[data-modal="true"]');
      if (fromDrawer) navigationFocus.current = "content";
      previousRoute.current = next;
      window.history.replaceState(null, "", `/${next}`);
      setRoute(next);
      setNavOpen(false);
    };
    const clicked = async (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const link = (e.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target || link.hasAttribute("download")) return;
      const href = link.getAttribute("href")!;
      if (
        !href.startsWith("/") ||
        href.startsWith("//") ||
        href.startsWith("/api/")
      )
        return;
      e.preventDefault();
      if (
        document.querySelector('.dialog[data-dirty="true"]') &&
        !(await confirmAction(
          "Hay cambios sin guardar. ¿Salir del formulario?",
        ))
      )
        return;
      const next = normalizeRoute(href);
      const restoreValue = link.dataset.restoreScroll;
      const restoreScroll =
        restoreValue && /^\d+$/.test(restoreValue)
          ? Number(restoreValue)
          : null;
      const restoreTableValue = link.dataset.restoreTableScroll;
      const restoreTableScroll =
        restoreTableValue && /^\d+$/.test(restoreTableValue)
          ? Number(restoreTableValue)
          : null;
      const navigationPanel = document.getElementById("app-navigation");
      if (navigationPanel?.contains(link)) {
        if (
          next === previousRoute.current &&
          !navigationPanel.matches('[data-modal="true"]')
        )
          document
            .getElementById("main-content")
            ?.focus({ preventScroll: true });
        else navigationFocus.current = "content";
      }
      if (next !== previousRoute.current) {
        if (restoreScroll !== null)
          pendingScrollRestore.current = {
            top: restoreScroll,
            tableLeft: restoreTableScroll,
          };
        window.history.pushState(null, "", `/${next}`);
      }
      intentionalNavigation.current = true;
      changed();
      if (restoreScroll === null)
        window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", changed);
    window.addEventListener("popstate", changed);
    window.addEventListener(routeEvent, changed);
    document.addEventListener("click", clicked);
    return () => {
      window.removeEventListener("hashchange", changed);
      window.removeEventListener("popstate", changed);
      window.removeEventListener(routeEvent, changed);
      document.removeEventListener("click", clicked);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [load]);
  const navigate = useCallback((path: string) => {
    const next = normalizeRoute(path);
    intentionalNavigation.current = true;
    if (next !== previousRoute.current)
      window.history.pushState(null, "", `/${next}`);
    window.dispatchEvent(new Event(routeEvent));
    setNavOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const updateData = useCallback(async (changes: Changes, revision?: number, beforeSnapshot?: (snapshot: Database) => void) => {
    if (!modelRef.current) return;
    if (revision === undefined || revision > revisionRef.current + 1 ||
        (revision > revisionRef.current && !Object.keys(changes).length)) {
      await load(beforeSnapshot);
      void queryClient.invalidateQueries({ queryKey: ["ordenes", user.id] });
      return;
    }
    if (revision <= revisionRef.current) {
      beforeSnapshot?.(modelRef.current);
      return;
    }
    const snapshot = applyChanges(modelRef.current, changes);
    beforeSnapshot?.(snapshot);
    revisionRef.current = revision;
    modelRef.current = snapshot;
    queryClient.setQueryData(["contexto", user.id], { data: snapshot, revision });
    void queryClient.invalidateQueries({ queryKey: ["ordenes", user.id] });
    setDb(snapshot);
  }, [load, queryClient, user.id]);
  const run = useCallback(
    async (
      name: string,
      payload: Row,
      message?: string,
      beforeSnapshot?: (snapshot: Database) => void,
    ) => {
      setSaving((n) => n + 1);
      try {
        const response = pilot
          ? await request(
              name === "deleteDocument" ? "documentos/" + payload.id + "/eliminar" : commandRoutes[name],
              payload,
              typeof payload.request_key === "string" ? payload.request_key : undefined,
            )
          : await request("commands", { name, payload });
        const { result } = response;
        if (pilot) await updateData(response.changes, response.revision, beforeSnapshot);
        else {
          const snapshot = shareSnapshotStrings(await request("state"));
          beforeSnapshot?.(snapshot);
          modelRef.current = snapshot;
          setDb(snapshot);
        }
        const failedMail = pilot && ["sendMail", "sendMaterialQuotations"].includes(name) &&
          (result.messages ?? [result.row]).some((item: Row) => item.status !== "sent");
        if (failedMail) {
          const messages = (result.messages ?? [result.row]) as Row[];
          const confirmed = messages.filter((item) => item.status === "sent").length;
          const uncertain = messages.filter((item) => item.status === "uncertain").length;
          throw new ApiError({ code: "MAIL_DELIVERY", message: `Confirmados: ${confirmed}. Rechazados: ${messages.length - confirmed - uncertain}. Por verificar en Gmail: ${uncertain}.` });
        }
        if (message) notify(message);
        return result;
      } catch (error) {
        if (
          error instanceof ApiError &&
          (error.code === "CONSECUTIVE_CHANGED" ||
            error.code === "SHEET_CHANGED" ||
            error.code === "ORDER_CHANGED" ||
            error.code === "LOT_STATE_CHANGED" ||
            error.code === "AUTHORIZATION_CHANGED" ||
            error.code === "QUOTATION_CHANGED" ||
            error.code === "QUOTATION_TEMPLATE_CHANGED" ||
            error.code === "SUPPLY_CHANGED" ||
            error.code === "FAVORITES_CHANGED" ||
            error.code === "PRODUCT_MATERIALS_CHANGED" ||
            error.code === "BARCODE_CHANGED" ||
            error.code === "COST_PERIOD_CONFLICT" ||
            (["createOrder", "editOrder"].includes(name) &&
              Object.keys(error.fields).some((field) =>
                /^lines\.\d+\.id_producto$/.test(field),
              )))
        )
          await load(beforeSnapshot);
        throw error;
      } finally {
        setSaving((n) => n - 1);
      }
    },
    [notify, load, updateData],
  );
  const url = new URL(`http://local/${route}`),
    parts = url.pathname.slice(1).split("/"),
    page = parts[0],
    id = parts[1],
    print = page === "ordenes" && parts[2] === "imprimir";
  const title =
    page === "configuracion"
      ? "Configuración"
      : (navigation.find((n) => n.id === page)?.label ?? "Órdenes de compra");
  if (!db)
    return (
      <div style={{ maxWidth: 600, margin: "12vh auto", padding: 24 }}>
        {loadError ? (
          <Empty
            title="Servicio local no disponible"
            description={loadError}
            action={
              <Button
                icon={RefreshCw}
                variant="primary"
                onClick={() => void load()}
              >
                Reintentar
              </Button>
            }
          />
        ) : (
          <Loading />
        )}
      </div>
    );
  let content;
  if (page === "ordenes")
    content =
      id && !["productos", "materiales"].includes(id) ? (
        print ? (
          <PrintOrder id={id} />
        ) : (
          <OrderDetail key={id} id={id} listReturn={orderListReturn.current} />
        )
      ) : (
        <OrdersPage
          group={id === "materiales" ? "materiales" : "productos"}
          params={url.searchParams}
        />
      );
  else if (page === "abastecimiento")
    content = <SupplyPage params={url.searchParams} />;
  else if (page === "facturas")
    content = (
      <InvoicesPage key={id ?? "list"} id={id} params={url.searchParams} />
    );
  else if (page === "catalogos" || page === "proveedores")
    content = <CatalogPage key={page} group={page} params={url.searchParams} />;
  else if (page === "codigos") content = <CodesPage />;
  else if (page === "documentos") content = <DocumentsPage />;
  else if (page === "correos") content = <EmailsPage />;
  else if (page === "configuracion") content = <SettingsPage />;
  else
    content = (
      <Empty
        title="Página no encontrada"
        action={
          <Button onClick={() => navigate("ordenes")}>Ir a órdenes</Button>
        }
      />
    );
  return (
    <AppContext.Provider value={{ db, run, navigate, notify, updateData, userId: user.id }}>
      {print ? (
        content
      ) : (
        <div className={`shell${navPinned ? " nav-pinned" : ""}`}>
          <ControlLink
            className="skip-link"
            href="#main-content"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("main-content")?.focus();
            }}
          >
            Saltar al contenido
          </ControlLink>
          <NavigationDrawer
            open={navOpen}
            pinned={navPinned}
            canPin={canPinNavigation}
            onClose={closeNavigation}
            onPinnedChange={changeNavigationPinned}
          >
            <span className="nav-label">OPERACIÓN</span>
            <nav className="nav" aria-label="Navegación principal">
              {navigation.map((n) => (
                <ControlLink
                  key={n.id}
                  href={`/${n.id}`}
                  className={page === n.id ? "active" : ""}
                  aria-current={page === n.id ? "page" : undefined}
                >
                  <n.icon size={18} aria-hidden="true" />
                  <span className="nav-text">{n.label}</span>
                </ControlLink>
              ))}
            </nav>
            <div className="nav-divider" />
            <nav className="nav" aria-label="Configuración">
              <ControlLink
                href="/configuracion"
                className={page === "configuracion" ? "active" : ""}
                aria-current={page === "configuracion" ? "page" : undefined}
              >
                <Settings2 size={18} aria-hidden="true" />
                <span className="nav-text">Configuración</span>
              </ControlLink>
            </nav>
          </NavigationDrawer>
          <div className="main-area" inert={navOpen && !navPinned}>
            <header className="topbar">
              <div className="inline">
                {!navPinned && (
                  <Button
                    ref={menuRef}
                    className="menu-btn icon-btn"
                    icon={Menu}
                    aria-label="Abrir navegación"
                    aria-haspopup="dialog"
                    aria-expanded={navOpen}
                    aria-controls="app-navigation"
                    onClick={() => setNavOpen(!navOpen)}
                  />
                )}
                <div className="breadcrumbs">
                  <span>Compras</span>
                  <ChevronRight size={12} aria-hidden="true" />
                  <strong>{title}</strong>
                </div>
              </div>
              <div className="topbar-right">
                <span className="avatar" aria-label={user.nombre}>
                  {user.nombre.slice(0, 2).toUpperCase()}
                </span>
                <Button
                  variant="ghost"
                  icon={LogOut}
                  aria-label="Cerrar sesión"
                  title={`${user.nombre} · Cerrar sesión`}
                  onClick={() => void onLogout().catch((error: Error) => notify(error.message, true))}
                />
              </div>
            </header>
            <main id="main-content" className="content" tabIndex={-1}>
              <Suspense fallback={<Loading />}>{content}</Suspense>
            </main>
          </div>
        </div>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{toast.message}</span>
          <Button
            variant="ghost"
            className="icon-btn"
            icon={X}
            aria-label="Cerrar aviso"
            onClick={() => setToast(null)}
          />
        </div>
      )}
    </AppContext.Provider>
  );
}
