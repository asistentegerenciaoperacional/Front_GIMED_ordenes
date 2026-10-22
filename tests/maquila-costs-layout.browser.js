async (page) => {
  page.setDefaultTimeout(8000);
  const origin = new URL(page.url()).origin;
  const checks = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  const initial = await state();
  const panel = () => page.locator(".maquila-costs-panel");
  const settle = async () => {
    await page.waitForFunction(() =>
      [
        ...document.querySelectorAll('.relation-toggle[aria-expanded="true"]'),
      ].every((toggle) => {
        const target = document.getElementById(
          toggle.getAttribute("aria-controls"),
        );
        return target?.dataset.expanded === "true" && target.clientHeight > 0;
      }),
    );
    await page.evaluate(async () => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      await Promise.allSettled(
        [...document.querySelectorAll(".relation-disclosure")].flatMap(
          (element) =>
            element.getAnimations().map((animation) => animation.finished),
        ),
      );
    });
  };
  const measure = () =>
    panel()
      .locator(".maquila-cost-history")
      .evaluateAll((tables) =>
        tables.map((table) => {
          const bounds = (cell) => {
            const rect = cell.getBoundingClientRect();
            const style = getComputedStyle(cell);
            return {
              x: rect.x + parseFloat(style.paddingLeft),
              width: rect.width,
              background: style.backgroundColor,
            };
          };
          return {
            headers: [...table.tHead.rows[0].cells].map(bounds),
            rows: [...table.tBodies[0].rows].map((row) =>
              [...row.cells].map(bounds),
            ),
            layout: getComputedStyle(table).tableLayout,
          };
        }),
      );
  const aligned = (tables) =>
    tables.every((table) =>
      table.headers.every(
        (header, column) =>
          Math.abs(header.x - tables[0].headers[column].x) < 1 &&
          Math.abs(header.width - tables[0].headers[column].width) < 1 &&
          table.rows.every((row) => Math.abs(row[column].x - header.x) < 1),
      ),
    );

  for (const width of [375, 768, 1024, 1440, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + "/catalogos?tab=costos_maquila");
    const toggles = panel().locator(".relation-toggle");
    await toggles.first().waitFor();
    const groups = await toggles.count();
    check(
      groups >= 3,
      `Varios productos con historiales distintos a ${width}px`,
    );
    for (let index = 0; index < groups; index++)
      await toggles.nth(index).click();
    await page.waitForFunction(
      (count) =>
        document.querySelectorAll(".maquila-cost-history").length === count,
      groups,
    );
    await settle();
    const tables = await measure();
    check(
      tables.length === groups,
      `Todos los historiales desplegados a ${width}px`,
    );
    check(
      aligned(tables),
      `Encabezados y celdas alineados entre productos a ${width}px`,
    );
    check(
      tables.every((table) => table.layout === "fixed"),
      `Distribución independiente del contenido a ${width}px`,
    );
    check(
      tables.every((table) =>
        table.headers.every(
          (header) => header.background === "rgba(0, 0, 0, 0)",
        ),
      ),
      `Encabezados internos sin banner gris a ${width}px`,
    );
    check(
      await panel()
        .locator(".grouped-relations > thead th")
        .first()
        .evaluate(
          (cell) =>
            getComputedStyle(cell).backgroundColor !== "rgba(0, 0, 0, 0)",
        ),
      `Cabecera principal conserva su fondo a ${width}px`,
    );
    const row = panel().locator(".maquila-cost-row").first();
    await row.hover();
    await row.getByRole("button", { name: /^Editar costo/ }).focus();
    check(
      aligned(await measure()),
      `Hover y foco de acciones no desplazan columnas a ${width}px`,
    );
    await toggles.first().click();
    await settle();
    await toggles.first().click();
    await settle();
    check(
      aligned(await measure()),
      `Reabrir conserva la alineación a ${width}px`,
    );
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Desplazamiento horizontal contenido en la tabla a ${width}px`,
    );
    if ([375, 1024, 1440].includes(width))
      await page.screenshot({
        path: `tests/evidence/costs/aligned-groups-${width}.png`,
        fullPage: true,
      });
  }
  await page.goto(origin + "/catalogos?tab=proveedores_favoritos");
  const favorites = page.locator(".grouped-relations");
  await favorites.waitFor();
  await favorites.locator(".relation-toggle:not([disabled])").first().click();
  await page.locator(".relation-provider-list").first().waitFor();
  check(
    (await favorites.locator(".relation-provider-list li").count()) > 0,
    "Favoritos conserva su lista y despliegue",
  );
  check(
    (await favorites.locator("table").count()) === 0,
    "Favoritos no adquiere una tabla interna ni estilos ajenos",
  );
  check(errors.length === 0, "Sin errores JavaScript");
  check(
    JSON.stringify(await state()) === JSON.stringify(initial),
    "Prueba visual sin modificar datos",
  );
  return { checks, errors, savedRecords: 0 };
};
