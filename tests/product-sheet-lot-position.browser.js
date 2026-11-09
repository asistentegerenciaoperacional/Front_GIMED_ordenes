async (page) => {
  page = page.context().pages()[0];
  page.setDefaultTimeout(12000);
  const origin = new URL(page.url()).origin;
  const checks = [];
  const state = () =>
    page.request.get(origin + "/api/state").then((response) => response.json());
  const command = async (name, payload) => {
    const response = await page.request.post(origin + "/api/commands", {
      data: { name, payload },
    });
    if (!response.ok()) throw new Error(await response.text());
  };
  const fixture = await state();
  const annulled = fixture.lote_producto
    .filter((lot) => /^VIRTUAL-[0-9]+$/.test(lot.numero_lote ?? ""))
    .slice(0, 65);
  await command("setProductLotStates", {
    ids: annulled.map((lot) => lot.id),
    estado: "anulado",
  });
  for (const [index, lot] of annulled.slice(-2).entries())
    await command("saveLot", {
      row: {
        ...lot,
        estado: "anulado",
        numero_lote: "POSICION-FINAL-" + index,
      },
    });
  const saveFilterLots = fixture.lote_producto.filter((lot) =>
    /^VIRTUAL-499[0-2]$/.test(lot.numero_lote ?? ""),
  );
  for (const [index, lot] of saveFilterLots.entries())
    await command("saveLot", {
      row: { ...lot, numero_lote: "POSICION-GUARDAR-" + index },
    });
  await page.setViewportSize({ width: 1250, height: 850 });
  await page.evaluate(() =>
    localStorage.setItem("gimed:ui:product-order-sheet", "true"),
  );
  await page.goto(origin + "/ordenes/productos");
  const grid = page.locator(".product-sheet-grid");
  const active = grid.locator("[data-active]");
  const column = "cantidad_recibida";
  const cell = (index, key = column) =>
    grid.locator(
      '[data-sheet-row="' + index + '"][data-column-key="' + key + '"]',
    );
  const ready = () =>
    page.locator('.product-order-sheet[aria-busy="false"]').waitFor();
  const position = () =>
    grid.evaluate((table) => ({
      top: table.parentElement.scrollTop,
      left: table.parentElement.scrollLeft,
    }));
  const select = async (index, key = column, left = 600) => {
    await grid.evaluate(
      (table, { index, left }) => {
        table.parentElement.scrollTop = (index - 3) * 32;
        table.parentElement.scrollLeft = left;
      },
      { index, left },
    );
    await cell(index, key).click();
    await cell(index, key).and(active).waitFor();
    const scroll = await position();
    if (scroll.top <= 0 || scroll.left <= 0)
      throw new Error("La hoja de prueba debe estar desplazada en ambos ejes.");
    return { scroll, key: await active.getAttribute("data-sheet-key") };
  };
  const verify = async (key, scroll, label, expectedColumn = column) => {
    await ready();
    await page.waitForFunction(
      ({ key, scroll, expectedColumn }) => {
        const table = document.querySelector(".product-sheet-grid");
        const active = table.querySelector("[data-active]");
        const viewport = table.parentElement;
        return (
          document.activeElement === table &&
          Math.abs(viewport.scrollTop - scroll.top) <= 1 &&
          Math.abs(viewport.scrollLeft - scroll.left) <= 1 &&
          (key
            ? active?.dataset.sheetKey === key &&
              active.dataset.columnKey === expectedColumn &&
              table.getAttribute("aria-activedescendant") === active.id
            : !active && !table.hasAttribute("aria-activedescendant"))
        );
      },
      { key, scroll, expectedColumn },
    );
    checks.push(label);
  };
  const menu = async (name) => {
    await page
      .getByRole("button", { name: "Estado del lote", exact: true })
      .click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  };
  const confirm = (label) =>
    page
      .getByRole("alertdialog")
      .getByRole("button", { name: label, exact: true })
      .click();
  const paste = (value) =>
    grid.evaluate((table, value) => {
      const clipboard = new DataTransfer();
      clipboard.setData("text/plain", value);
      table.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          clipboardData: clipboard,
        }),
      );
    }, value);
  const saveButton = (name = "Guardar 1 cambios") =>
    page.getByRole("button", { name, exact: true });
  const removeButton = () =>
    page.getByRole("button", {
      name: "Eliminar lotes seleccionados",
      exact: true,
    });
  const deleteDialog = () =>
    page.getByRole("dialog", { name: "Eliminar lote", exact: true });
  const deleteConfirm = (name = "Eliminar lote") =>
    deleteDialog().getByRole("button", { name, exact: true }).click();
  const persistedLot = async (key) =>
    (await state()).lote_producto.find((lot) => "lot:" + lot.id === key);
  const rowCount = () => grid.getAttribute("aria-rowcount").then(Number);
  const countChangesTo = (count) =>
    page.waitForFunction(
      (count) =>
        Number(
          document
            .querySelector(".product-sheet-grid")
            ?.getAttribute("aria-rowcount"),
        ) === count,
      count,
    );
  const successor = async () => {
    const index = Number(await active.getAttribute("data-sheet-row"));
    return cell(index + 1).getAttribute("data-sheet-key");
  };
  const waitState = (key, state) =>
    page.waitForFunction(
      ({ key, state }) =>
        document.querySelector(
          'tr[data-lot-state="' + state + '"] [data-sheet-key="' + key + '"]',
        ) !== null,
      { key, state },
    );

  await grid.waitFor();
  let chosen = await select(42);
  let count = await rowCount();
  await menu("Nuevo lote");
  await countChangesTo(count + 1);
  await verify(
    chosen.key,
    chosen.scroll,
    "Nuevo lote por menú conserva ambos scrolls y la celda",
  );
  await page.keyboard.press("Alt+d");
  await countChangesTo(count + 2);
  await verify(
    chosen.key,
    chosen.scroll,
    "Alt+D crea un lote y permite seguir en la misma celda",
  );

  await menu("Cerrar lotes");
  await waitState(chosen.key, "cerrado");
  await verify(
    chosen.key,
    chosen.scroll,
    "Cerrar por menú cambia el estado en la misma fila",
  );
  const nextKey = await successor();
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(
    (key) =>
      document.querySelector(".product-sheet-grid [data-active]")?.dataset
        .sheetKey === key,
    nextKey,
  );
  await page.keyboard.press("Alt+c");
  await waitState(nextKey, "cerrado");
  await verify(
    nextKey,
    chosen.scroll,
    "Las flechas continúan desde la celda activa y Alt+C conserva el foco",
  );

  let next = await successor();
  await menu("Anular lotes");
  await confirm("Cancelar");
  await verify(
    nextKey,
    chosen.scroll,
    "Cancelar la anulación conserva scroll y foco",
  );
  count = await rowCount();
  await menu("Anular lotes");
  await confirm("Anular lote");
  await countChangesTo(count - 1);
  await verify(
    next,
    chosen.scroll,
    "Anular por menú activa el siguiente lote en la misma columna",
  );
  next = await successor();
  await page.keyboard.press("Alt+n");
  await confirm("Anular lote");
  await countChangesTo(count - 2);
  await verify(
    next,
    chosen.scroll,
    "Alt+N retira la fila sin reiniciar el scroll",
  );

  await page.getByRole("button", { name: "Anuladas", exact: true }).click();
  chosen = await select(31);
  next = await successor();
  count = await rowCount();
  await menu("Reabrir lotes");
  await countChangesTo(count - 1);
  await verify(
    next,
    chosen.scroll,
    "Reabrir por menú desde Anuladas activa el siguiente lote visible",
  );
  next = await successor();
  await page.keyboard.press("Alt+r");
  await countChangesTo(count - 2);
  await verify(
    next,
    chosen.scroll,
    "Alt+R desde Anuladas conserva la posición y activa al vecino",
  );

  await page
    .getByRole("button", { name: "En seguimiento", exact: true })
    .click();
  chosen = await select(45);
  await paste("12");
  await page
    .getByRole("button", { name: "Guardar 1 cambios", exact: true })
    .waitFor();
  await menu("Cerrar lotes");
  await page
    .getByRole("button", { name: "Guardar y continuar", exact: true })
    .click();
  await waitState(chosen.key, "cerrado");
  await verify(
    chosen.key,
    chosen.scroll,
    "Guardar y continuar conserva la celda y el scroll en ambos comandos",
  );

  chosen = await select(47);
  await menu("Anular lotes");
  await page.getByRole("alertdialog").waitFor();
  const sibling = (await state()).lote_producto.find(
    (lot) => lot.numero_lote === "VIRTUAL-4000",
  );
  await command("setProductLotStates", {
    ids: [sibling.id],
    estado: "cerrado",
  });
  await confirm("Anular lote");
  await page
    .getByText(/Los lotes o el estado del producto cambiaron/)
    .first()
    .waitFor();
  await verify(
    chosen.key,
    chosen.scroll,
    "Una recarga por conflicto conserva la posición y el foco",
  );

  let release;
  const heldResponse = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/commands",
    async (route) => {
      const response = await route.fetch();
      await heldResponse;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await menu("Nuevo lote");
  await page.getByRole("button", { name: "Anuladas", exact: true }).click();
  chosen = await select(33);
  release();
  await verify(
    chosen.key,
    chosen.scroll,
    "La respuesta tardía respeta la pestaña y la celda seleccionada durante la espera",
  );

  const search = page.getByRole("searchbox", {
    name: "Buscar en la hoja de OC",
  });
  await search.fill("POSICION-FINAL");
  await countChangesTo(3);
  await grid.evaluate((table) => {
    table.parentElement.scrollLeft = 600;
  });
  await cell(1).click();
  await cell(1).and(active).waitFor();
  const previous = await cell(0).getAttribute("data-sheet-key");
  const emptyScroll = await position();
  await page.keyboard.press("Alt+r");
  await countChangesTo(2);
  await verify(
    previous,
    emptyScroll,
    "Al salir el último de dos lotes filtrados, el foco vuelve al anterior",
  );
  await page.keyboard.press("Alt+r");
  await countChangesTo(1);
  await verify(
    null,
    { ...emptyScroll, top: 0 },
    "Al desaparecer el último lote filtrado, la cuadrícula conserva el foco",
  );

  await page.goto(origin + "/ordenes/productos?vista=seguimiento");
  await grid.waitFor();
  chosen = await select(48);
  count = await rowCount();
  next = await successor();
  await removeButton().click();
  await deleteConfirm("Cancelar");
  await verify(
    chosen.key,
    chosen.scroll,
    "Cancelar la eliminación devuelve el foco a la misma celda",
  );
  await removeButton().click();
  await deleteConfirm();
  await countChangesTo(count - 1);
  await verify(
    next,
    chosen.scroll,
    "La papelera elimina el lote y activa al siguiente en la misma columna",
  );
  if (await persistedLot(chosen.key))
    throw new Error("El lote individual sigue en la base.");

  await page.keyboard.press("Shift+ArrowDown");
  await cell(48).and(active).waitFor();
  await cell(49).and(grid.locator("[data-range]")).waitFor();
  const second = await cell(49).getAttribute("data-sheet-key");
  const afterRange = await cell(50).getAttribute("data-sheet-key");
  await page.keyboard.press("Alt+Delete");
  await deleteDialog().waitFor();
  if ((await deleteDialog().locator("li").count()) !== 2)
    throw new Error("La confirmación debe incluir ambos lotes.");
  await deleteConfirm();
  await countChangesTo(count - 3);
  await verify(
    afterRange,
    chosen.scroll,
    "Alt+Supr elimina ambos lotes y reduce el rango a la nueva celda activa",
  );
  if (
    (await grid.locator("[data-range]").count()) !== 1 ||
    (await persistedLot(next)) ||
    (await persistedLot(second))
  )
    throw new Error(
      "La eliminación múltiple no dejó la selección o los datos esperados.",
    );

  chosen = await select(50);
  await removeButton().click();
  await deleteDialog().waitFor();
  const changedSibling = (await state()).lote_producto.find(
    (lot) => lot.numero_lote === "VIRTUAL-4001",
  );
  await command("setProductLotStates", {
    ids: [changedSibling.id],
    estado: "cerrado",
  });
  await deleteConfirm();
  await deleteDialog()
    .getByText(/Los lotes o el estado del producto cambiaron/)
    .waitFor();
  await deleteConfirm("Cancelar");
  await verify(
    chosen.key,
    chosen.scroll,
    "El conflicto se muestra en el diálogo de eliminación y la hoja conserva su posición",
  );

  await paste("23");
  await saveButton().click();
  await verify(
    chosen.key,
    chosen.scroll,
    "Guardar desde la barra completa devuelve el foco a la celda",
  );
  if ((await persistedLot(chosen.key)).cantidad_recibida !== 23)
    throw new Error("Guardar no persistió la cantidad.");
  await paste("24");
  await page
    .getByRole("button", { name: "Ocultar barra de herramientas" })
    .click();
  const collapsedScroll = await position();
  await saveButton("Guardar 1").click();
  await verify(
    chosen.key,
    collapsedScroll,
    "Guardar desde la barra plegada conserva la posición y el foco",
  );
  if ((await persistedLot(chosen.key)).cantidad_recibida !== 24)
    throw new Error("El guardado desde la barra plegada no persistió.");
  await page.getByRole("button", { name: "Mostrar herramientas" }).click();

  chosen = await select(51);
  await paste("25");
  await command("saveLot", {
    row: { ...(await persistedLot(chosen.key)), cantidad_recibida: 26 },
  });
  await saveButton().click();
  await verify(
    chosen.key,
    chosen.scroll,
    "Un conflicto de guardado conserva la celda, el scroll y el borrador",
  );
  await saveButton().waitFor();
  if (
    (await persistedLot(chosen.key)).cantidad_recibida !== 26 ||
    (await active.innerText()).trim() !== "25"
  )
    throw new Error(
      "El conflicto debe dejar el borrador visible y el dato concurrente persistido.",
    );
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await confirm("Descartar");

  await page.goto(
    origin +
      "/ordenes/productos?vista=seguimiento&ordenar=numero_lote&direccion=asc",
  );
  await grid.waitFor();
  chosen = await select(60, "numero_lote", 180);
  const followingNumber = (await cell(61, "numero_lote").innerText()).trim();
  await paste(followingNumber + "-A");
  await saveButton().click();
  await verify(
    chosen.key,
    chosen.scroll,
    "Guardar con ordenamiento conserva la identidad de la celda aunque se mueva",
    "numero_lote",
  );
  if (Number(await active.getAttribute("data-sheet-row")) <= 60)
    throw new Error("La fila guardada no se reordenó.");

  chosen = await select(62);
  await paste("27");
  let finishSave;
  const delayedSave = new Promise((resolve) => {
    finishSave = resolve;
  });
  await page.route(
    "**/api/commands",
    async (route) => {
      const response = await route.fetch();
      await delayedSave;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await saveButton().click();
  await page.getByRole("button", { name: "Anuladas", exact: true }).click();
  const newView = await select(30);
  finishSave();
  await verify(
    newView.key,
    newView.scroll,
    "Una respuesta tardía de Guardar respeta la nueva pestaña y su celda",
  );
  if ((await persistedLot(chosen.key)).cantidad_recibida !== 27)
    throw new Error("El guardado tardío no persistió.");

  await page.goto(
    origin + "/ordenes/productos?vista=seguimiento&q=POSICION-GUARDAR",
  );
  await countChangesTo(4);
  await grid.evaluate((table) => {
    table.parentElement.scrollLeft = 180;
  });
  await cell(1, "numero_lote").click();
  await cell(1, "numero_lote").and(active).waitFor();
  const filterScroll = await position();
  const filterNeighbor = await cell(2, "numero_lote").getAttribute(
    "data-sheet-key",
  );
  await paste("FUERA-DEL-FILTRO");
  await saveButton().click();
  await countChangesTo(3);
  await verify(
    filterNeighbor,
    filterScroll,
    "Guardar una fila que sale del filtro activa al vecino",
    "numero_lote",
  );

  await search.fill("POSICION-GUARDAR-2");
  await countChangesTo(2);
  await grid.evaluate((table) => {
    table.parentElement.scrollLeft = 600;
  });
  await cell(0).click();
  await cell(0).and(active).waitFor();
  const lastScroll = await position();
  await removeButton().click();
  await deleteConfirm();
  await countChangesTo(1);
  await verify(
    null,
    lastScroll,
    "Eliminar el último lote de la vista deja el foco en la cuadrícula vacía",
  );
  return { checks };
};
