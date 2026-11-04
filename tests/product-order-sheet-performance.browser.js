async (page) => {
  page = page.context().pages()[0];
  page.setDefaultTimeout(12000);
  const checks = [],
    timings = [],
    errors = [];
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  page.on("pageerror", (error) => errors.push(error.message));
  const origin = new URL(page.url()).origin;
  const writes = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/commands"))
      writes.push(request.postDataJSON().name);
  });
  await page.evaluate(() =>
    localStorage.setItem("gimed:ui:product-order-sheet", "true"),
  );
  await page.goto(origin + "/ordenes/productos");
  await page.locator(".product-sheet-grid").waitFor();
  check(
    (await page.locator(".product-sheet-footer").innerText()).includes("500"),
    "La prueba utiliza más de 5000 lotes",
  );
  const { sheetCell, revealSheetColumn } = await import(
    (await import("node:url")).pathToFileURL(
      (await import("node:path")).resolve("tests/sheet-locator.mjs"),
    ).href
  );
  const cell = (row, key) => sheetCell(page, row, key);
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  async function measure(name, action) {
    const start = Date.now();
    await action();
    await settle();
    const ms = Date.now() - start;
    timings.push({ name, ms });
    check(
      errors.length === 0 &&
        (await page.locator("vite-error-overlay").count()) === 0,
      `Sin errores ni bloqueo después de ${name}`,
    );
    check(
      ms < 4000,
      `${name} responde dentro del presupuesto de 4 s con 5000 lotes`,
    );
    check(
      (await page
        .locator(".product-sheet-grid tbody tr:not(.sheet-spacer)")
        .count()) < 50,
      `DOM de filas acotado después de ${name}`,
    );
  }
  const menu = async (id) => {
    await page
      .getByRole("button", {
        name: "Filtro personalizado de la hoja",
        exact: true,
      })
      .click();
    await page.locator(`[role="menuitemradio"][data-key="${id}"]`).click();
  };
  await measure("filtro personalizado", () => menu("sin_recepciones"));
  await measure("quitar filtro", () =>
    page.getByRole("button", { name: "Limpiar filtros", exact: true }).click(),
  );
  for (const name of ["Anuladas", "No autorizadas", "En seguimiento"])
    await measure(`cambiar a ${name}`, () =>
      page.getByRole("button", { name, exact: true }).click(),
    );
  const search = () =>
    page.getByRole("searchbox", {
      name: "Buscar en la hoja de OC",
      exact: true,
    });
  await measure("buscar", () => search().fill("VIRTUAL-49"));
  await measure("limpiar búsqueda", () => search().fill(""));
  const openPrice = () =>
    page
      .getByRole("button", {
        name: "Filtrar y ordenar Precio unitario",
        exact: true,
      })
      .click();
  await measure("filtro de columna", async () => {
    await openPrice();
    await page.getByRole("button", { name: "Condición", exact: true }).click();
    await page
      .getByRole("option", { name: "Es mayor que", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Valor del filtro", exact: true })
      .fill("0");
    await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  });
  await measure("limpiar condición de columna", () =>
    page.getByRole("button", { name: "Limpiar filtros", exact: true }).click(),
  );
  await measure("ordenar", async () => {
    await openPrice();
    await page
      .getByRole("button", { name: "De menor a mayor", exact: true })
      .click();
  });
  await measure("quitar ordenamiento", async () => {
    await openPrice();
    await page
      .getByRole("button", { name: "Quitar ordenamiento", exact: true })
      .click();
  });
  await measure("abrir columna con 5000 valores", async () => {
    await revealSheetColumn(page, "numero_lote");
    await page
      .getByRole("button", { name: "Filtrar y ordenar Lote", exact: true })
      .click();
  });
  const choices = () =>
    page.locator(".column-value-list").getByRole("checkbox");
  check(
    (await choices().count()) === 50,
    "El filtro no monta miles de casillas",
  );
  const mode =
    process.env.PROTOTIPO_BROWSER_MODE === "development"
      ? "development"
      : "production";
  await page.locator(".column-filter-panel").screenshot({
    path: `tests/evidence/product-sheet-performance/${mode}-5000-values.png`,
  });
  await page
    .getByRole("button", { name: "Siguientes valores", exact: true })
    .click();
  await choices().first().uncheck();
  await page
    .getByRole("button", { name: "Valores anteriores", exact: true })
    .click();
  check(
    await choices().first().isChecked(),
    "Cambiar la página de valores conserva las elecciones fuera de ella",
  );
  await page
    .getByRole("button", { name: "Siguientes valores", exact: true })
    .click();
  check(
    !(await choices().first().isChecked()),
    "La elección de la segunda página se conserva",
  );
  await page
    .getByRole("searchbox", { name: "Buscar valores", exact: true })
    .fill("VIRTUAL-4999");
  check(
    (await choices().count()) === 1,
    "Buscar valores recorre todas las opciones, no solo la página",
  );
  await measure("aplicar selección de valores", async () => {
    const all = page.getByRole("checkbox", {
      name: "Seleccionar todos",
      exact: true,
    });
    await all.check();
    await all.uncheck();
    await choices().first().check();
    await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  });
  check(
    (await page.locator(".product-sheet-footer").innerText()).startsWith(
      "1 lotes",
    ),
    "La selección de un valor filtra el lote esperado",
  );
  await measure("quitar selección de valores", () =>
    page.getByRole("button", { name: "Limpiar filtros", exact: true }).click(),
  );
  await measure("ocultar y mostrar columna", async () => {
    await page.getByRole("button", { name: "Columnas", exact: true }).click();
    const invoice = page
      .getByRole("dialog", { name: "Columnas visibles", exact: true })
      .getByRole("checkbox", { name: "Factura", exact: true });
    await invoice.uncheck();
    check(
      Number(
        await page.locator(".product-sheet-grid").getAttribute("aria-colcount"),
      ) === 23,
      "La columna se oculta sin recargar",
    );
    await invoice.check();
    await page.keyboard.press("Escape");
  });
  await measure("selección y teclado", async () => {
    await cell(0, "precio_unitario").click();
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+ArrowRight");
  });
  await measure("editar y confirmar", async () => {
    await cell(0, "ubicacion").dblclick();
    const input = page.getByRole("textbox", { name: "Ubicación", exact: true });
    await input.fill("Rendimiento Bogotá");
    await input.press("Enter");
  });
  await measure("guardar sin recargar", async () => {
    await page
      .getByRole("button", { name: "Guardar 1 cambios", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".product-sheet-status")
          ?.textContent.startsWith("Sin cambios pendientes") &&
        document
          .querySelector(".product-order-sheet")
          ?.getAttribute("aria-busy") !== "true",
    );
  });
  const saved = await (await page.request.get(origin + "/api/state")).json();
  check(
    saved.lote_producto.some((lot) => lot.ubicacion === "Rendimiento Bogotá"),
    "El guardado persiste y la interfaz sigue respondiendo",
  );
  const paste = async (text) =>
    page.locator(".product-sheet-viewport").evaluate((element, text) => {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      element.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, clipboardData: data }),
      );
    }, text);
  await measure("pegar datos válidos", async () => {
    await cell(0, "precio_unitario").click();
    await paste("4,00\n5,00");
  });
  await measure("descartar borrador", async () => {
    await page.getByRole("button", { name: "Descartar", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Descartar", exact: true })
      .click();
  });
  await measure("pegar 5000 celdas protegidas", async () => {
    await cell(0, "no_orden").click();
    await paste(Array(5000).fill("no interpretar").join("\n"));
  });
  check(
    (await page.locator(".product-sheet-errors button").count()) === 50,
    "El resumen conserva todos los errores con un DOM limitado a 50 enlaces",
  );
  await page.locator(".product-order-sheet").screenshot({
    path: `tests/evidence/product-sheet-performance/${mode}-5000-errors.png`,
  });
  await page
    .getByRole("button", { name: "Siguientes errores", exact: true })
    .click();
  await page.locator(".product-sheet-errors button").first().click();
  await page.locator('[data-active][data-sheet-row="50"]').waitFor();
  check(
    true,
    "Un error fuera de la ventana enfoca su celda estable sin bloquear",
  );
  await measure("corregir y retirar errores", async () => {
    await cell(50, "precio_unitario").dblclick();
    await page
      .getByRole("textbox", { name: "Precio unitario", exact: true })
      .press("Enter");
  });
  await measure("preparar pegado válido de 5000 lotes", async () => {
    await page
      .locator(".product-sheet-viewport")
      .evaluate((element) => (element.scrollTop = 0));
    await cell(2, "ubicacion").click();
    await paste(Array(5000).fill("Bodega de pegado masivo").join("\n"));
    await page
      .getByRole("button", { name: "Guardar 5000 cambios", exact: true })
      .waitFor();
  });
  await measure("descartar 5000 cambios", async () => {
    await page.getByRole("button", { name: "Descartar", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Descartar", exact: true })
      .click();
  });
  await measure("abrir y cancelar nuevos lotes", async () => {
    await page.getByRole("button", { name: "Nuevo lote", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
  });
  await measure("abrir y cancelar nueva OC", async () => {
    await page.getByRole("button", { name: "Nueva OC", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
  });
  await measure("ocultar y recuperar herramientas", async () => {
    await page
      .getByRole("button", {
        name: "Ocultar barra de herramientas",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Mostrar herramientas", exact: true })
      .click();
  });
  check(
    writes.length === 1 && writes[0] === "saveProductOrderSheet",
    "Únicamente Guardar envía un comando durante la prueba",
  );
  return { checks, timings, pageErrors: errors };
};
