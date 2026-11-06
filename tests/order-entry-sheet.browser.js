async (page) => {
  page.setDefaultTimeout(12000);
  const checks = [],
    errors = [],
    writes = [];
  const check = (valid, label) => {
    if (!valid) throw new Error(label);
    checks.push(label);
  };
  const origin = new URL(page.url()).origin;
  const preference = "gimed:ui:alternative-order-entry";
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  const initial = await state();
  const command = async (name, payload) => {
    const response = await page.request.post(origin + "/api/commands", {
      data: { name, payload },
    });
    if (!response.ok()) throw new Error(await response.text());
    return (await response.json()).result;
  };
  const product = initial.productos[0];
  const material = initial.materiales.find(
    (row) => row.codigo_material === 101,
  );
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 30);
  const delivery = future
    .toISOString()
    .slice(0, 10)
    .split("-")
    .reverse()
    .join("/");
  page.on("pageerror", (failure) => errors.push(failure.message));
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/commands"))
      writes.push(request.postDataJSON());
  });
  const dialog = () =>
    page.getByRole("dialog", { name: "Nueva orden de compra", exact: true });
  const cell = (row, column) =>
    dialog().locator(
      `[data-sheet-row="${row}"][data-sheet-column="${column}"]`,
    );
  const item = (row) => cell(row, 1).getByRole("combobox");
  const quantity = (row) => cell(row, 2).getByRole("textbox");
  const price = (row) => cell(row, 3).getByRole("textbox");
  const focused = (control) =>
    control.evaluate(
      (input) =>
        new Promise((resolve) =>
          requestAnimationFrame(() =>
            resolve(input === document.activeElement),
          ),
        ),
    );
  const chooseItem = async (row, record) => {
    await item(row).fill(record.nombre_producto ?? record.nombre_material);
    await page.locator('[role="option"][data-key="' + record.id + '"]').click();
  };
  const open = async () => {
    await page
      .getByRole("button", { name: "Nueva orden", exact: true })
      .click();
    await dialog().waitFor();
  };
  const review = async () =>
    dialog()
      .getByRole("button", { name: "Revisar orden", exact: true })
      .click();
  const createInPlace = async (description) => {
    const originView = page.url();
    await dialog()
      .getByRole("button", { name: "Crear orden", exact: true })
      .click();
    await dialog().waitFor({ state: "hidden" });
    check(
      page.url() === originView,
      "La creación conserva la vista de " + description,
    );
  };
  const cancel = async () => {
    await dialog()
      .getByRole("button", { name: "Cancelar", exact: true })
      .click();
    await dialog().waitFor({ state: "hidden" });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/ordenes/productos");
  await open();
  check(
    (await dialog().locator(".order-entry-sheet").count()) === 0,
    "Modo clásico por defecto",
  );
  await cancel();
  await page.goto(origin + "/configuracion");
  await page.getByRole("tab", { name: "Apariencia", exact: true }).click();
  const setting = page.getByRole("checkbox", {
    name: "Vista alternativa de creación de órdenes",
    exact: true,
  });
  await setting.check();
  check(
    (await page.evaluate((key) => localStorage.getItem(key), preference)) ===
      "true",
    "Configuración guarda preferencia local",
  );
  check(
    JSON.stringify(await state()) === JSON.stringify(initial),
    "Cambiar apariencia no escribe en la base",
  );
  await page.reload();
  await page.getByRole("tab", { name: "Apariencia", exact: true }).click();
  check(await setting.isChecked(), "Preferencia persiste al recargar");
  await page.goto(origin + "/ordenes/productos");
  await open();
  await page.evaluate((key) => localStorage.setItem(key, "false"), preference);
  check(
    (await dialog().locator(".order-entry-sheet").count()) === 1,
    "Cambio de preferencia no altera un borrador abierto",
  );
  await cancel();
  await open();
  check(
    (await dialog().locator(".order-entry-sheet").count()) === 0,
    "Siguiente formulario toma la preferencia vigente",
  );
  await cancel();
  await page.evaluate((key) => localStorage.setItem(key, "true"), preference);
  await open();
  check(
    (await dialog().locator(".order-sheet-table tbody tr").count()) === 7,
    "Siete filas editables sin Agregar",
  );
  check(
    (
      await dialog().locator(".order-sheet-table thead th").allTextContents()
    ).join("|") === "CÓDIGO|PRODUCTO|CANTIDAD|PRECIO UNIDAD|TOTAL",
    "Cinco columnas del formato físico",
  );
  check(
    (await dialog().locator(".order-sheet-heading").innerText()).includes(
      "ORDEN DE PRODUCCIÓN No.",
    ),
    "Título de producción y consecutivo",
  );
  check(
    (await dialog().locator(".order-sheet-logo").innerText()) === "" &&
      (await dialog().locator(".order-entry-sheet img").count()) === 0,
    "Sección de logo vacía",
  );
  check(
    await dialog()
      .getByRole("textbox", { name: "Fecha de elaboración", exact: true })
      .evaluate((input) => input.readOnly),
    "Fecha automática de solo lectura",
  );
  await review();
  check(
    (await dialog().locator(".form-error-summary").count()) > 0 ||
      (await dialog().innerText()).includes("Añade al menos un renglón"),
    "Hoja vacía no pasa a revisión",
  );
  check(writes.length === 0, "Revisión vacía no envía comandos");
  await dialog()
    .getByRole("textbox", { name: "Entrega solicitada", exact: true })
    .fill(delivery);
  await chooseItem(0, product);
  check(
    (await cell(0, 0).innerText()).includes(
      initial.codigos_barras.find(
        (row) => row.id_producto === product.id && row.estado === "asignado",
      ).codigo,
    ),
    "Código automático según producto",
  );
  check(
    (await quantity(0).inputValue()) === String(product.unidades_lote),
    "Autocompletado conserva cantidad por lote",
  );
  await quantity(0).fill("2");
  await price(0).fill("10.25");
  await chooseItem(2, product);
  await quantity(2).fill("3");
  await price(2).fill("20.50");
  check(
    (
      await dialog()
        .locator('[aria-label="Gran total de la orden"]')
        .innerText()
    ).includes("82,00"),
    "Gran total exacto con huecos",
  );
  await quantity(0).focus();
  await quantity(0).press("ArrowDown");
  check(await focused(quantity(1)), "Flecha abajo cambia de fila");
  check(
    (await quantity(0).inputValue()) === "2",
    "Flechas no incrementan números",
  );
  await quantity(1).press("ArrowRight");
  check(await focused(price(1)), "Flecha derecha cambia de columna");
  await price(1).press("Enter");
  check(await focused(price(2)), "Enter baja sin enviar el formulario");
  check(
    (await dialog().locator(".order-sheet-actions").innerText()).includes(
      "Fila activa: 3",
    ),
    "Indicador sigue la celda activa",
  );
  check(writes.length === 0, "Navegación no guarda");
  await dialog().screenshot({
    path: "tests/evidence/aria/order-entry-sheet-1440.png",
  });
  await review();
  check(
    (await dialog().locator(".order-entry-sheet").count()) === 0,
    "Paso 2 mantiene presentación clásica",
  );
  await dialog().getByRole("button", { name: "Volver", exact: true }).click();
  check(
    (await quantity(0).inputValue()) === "2" &&
      (await quantity(1).inputValue()) === "3" &&
      (await quantity(2).inputValue()) === "",
    "Revisar compacta 1 y 3 a 1 y 2",
  );
  await review();
  await createInPlace("productos");
  const created = writes.find((write) => write.name === "createOrder");
  check(
    created.payload.lines.length === 2 &&
      created.payload.lines.every((line) => !Object.hasOwn(line, "_sheet")),
    "Payload usa solo filas reales sin metadatos de UI",
  );
  check(
    created.payload.lines[0].cantidad_solicitada === 2 &&
      created.payload.lines[1].cantidad_solicitada === 3,
    "Guardado conserva orden de filas",
  );
  for (const type of ["material", "otro"]) {
    await page.goto(origin + "/ordenes/materiales");
    await open();
    await dialog()
      .getByRole("combobox", { name: "Tipo de orden", exact: true })
      .selectOption(type);
    await dialog()
      .getByRole("textbox", { name: "Entrega solicitada", exact: true })
      .fill(delivery);
    for (const [index, amount] of [
      [1, 2],
      [3, 4],
      [4, 5],
    ]) {
      if (type === "material") await chooseItem(index, material);
      else {
        await cell(index, 1)
          .getByRole("combobox")
          .fill("Servicio " + index);
        await cell(index, 1).getByRole("combobox").press("Tab");
      }
      await quantity(index).fill(String(amount));
      await price(index).fill("1.00");
    }
    check(
      (await dialog().locator(".order-sheet-heading").innerText()).includes(
        "ORDEN DE COMPRA",
      ),
      "Mismo formato con título de compra para " + type,
    );
    await review();
    await dialog().getByRole("button", { name: "Volver", exact: true }).click();
    check(
      (
        await Promise.all(
          [0, 1, 2].map((index) => quantity(index).inputValue()),
        )
      ).join("|") === "2|4|5",
      "Compactación 2, 4, 5 para " + type,
    );
    await review();
    await createInPlace(type);
  }
  await page.goto(origin + "/ordenes/productos");
  await open();
  await quantity(4).fill("0");
  await review();
  check(
    (await quantity(0).inputValue()) === "0",
    "Fila parcial con cero no desaparece",
  );
  check(
    (await item(0).getAttribute("aria-invalid")) === "true",
    "Error del producto se remapea a la primera fila",
  );
  await dialog()
    .getByRole("button", { name: "Vaciar fila", exact: true })
    .click();
  check(
    (await quantity(0).inputValue()) === "",
    "Vaciar fila limpia los valores",
  );
  await item(3).fill("producto inexistente");
  await item(3).press("Tab");
  await review();
  check(
    (await item(0).inputValue()).includes("inexistente"),
    "Búsqueda sin seleccionar no se descarta al compactar",
  );
  await cancel();
  await open();
  await item(5).fill(product.nombre_producto);
  await page.getByRole("option").first().waitFor();
  await item(5).press("ArrowDown");
  await item(5).press("Enter");
  check(
    (await quantity(5).inputValue()) === String(product.unidades_lote) &&
      (await focused(item(5))),
    "Enter selecciona del autocompletado sin saltar otra fila",
  );
  await item(5).press("Enter");
  check(await focused(item(6)), "Enter posterior baja una fila");
  await item(6).press("ArrowUp");
  await focused(item(5));
  await dialog()
    .getByRole("button", { name: "Vaciar fila", exact: true })
    .click();
  check(
    (await quantity(5).inputValue()) === "" &&
      (await item(5).inputValue()) === "",
    "Vaciar limpia la fila activa, no otra posición",
  );
  await quantity(4).fill("1.5");
  await review();
  check(
    (await quantity(0).inputValue()) === "1.5" &&
      (await quantity(0).getAttribute("aria-invalid")) === "true",
    "Cantidad fraccionaria se conserva y resalta tras compactar",
  );
  check(
    await cell(0, 2).evaluate(
      (element) => getComputedStyle(element).boxShadow !== "none",
    ),
    "Celda inválida tiene borde visual rojo",
  );
  await dialog()
    .locator(".order-sheet-meta .date-calendar-button:not(:disabled)")
    .click();
  await page.locator(".aria-calendar-popover").waitFor();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  check(
    await dialog().isVisible(),
    "Calendario abre y cierra sin dejar la página en blanco ni cerrar la orden",
  );
  await cancel();

  const source = await command("createOrder", {
    tipo_orden: "producto",
    id_proveedor: product.id_maquilador,
    fecha_solicitada_entrega:
      future.toISOString().slice(0, 10) + "T12:00:00.000Z",
    lines: [
      {
        id_producto: product.id,
        cantidad_solicitada: 100,
        precio_unitario: "1.00",
      },
    ],
  });
  await command("authorizeOrder", { id: source.orderId, confirm: true });
  const sourceLine = (await state()).orden_producto.find(
    (line) => line.id_orden_compra === source.orderId,
  );
  await page.goto(origin + "/abastecimiento?tab=pendientes");
  const today = new Date()
    .toISOString()
    .slice(0, 10)
    .split("-")
    .reverse()
    .join("/");
  await page.locator('[id="field-desde"]').fill(today);
  await page.locator('[id="field-hasta"]').fill(delivery);
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await page
    .locator(`[data-need="${sourceLine.id}/${material.id}"]`)
    .getByRole("checkbox")
    .check();
  await page.getByRole("button", { name: "Elaborar OCM", exact: true }).click();
  check(
    (await item(0).isDisabled()) &&
      (await quantity(1).isDisabled()) &&
      (await dialog()
        .getByRole("button", { name: "Vaciar fila", exact: true })
        .isDisabled()),
    "OCM de Abastecimiento conserva materiales y filas bloqueados",
  );
  check(
    (
      await dialog()
        .getByRole("region", { name: "Detalle de abastecimiento", exact: true })
        .innerText()
    ).includes("100 unidades"),
    "Panel auxiliar conserva bases y orígenes",
  );
  const percent = dialog().getByRole("textbox", {
    name: "Adicional del material 1 (%)",
    exact: true,
  });
  await percent.fill("5");
  await percent.press("Tab");
  check(
    (await quantity(0).inputValue()) === "105",
    "Porcentaje auxiliar recalcula la cantidad en la hoja",
  );
  await quantity(0).fill("107");
  await price(0).fill("2.55");
  await dialog()
    .getByRole("textbox", { name: "Entrega solicitada", exact: true })
    .fill(delivery);
  await review();
  check(
    (await dialog().innerText()).includes("debe ser anterior"),
    "OCM conserva restricción de entrega anterior a las OC de origen",
  );
  const supplyDate = new Date(future.getTime() - 86400000)
    .toISOString()
    .slice(0, 10)
    .split("-")
    .reverse()
    .join("/");
  await dialog()
    .getByRole("textbox", { name: "Entrega solicitada", exact: true })
    .fill(supplyDate);
  await review();
  check(
    (await dialog().locator(".demand-review").innerText()).includes("107"),
    "Revisión de OCM continúa con el formato existente",
  );
  await dialog().getByRole("button", { name: "Volver", exact: true }).click();
  check(
    (await quantity(0).inputValue()) === "107" &&
      (await percent.inputValue()) === "5",
    "Volver conserva cantidad manual, adicional y orígenes",
  );
  await dialog().screenshot({
    path: "tests/evidence/aria/order-entry-sheet-supply.png",
  });
  await review();
  await createInPlace("materiales pendientes");
  const supplyWrite = writes
    .filter((write) => write.name === "createOrder")
    .at(-1);
  check(
    supplyWrite.payload.abastecimiento.fuentes.length === 1 &&
      supplyWrite.payload.lines[0].cantidad_solicitada === 107 &&
      !Object.hasOwn(supplyWrite.payload.lines[0], "_sheet"),
    "OCM guarda el contrato original de abastecimiento",
  );

  const createdProduct = (await state()).orden_compra.find(
    (order) =>
      order.tipo_orden === "producto" &&
      !initial.orden_compra.some((old) => old.id === order.id) &&
      order.id !== source.orderId,
  );
  await page.goto(origin + "/ordenes/" + createdProduct.id);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const editing = page.getByRole("dialog", {
    name: "Editar orden · " + createdProduct.no_orden,
    exact: true,
  });
  check(
    (await editing.locator(".order-entry-sheet").count()) === 1 &&
      (await editing.locator("tbody tr").count()) === 7,
    "Las órdenes existentes usan siete filas de boceto cuando está activo",
  );
  const alternate = initial.productos.find(p => p.id !== product.id && p.id_maquilador === product.id_maquilador && p.activo && initial.codigos_barras.some(code => code.id_producto === p.id && code.estado === "asignado"));
  check(Boolean(alternate),"Hay otro producto asignado para verificar la sustitución");
  const editItem = editing.locator('[data-sheet-row="0"][data-sheet-column="1"]').getByRole("combobox");
  await editItem.fill(alternate.nombre_producto);
  await page.locator(`[role="option"][data-key="${alternate.id}"]`).click();
  const replacementCode=initial.codigos_barras.find(code=>code.id_producto===alternate.id && code.estado==="asignado").codigo;
  check((await editing.locator('[data-sheet-row="0"][data-sheet-column="0"]').innerText()).includes(replacementCode),"Al cambiar el producto se muestra su código asignado actual");
  const otherSupplier = initial.proveedor.find(p=>p.Es_maquila && p.id!==product.id_maquilador);
  const providerInput=editing.getByRole("combobox",{name:"Proveedor",exact:true});
  await providerInput.fill(otherSupplier.nombre_largo);
  await page.locator(`[role="option"][data-key="${otherSupplier.id}"]`).click();
  await page.getByRole("dialog",{name:"Cambiar proveedor y reemplazar la orden",exact:true}).getByRole("button",{name:"Cambiar proveedor",exact:true}).click();
  check(await editing.locator(".order-entry-sheet tbody tr").count()===7,"Confirmar el reemplazo de proveedor mantiene las siete filas del boceto");
  await providerInput.fill(initial.proveedor.find(p=>p.id===product.id_maquilador).nombre_largo);
  await page.locator(`[role="option"][data-key="${product.id_maquilador}"]`).click();
  check((await editing.locator('[data-sheet-row="0"][data-sheet-column="0"]').innerText()).includes(replacementCode),"Volver al proveedor inicial recupera el borrador de edición");
  await editing.getByRole("button", { name: "Cancelar", exact: true }).click();
  await command("authorizeOrder", { id: createdProduct.id, confirm: true });
  await page.reload();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await editing.locator(".order-entry-sheet").waitFor();
  const editCell = (row, col) =>
    editing.locator(`[data-sheet-row="${row}"][data-sheet-column="${col}"]`);
  check(
    (await editCell(0, 1).getByRole("combobox").isDisabled()) &&
      (await editing.getByRole("button", { name: "Vaciar fila" }).isDisabled()),
    "En OC autorizada no se pueden reemplazar ni quitar productos",
  );
  check(
    (await editCell(6, 2).getByRole("textbox").isDisabled()) &&
      (await editCell(6, 3).getByRole("textbox").isDisabled()),
    "Las filas libres no permiten añadir productos a una OC autorizada",
  );
  const savedBefore = await state();
  const originalLine = savedBefore.orden_producto.find(
    (line) => line.id_orden_compra === createdProduct.id,
  );
  const originalCode = savedBefore.codigos_barras.find(
    (code) => code.id === originalLine.id_codigo_barras,
  ).codigo;
  check(
    (await editCell(0, 0).innerText()).includes(originalCode),
    "La hoja muestra el código histórico de la orden",
  );
  await editCell(0, 2).getByRole("textbox").fill("4321");
  await editing
    .getByRole("button", { name: "Revisar orden", exact: true })
    .click();
  await editing.getByRole("button", { name: "Volver", exact: true }).click();
  check(
    (await editCell(0, 2).getByRole("textbox").inputValue()) === "4321",
    "Volver conserva la edición y el formato boceto",
  );
  await editing
    .getByRole("button", { name: "Revisar orden", exact: true })
    .click();
  await editing
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await editing.waitFor({ state: "hidden" });
  const savedAfter = await state();
  check(
    savedAfter.orden_producto.find((line) => line.id === originalLine.id)
      .cantidad_solicitada === 4321 &&
      savedAfter.orden_producto.find((line) => line.id === originalLine.id)
        .id_codigo_barras === originalLine.id_codigo_barras,
    "Guardar conserva identidad y código histórico y actualiza la cantidad",
  );
  for (const type of ["material", "otro"]) {
    const existing = (await state()).orden_compra.find(
      (order) =>
        order.tipo_orden === type &&
        !initial.orden_compra.some((old) => old.id === order.id),
    );
    await page.goto(origin + "/ordenes/" + existing.id);
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    const form = page.getByRole("dialog", {
      name: "Editar orden · " + existing.no_orden,
      exact: true,
    });
    check(
      (await form.locator(".order-entry-sheet").count()) === 1 &&
        (await form.locator(".order-sheet-heading").innerText()).includes(
          "ORDEN DE COMPRA",
        ),
      `Edición de ${type} usa el boceto de compra`,
    );
    await form
      .getByRole("button", { name: "Revisar orden", exact: true })
      .click();
    check(
      await form
        .getByRole("button", { name: "Guardar cambios", exact: true })
        .isVisible(),
      `La edición de ${type} llega a revisión`,
    );
    await form.getByRole("button", { name: "Cancelar", exact: true }).click();
  }
  await page.evaluate((key) => localStorage.setItem(key, "false"), preference);
  await page.goto(origin + "/ordenes/" + createdProduct.id);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  check(
    (await editing.locator(".order-entry-sheet").count()) === 0,
    "La edición conserva el formato clásico con la preferencia desactivada",
  );
  await editing.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.evaluate((key) => localStorage.setItem(key, "true"), preference);
  await page.goto(origin + "/ordenes/" + createdProduct.id + "/imprimir");
  await page.locator(".print-table").waitFor();
  check(
    (await page.locator(".print-table thead th").count()) === 7 &&
      (await page.locator(".order-entry-sheet").count()) === 0,
    "Formato de impresión no cambia",
  );

  await page.goto(origin + "/ordenes/productos");
  await page.setViewportSize({ width: 375, height: 900 });
  await open();
  check(
    await dialog()
      .locator(".order-entry-sheet")
      .evaluate((sheet) => sheet.getBoundingClientRect().width >= 880),
    "Móvil conserva ancho de hoja",
  );
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Móvil no desborda la página",
  );
  await price(6).focus();
  await price(6).press("Enter");
  check(await focused(price(6)), "Enter en última fila no añade una octava");
  await dialog()
    .locator(".order-sheet-scroll")
    .evaluate((element) => {
      element.scrollLeft = 0;
      element.closest(".dialog").scrollTop = 0;
    });
  await dialog().screenshot({
    path: "tests/evidence/aria/order-entry-sheet-375.png",
  });
  await cancel();
  await page.goto(origin + "/configuracion");
  await page.getByRole("tab", { name: "Apariencia", exact: true }).click();
  await setting.uncheck();
  await page.goto(origin + "/ordenes/productos");
  await open();
  check(
    (await dialog().locator(".order-entry-sheet").count()) === 0,
    "Desactivar restaura formulario clásico",
  );
  await cancel();

  const blockedContext = await page
    .context()
    .browser()
    .newContext({ viewport: { width: 1024, height: 900 } });
  await blockedContext.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Bloqueado", "SecurityError");
      },
    }),
  );
  const blocked = await blockedContext.newPage();
  blocked.on("pageerror", (failure) => errors.push(failure.message));
  await blocked.goto(origin + "/configuracion");
  await blocked.getByRole("tab", { name: "Apariencia", exact: true }).click();
  await blocked
    .getByRole("checkbox", {
      name: "Vista alternativa de creación de órdenes",
      exact: true,
    })
    .check();
  check(
    (await blocked.getByRole("status").innerText()).includes(
      "solo durante esta sesión",
    ),
    "Almacenamiento bloqueado informa limitación sin fallar",
  );
  await blocked
    .getByRole("button", { name: "Abrir navegación", exact: true })
    .click();
  await blocked
    .getByRole("link", { name: "Órdenes de compra", exact: true })
    .click();
  await blocked
    .getByRole("button", { name: "Nueva orden", exact: true })
    .click();
  check(
    (await blocked.locator(".order-entry-sheet").count()) === 1,
    "Preferencia bloqueada funciona en memoria durante la sesión",
  );
  await blockedContext.close();
  check(errors.length === 0, "Sin errores de ejecución");
  return {
    checks,
    errors,
    savedOrders: writes.filter((write) => write.name === "createOrder").length,
  };
};
