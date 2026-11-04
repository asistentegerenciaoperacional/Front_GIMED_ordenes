const caches = new WeakMap();
const frames = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

/** Reveal a logical column instead of assuming all spreadsheet columns stay mounted. */
export async function revealSheetColumn(page, key, row = 0) {
  await frames(page);
  const viewport = page.locator(".product-sheet-viewport");
  const table = page.locator(".product-sheet-grid");
  const total = Number(await table.getAttribute("aria-rowcount")) - 1;
  if (row >= total) return;
  const signature = await page.evaluate(
    () =>
      location.pathname +
      (new URLSearchParams(location.search).get("vista") ?? "seguimiento") +
      [...Object.keys(localStorage)]
        .filter((k) => k.includes("columns"))
        .map((k) => localStorage.getItem(k))
        .join("|"),
  );
  let cache = caches.get(page);
  if (!cache || cache.signature !== signature) {
    cache = { signature, offsets: new Map() };
    caches.set(page, cache);
  }
  const selector = `[data-sheet-row="${row}"][data-column-key="${key}"]`;
  const remember = async () => {
    const offsets = await table
      .locator("tbody tr:not(.sheet-spacer)")
      .first()
      .locator("[data-column-key]")
      .evaluateAll((cells) =>
        cells.map((cell) => [cell.dataset.columnKey, cell.offsetLeft]),
      );
    offsets.forEach(([k, x]) => cache.offsets.set(k, x));
  };
  if (!(await page.locator(`[data-sheet-row="${row}"]`).count())) {
    await viewport.evaluate((el, row) => {
      el.scrollTop = row * 32;
    }, row);
    await frames(page);
  }
  await remember();
  if (!(await page.locator(selector).count()) && cache.offsets.has(key)) {
    await viewport.evaluate((el, x) => {
      el.scrollLeft = x;
    }, cache.offsets.get(key));
    await frames(page);
  }
  if (!(await page.locator(selector).count())) {
    const size = await viewport.evaluate((el) => ({
      width: el.clientWidth,
      max: el.scrollWidth - el.clientWidth,
    }));
    for (
      let x = 0;
      x <= size.max + size.width;
      x += Math.max(100, size.width * 0.65)
    ) {
      await viewport.evaluate(
        (el, x) => {
          el.scrollLeft = x;
        },
        Math.min(x, size.max),
      );
      await frames(page);
      await remember();
      if (await page.locator(selector).count()) break;
    }
  }
  if (await page.locator(selector).count()) {
    await page.locator(selector).evaluate((cell) => {
      const viewport = cell.closest(".product-sheet-viewport");
      const rect = cell.getBoundingClientRect(),
        box = viewport.getBoundingClientRect();
      if (rect.left < box.left + 1)
        viewport.scrollLeft += rect.left - box.left - 1;
      else if (rect.right > box.right - 1)
        viewport.scrollLeft += rect.right - box.right + 1;
      if (rect.top < box.top + 44)
        viewport.scrollTop += rect.top - box.top - 44;
      else if (rect.bottom > box.bottom - 1)
        viewport.scrollTop += rect.bottom - box.bottom + 1;
    });
    await frames(page);
  }
}

/** Keep existing locator assertions, but perform actions against their logical cell. */
export function sheetCell(page, row, key) {
  const reveal = () => revealSheetColumn(page, key, row);
  const chain = new Set([
    "locator",
    "getByRole",
    "getByText",
    "getByLabel",
    "filter",
    "first",
    "last",
    "nth",
  ]);
  const wrap = (locator) =>
    new Proxy(locator, {
      get(target, property) {
        if (property === "then") return undefined;
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        if (chain.has(property))
          return (...args) => wrap(value.apply(target, args));
        return async (...args) => {
          await reveal();
          const result = await value.apply(target, args);
          if (["click", "dblclick", "press", "fill"].includes(property))
            await frames(page);
          return result;
        };
      },
    });
  return wrap(
    page.locator(`[data-sheet-row="${row}"][data-column-key="${key}"]`),
  );
}
