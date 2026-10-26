async (page) => {
  page.setDefaultTimeout(12000);
  const checks = [],
    errors = [];
  const check = (valid, label) => {
    if (!valid) throw new Error(label);
    checks.push(label);
  };
  page.on("pageerror", (error) => errors.push(error.message));
  const origin = new URL(page.url()).origin;
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  const initial = await state();
  const cases = [
    {
      id: "oc",
      route: "/ordenes/productos",
      name: "Filtro personalizado",
      groups: 13,
      value: "documento_con",
      label: "Con orden escaneada",
    },
    {
      id: "ocm",
      route: "/ordenes/materiales",
      name: "Filtro personalizado",
      groups: 6,
      value: "documento_sin",
      label: "Sin orden escaneada",
    },
    {
      id: "tipo",
      route: "/ordenes/materiales",
      name: "Filtrar tipo de orden",
      groups: 0,
      value: "material",
      label: "Material",
    },
    {
      id: "costos",
      route: "/catalogos?tab=costos_maquila",
      name: "Filtro personalizado de costos",
      groups: 0,
      value: "todos",
      label: "Todos los productos",
    },
    {
      id: "materiales",
      route: "/catalogos?tab=materiales_asociados",
      name: "Filtro personalizado de materiales por producto",
      groups: 0,
      value: "sin_corrugado",
      label: "Sin corrugado asignado",
    },
    {
      id: "documentos",
      route: "/documentos",
      name: "Filtrar clase de documento",
      groups: 0,
      value: "certificado_calidad",
      label: "Certificado de calidad",
    },
  ];
  const menu = () => page.locator(".custom-filter-options");
  for (const width of [375, 868, 1440]) {
    await page.setViewportSize({ width, height: 835 });
    for (const item of cases) {
      await page.goto(origin + item.route);
      const trigger = page.getByRole("combobox", {
        name: item.name,
        exact: true,
      });
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      await menu().waitFor();
      const style = await menu().evaluate((element) => {
        const surface = getComputedStyle(element);
        const list = element.querySelector('[role="menu"]');
        const rect = element.getBoundingClientRect();
        const option = element.querySelector('[role="menuitemradio"]');
        const selected = element.querySelector('[aria-checked="true"]');
        const focused = element.querySelector("[data-focused]");
        return {
          background: surface.backgroundColor,
          radius: surface.borderRadius,
          shadow: surface.boxShadow,
          font: getComputedStyle(option).fontSize,
          family: getComputedStyle(option).fontFamily,
          rowHeight: option.getBoundingClientRect().height,
          indicator: getComputedStyle(option, "::before").borderRadius,
          selected: selected && getComputedStyle(selected).backgroundColor,
          focus: focused && getComputedStyle(focused).outlineStyle,
          contained:
            rect.left >= 0 &&
            rect.right <= innerWidth + 1 &&
            rect.top >= 0 &&
            rect.bottom <= innerHeight + 1,
          internalScroll:
            getComputedStyle(list).overflowY === "auto" &&
            list.clientHeight <= innerHeight * 0.6 + 1,
        };
      });
      const context = item.id + " a " + width + "px";
      check(
        style.background === "rgb(255, 255, 255)" &&
          style.radius === "12px" &&
          style.shadow !== "none",
        "Superficie compartida " + context,
      );
      check(
        style.font === "12px" &&
          style.family.includes("Segoe UI") &&
          style.rowHeight >= (width <= 600 ? 40 : 34),
        "Tipografía y densidad " + context,
      );
      check(
        style.indicator === "50%" && style.selected === "rgb(239, 245, 255)",
        "Indicador y selección azul suave " + context,
      );
      check(
        style.contained && style.internalScroll,
        "Menú contenido y scroll interno " + context,
      );
      check(
        (await menu().locator("svg").count()) === 0,
        "Sin iconos decorativos " + context,
      );
      check(
        (await menu().locator(".custom-filter-section").count()) ===
          item.groups,
        "Subcategorías correctas " + context,
      );
      if (item.groups) {
        const headers = await menu()
          .locator(".aria-option-section")
          .evaluateAll((elements) =>
            elements.map((element) => ({
              background: getComputedStyle(element).backgroundColor,
              weight: Number(getComputedStyle(element).fontWeight),
            })),
          );
        check(
          headers.every(
            (header) =>
              header.background === "rgba(0, 0, 0, 0)" && header.weight >= 600,
          ),
          "Títulos blancos con jerarquía " + context,
        );
      }
      if ([375, 868].includes(width) && ["oc", "costos"].includes(item.id))
        await page.screenshot({
          path:
            "tests/evidence/aria/custom-filter-" +
            item.id +
            "-" +
            width +
            ".png",
        });
      await page.keyboard.press("End");
      check(
        (await menu()
          .locator('[role="menuitemradio"]')
          .last()
          .getAttribute("data-focused")) !== null,
        "Teclado alcanza última opción " + context,
      );
      await page.keyboard.press("Escape");
      await menu().waitFor({ state: "hidden" });
      check(
        await trigger.evaluate((element) => element === document.activeElement),
        "Escape devuelve foco " + context,
      );
      await trigger.click();
      await menu().waitFor();
      await menu()
        .locator(
          '[role="menuitemradio"][data-key=' + JSON.stringify(item.value) + "]",
        )
        .click();
      check(
        (await trigger.inputValue()) === item.value &&
          (await trigger.innerText()).includes(item.label),
        "Seleccionar aplica filtro " + context,
      );
      await trigger.click();
      await menu().waitFor();
      check(
        (await menu().locator('[aria-checked="true"]').count()) === 1,
        "Selección exclusiva " + context,
      );
      await page.mouse.click(4, 4);
      await menu().waitFor({ state: "hidden" });
      check(
        (await menu().count()) === 0,
        "Clic fuera cierra el menú " + context,
      );
      if (item.id === "oc") {
        check(
          new URL(page.url()).searchParams.get("filtro") === item.value,
          "Filtro de OC se conserva en URL a " + width + "px",
        );
        await page.reload();
        check(
          (await trigger.inputValue()) === item.value,
          "Recarga conserva filtro de OC a " + width + "px",
        );
        await trigger.click();
        await menu().waitFor();
        await menu().locator('[role="menuitemradio"][data-key=""]').click();
        check(
          !new URL(page.url()).searchParams.has("filtro"),
          "Sin filtro retira selección a " + width + "px",
        );
      }
    }
  }
  check(
    JSON.stringify(await state()) === JSON.stringify(initial),
    "Sin modificar registros reales ni temporales",
  );
  check(errors.length === 0, "Sin errores de ejecución");
  return { checks, errors, savedRecords: 0 };
};
