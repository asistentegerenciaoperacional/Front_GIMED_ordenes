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
  const appearances = new Map();
  const appearance = (selector) =>
    page
      .locator(selector)
      .first()
      .evaluate((table) => {
        const style = (cell) => {
          const computed = getComputedStyle(cell);
          return [
            computed.paddingBlock,
            computed.paddingInline,
            computed.fontFamily,
            computed.fontSize,
            computed.fontWeight,
            computed.color,
          ];
        };
        return {
          header: style(table.tHead.rows[0].cells[0]),
          row: style(table.tBodies[0].rows[0].cells[0]),
          height: table.tBodies[0].rows[0].getBoundingClientRect().height,
        };
      });
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
    appearances.set(width, await appearance(".maquila-cost-history"));
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
  for (const width of [375, 768, 1024, 1440, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + "/catalogos?tab=proveedores_favoritos");
    const favorites = page.locator(".favorite-suppliers-panel");
    const toggles = favorites.locator(".relation-toggle:not([disabled])");
    await toggles.first().waitFor();
    const count = await toggles.count();
    for (let index = 0; index < count; index++)
      await toggles.nth(index).click();
    await page.waitForFunction(
      (count) =>
        document.querySelectorAll(".relation-provider-list").length === count,
      count,
    );
    await settle();
    const suppliers = favorites.locator(".relation-provider-list");
    check(
      (
        await suppliers.first().getByRole("columnheader").allTextContents()
      ).join("|") === "Proveedor|NIT",
      `Favoritos muestra encabezados Proveedor y NIT a ${width}px`,
    );
    const supplierAppearance = await appearance(".relation-provider-list");
    check(
      JSON.stringify(supplierAppearance) ===
        JSON.stringify(appearances.get(width)),
      `Tipografía, padding y alto de filas iguales a costos a ${width}px`,
    );
    const geometry = await suppliers.evaluateAll((tables) =>
      tables.map((table) => ({
        headers: [...table.tHead.rows[0].cells].map((cell) => ({
          x: cell.getBoundingClientRect().x,
          width: cell.getBoundingClientRect().width,
          background: getComputedStyle(cell).backgroundColor,
        })),
        rows: [...table.tBodies[0].rows].map((row) =>
          [...row.cells].map((cell) => cell.getBoundingClientRect().x),
        ),
      })),
    );
    check(
      geometry.every((table) =>
        table.headers.every(
          (header, column) =>
            Math.abs(header.x - geometry[0].headers[column].x) < 1 &&
            Math.abs(header.width - geometry[0].headers[column].width) < 1 &&
            table.rows.every((row) => Math.abs(row[column] - header.x) < 1),
        ),
      ),
      `Columnas de favoritos alineadas entre tipos a ${width}px`,
    );
    check(
      geometry.every((table) =>
        table.headers.every(
          (header) => header.background === "rgba(0, 0, 0, 0)",
        ),
      ),
      `Encabezados blancos sin banner en favoritos a ${width}px`,
    );
    await suppliers.first().locator("tbody tr").first().hover();
    check(
      (await suppliers.locator("button,a").count()) === 0,
      `Sin editar ni eliminar proveedores al hacer hover a ${width}px`,
    );
    check(
      (await favorites
        .getByRole("button", { name: /^Editar proveedores de/ })
        .count()) === initial.tipos_materiales.length,
      `Se conserva la edición por tipo a ${width}px`,
    );
    const supplierIds = initial.proveedores_favoritos
      .filter(
        (favorite) =>
          favorite.id_tipo_material ===
          initial.tipos_materiales.find(
            (type) => type.tipo_material === "Cinta",
          ).id,
      )
      .map((favorite) => favorite.id_proveedor);
    const supplier = initial.proveedor.find((provider) =>
      supplierIds.includes(provider.id),
    );
    const nit = `${supplier.nit}${supplier.digito_verf ? `-${supplier.digito_verf}` : ""}`;
    check(
      (await suppliers.getByText(nit, { exact: true }).count()) > 0,
      `Se conserva NIT-DV a ${width}px`,
    );
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Favoritos no desborda la página a ${width}px`,
    );
    if ([375, 1440].includes(width))
      await page.screenshot({
        path: `tests/evidence/costs/aligned-favorites-${width}.png`,
        fullPage: true,
      });
  }
  check(errors.length === 0, "Sin errores JavaScript");
  check(
    JSON.stringify(await state()) === JSON.stringify(initial),
    "Prueba visual sin modificar datos",
  );
  return { checks, errors, savedRecords: 0 };
};
