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
  const original = initial.producto_corrugado[0];
  const product = initial.productos.find(
    (row) => row.id === original.id_producto,
  );
  const dialog = () => page.getByRole("dialog").last();
  const reference = () =>
    dialog().getByRole("combobox", {
      name: "Referencia de corrugado",
      exact: true,
    });
  const capacity = () =>
    dialog().getByRole("textbox", {
      name: "Unidades por corrugado",
      exact: true,
    });
  const remove = () =>
    dialog().getByRole("button", { name: "Quitar corrugado", exact: true });
  const geometry = () =>
    dialog()
      .locator(".product-materials-corrugado")
      .evaluate((section) =>
        [...section.children].map((element) => {
          const rect = element.getBoundingClientRect();
          return [rect.x, rect.y, rect.width, rect.height];
        }),
      );
  await page.goto(origin + "/catalogos?tab=materiales_asociados");
  for (const width of [375, 600, 768, 1104, 1440]) {
    await page.setViewportSize({ width, height: 835 });
    await page
      .getByRole("button", {
        name: "Editar materiales de " + product.nombre_producto,
        exact: true,
      })
      .click();
    await reference().waitFor();
    const selectedGeometry = await geometry();
    await reference().fill("corrugado inexistente");
    const pendingCapacity = await page
      .locator(".product-materials-corrugado > .field")
      .nth(1)
      .locator("input")
      .evaluate((input) => ({ disabled: input.disabled, value: input.value }));
    check(
      !pendingCapacity.disabled &&
        pendingCapacity.value === String(original.unidades_por_corrugado),
      "Buscar corrugado conserva la configuración hasta elegir una opción a " +
        width +
        "px",
    );
    await page.keyboard.press("Tab");
    await page.locator(".aria-options").waitFor({ state: "hidden" });
    check(
      (await reference().inputValue()) ===
        initial.materiales.find((row) => row.id === original.id_material)
          .nombre_material,
      "Abandonar búsqueda sin elegir restaura la referencia a " + width + "px",
    );
    check(
      await remove().isEnabled(),
      "Papelera disponible con corrugado a " + width + "px",
    );
    check(
      (await remove().innerText()) === "" &&
        (await remove().locator("svg").count()) === 1,
      "Quitar es un botón de solo icono a " + width + "px",
    );
    await dialog()
      .getByRole("heading", { name: "Corrugado", exact: true })
      .hover();
    await remove().hover();
    await page
      .getByRole("tooltip", { name: "Quitar corrugado", exact: true })
      .waitFor();
    check(true, "Tooltip de papelera a " + width + "px");
    await dialog()
      .getByRole("heading", { name: "Corrugado", exact: true })
      .hover();
    await page
      .getByRole("tooltip", { name: "Quitar corrugado", exact: true })
      .waitFor({ state: "hidden" });
    if ([375, 1104].includes(width))
      await page.screenshot({
        path:
          "tests/evidence/product-materials/compact-packaging-selected-" +
          width +
          ".png",
      });
    await remove().click();
    const emptyGeometry = await geometry();
    check(
      selectedGeometry.every((rect, index) =>
        rect.every(
          (value, axis) => Math.abs(value - emptyGeometry[index][axis]) < 1,
        ),
      ),
      "Referencia, capacidad y papelera no se desplazan al quitar a " +
        width +
        "px",
    );
    check(
      (await remove().isDisabled()) &&
        (await capacity().isDisabled()) &&
        (await capacity().inputValue()) === "" &&
        (await reference().inputValue()) === "",
      "Sin corrugado se limpian referencia y capacidad y se conserva la papelera deshabilitada a " +
        width +
        "px",
    );
    const metrics = await dialog()
      .locator(".product-materials-editor")
      .evaluate((editor) => {
        const corrugado = editor.querySelector('[aria-label="Corrugado"]');
        const specials = editor.querySelector('[aria-label="Cinta o sticker"]');
        const start = corrugado.getBoundingClientRect();
        const end = specials.getBoundingClientRect();
        const choices = [
          ...specials.querySelectorAll(".product-materials-choice"),
        ];
        return {
          height: end.bottom - start.top,
          gap: end.top - start.bottom,
          headings: [corrugado, specials].map(
            (section) => getComputedStyle(section.querySelector("h3")).fontSize,
          ),
          choiceSizes: choices.map(
            (choice) => getComputedStyle(choice).fontSize,
          ),
          contained: editor.scrollWidth <= editor.clientWidth + 1,
          aligned: Math.abs(start.left - end.left) < 1,
        };
      });
    check(
      metrics.headings.every((size) => size === "15px") &&
        metrics.choiceSizes.every((size) => size === "12px"),
      "Títulos y casillas con tipografía consistente a " + width + "px",
    );
    check(
      metrics.aligned &&
        Math.abs(metrics.gap - 16) < 1 &&
        metrics.height < (width <= 600 ? 330 : 220),
      "Secciones compactas y alineadas a " + width + "px",
    );
    check(
      metrics.contained,
      "Sin desbordamiento horizontal en el diálogo a " + width + "px",
    );
    check(
      selectedGeometry[2][2] === (width <= 600 ? 40 : 38) &&
        Math.abs(
          selectedGeometry[2][1] +
            selectedGeometry[2][3] -
            selectedGeometry[1][1] -
            selectedGeometry[1][3],
        ) < 1,
      "Papelera alineada al borde inferior del campo y con tamaño consistente a " +
        width +
        "px",
    );
    if ([375, 1104].includes(width))
      await page.screenshot({
        path:
          "tests/evidence/product-materials/compact-packaging-empty-" +
          width +
          ".png",
      });
    await reference().selectOption(original.id_material);
    await capacity().fill(String(original.unidades_por_corrugado));
    const restoredGeometry = await geometry();
    check(
      restoredGeometry.every((rect, index) =>
        rect.every(
          (value, axis) => Math.abs(value - selectedGeometry[index][axis]) < 1,
        ),
      ),
      "Seleccionar corrugado tampoco cambia la grilla a " + width + "px",
    );
    await dialog()
      .getByRole("checkbox", { name: /^Sticker/ })
      .check();
    await dialog()
      .getByRole("checkbox", { name: /^Cinta/ })
      .check();
    check(
      !(await dialog()
        .getByRole("checkbox", { name: /^Sticker/ })
        .isChecked()),
      "Cinta y sticker mantienen selección excluyente a " + width + "px",
    );
    await dialog()
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    const discard = page.getByRole("button", {
      name: "Descartar cambios",
      exact: true,
    });
    if (await discard.count()) await discard.click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  }
  check(
    JSON.stringify(await state()) === JSON.stringify(initial),
    "Prueba visual sin modificar registros",
  );
  check(errors.length === 0, "Sin errores de ejecución");
  return { checks, errors, savedRecords: 0 };
};
