async (page) => {
  page = page.context().pages()[0];
  const { performance: clock } = await import("node:perf_hooks");
  const { mkdir, writeFile } = await import("node:fs/promises");
  const checks = [],
    snapshots = [],
    errors = [];
  const check = (ok, text) => {
    if (!ok) throw Error(text);
    checks.push(text);
  };
  page.on("pageerror", (e) => errors.push(e.message));
  const mode =
    process.env.PROTOTIPO_BROWSER_MODE === "development"
      ? "development"
      : "production";
  await page.evaluate(() =>
    localStorage.setItem("gimed:ui:product-order-sheet", "true"),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL(page.url()).origin + "/ordenes/productos");
  await page
    .locator('[data-sheet-row="0"][data-column-key="no_orden"]')
    .click();
  const cdp = await page.context().newCDPSession(page);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const keys = [
    ...Array(90).fill("ArrowDown"),
    ...Array(90).fill("ArrowUp"),
    ...Array(18).fill("ArrowRight"),
    ...Array(18).fill("ArrowLeft"),
  ];
  const codes = { ArrowDown: 40, ArrowUp: 38, ArrowRight: 39, ArrowLeft: 37 };
  let peak = 0;
  for (let cycle = 0; cycle < 10; cycle++) {
    const start = clock.now(),
      sends = [];
    let last;
    for (let i = 0; i < keys.length; i++) {
      const due = start + (i * 1000) / 60;
      if (due > clock.now()) await wait(due - clock.now());
      const key = keys[i];
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
      if (i % 30 === 0)
        sends.push(
          cdp.send("Runtime.getHeapUsage").then((h) => {
            peak = Math.max(peak, h.usedSize);
          }),
        );
    }
    sends.push(
      cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: last,
        code: last,
        windowsVirtualKeyCode: codes[last],
      }),
    );
    await Promise.all(sends);
    await page.waitForFunction(
      () =>
        !!document.querySelector(
          '[data-active][data-sheet-row="0"][data-sheet-column="0"]',
        ),
    );
    // Hysteresis legitimately leaves 2–6 spare rows. Compare identical windows,
    // including two large jumps to exercise removal rather than comparing different margins.
    await page.locator(".product-sheet-viewport").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.scrollLeft = el.scrollWidth;
    });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.locator(".product-sheet-viewport").evaluate((el) => {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    });
    await page.waitForFunction(
      () =>
        !!document.querySelector(
          '[data-active][data-sheet-row="0"][data-sheet-column="0"]',
        ),
    );
    await page.waitForTimeout(100);
    await cdp.send("HeapProfiler.collectGarbage");
    const heap = await cdp.send("Runtime.getHeapUsage"),
      dom = await cdp.send("Memory.getDOMCounters");
    const mounted = await page.locator("[data-sheet-row]").count();
    const rows = await page.locator("tbody tr[data-row-index]").count();
    snapshots.push({
      cycle: cycle + 1,
      heapMiB: heap.usedSize / 1048576,
      dom,
      mounted,
      rows,
    });
    await mkdir("tests/evidence/product-sheet-navigation", { recursive: true });
    await writeFile(
      `tests/evidence/product-sheet-navigation/${mode}-memory.json`,
      JSON.stringify(
        { mode, snapshots, peakMiB: peak / 1048576, complete: false },
        null,
        2,
      ),
    );
    check(
      rows < 50 && mounted < rows * 24,
      `Recorrido ${cycle + 1}: virtualización de filas y columnas acotada`,
    );
  }
  const tail = snapshots.slice(-3),
    heaps = tail.map((s) => s.heapMiB);
  check(
    Math.max(...heaps) - Math.min(...heaps) <= 10,
    "Los tres últimos heaps difieren menos de 10 MiB",
  );
  check(
    new Set(tail.map((s) => s.dom.nodes)).size === 1,
    "Los nodos se estabilizan tras los recorridos",
  );
  check(
    new Set(tail.map((s) => s.dom.jsEventListeners)).size === 1,
    "Los listeners se estabilizan tras los recorridos",
  );
  check(errors.length === 0, "Sin excepciones en diez recorridos consecutivos");
  const report = { mode, snapshots, peakMiB: peak / 1048576, checks, errors };
  await mkdir("tests/evidence/product-sheet-navigation", { recursive: true });
  await writeFile(
    `tests/evidence/product-sheet-navigation/${mode}-memory.json`,
    JSON.stringify(report, null, 2),
  );
  return report;
};
