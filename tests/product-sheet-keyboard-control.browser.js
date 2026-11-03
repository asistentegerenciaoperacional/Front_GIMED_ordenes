async (page) => {
  page = page.context().pages()[0];
  page.setDefaultTimeout(45000);
  const { performance: clock } = await import("node:perf_hooks");
  const checks = [],
    results = [],
    errors = [];
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  const origin = new URL(page.url()).origin;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluate(() =>
    localStorage.setItem("gimed:ui:product-order-sheet", "true"),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/ordenes/productos");
  await page.locator(".product-sheet-grid").waitFor();
  const hookInfo = await page.evaluate(() => ({
    type: typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__,
    customDiagnostic: typeof window.__keyboardDiagnostic,
  }));
  check(
    hookInfo.customDiagnostic === "undefined",
    "Control sin instrumentación propia de commits ni perfilador de CPU",
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const p95 = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[
      Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
    ];
  };
  async function run(name, sequence) {
    await cdp.send("HeapProfiler.collectGarbage");
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.__keyControl = [];
      window.__keyControlListener = (e) => {
        if (e.key.startsWith("Arrow"))
          window.__keyControl.push({
            key: e.key,
            delay: performance.now() - e.timeStamp,
            trusted: e.isTrusted,
          });
      };
      window.addEventListener("keydown", window.__keyControlListener, true);
    });
    const before = await cdp.send("Runtime.getHeapUsage");
    const mounted = await page.locator("[data-sheet-row]").count();
    const sends = [],
      start = clock.now();
    let last;
    const codes = { ArrowRight: 39, ArrowLeft: 37, ArrowDown: 40 };
    for (let i = 0; i < sequence.length; i++) {
      const due = start + (i * 1000) / 60;
      if (due > clock.now()) await wait(due - clock.now());
      const key = sequence[i];
      if (last && last !== key)
        sends.push(
          cdp.send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: last,
            code: last,
            windowsVirtualKeyCode: codes[last],
          }),
        );
      sends.push(
        cdp.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key,
          code: key,
          windowsVirtualKeyCode: codes[key],
          autoRepeat: last === key,
          timestamp: Date.now() / 1000,
        }),
      );
      last = key;
    }
    const enqueueMs = clock.now() - start;
    sends.push(
      cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: last,
        code: last,
        windowsVirtualKeyCode: codes[last],
      }),
    );
    await Promise.all(sends);
    const drainMs = clock.now() - start - enqueueMs;
    await page.waitForTimeout(300);
    const keys = await page.evaluate(() => {
      window.removeEventListener("keydown", window.__keyControlListener, true);
      return window.__keyControl;
    });
    const heapBeforeGc = await cdp.send("Runtime.getHeapUsage");
    await cdp.send("HeapProfiler.collectGarbage");
    const heapAfterGc = await cdp.send("Runtime.getHeapUsage");
    const report = {
      name,
      keysSent: sequence.length,
      keysReceived: keys.length,
      inputRate: 60,
      enqueueMs,
      drainMs,
      inputDelayP95Ms: p95(keys.map((item) => item.delay)),
      mountedCells: mounted,
      heapBefore: before.usedSize,
      heapAfter: heapBeforeGc.usedSize,
      heapAfterGc: heapAfterGc.usedSize,
      active: await page.locator("[data-active]").evaluate((cell) => ({
        row: Number(cell.dataset.sheetRow),
        column: Number(cell.dataset.sheetColumn),
      })),
    };
    results.push(report);
    console.log(JSON.stringify(report));
    check(
      keys.length === sequence.length && keys.every((item) => item.trusted),
      `${name}: todas las teclas reales recibidas`,
    );
  }
  await page
    .locator('[data-sheet-row="0"][data-column-key="no_orden"]')
    .click();
  const horizontal = Array.from({ length: 4 }, () => [
    ...Array(18).fill("ArrowRight"),
    ...Array(18).fill("ArrowLeft"),
  ]).flat();
  await run("full-window-horizontal", horizontal);
  const mode = process.env.PROTOTIPO_BROWSER_MODE === "development";
  await run("full-window-vertical", Array(mode ? 80 : 180).fill("ArrowDown"));
  await page
    .getByRole("searchbox", { name: "Buscar en la hoja de OC", exact: true })
    .fill("PRO-26-012");
  await page
    .locator('[data-sheet-row="0"][data-column-key="no_orden"]')
    .click();
  check(
    (await page
      .locator(".product-sheet-grid tbody tr:not(.sheet-spacer)")
      .count()) === 1,
    "Mismo modelo con un solo lote visible para aislar el coste del render",
  );
  await run("one-row-horizontal", horizontal);
  check(errors.length === 0, "Sin excepciones en los controles");
  return {
    checks,
    results,
    pageErrors: errors,
    hookInfo,
    instrumentation:
      "No custom commit hook, no CPU profiler, no frame/DOM observers; Vite's usual Refresh hook remains in development; key capture only; no data commands",
  };
};
