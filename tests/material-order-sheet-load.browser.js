async (page) => {
  page = page.context().pages()[0];
  const origin = new URL(page.url()).origin;
  const checks = [],
    returns = [],
    memory = [];
  const check = (condition, label) => {
    if (!condition) throw Error(label);
    checks.push(label);
  };
  const frames = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() =>
    localStorage.setItem("gimed:ui:product-order-sheet", "true"),
  );
  const start = Date.now();
  await page.goto(origin + "/ordenes/materiales");
  const grid = page.getByRole("grid", {
    name: "Órdenes de materiales por renglón",
  });
  await grid.waitFor();
  await frames();
  const loadMs = Date.now() - start;
  check(
    Number(await grid.getAttribute("aria-rowcount")) >= 5001,
    "La hoja carga al menos 5.000 renglones reales de OCM",
  );
  const viewport = page.locator(".product-sheet-viewport");
  const cdp = await page.context().newCDPSession(page);
  let maxRows = 0,
    maxCells = 0;
  for (let cycle = 0; cycle < 10; cycle++) {
    const top = (120 + cycle * 100) * 32;
    const left = 600;
    await viewport.evaluate(
      (el, [top, left]) => {
        el.scrollTop = top;
        el.scrollLeft = left;
      },
      [top, left],
    );
    await frames();
    await page.getByRole("button", { name: "Productos", exact: true }).click();
    await page
      .getByRole("grid", { name: "Órdenes de productos por lote" })
      .waitFor();
    const started = Date.now();
    await page.goBack();
    await grid.waitFor();
    await page.waitForFunction(
      ([top, left]) => {
        const el = document.querySelector(
          ".material-order-sheet .product-sheet-viewport",
        );
        return (
          el &&
          el.scrollTop === top &&
          el.scrollLeft === left &&
          !!el.querySelector(`[data-sheet-row="${top / 32 + 1}"]`)
        );
      },
      [top, left],
    );
    returns.push(Date.now() - started);
    maxRows = Math.max(
      maxRows,
      await grid.locator("tr[data-row-index]").count(),
    );
    maxCells = Math.max(
      maxCells,
      await grid.locator("td[data-sheet-row]").count(),
    );
    await cdp.send("HeapProfiler.collectGarbage");
    const heap = await cdp.send("Runtime.getHeapUsage");
    const dom = await cdp.send("Memory.getDOMCounters");
    memory.push({ heapMiB: heap.usedSize / 1048576, ...dom });
  }
  check(
    maxRows < 50 && maxCells < maxRows * 16,
    "El DOM virtual conserva un número acotado de filas y columnas",
  );
  check(
    returns.every((value) => value < 4000),
    "Los diez retornos restauran los dos ejes dentro del presupuesto",
  );
  const tail = memory.slice(-3).map((sample) => sample.heapMiB);
  check(
    Math.max(...tail) - Math.min(...tail) < 10,
    "La memoria se estabiliza después de GC en los últimos tres retornos",
  );
  return { checks, loadMs, returns, maxRows, maxCells, memory };
};
