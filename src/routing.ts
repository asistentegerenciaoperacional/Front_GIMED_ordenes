export const routeEvent = "prototipo:navigate";

export type ScrollPosition = { top: number; tableLeft: number | null };
export type OrderListReturn = ScrollPosition & {
  path: string;
  detailPath: string;
};

export function normalizeRoute(path: string): string {
  const url = new URL(path.replace(/^\/?/, "/"), "http://local");
  if (url.pathname === "/" || url.pathname === "/ordenes") {
    const material = ["material", "otro"].includes(
      url.searchParams.get("tipo") ?? "",
    );
    url.pathname = `/ordenes/${material ? "materiales" : "productos"}`;
  }
  return url.pathname.slice(1) + url.search;
}

export function currentRoute(): string {
  return normalizeRoute(
    window.location.hash.startsWith("#/")
      ? window.location.hash.slice(2)
      : window.location.pathname + window.location.search,
  );
}

export function orderListReturnAfterNavigation(
  current: OrderListReturn | null,
  previousRoute: string,
  nextRoute: string,
  position: ScrollPosition,
): OrderListReturn | null {
  const previous = normalizeRoute(previousRoute);
  const previousPath = previous.split("?")[0];
  const nextPath = normalizeRoute(nextRoute).split("?")[0];
  const lists = ["ordenes/productos", "ordenes/materiales"];
  if (
    lists.includes(previousPath) &&
    /^ordenes\/[^/]+$/.test(nextPath) &&
    !lists.includes(nextPath)
  )
    return { ...position, path: `/${previous}`, detailPath: nextPath };
  return current &&
    (nextPath === current.detailPath ||
      nextPath === `${current.detailPath}/imprimir`)
    ? current
    : null;
}

export function replaceRoute(path: string): void {
  window.history.replaceState(null, "", `/${normalizeRoute(path)}`);
  window.dispatchEvent(new Event(routeEvent));
}
