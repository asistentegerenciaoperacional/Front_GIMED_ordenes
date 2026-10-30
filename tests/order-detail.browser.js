async (page) => {
  page.setDefaultTimeout(8000);
  const origin = new URL(page.url()).origin;
  const checks = [];
  const errors = [];
  const commands = [];
  let requests = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", () => requests++);
  page.on("response", async (response) => {
    if (response.url().endsWith("/api/commands"))
      commands.push({
        request: response.request().postDataJSON(),
        status: response.status(),
        body: await response.json(),
      });
  });
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  const command = async (name, payload) => {
    const response = await page.request.post(origin + "/api/commands", {
      data: { name, payload },
    });
    check(response.ok(), `${name} aceptado por el servicio`);
    return response.json();
  };
  const db = await state();
  const productOrder = db.orden_compra.find(
    (order) =>
      order.tipo_orden === "producto" &&
      order.estado_autorizacion === "autorizada" &&
      db.orden_producto.filter((line) => line.id_orden_compra === order.id)
        .length > 1,
  );
  const productLines = db.orden_producto
    .filter((line) => line.id_orden_compra === productOrder.id)
    .sort((a, b) => a.posicion - b.posicion);
  const hasConflictingCoverage = (line) => {
    const products = new Set(
      db.abastecimiento_material
        .filter((link) => link.id_orden_material === line.id)
        .map((link) => link.id_orden_producto),
    );
    return db.orden_material.some(
      (other) =>
        other.id !== line.id &&
        other.id_material === line.id_material &&
        other.estado !== "anulada" &&
        db.abastecimiento_material.some(
          (link) =>
            link.id_orden_material === other.id &&
            products.has(link.id_orden_producto),
        ),
    );
  };
  // The seed deliberately keeps historical duplicate coverage. A successful
  // reopening must use another material; restoring duplicate coverage is invalid.
  const materialLine = db.orden_material.find(
    (line) =>
      line.id_lote_material &&
      !hasConflictingCoverage(line) &&
      db.orden_compra.some(
        (order) =>
          order.id === line.id_orden_compra &&
          order.estado_autorizacion === "autorizada",
      ),
  );
  const conflictingMaterialLine = db.orden_material.find(
    (line) =>
      line.id_lote_material &&
      hasConflictingCoverage(line) &&
      db.orden_compra.some(
        (order) =>
          order.id === line.id_orden_compra &&
          order.estado_autorizacion === "autorizada",
      ),
  );
  check(
    !!materialLine && !!conflictingMaterialLine,
    "Fixtures de OCM con recepción distinguen reapertura válida y cobertura duplicada histórica",
  );
  const go = async (id) => {
    await page.goto(`${origin}/ordenes/${id}`);
    await page.locator(".line-card").first().waitFor();
  };
  const first = () => page.locator(".line-card").first();
  const settled = async (expanded) => {
    await page.waitForFunction((expanded) => {
      const body = document.querySelector(".line-card .line-disclosure");
      return (
        body &&
        (expanded
          ? body.getBoundingClientRect().height > 0 &&
            getComputedStyle(body).opacity === "1"
          : body.getBoundingClientRect().height < 1 &&
            getComputedStyle(body.firstElementChild).visibility === "hidden")
      );
    }, expanded);
  };
  for (const width of [1440, 799, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await go(productOrder.id);
    const card = first();
    check(
      (await card
        .locator(".line-disclosure-toggle")
        .getAttribute("aria-expanded")) === "true",
      `Lotes desplegados por defecto a ${width}px`,
    );
    check(
      (await card.locator(".line-metadata dt").allTextContents()).join("|") ===
        "Código de barras|Cantidad solicitada|Precio unitario|Recibido en lotes cerrados|Desviación / margen",
      `Resumen comercial en la cabecera y código conservado a ${width}px`,
    );
    check(
      (await card.locator(".line-packaging dt").allTextContents())
        .join("|")
        .startsWith("Ref. corrugado|Cantidad de corrugado|"),
      `Empaque en la franja secundaria a ${width}px`,
    );
    const fonts = await card.evaluate((el) => [
      getComputedStyle(el.querySelector(".line-metadata dd.num")).fontSize,
      getComputedStyle(el.querySelector(".line-packaging dd")).fontSize,
    ]);
    check(
      fonts[0] === "14px" && fonts[1] === "13px",
      `Tamaños de las dos franjas intercambiados a ${width}px`,
    );
    const secondExpanded = await page
      .locator(".line-card")
      .nth(1)
      .locator(".line-disclosure-toggle")
      .getAttribute("aria-expanded");
    const beforeRequests = requests;
    await card.locator(".line-disclosure-toggle").click();
    await settled(false);
    check(
      (await card
        .getByRole("heading", { name: /Lotes de producto/ })
        .isVisible()) &&
        (await card
          .getByRole("button", { name: "Agregar lote", exact: true })
          .isVisible()),
      `Resumen de lotes y Agregar lote siguen visibles a ${width}px`,
    );
    check(
      (await card.locator(".line-disclosure").getAttribute("inert")) !== null &&
        (await card.locator(".line-disclosure").getAttribute("aria-hidden")) ===
          "true",
      `Contenido oculto fuera del teclado y árbol accesible a ${width}px`,
    );
    check(
      (await page
        .locator(".line-card")
        .nth(1)
        .locator(".line-disclosure-toggle")
        .getAttribute("aria-expanded")) === secondExpanded,
      `Ocultar un renglón conserva el otro a ${width}px`,
    );
    check(
      await card
        .locator(".line-disclosure-toggle")
        .evaluate((el) => el === document.activeElement),
      `El foco permanece en el botón a ${width}px`,
    );
    check(
      requests === beforeRequests,
      `Desplegar no realiza solicitudes a ${width}px`,
    );
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Sin desbordamiento de página a ${width}px`,
    );
    await card.screenshot({
      path: `tests/evidence/order-detail/product-collapsed-${width}.png`,
    });
    await card.locator(".line-disclosure-toggle").press("Enter");
    await settled(true);
    check(
      await card.locator(".lot-list").isVisible(),
      `Enter vuelve a desplegar lotes a ${width}px`,
    );
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  check(
    await first()
      .locator(".line-disclosure")
      .evaluate((el) => getComputedStyle(el).transitionDuration === "0s"),
    "Movimiento reducido elimina la animación",
  );
  await first().locator(".line-disclosure-toggle").click();
  await settled(false);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await go(materialLine.id_orden_compra);
  const materialPosition = db.orden_material
    .filter((line) => line.id_orden_compra === materialLine.id_orden_compra)
    .sort((a, b) => a.posicion - b.posicion)
    .findIndex((line) => line.id === materialLine.id);
  const materialCard = () => page.locator(".line-card").nth(materialPosition);
  await materialCard().locator(".line-disclosure-toggle").click();
  await page.waitForFunction(
    (index) =>
      document
        .querySelectorAll(".line-card")
        [index].querySelector(".line-disclosure")
        .getBoundingClientRect().height < 1,
    materialPosition,
  );
  check(
    (await materialCard()
      .getByRole("button", { name: "Registrar / editar", exact: true })
      .isVisible()) &&
      (await materialCard()
        .getByRole("heading", { name: "Recepción del material", exact: true })
        .isVisible()),
    "OCM ocultada conserva recepción y edición",
  );
  check(
    !(await materialCard()
      .getByRole("button", { name: "Enviar calidad", exact: true })
      .isVisible()),
    "OCM ocultada esconde documentos y sus acciones",
  );
  await materialCard().screenshot({
    path: "tests/evidence/order-detail/material-collapsed.png",
  });
  for (const previous of ["cerrada", "anulada"]) {
    await command("setLineState", {
      entity: "orden_material",
      id: materialLine.id,
      estado: previous,
      confirm: true,
    });
    await go(materialLine.id_orden_compra);
    check(
      await materialCard()
        .getByRole("button", { name: "Reabrir", exact: true })
        .isVisible(),
      `OCM ${previous} ofrece Reabrir`,
    );
    const color = await materialCard().evaluate((el) => {
      const style = getComputedStyle(el.querySelector(".line-card-head"));
      return [style.backgroundColor, style.borderLeftColor];
    });
    check(
      color.join("|") ===
        (previous === "cerrada"
          ? "rgb(241, 245, 243)|rgb(116, 148, 134)"
          : "rgb(247, 242, 242)|rgb(173, 133, 133)"),
      `Fondo y ribete sobrios de OCM ${previous}`,
    );
    const before = await state();
    await materialCard()
      .getByRole("button", { name: "Reabrir", exact: true })
      .click();
    try {
      await page.waitForFunction(
        (index) =>
          document.querySelectorAll(".line-card")[index].dataset.state ===
          "en_seguimiento",
        materialPosition,
      );
    } catch (error) {
      const current = await state();
      throw new Error(
        `${error.message}; OCM ${previous}: ${JSON.stringify(current.orden_material.find((line) => line.id === materialLine.id))}; avisos: ${await page.locator('[role="status"], [role="alert"]').allTextContents()}; commands: ${JSON.stringify(commands)}`,
      );
    }
    const after = await state();
    const expected = {
      ...before.orden_material.find((line) => line.id === materialLine.id),
      estado: "en_seguimiento",
    };
    check(
      JSON.stringify(
        after.orden_material.find((line) => line.id === materialLine.id),
      ) === JSON.stringify(expected),
      `Reabrir OCM ${previous} conserva datos de recepción y factura`,
    );
    check(
      JSON.stringify(before.documento) === JSON.stringify(after.documento) &&
        JSON.stringify(before.lote_material) ===
          JSON.stringify(after.lote_material) &&
        JSON.stringify(before.abastecimiento_material) ===
          JSON.stringify(after.abastecimiento_material),
      `Reabrir OCM ${previous} conserva documentos, lote y abastecimiento`,
    );
  }
  await command("setLineState", {
    entity: "orden_material",
    id: conflictingMaterialLine.id,
    estado: "anulada",
    confirm: true,
  });
  await go(conflictingMaterialLine.id_orden_compra);
  const conflictPosition = db.orden_material
    .filter(
      (line) =>
        line.id_orden_compra === conflictingMaterialLine.id_orden_compra,
    )
    .sort((a, b) => a.posicion - b.posicion)
    .findIndex((line) => line.id === conflictingMaterialLine.id);
  const conflictCard = page.locator(".line-card").nth(conflictPosition);
  const beforeConflict = await state();
  const [rejectedResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/commands") &&
        response.request().postDataJSON()?.name === "setLineState",
    ),
    conflictCard.getByRole("button", { name: "Reabrir", exact: true }).click(),
  ]);
  const rejected = await rejectedResponse.json();
  check(
    rejectedResponse.status() === 422 && rejected.code === "SUPPLY_CHANGED",
    "Reabrir OCM anulada rechaza restaurar cobertura duplicada",
  );
  await page.getByText(rejected.message, { exact: true }).waitFor();
  check(
    await conflictCard
      .getByRole("button", { name: "Reabrir", exact: true })
      .isVisible(),
    "El rechazo conserva visible Reabrir y muestra su causa",
  );
  check(
    JSON.stringify(await state()) === JSON.stringify(beforeConflict),
    "La reapertura rechazada conserva íntegra la base temporal",
  );
  await page.screenshot({
    path: "tests/evidence/order-detail/material-reopen-conflict.png",
    fullPage: false,
  });
  for (const status of ["en_seguimiento", "cerrada", "anulada"]) {
    await command("setLineState", {
      entity: "orden_producto",
      id: productLines[0].id,
      estado: status,
      confirm: true,
    });
    await go(productOrder.id);
    const colors = await first().evaluate((el) => {
      const style = getComputedStyle(el.querySelector(".line-card-head"));
      const contrast = (text, background) => {
        const lum = (rgb) =>
          rgb
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((n) => n / 255)
            .map((n) =>
              n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4,
            )
            .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
        const [a, b] = [lum(text), lum(background)].sort((a, b) => b - a);
        return (a + 0.05) / (b + 0.05);
      };
      return {
        background: style.backgroundColor,
        accent: style.borderLeftColor,
        contrast: contrast(
          getComputedStyle(el.querySelector(".line-metadata dt")).color,
          style.backgroundColor,
        ),
      };
    });
    check(colors.contrast >= 4.5, `Texto secundario legible en OC ${status}`);
    check(
      colors.background ===
        {
          en_seguimiento: "rgb(246, 248, 252)",
          cerrada: "rgb(241, 245, 243)",
          anulada: "rgb(247, 242, 242)",
        }[status],
      `Fondo de OC ${status} correcto`,
    );
  }
  // Amplify only the response in this isolated browser; never write stress data.
  const stress = await state();
  const template = { ...productLines[0], estado: "en_seguimiento" };
  stress.orden_producto = stress.orden_producto.filter(
    (line) => line.id_orden_compra !== productOrder.id,
  );
  const lotTemplate = db.lote_producto.find(
    (lot) => lot.id_orden_producto === productLines[0].id,
  );
  stress.lote_producto = stress.lote_producto.filter(
    (lot) => !productLines.some((line) => line.id === lot.id_orden_producto),
  );
  for (let i = 0; i < 7; i++) {
    const id = (9000 + i).toString(16).padStart(24, "0");
    stress.orden_producto.push({ ...template, id, posicion: i + 1 });
    for (let j = 0; j < 40; j++)
      stress.lote_producto.push({
        ...lotTemplate,
        id: (10000 + i * 40 + j).toString(16).padStart(24, "0"),
        id_orden_producto: id,
        numero_lote: `STRESS-${i}-${j}`,
      });
  }
  await page.route("**/api/state", (route) => route.fulfill({ json: stress }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await go(productOrder.id);
  check(
    (await page.locator(".line-card").count()) === 7 &&
      (await first().locator(".product-lots-table tbody tr").count()) === 40,
    "Ensayo de 7 renglones y 280 lotes cargado",
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const metricsBefore = await cdp.send("Performance.getMetrics");
  const samples = [];
  for (let i = 0; i < 4; i++) {
    samples.push(
      await first().evaluate(async (el) => {
        const body = el.querySelector(".line-disclosure");
        const initial = body.getBoundingClientRect().height;
        const heights = [],
          frames = [];
        let start, last;
        el.querySelector(".line-disclosure-toggle").click();
        await new Promise((done) => {
          const frame = (now) => {
            start ??= now;
            if (last !== undefined) frames.push(now - last);
            last = now;
            heights.push(body.getBoundingClientRect().height);
            if (now - start >= 260) done();
            else requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
        return { initial, heights, frames };
      }),
    );
  }
  const metricsAfter = await cdp.send("Performance.getMetrics");
  const frames = samples
    .flatMap((sample) => sample.frames)
    .sort((a, b) => a - b);
  check(
    samples[0].heights.some(
      (height) => height > 0 && height < samples[0].initial,
    ) && samples[0].heights.at(-1) < 1,
    "Animación interpola la altura y termina completamente oculta",
  );
  check(
    samples[1].heights.at(-1) > 0,
    "Animación despliega nuevamente sin recortar lotes",
  );
  await first()
    .locator(".line-disclosure-toggle")
    .evaluate((el) => {
      el.click();
      el.click();
      el.click();
    });
  await settled(false);
  check(
    (await first()
      .locator(".line-disclosure-toggle")
      .getAttribute("aria-expanded")) === "false",
    "Clics rápidos terminan en el estado solicitado",
  );
  const duration = (name) =>
    (metricsAfter.metrics.find((m) => m.name === name).value -
      metricsBefore.metrics.find((m) => m.name === name).value) *
    1000;
  const performance = {
    browser: await page.evaluate(() => navigator.userAgent),
    lines: 7,
    lots: 280,
    toggles: 4,
    measuredFrames: frames.length,
    frameMedianMs: frames[Math.floor(frames.length / 2)],
    frameP95Ms: frames[Math.ceil(frames.length * 0.95) - 1],
    frameMaxMs: frames.at(-1),
    layoutMs: duration("LayoutDuration"),
    styleMs: duration("RecalcStyleDuration"),
    scriptMs: duration("ScriptDuration"),
  };
  check(errors.length === 0, `Sin errores de navegador: ${errors.join("; ")}`);
  return { checks, performance };
};
