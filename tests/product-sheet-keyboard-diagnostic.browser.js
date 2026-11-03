async (page) => {
  page = page.context().pages()[0];
  page.setDefaultTimeout(45000);
  const fs = await import("node:fs/promises");
  const { performance: clock } = await import("node:perf_hooks");
  const { resolve } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const { summarizeKeyboardCpuProfile: summarizeProfile } = await import(
    pathToFileURL(resolve("scripts/keyboard-cpu-profile.mjs")).href
  );
  const mode =
    process.env.PROTOTIPO_BROWSER_MODE === "development"
      ? "development"
      : "production";
  const out = "tests/evidence/product-sheet-keyboard";
  await fs.mkdir(out, { recursive: true });
  const origin = new URL(page.url()).origin;
  const errors = [],
    writes = [],
    checks = [];
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/commands"))
      writes.push(request.postDataJSON().name);
  });
  await page.addInitScript(() => {
    const hook = {
      supportsFiber: true,
      renderers: new Map(),
      inject(renderer) {
        const id = this.renderers.size + 1;
        this.renderers.set(id, renderer);
        return id;
      },
      onCommitFiberRoot(_id, root) {
        const d = window.__keyboardDiagnostic;
        if (d?.record) {
          d.commits++;
          if (typeof root.current.actualDuration === "number")
            d.renderDurations.push(root.current.actualDuration);
        }
      },
      onCommitFiberUnmount() {},
    };
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ??= hook;
  });
  await page.evaluate(() =>
    localStorage.setItem("gimed:ui:product-order-sheet", "true"),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/ordenes/productos");
  await page.locator(".product-sheet-grid").waitFor();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.enable");
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
  const snapshot = async () => {
    const [heap, dom, performance, visible] = await Promise.all([
      cdp.send("Runtime.getHeapUsage"),
      cdp.send("Memory.getDOMCounters"),
      cdp.send("Performance.getMetrics"),
      page.evaluate(() => ({
        rows: document.querySelectorAll(
          ".product-sheet-grid tbody tr:not(.sheet-spacer)",
        ).length,
        cells: document.querySelectorAll("[data-sheet-row]").length,
        allDom: document.getElementsByTagName("*").length,
        active: document.querySelector("[data-active]")
          ? {
              row: Number(
                document.querySelector("[data-active]").dataset.sheetRow,
              ),
              column: Number(
                document.querySelector("[data-active]").dataset.sheetColumn,
              ),
            }
          : null,
      })),
    ]);
    return {
      heap,
      dom,
      metrics: Object.fromEntries(
        performance.metrics.map((item) => [item.name, item.value]),
      ),
      visible,
    };
  };
  const gc = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    await page.waitForTimeout(200);
    return snapshot();
  };
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const percentile = (values, fraction) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return Number(
      sorted[
        Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
      ].toFixed(2),
    );
  };
  const viewport = page.locator(".product-sheet-viewport");
  await page
    .locator('[data-sheet-row="0"][data-column-key="no_orden"]')
    .click();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(1000);
  const initial = await gc(),
    scenarios = [];
  const keys = { ArrowDown: 40, ArrowUp: 38, ArrowRight: 39, ArrowLeft: 37 };
  async function run(
    name,
    sequence,
    hz,
    { shift = false, profile = false } = {},
  ) {
    const before = await snapshot();
    let expected = { ...before.visible.active };
    const columns = await page.locator(".product-sheet-grid thead th").count();
    const total =
      Number(
        await page.locator(".product-sheet-grid").getAttribute("aria-rowcount"),
      ) - 1;
    for (const key of sequence) {
      if (key === "ArrowDown")
        expected.row = Math.min(total - 1, expected.row + 1);
      if (key === "ArrowUp") expected.row = Math.max(0, expected.row - 1);
      if (key === "ArrowRight")
        expected.column = Math.min(columns - 1, expected.column + 1);
      if (key === "ArrowLeft")
        expected.column = Math.max(0, expected.column - 1);
    }
    await page.evaluate(() => {
      const d = (window.__keyboardDiagnostic = {
        record: true,
        start: performance.now(),
        keys: [],
        frames: [],
        lastFrame: performance.now(),
        longTasks: [],
        commits: 0,
        renderDurations: [],
        transitions: [],
        missingActiveFrames: 0,
      });
      d.observer = new MutationObserver(() => {
        if (!d.record) return;
        const cell = document.querySelector("[data-active]");
        if (cell) {
          const row = Number(cell.dataset.sheetRow),
            column = Number(cell.dataset.sheetColumn),
            last = d.transitions.at(-1);
          if (!last || last.row !== row || last.column !== column)
            d.transitions.push({ time: performance.now(), row, column });
        }
      });
      d.observer.observe(document.querySelector(".product-sheet-grid"), {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-active"],
      });
      d.listener = (event) => {
        if (d.record && event.key.startsWith("Arrow"))
          d.keys.push({
            key: event.key,
            repeat: event.repeat,
            trusted: event.isTrusted,
            at: performance.now(),
            stamp: event.timeStamp,
            delay: performance.now() - event.timeStamp,
          });
      };
      window.addEventListener("keydown", d.listener, true);
      d.longObserver = new PerformanceObserver((list) => {
        if (d.record)
          d.longTasks.push(
            ...list
              .getEntries()
              .map((item) => ({ at: item.startTime, ms: item.duration })),
          );
      });
      d.longObserver.observe({ type: "longtask", buffered: false });
      const frame = (time) => {
        if (!d.record) return;
        d.frames.push(time - d.lastFrame);
        d.lastFrame = time;
        if (
          d.frames.length % 4 === 0 &&
          !document.querySelector("[data-active]")
        )
          d.missingActiveFrames++;
        d.frame = requestAnimationFrame(frame);
      };
      d.frame = requestAnimationFrame(frame);
    });
    if (profile) await cdp.send("Profiler.start");
    const memorySamples = [];
    let polling = false;
    const monitor = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        memorySamples.push({
          at: clock.now(),
          ...(await cdp.send("Runtime.getHeapUsage")),
        });
      } finally {
        polling = false;
      }
    }, 250);
    const sends = [],
      sent = [],
      start = clock.now();
    let previous;
    for (let index = 0; index < sequence.length; index++) {
      const due = start + (index * 1000) / hz,
        delay = due - clock.now();
      if (delay > 0) await pause(delay);
      const key = sequence[index];
      if (previous && previous !== key)
        sends.push(
          cdp.send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: previous,
            code: previous,
            windowsVirtualKeyCode: keys[previous],
            modifiers: shift ? 8 : 0,
          }),
        );
      sent.push({ key, at: clock.now() - start });
      sends.push(
        cdp.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key,
          code: key,
          windowsVirtualKeyCode: keys[key],
          nativeVirtualKeyCode: keys[key],
          autoRepeat: previous === key,
          modifiers: shift ? 8 : 0,
          timestamp: Date.now() / 1000,
        }),
      );
      previous = key;
    }
    const enqueueMs = clock.now() - start;
    sends.push(
      cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: previous,
        code: previous,
        windowsVirtualKeyCode: keys[previous],
        modifiers: shift ? 8 : 0,
      }),
    );
    let timeout;
    try {
      await Promise.race([
        Promise.all(sends),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`No se vació la cola de ${name}`)),
            45000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      clearInterval(monitor);
    }
    const drainMs = clock.now() - start - enqueueMs;
    await page.waitForTimeout(300);
    const trace = await page.evaluate(() => {
      const d = window.__keyboardDiagnostic;
      d.record = false;
      cancelAnimationFrame(d.frame);
      d.observer.disconnect();
      d.longObserver.disconnect();
      window.removeEventListener("keydown", d.listener, true);
      return {
        start: d.start,
        keys: d.keys,
        frames: d.frames,
        longTasks: d.longTasks,
        commits: d.commits,
        renderDurations: d.renderDurations,
        transitions: d.transitions,
        missingActiveFrames: d.missingActiveFrames,
      };
    });
    const after = await snapshot();
    let cpu;
    if (profile) {
      const result = await cdp.send("Profiler.stop");
      cpu = summarizeProfile(result.profile);
      await fs.writeFile(
        `${out}/${mode}-${name}.cpuprofile`,
        JSON.stringify(result.profile),
      );
    }
    const afterGc = await gc();
    const elapsed = clock.now() - start;
    const report = {
      name,
      hz,
      shift,
      keysSent: sequence.length,
      keysCaptured: trace.keys.length,
      trustedKeys: trace.keys.filter((key) => key.trusted).length,
      enqueueMs: Number(enqueueMs.toFixed(1)),
      drainMs: Number(drainMs.toFixed(1)),
      elapsedMs: Number(elapsed.toFixed(1)),
      expected,
      actual: after.visible.active,
      commits: trace.commits,
      commitsPerKey: Number((trace.commits / sequence.length).toFixed(2)),
      observedTransitions: trace.transitions.length,
      inputDelayMs: {
        p50: percentile(
          trace.keys.map((key) => key.delay),
          0.5,
        ),
        p95: percentile(
          trace.keys.map((key) => key.delay),
          0.95,
        ),
        max: percentile(
          trace.keys.map((key) => key.delay),
          1,
        ),
      },
      frameGapMs: {
        p50: percentile(trace.frames, 0.5),
        p95: percentile(trace.frames, 0.95),
        max: percentile(trace.frames, 1),
      },
      longTasks: {
        count: trace.longTasks.length,
        totalMs: trace.longTasks.reduce((sum, item) => sum + item.ms, 0),
        maxMs: Math.max(0, ...trace.longTasks.map((item) => item.ms)),
      },
      missingActiveFrames: trace.missingActiveFrames,
      heap: {
        before: before.heap.usedSize,
        peak: Math.max(
          after.heap.usedSize,
          ...memorySamples.map((sample) => sample.usedSize),
        ),
        after: after.heap.usedSize,
        afterGc: afterGc.heap.usedSize,
      },
      dom: {
        before: before.dom,
        after: after.dom,
        afterGc: afterGc.dom,
        mounted: after.visible,
      },
      work: {
        tasksMs:
          (after.metrics.TaskDuration - before.metrics.TaskDuration) * 1000,
        scriptMs:
          (after.metrics.ScriptDuration - before.metrics.ScriptDuration) * 1000,
        layoutMs:
          (after.metrics.LayoutDuration - before.metrics.LayoutDuration) * 1000,
        styleMs:
          (after.metrics.RecalcStyleDuration -
            before.metrics.RecalcStyleDuration) *
          1000,
        layouts: after.metrics.LayoutCount - before.metrics.LayoutCount,
      },
      cpu,
    };
    await fs.writeFile(
      `${out}/${mode}-${name}-trace.json`,
      JSON.stringify({ sent, trace, memorySamples }, null, 2),
    );
    scenarios.push(report);
    console.log(
      JSON.stringify({
        mode,
        phase: name,
        delayP95: report.inputDelayMs.p95,
        frameP95: report.frameGapMs.p95,
        drainMs: report.drainMs,
        commits: report.commits,
        heapAfterGcMB: Number((report.heap.afterGc / 1048576).toFixed(1)),
        position: report.actual,
        expected,
      }),
    );
    check(
      trace.keys.length === sequence.length,
      `${name}: el navegador recibe todas las teclas reales`,
    );
    check(
      trace.keys.every((key) => key.trusted),
      `${name}: eventos de teclado confiables enviados por el navegador`,
    );
    check(
      after.visible.rows < 50,
      `${name}: el DOM de filas se mantiene acotado`,
    );
    check(
      JSON.stringify(after.visible.active) === JSON.stringify(expected),
      `${name}: la posición final coincide con todas las flechas enviadas`,
    );
  }
  await run("paced-vertical", Array(24).fill("ArrowDown"), 8);
  const horizontal = Array.from({ length: 4 }, () => [
    ...Array(18).fill("ArrowRight"),
    ...Array(18).fill("ArrowLeft"),
  ]).flat();
  await run("fast-horizontal", horizontal, 60);
  const shorter = mode === "development";
  await run("fast-vertical", Array(shorter ? 80 : 180).fill("ArrowDown"), 60, {
    profile: true,
  });
  await run("left-edge", Array(shorter ? 80 : 120).fill("ArrowLeft"), 60);
  await run(
    "sustained-vertical-1",
    Array(shorter ? 80 : 150).fill("ArrowDown"),
    30,
  );
  await run(
    "sustained-vertical-2",
    Array(shorter ? 80 : 150).fill("ArrowDown"),
    30,
  );
  await run(
    "sustained-vertical-3",
    Array(shorter ? 80 : 150).fill("ArrowDown"),
    30,
  );
  await run("shift-range", Array(shorter ? 45 : 90).fill("ArrowDown"), 30, {
    shift: true,
  });
  await viewport.screenshot({ path: `${out}/${mode}-final.png` });
  const final = await gc();
  check(writes.length === 0, "La navegación no ejecuta comandos de datos");
  check(errors.length === 0, "Sin excepciones durante las pruebas de teclado");
  const environment = {
    browser: page.context().browser().version(),
    viewport: page.viewportSize(),
    instrumentation:
      "CDP trusted keydown, explicit timestamp, independent sender, frame/long-task observers, commit hook, heap before/after forced GC; CPU profile only fast-vertical",
  };
  await fs.writeFile(
    `${out}/${mode}-summary.json`,
    JSON.stringify(
      { environment, initial, final, scenarios, errors, writes },
      null,
      2,
    ),
  );
  return {
    checks,
    environment,
    initialHeapMB: initial.heap.usedSize / 1048576,
    finalHeapMB: final.heap.usedSize / 1048576,
    scenarios: scenarios.map(({ cpu, ...scenario }) => scenario),
    pageErrors: errors,
  };
};
