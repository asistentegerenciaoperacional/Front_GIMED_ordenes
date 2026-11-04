async (page) => {
  page = page.context().pages()[0];
  const { performance: clock } = await import("node:perf_hooks");
  const { mkdir, writeFile } = await import("node:fs/promises");
  const mode =
    process.env.PROTOTIPO_BROWSER_MODE === "development"
      ? "development"
      : "production";
  const checks = [],
    results = [],
    errors = [],
    writes = [];
  const check = (ok, label) => {
    if (!ok) throw Error(label);
    checks.push(label);
  };
  const out = "tests/evidence/product-sheet-navigation";
  await mkdir(out, { recursive: true });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/commands"))
      writes.push(r.postData());
  });
  const origin = new URL(page.url()).origin;
  await page.evaluate(() =>
    localStorage.setItem("gimed:ui:product-order-sheet", "true"),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/ordenes/productos");
  const viewport = page.locator(".product-sheet-viewport");
  await viewport.waitFor();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const percentile = (values, p) => {
    const a = [...values].sort((a, b) => a - b);
    return a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
  };
  const active = () =>
    page.locator("[data-active]").evaluate((cell) => ({
      row: +cell.dataset.sheetRow,
      column: +cell.dataset.sheetColumn,
    }));
  const metrics = async () =>
    Object.fromEntries(
      (await cdp.send("Performance.getMetrics")).metrics.map((m) => [
        m.name,
        m.value,
      ]),
    );
  async function reset() {
    await viewport.evaluate((el) => {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    });
    await page
      .locator('[data-sheet-row="0"][data-column-key="no_orden"]')
      .click();
    await page.waitForFunction(
      () =>
        !!document.querySelector(
          '[data-active][data-sheet-row="0"][data-sheet-column="0"]',
        ),
    );
  }
  await reset();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(500);
  const cases = [
    { name: "paced-vertical", hz: 8, keys: Array(24).fill("ArrowDown") },
    {
      name: "horizontal",
      hz: 60,
      keys: Array.from({ length: 4 }, () => [
        ...Array(18).fill("ArrowRight"),
        ...Array(18).fill("ArrowLeft"),
      ]).flat(),
    },
    { name: "vertical", hz: 60, keys: Array(180).fill("ArrowDown") },
    { name: "edge", hz: 60, keys: Array(120).fill("ArrowLeft") },
    {
      name: "sustained",
      hz: 30,
      keys: [...Array(90).fill("ArrowDown"), ...Array(60).fill("ArrowUp")],
    },
    {
      name: "shift-range",
      hz: 30,
      shift: true,
      keys: [
        ...Array(45).fill("ArrowDown"),
        ...Array(18).fill("ArrowRight"),
        ...Array(18).fill("ArrowLeft"),
      ],
    },
  ];
  const keyCodes = {
    ArrowDown: 40,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowLeft: 37,
  };
  for (let repetition = 0; repetition < 3; repetition++) {
    for (const scenario of cases) {
      await reset();
      await cdp.send("HeapProfiler.collectGarbage");
      await page.waitForTimeout(100);
      const before = await metrics();
      await page.evaluate(() => {
        const d = (window.__navigationMeasurement = {
          keys: [],
          frames: [],
          active: true,
          last: performance.now(),
          mutations: 0,
        });
        d.listener = (e) => {
          if (e.key.startsWith("Arrow"))
            d.keys.push({
              key: e.key,
              delay: performance.now() - e.timeStamp,
              trusted: e.isTrusted,
            });
        };
        addEventListener("keydown", d.listener, true);
        const frame = (time) => {
          if (!d.active) return;
          d.frames.push(time - d.last);
          d.last = time;
          d.frame = requestAnimationFrame(frame);
        };
        d.frame = requestAnimationFrame(frame);
        d.observer = new MutationObserver((records) => {
          for (const r of records)
            d.mutations += r.addedNodes.length + r.removedNodes.length;
        });
        d.observer.observe(
          document.querySelector(".product-sheet-grid tbody"),
          { childList: true, subtree: true },
        );
      });
      const start = clock.now(),
        sends = [];
      let last;
      for (let index = 0; index < scenario.keys.length; index++) {
        const due = start + (index * 1000) / scenario.hz;
        if (due > clock.now()) await wait(due - clock.now());
        const key = scenario.keys[index];
        if (last && last !== key)
          sends.push(
            cdp.send("Input.dispatchKeyEvent", {
              type: "keyUp",
              key: last,
              code: last,
              windowsVirtualKeyCode: keyCodes[last],
            }),
          );
        sends.push(
          cdp.send("Input.dispatchKeyEvent", {
            type: "keyDown",
            key,
            code: key,
            windowsVirtualKeyCode: keyCodes[key],
            autoRepeat: last === key,
            modifiers: scenario.shift ? 8 : 0,
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
          windowsVirtualKeyCode: keyCodes[last],
        }),
      );
      await Promise.all(sends);
      const drainMs = clock.now() - start - enqueueMs;
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const renderedMs = clock.now() - start - enqueueMs;
      const observed = await page.evaluate(() => {
        const d = window.__navigationMeasurement;
        d.active = false;
        cancelAnimationFrame(d.frame);
        removeEventListener("keydown", d.listener, true);
        d.observer.disconnect();
        return { keys: d.keys, frames: d.frames, mutations: d.mutations };
      });
      const after = await metrics();
      const expected = { row: 0, column: 0 };
      for (const key of scenario.keys) {
        if (key === "ArrowDown") expected.row++;
        if (key === "ArrowUp") expected.row = Math.max(0, expected.row - 1);
        if (key === "ArrowRight")
          expected.column = Math.min(23, expected.column + 1);
        if (key === "ArrowLeft")
          expected.column = Math.max(0, expected.column - 1);
      }
      const actual = await active();
      check(
        JSON.stringify(expected) === JSON.stringify(actual),
        `${repetition + 1}/${scenario.name}: destino exacto`,
      );
      check(
        observed.keys.length === scenario.keys.length &&
          observed.keys.every((k) => k.trusted),
        `${repetition + 1}/${scenario.name}: todas las teclas reales recibidas`,
      );
      if (scenario.name === "edge")
        check(
          observed.mutations === 0,
          "El borde inmóvil no reconstruye el cuerpo",
        );
      const result = {
        repetition: repetition + 1,
        name: scenario.name,
        hz: scenario.hz,
        keys: scenario.keys.length,
        enqueueMs,
        drainMs,
        renderedMs,
        inputP95Ms: percentile(
          observed.keys.map((k) => k.delay),
          0.95,
        ),
        frameP95Ms: percentile(observed.frames, 0.95),
        frameMaxMs: Math.max(...observed.frames),
        scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
        mutations: observed.mutations,
        actual,
      };
      results.push(result);
      console.log(JSON.stringify(result));
      await writeFile(
        `${out}/${mode}-acceptance.json`,
        JSON.stringify({ mode, results, checks }, null, 2),
      );
    }
  }
  const budgets = {
    input: mode === "production" ? 50 : 100,
    drain: mode === "production" ? 150 : 300,
    max: mode === "production" ? 500 : 1000,
  };
  const summaries = cases.map(({ name }) => {
    const rs = results.filter((r) => r.name === name);
    return {
      name,
      inputP95MedianMs: percentile(
        rs.map((r) => r.inputP95Ms),
        0.5,
      ),
      drainMedianMs: percentile(
        rs.map((r) => r.drainMs),
        0.5,
      ),
      drainMaxMs: Math.max(...rs.map((r) => r.drainMs)),
    };
  });
  const passed = summaries.every(
    (s) =>
      s.inputP95MedianMs <= budgets.input &&
      s.drainMedianMs <= budgets.drain &&
      s.drainMaxMs <= budgets.max,
  );
  const report = {
    mode,
    budgets,
    summaries,
    passed,
    results,
    checks,
    pageErrors: errors,
    writes,
  };
  await writeFile(
    `${out}/${mode}-acceptance.json`,
    JSON.stringify(report, null, 2),
  );
  check(
    errors.length === 0 && writes.length === 0,
    "Sin excepciones ni escrituras de datos",
  );
  check(passed, `Presupuestos de navegación de ${mode}`);
  return report;
};
