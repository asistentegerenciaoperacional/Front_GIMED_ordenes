async (page) => {
  page = page.context().pages()[0];
  page.setDefaultTimeout(12000);
  const { sheetCell, revealSheetColumn } = await import(
    (await import("node:url")).pathToFileURL(
      (await import("node:path")).resolve("tests/sheet-locator.mjs"),
    ).href
  );
  const checks = [],
    errors = [];
  const check = (ok, text) => {
    if (!ok) throw Error(text);
    checks.push(text);
  };
  page.on("pageerror", (error) => errors.push(error.message));
  const origin = new URL(page.url()).origin;
  await page.evaluate(() =>
    localStorage.setItem("gimed:ui:product-order-sheet", "true"),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + "/ordenes/productos");
  const cell = (row, key) => sheetCell(page, row, key),
    viewport = page.locator(".product-sheet-viewport");
  const frames = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const before = await (await page.request.get(origin + "/api/state")).json();
  await cell(0, "ubicacion").dblclick();
  const input = page.getByRole("textbox", { name: "Ubicación", exact: true });
  await input.fill("Editor conservado fuera de la ventana");
  await viewport.evaluate((el) => {
    el.scrollTop = 4000 * 32;
    el.scrollLeft = 0;
  });
  await frames();
  check(
    (await input.inputValue()) === "Editor conservado fuera de la ventana",
    "La celda editada se conserva fuera de ambas ventanas virtuales",
  );
  check(
    await input.evaluate((el) => document.activeElement === el),
    "Desplazarse no pierde el foco del editor",
  );
  check(
    (await page.locator("tbody tr[data-row-index]").count()) < 50,
    "Fijar el montaje de un editor no monta las filas intermedias",
  );
  await input.press("Enter");
  await page.waitForFunction(
    () =>
      !!document.querySelector(
        '[data-active][data-sheet-row="1"][data-column-key="ubicacion"]',
      ),
  );
  check(
    (await cell(0, "ubicacion").innerText()) ===
      "Editor conservado fuera de la ventana",
    "Confirmar conserva el borrador y vuelve a la fila siguiente",
  );
  check(
    JSON.stringify(
      await (await page.request.get(origin + "/api/state")).json(),
    ) === JSON.stringify(before),
    "La navegación y el editor no escriben datos automáticamente",
  );
  await cell(0, "no_orden").click();
  await page.evaluate(() => {
    const table = document.querySelector(".product-sheet-grid");
    for (const key of [
      ...Array(23).fill("ArrowRight"),
      ...Array(40).fill("ArrowDown"),
      "F2",
    ])
      table.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
  });
  await input.waitFor();
  await frames();
  const editorBox = await input.boundingBox(),
    viewBox = await viewport.boundingBox();
  check(
    editorBox.x >= viewBox.x &&
      editorBox.y >= viewBox.y + 43 &&
      editorBox.x + editorBox.width <= viewBox.x + viewBox.width &&
      editorBox.y + editorBox.height <= viewBox.y + viewBox.height,
    "F2 inmediatamente después de una ráfaga revela el editor de la celda lógica",
  );
  const scrollBeforeEscape = await viewport.evaluate((el) => [
    el.scrollTop,
    el.scrollLeft,
  ]);
  await input.press("Escape");
  await frames();
  check(
    JSON.stringify(
      await viewport.evaluate((el) => [el.scrollTop, el.scrollLeft]),
    ) === JSON.stringify(scrollBeforeEscape),
    "Escape conserva el desplazamiento de la celda editada",
  );
  await cell(2, "no_orden").click();
  const copied = await page.evaluate(() => {
    const table = document.querySelector(".product-sheet-grid");
    for (let i = 0; i < 2; i++)
      table.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
          cancelable: true,
        }),
      );
    const clipboard = new DataTransfer();
    table.dispatchEvent(
      new ClipboardEvent("copy", {
        clipboardData: clipboard,
        bubbles: true,
        cancelable: true,
      }),
    );
    return clipboard.getData("text/plain");
  });
  await frames();
  check(
    copied === (await cell(2, "numero_lote").innerText()),
    "Copiar en el mismo turno utiliza el destino lógico más reciente",
  );
  await cell(2, "no_orden").click();
  await page.evaluate(() => {
    const table = document.querySelector(".product-sheet-grid");
    table.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    table.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "H",
        altKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await frames();
  check(
    (await page.locator("[data-active]").count()) === 0,
    "Ocultar columnas cancela la selección pendiente del frame",
  );
  check(
    Number(
      await page.locator(".product-sheet-grid").getAttribute("aria-colcount"),
    ) === 23,
    "Se oculta la columna de la selección lógica",
  );
  await page.getByRole("button", { name: "Columnas", exact: true }).click();
  await page
    .getByRole("button", { name: "Seleccionar todas", exact: true })
    .click();
  await frames();
  await page.keyboard.press("Escape");
  await page
    .locator(".product-sheet-column-popover")
    .waitFor({ state: "hidden" });
  await cell(2, "numero_lote").click();
  check(
    await page
      .locator(".product-sheet-grid")
      .evaluate(
        (table) =>
          document.activeElement === table &&
          !!document.getElementById(
            table.getAttribute("aria-activedescendant"),
          ) &&
          table.contains(
            document.getElementById(
              table.getAttribute("aria-activedescendant"),
            ),
          ),
      ),
    "El grid enfocado referencia una celda activa montada y propia",
  );
  await page
    .getByRole("button", { name: "Filtrar y ordenar Lote", exact: true })
    .click();
  await viewport.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await frames();
  check(
    await page.locator(".column-filter-panel").isVisible(),
    "Un filtro abierto conserva su encabezado al desplazar columnas",
  );
  await page.keyboard.press("Escape");
  await cell(2, "numero_lote").click();
  await page
    .getByRole("button", { name: "Anuladas", exact: true })
    .evaluate((button) => {
      document
        .querySelector(".product-sheet-grid")
        .dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowDown",
            bubbles: true,
            cancelable: true,
          }),
        );
      button.click();
    });
  await page.waitForFunction(
    () => new URLSearchParams(location.search).get("vista") === "anuladas",
  );
  await frames();
  check(
    (await page.locator("[data-active]").count()) === 0,
    "Cambiar de hoja cancela el frame anterior y conserva el borrador",
  );
  await page
    .getByRole("button", { name: "En seguimiento", exact: true })
    .click();
  await cell(2, "no_orden").click();
  await page
    .getByRole("button", { name: /Guardar 1 cambios/ })
    .evaluate((button) => {
      document
        .querySelector(".product-sheet-grid")
        .dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowDown",
            bubbles: true,
            cancelable: true,
          }),
        );
      button.click();
    });
  await page.getByText("Sin cambios pendientes", { exact: false }).waitFor();
  await frames();
  check(
    (await page.locator("[data-active]").count()) === 0,
    "Guardar cancela el movimiento pendiente sin restaurar una selección antigua",
  );
  const after = await (await page.request.get(origin + "/api/state")).json();
  check(
    after.lote_producto.some(
      (lot) => lot.ubicacion === "Editor conservado fuera de la ventana",
    ),
    "Guardar conserva el destino estable del borrador tras cambiar de hoja",
  );
  check(
    errors.length === 0,
    "Sin errores de página en las carreras de selección y virtualización",
  );
  return { checks };
};
