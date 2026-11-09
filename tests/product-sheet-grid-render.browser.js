async (page) => {
  page = page.context().pages()[0];
  const checks = [];
  const check = (ok, text) => {
    if (!ok) throw Error(text);
    checks.push(text);
  };
  const origin = new URL(page.url()).origin;
  await page.goto(origin + "/tests/product-sheet-grid-render.html");
  await page
    .locator('[data-sheet-row="0"][data-column-key="no_orden"]')
    .click();
  const frames = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  await frames();
  const before = await page.evaluate(() => window.sheetProbe.renders);
  await page.evaluate(() => {
    const grid = document.querySelector(".product-sheet-grid");
    for (const key of ["ArrowRight", "ArrowRight", "ArrowDown"])
      grid.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    grid.dispatchEvent(
      new ClipboardEvent("copy", { bubbles: true, cancelable: true }),
    );
    grid.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      }),
    );
    grid.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Delete",
        bubbles: true,
        cancelable: true,
      }),
    );
    grid.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F2",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  const reads = await page.evaluate(() => window.sheetProbe.reads);
  check(
    reads.length === 4 &&
      reads.every(
        ([, range]) => range.anchor.row === 1 && range.anchor.column === 2,
      ),
    "Copiar, pegar, borrar y editar leen todas las teclas antes del frame visual",
  );
  await frames();
  check(
    await page.evaluate(
      (before) => window.sheetProbe.renders === before,
      before,
    ),
    "Moverse dentro de la ventana no vuelve a ejecutar renderCell",
  );
  check(
    (await page.locator("[data-active]").getAttribute("data-sheet-row")) ===
      "1",
    "La representación alcanza la selección lógica exacta",
  );
  await page.evaluate(() => {
    const grid = document.querySelector(".product-sheet-grid");
    grid.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    );
    grid.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "h",
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await frames();
  check(
    (await page.locator("[data-active]").count()) === 0,
    "Reiniciar mientras hay un frame pendiente no resucita la selección",
  );
  await page
    .locator('[data-sheet-row="0"][data-column-key="no_orden"]')
    .click();
  await frames();
  const edgeBefore = await page.evaluate(() => window.sheetProbe.renders);
  await page.evaluate(() => {
    const grid = document.querySelector(".product-sheet-grid");
    for (let i = 0; i < 120; i++)
      grid.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowLeft",
          bubbles: true,
          cancelable: true,
        }),
      );
  });
  await frames();
  check(
    await page.evaluate(
      (before) => window.sheetProbe.renders === before,
      edgeBefore,
    ),
    "120 flechas contra el borde no renderizan contenido",
  );
  return { checks };
};
