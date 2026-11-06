import { costDay } from "../shared/maquila-costs";

const storageKey = "gimed:ui:last-product-order";
type ProductOrderDefaults = { supplier: string; delivery: string };
let memoryDefaults: ProductOrderDefaults | null = null;

export function readProductOrderDefaults(): Partial<ProductOrderDefaults> {
  if (memoryDefaults) return memoryDefaults;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    return {
      supplier:
        typeof saved?.supplier === "string" ? saved.supplier : undefined,
      delivery: costDay(saved?.delivery) ?? undefined,
    };
  } catch {
    return {};
  }
}

export function rememberProductOrder(supplier: string, delivery: string) {
  const defaults = { supplier, delivery };
  try {
    localStorage.setItem(storageKey, JSON.stringify(defaults));
    memoryDefaults = null;
  } catch {
    memoryDefaults = defaults;
  }
}
