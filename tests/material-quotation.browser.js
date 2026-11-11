async (page) => {
  page.setDefaultTimeout(10000);
  const origin = new URL(page.url()).origin;
  const checks = [];
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  const state = async () =>
    (await page.request.get(origin + "/api/state")).json();
  const command = async (name, payload) => {
    const response = await page.request.post(origin + "/api/commands", {
      data: { name, payload },
    });
    if (!response.ok()) throw new Error(await response.text());
    return (await response.json()).result;
  };
  const initial = await state();
  const product = initial.productos[0];
  const mainProvider = initial.proveedor.find((p) => p.Es_materiales);
  const mainContact = initial.contacto.find(
    (c) => c.id_proveedor === mainProvider.id,
  );
  await command("saveEntity", {
    entity: "contacto",
    row: {
      id_proveedor: mainProvider.id,
      nombre: "Segundo contacto de compras",
      cargo_area: "Compras",
      correo: "segundo@proveedor.example",
      celular: null,
    },
  });
  const supplier = (
    await command("saveEntity", {
      entity: "proveedor",
      row: {
        nombre_largo: "Proveedor de cotización sin favorito",
        nombre_corto: "Nuevo cotizador",
        nit: "901222333",
        digito_verf: "4",
        Es_maquila: false,
        Es_materiales: true,
        activo: true,
      },
    })
  ).row;
  const extra = [];
  const type = initial.tipos_materiales.find(
    (t) => t.tipo_material === "Envase",
  );
  for (let i = 0; i < 6; i++) {
    const material = (
      await command("saveEntity", {
        entity: "materiales",
        row: {
          codigo_material: 220 + i,
          nombre_material: "Material cotización " + (i + 1),
          id_tipo_material: type.id,
        },
      })
    ).row;
    await command("saveEntity", {
      entity: "materiales_asociados",
      row: { id_producto: product.id, id_material: material.id },
    });
    extra.push(material.id);
  }
  const chosen = [
    initial.materiales.find((m) => m.codigo_material === 101).id,
    initial.materiales.find((m) => m.codigo_material === 102).id,
    ...extra,
  ];
  const orders = [];
  for (const [i, date] of ["2099-02-15", "2099-02-22"].entries()) {
    const result = await command("createOrder", {
      tipo_orden: "producto",
      id_proveedor: product.id_maquilador,
      fecha_solicitada_entrega: date + "T12:00:00.000Z",
      lines: [
        {
          id_producto: product.id,
          cantidad_solicitada: (i + 1) * 1000,
          precio_unitario: "1.00",
        },
      ],
    });
    await command("authorizeOrder", { id: result.orderId, confirm: true });
    orders.push(result.orderId);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/configuracion");
  await page
    .getByRole("tab", { name: "Plantilla de cotización", exact: true })
    .click();
  const globalSubject = "Cotizar {{material}} para {{proveedor}}";
  const globalBody =
    "Estimados {{proveedor}}:\n{{cantidad}} unidades de {{material}} ({{codigo_maia}}, {{tipo_material}}). Entrega {{fecha_entrega}}.";
  await page
    .getByRole("textbox", { name: "Asunto", exact: true })
    .fill(globalSubject);
  await page
    .getByRole("textbox", { name: "Mensaje", exact: true })
    .fill(globalBody);
  await page
    .getByRole("button", { name: "Guardar plantilla", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector("button[type=submit]")?.disabled === true,
  );
  check(
    (await state()).plantilla_correo[0].asunto === globalSubject,
    "Plantilla global guardada mediante Configuración",
  );
  await page.reload();
  await page
    .getByRole("tab", { name: "Plantilla de cotización", exact: true })
    .click();
  check(
    (await page
      .getByRole("textbox", { name: "Mensaje", exact: true })
      .inputValue()) === globalBody,
    "Plantilla global persiste al recargar",
  );
  await page
    .getByRole("textbox", { name: "Asunto", exact: true })
    .fill("{{variable_inexistente}}");
  await page
    .getByRole("button", { name: "Guardar plantilla", exact: true })
    .click();
  await page.locator(".error-notice").waitFor();
  check(
    (await page.locator(".error-notice").innerText()).includes(
      "Variable desconocida",
    ),
    "Configuración rechaza variables desconocidas",
  );
  await page.goto(origin + "/abastecimiento?tab=pendientes");
  const baseline = await state();
  const first = baseline.orden_producto.find(
    (l) => l.id_orden_compra === orders[0],
  );
  const second = baseline.orden_producto.find(
    (l) => l.id_orden_compra === orders[1],
  );
  const select = (line, material) =>
    page.locator(`[data-need="${line.id}/${material}"]`).getByRole("checkbox");
  for (const id of chosen) await select(first, id).check();
  await select(second, chosen[0]).check();
  check(
    (await page.locator(".demand-selection-count").innerText()).includes(
      "8 materiales",
    ),
    "Se seleccionan ocho materiales distintos",
  );
  check(
    await page
      .getByRole("button", { name: "Elaborar OCM", exact: true })
      .isDisabled(),
    "Ocho materiales bloquean elaborar OCM",
  );
  check(
    await page
      .getByRole("button", { name: "Cotizar materiales", exact: true })
      .isEnabled(),
    "Ocho materiales admiten cotización",
  );
  await select(first, chosen[7]).uncheck();
  check(
    await page
      .getByRole("button", { name: "Elaborar OCM", exact: true })
      .isEnabled(),
    "Volver a siete habilita OCM",
  );
  await select(first, chosen[7]).check();
  await page
    .getByRole("button", { name: "Cotizar materiales", exact: true })
    .click();
  const dialog = () =>
    page.getByRole("dialog", { name: "Cotizar materiales", exact: true });
  const material = (id) =>
    dialog().locator(`[data-quotation-material="${id}"]`);
  const recipient = (id) =>
    dialog().locator(`[data-quotation-provider="${id}"]`);
  const section = (name) => dialog().getByRole("button", { name, exact: true });
  const openSection = async (name) => {
    const trigger = section(name);
    if ((await trigger.getAttribute("aria-expanded")) !== "true")
      await trigger.press("Enter");
  };
  const materialsSection = "Materiales y proveedores";
  const recipientsSection = "Destinatarios por proveedor";
  const templateSection = "Plantilla de envío";
  await dialog().waitFor();
  check(
    (await section(materialsSection).getAttribute("aria-expanded")) ===
      "true" &&
      (await section(recipientsSection).getAttribute("aria-expanded")) ===
        "false" &&
      (await section(templateSection).getAttribute("aria-expanded")) ===
        "false",
    "La captura abre únicamente Materiales y proveedores",
  );
  check(
    (await dialog().locator("[data-quotation-material]").count()) === 8,
    "Diálogo muestra una sección por material",
  );
  for (const title of [materialsSection, recipientsSection, templateSection])
    check(
      (await section(title).innerText()).startsWith(title),
      `Encabezado sin numeración: ${title}`,
    );
  check(
    (await material(chosen[0])
      .getByRole("list", { name: "Proveedores a cotizar" })
      .count()) === 1,
    "La tarjeta del material identifica su lista de proveedores",
  );
  await openSection(templateSection);
  check(
    (await dialog()
      .getByRole("textbox", { name: "Asunto", exact: true })
      .inputValue()) === globalSubject,
    "Diálogo utiliza la plantilla global",
  );
  check(
    (await section(materialsSection).getAttribute("aria-expanded")) ===
      "false" &&
      (await material(chosen[0]).getByRole("spinbutton").count()) === 0,
    "Al abrir Plantilla con el teclado, los campos plegados salen del árbol accesible",
  );
  await section(templateSection).press("Space");
  check(
    (await section(templateSection).getAttribute("aria-expanded")) === "false",
    "La sección activa puede plegarse con el teclado",
  );
  await openSection(materialsSection);
  check(
    (await material(chosen[0]).innerText()).includes("3.000"),
    "Consolidación suma solo los orígenes seleccionados",
  );
  check(
    (await material(chosen[0])
      .getByRole("spinbutton", { name: "Cantidad a cotizar", exact: true })
      .inputValue()) === "3300",
    "Adicional inicial de 10 % con aritmética exacta",
  );
  await openSection(recipientsSection);
  check(
    (await recipient(mainProvider.id)
      .getByRole("textbox", { name: "Correo del destinatario", exact: true })
      .inputValue()) === "",
    "Varios contactos sugeridos exigen elegir uno",
  );
  await openSection(materialsSection);
  await dialog()
    .getByRole("button", { name: "Revisar cotización", exact: true })
    .click();
  await dialog().locator(".error-notice").waitFor();
  await page.waitForFunction(() =>
    document.activeElement
      ?.getAttribute("data-field-path")
      ?.startsWith("destinatarios."),
  );
  check(
    (await section(recipientsSection).getAttribute("aria-expanded")) === "true",
    "Revisar abre Destinatarios y enfoca el primer correo pendiente",
  );
  check(
    (await dialog()
      .getByRole("button", { name: /^Confirmar .* envíos simulados/ })
      .count()) === 0,
    "Faltantes impiden confirmar el envío",
  );
  await openSection(materialsSection);
  await dialog()
    .locator('.error-notice a[href^="#field-destinatarios."]')
    .first()
    .click();
  await page.waitForFunction(() =>
    document.activeElement
      ?.getAttribute("data-field-path")
      ?.startsWith("destinatarios."),
  );
  check(
    (await section(recipientsSection).getAttribute("aria-expanded")) === "true",
    "El enlace del aviso abre una sección plegada y enfoca el campo",
  );
  await openSection(materialsSection);
  // Keep a single common supplier per material, exercising configurable favorites.
  for (const id of chosen) {
    const card = material(id);
    const current = await card.locator(".quotation-providers li").count();
    for (let i = current - 1; i >= 0; i--) {
      const item = card.locator(".quotation-providers li").nth(i);
      if (!(await item.innerText()).includes(mainProvider.nombre_largo))
        await item.getByRole("button").click();
    }
    if (
      !(await card.locator(".quotation-providers").innerText()).includes(
        mainProvider.nombre_largo,
      )
    ) {
      await card
        .getByRole("combobox", { name: "Agregar proveedor", exact: true })
        .fill(mainProvider.nombre_largo);
      await page
        .getByRole("option", { name: mainProvider.nombre_largo, exact: true })
        .click();
    }
  }
  await openSection(recipientsSection);
  await recipient(mainProvider.id)
    .getByRole("textbox", { name: "Correo del destinatario", exact: true })
    .fill("manual-compartido@ejemplo.com");
  await openSection(materialsSection);
  await openSection(recipientsSection);
  check(
    (await recipient(mainProvider.id)
      .getByRole("textbox", { name: "Correo del destinatario", exact: true })
      .inputValue()) === "manual-compartido@ejemplo.com" &&
      (await recipient(mainProvider.id)
        .getByText("8 mensajes", { exact: true })
        .count()) === 1,
    "El correo manual se conserva al plegar y es común a los ocho mensajes del proveedor",
  );
  check(
    (await state()).contacto.every(
      (c) => c.correo !== "manual-compartido@ejemplo.com",
    ),
    "El correo manual no modifica el directorio",
  );
  await recipient(mainProvider.id)
    .getByRole("combobox", { name: "Contacto del proveedor", exact: true })
    .selectOption(mainContact.id);
  await openSection(materialsSection);
  const firstCard = material(chosen[0]);
  await firstCard
    .getByRole("spinbutton", { name: "Adicional (%)", exact: true })
    .fill("5");
  check(
    (await firstCard
      .getByRole("spinbutton", { name: "Cantidad a cotizar", exact: true })
      .inputValue()) === "3150",
    "Cambiar porcentaje recalcula desde la base",
  );
  await firstCard
    .getByRole("spinbutton", { name: "Cantidad a cotizar", exact: true })
    .fill("3210");
  await firstCard
    .getByRole("combobox", { name: "Agregar proveedor", exact: true })
    .fill(supplier.nombre_largo);
  await firstCard
    .getByRole("combobox", { name: "Agregar proveedor", exact: true })
    .press("ArrowDown");
  await firstCard
    .getByRole("combobox", { name: "Agregar proveedor", exact: true })
    .press("Enter");
  check(
    (await firstCard.locator(".quotation-providers li").count()) === 2,
    "Se agrega con teclado un proveedor de materiales sin ser favorito",
  );
  await firstCard
    .locator(".quotation-providers li")
    .filter({ hasText: mainProvider.nombre_largo })
    .getByRole("button")
    .click();
  await openSection(recipientsSection);
  await recipient(supplier.id)
    .getByRole("textbox", { name: "Correo del destinatario", exact: true })
    .fill("nuevo@cotizador.example");
  await openSection(templateSection);
  await dialog()
    .getByRole("textbox", { name: "Asunto", exact: true })
    .fill("{{desconocida}}");
  await openSection(materialsSection);
  await dialog()
    .getByRole("button", { name: "Revisar cotización", exact: true })
    .click();
  await dialog().locator(".error-notice").waitFor();
  check(
    (await section(templateSection).getAttribute("aria-expanded")) === "true",
    "Un error de plantilla abre su sección plegada",
  );
  check(
    (await dialog().locator(".error-notice").innerText()).includes(
      "Variable desconocida",
    ),
    "Plantilla del lote rechaza variables desconocidas",
  );
  await dialog()
    .getByRole("button", { name: "Revisar cotización", exact: true })
    .waitFor();
  await dialog()
    .getByRole("textbox", { name: "Asunto", exact: true })
    .fill("Solo este envío · {{material}}");
  await openSection(recipientsSection);
  const engine = await page.evaluate(() =>
    navigator.userAgent.includes("Firefox")
      ? "firefox"
      : navigator.userAgent.includes("AppleWebKit") &&
          !navigator.userAgent.includes("Chrome")
        ? "webkit"
        : "chromium",
  );
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    check(
      await dialog().evaluate(
        (el) =>
          el.getBoundingClientRect().right <= innerWidth &&
          el.getBoundingClientRect().left >= 0,
      ),
      "Captura responsive a " + width,
    );
    check(
      await dialog()
        .locator(".quotation-section")
        .evaluateAll((sections) =>
          sections.every((panel) => {
            const heading = panel.querySelector(".quotation-section-trigger");
            const typography = getComputedStyle(heading);
            return (
              panel.scrollWidth <= panel.clientWidth + 1 &&
              [
                ...panel.querySelectorAll("h4, p, label, input, textarea"),
              ].every((item) => {
                const style = getComputedStyle(item);
                return (
                  parseFloat(style.fontSize) <=
                    parseFloat(typography.fontSize) &&
                  style.fontFamily === typography.fontFamily
                );
              })
            );
          }),
        ),
      "Jerarquía tipográfica y secciones sin desborde a " + width,
    );
    await openSection(materialsSection);
    check(
      await dialog()
        .locator(".quotation-material")
        .evaluateAll((cards) =>
          cards.every(
            (card, index) =>
              card.scrollWidth <= card.clientWidth + 1 &&
              (index === 0 ||
                card.getBoundingClientRect().top >
                  cards[index - 1].getBoundingClientRect().bottom),
          ),
        ),
      "Tarjetas de materiales separadas y sin desborde a " + width,
    );
    await dialog().evaluate((el) => {
      let node = el;
      while (node) {
        node.scrollTop = 0;
        node = node.parentElement;
      }
    });
    if (width !== 320)
      await page.screenshot({
        path: `tests/evidence/quotations/${engine}-capture-${width}.png`,
        animations: "disabled",
      });
    await openSection(recipientsSection);
  }
  await dialog()
    .getByRole("button", { name: "Revisar cotización", exact: true })
    .click();
  await dialog()
    .getByRole("heading", { name: "Revisar cotizaciones", exact: true })
    .waitFor()
    .catch(async (cause) => {
      console.log(
        await dialog().evaluate((el) => ({
          error: el.querySelector(".error-notice")?.textContent,
          invalid: [...el.querySelectorAll("input,textarea")]
            .filter((input) => input.willValidate && !input.validity.valid)
            .map((input) => ({
              id: input.id,
              value: input.value,
              issue: input.validationMessage,
            })),
        })),
      );
      throw cause;
    });
  await page.waitForFunction(
    () => document.activeElement?.textContent === "Revisar cotizaciones",
  );
  check(
    await dialog()
      .getByRole("heading", { name: "Revisar cotizaciones", exact: true })
      .evaluate((el) => el === document.activeElement),
    "La revisión recibe el foco",
  );
  check(
    (await dialog().locator("article.quotation-card").count()) === 8,
    "Previsualización muestra ocho mensajes por material-proveedor",
  );
  await dialog()
    .getByRole("button", { name: "Ver mensaje", exact: true })
    .first()
    .click();
  check(
    (await dialog().locator(".quotation-message").first().innerText()).includes(
      "3210",
    ),
    "Vista previa sustituye la cantidad final ajustada",
  );
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await dialog().evaluate((el) => {
      let node = el;
      while (node) {
        node.scrollTop = 0;
        node = node.parentElement;
      }
    });
    check(
      await dialog()
        .locator(".dialog-footer")
        .getByRole("button")
        .evaluateAll((buttons) =>
          buttons.every((button) => {
            const box = button.getBoundingClientRect();
            return (
              box.left >= 0 &&
              box.right <= innerWidth + 0.5 &&
              box.top >= 0 &&
              box.bottom <= innerHeight + 0.5
            );
          }),
        ),
      "Todos los botones de revisión caben a " + width,
    );
    await page.screenshot({
      path: `tests/evidence/quotations/${engine}-review-${width}.png`,
    });
  }
  const beforeConflict = await state();
  await command("saveEntity", {
    entity: "contacto",
    key: { id: mainContact.id },
    row: { ...mainContact, correo: "contacto-actualizado@proveedor.example" },
  });
  const afterContact = await state();
  await dialog()
    .getByRole("button", { name: "Confirmar 8 envíos simulados", exact: true })
    .click();
  await dialog()
    .getByRole("button", { name: "Actualizar datos", exact: true })
    .waitFor();
  check(
    (await state()).correo_enviado.length ===
      beforeConflict.correo_enviado.length,
    "Conflicto de contactos no deja registros de envío",
  );
  check(
    JSON.stringify(await state()) === JSON.stringify(afterContact),
    "Conflicto no modifica otros datos",
  );
  await dialog()
    .getByRole("button", { name: "Actualizar datos", exact: true })
    .click();
  await dialog()
    .getByRole("button", { name: "Revisar cotización", exact: true })
    .waitFor();
  await openSection(materialsSection);
  check(
    (await material(chosen[0])
      .getByRole("spinbutton", { name: "Cantidad a cotizar", exact: true })
      .inputValue()) === "3210",
    "Actualizar conserva cantidad manual",
  );
  await openSection(templateSection);
  check(
    (await dialog()
      .getByRole("textbox", { name: "Asunto", exact: true })
      .inputValue()) === "Solo este envío · {{material}}",
    "Actualizar conserva plantilla del lote",
  );
  await openSection(recipientsSection);
  check(
    (await recipient(mainProvider.id)
      .getByRole("textbox", { name: "Correo del destinatario", exact: true })
      .inputValue()) === "contacto-actualizado@proveedor.example",
    "Actualizar carga el contacto vigente",
  );
  await dialog()
    .getByRole("button", { name: "Revisar cotización", exact: true })
    .click();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route("**/api/commands", async (route) => {
    if (route.request().postDataJSON().name === "sendMaterialQuotations") {
      calls++;
      await gate;
    }
    await route.continue();
  });
  await dialog()
    .getByRole("button", { name: "Confirmar 8 envíos simulados", exact: true })
    .click();
  check(
    await dialog()
      .getByRole("button", { name: "Procesando…", exact: true })
      .isDisabled(),
    "Envío bloquea doble confirmación",
  );
  check(
    await dialog()
      .getByRole("button", { name: "Cerrar Cotizar materiales", exact: true })
      .isDisabled(),
    "Envío bloquea X",
  );
  await page.keyboard.press("Escape");
  check(await dialog().isVisible(), "Escape no cierra durante el envío");
  release();
  await dialog().waitFor({ state: "hidden" });
  await page.unroute("**/api/commands");
  const after = await state();
  check(
    calls === 1 &&
      after.correo_enviado.length === beforeConflict.correo_enviado.length + 8,
    "Una sola confirmación registra ocho mensajes simulados",
  );
  check(
    after.correo_enviado_destinatario.length ===
      beforeConflict.correo_enviado_destinatario.length + 8,
    "Un destinatario principal por mensaje",
  );
  check(
    JSON.stringify(after.orden_compra) ===
      JSON.stringify(beforeConflict.orden_compra) &&
      JSON.stringify(after.abastecimiento_material) ===
        JSON.stringify(beforeConflict.abastecimiento_material),
    "Cotizar no crea OCM ni vínculos",
  );
  check(
    after.plantilla_correo[0].asunto === globalSubject &&
      after.plantilla_correo[0].cuerpo === globalBody,
    "Ajustar el lote no sobrescribe la plantilla global",
  );
  check(
    (await page.locator(".demand-selection-count").innerText()).includes(
      "8 materiales",
    ),
    "Enviar conserva la selección de materiales",
  );
  await page
    .getByRole("button", { name: "Cotizar materiales", exact: true })
    .click();
  await openSection(templateSection);
  check(
    (await dialog()
      .getByRole("textbox", { name: "Asunto", exact: true })
      .inputValue()) === globalSubject,
    "Nueva cotización recupera la plantilla global",
  );
  await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();
  await dialog().waitFor({ state: "hidden" });
  check(
    (await page.locator(".demand-selection-count").innerText()).includes(
      "8 materiales",
    ),
    "Cancelar conserva la selección",
  );
  return { checks };
};
