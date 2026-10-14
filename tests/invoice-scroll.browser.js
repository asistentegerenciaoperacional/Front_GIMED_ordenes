// Run with Playwright CLI from an existing invoice detail page:
// playwright-cli run-code --filename=tests/invoice-scroll.browser.js
async (page) => {
  page.setDefaultTimeout(5000);
  const origin = new URL(page.url()).origin;
  const invoiceUrl = page.url();
  const errors = [];
  const writes = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  page.on("request", (request) => {
    if (request.method() === "POST") writes.push(request.url());
  });
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const position = () =>
    page.evaluate(() => ({
      dialog: document.querySelector("dialog[open]").scrollTop,
      list: document.querySelector("dialog[open] .check-list").scrollTop,
      window: window.scrollY,
    }));
  const results = [];
  let supplier;
  for (const size of [
    { width: 799, height: 668 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    for (const mode of ["edit", "create"]) {
      await page.goto(mode === "edit" ? invoiceUrl : origin + "/facturas");
      await page
        .getByRole("button", {
          name: mode === "edit" ? "Asignar lotes" : "Agregar factura",
          exact: true,
        })
        .click();
      const dialog = page.locator("dialog[open]");
      await dialog.locator(".check-list").waitFor();
      const provider = dialog.locator('select[data-field-path="id_proveedor"]');
      if (mode === "edit") supplier = await provider.inputValue();
      else await provider.selectOption(supplier);
      const deltas = [];
      let clicks = 0;
      for (const target of ["label", "checkbox"]) {
        for (const edge of ["top", "bottom"]) {
          for (let toggle = 0; toggle < 2; toggle++) {
            const before = await page.evaluate(
              ({ target, edge }) => {
                const dialog = document.querySelector("dialog[open]");
                const list = dialog.querySelector(".check-list");
                dialog
                  .querySelector(
                    'input[aria-label="Buscar orden o lote para la factura"]',
                  )
                  .focus({ preventScroll: true });
                dialog.scrollTop = 70;
                list.scrollTop = 120;
                const box = list.getBoundingClientRect();
                const footer = dialog
                  .querySelector(".dialog-footer")
                  .getBoundingClientRect();
                const heading = dialog
                  .querySelector(".dialog-heading")
                  .getBoundingClientRect();
                const rows = [...list.querySelectorAll("label")].filter(
                  (row) => {
                    const r = row.getBoundingClientRect();
                    return (
                      r.top >= Math.max(box.top, heading.bottom) + 2 &&
                      r.bottom <= Math.min(box.bottom, footer.top) - 2
                    );
                  },
                );
                const row = edge === "top" ? rows[0] : rows.at(-1);
                if (!row) throw new Error("No fully visible reception row");
                const input = row.querySelector("input");
                const r = (
                  target === "checkbox" ? input : row
                ).getBoundingClientRect();
                return {
                  dialog: dialog.scrollTop,
                  list: list.scrollTop,
                  window: window.scrollY,
                  x:
                    target === "checkbox"
                      ? (r.left + r.right) / 2
                      : r.left + 75,
                  y: (r.top + r.bottom) / 2,
                  id: input.value,
                  checked: input.checked,
                  cursor: getComputedStyle(target === "checkbox" ? input : row)
                    .cursor,
                  margin: getComputedStyle(input).scrollMarginBlock,
                };
              },
              { target, edge },
            );
            await page.mouse.click(before.x, before.y);
            await settle();
            const after = await position();
            const selection = await dialog
              .locator(".check-list input")
              .evaluateAll((inputs, id) => {
                const input = inputs.find((input) => input.value === id);
                return {
                  checked: input.checked,
                  focused: input === document.activeElement,
                };
              }, before.id);
            const delta = Math.max(
              ...["dialog", "list", "window"].map((key) =>
                Math.abs(after[key] - before[key]),
              ),
            );
            assert(
              delta === 0,
              `${mode} ${size.width} ${target}/${edge}: scroll moved by ${delta}px`,
            );
            assert(
              selection.checked !== before.checked && selection.focused,
              "Click must toggle exactly once and focus checkbox",
            );
            assert(
              before.cursor === "pointer" && before.margin === "0px",
              "Pointer and checkbox focus margin",
            );
            deltas.push(delta);
            clicks++;
          }
        }
      }
      // Space toggles the focused checkbox; Tab must still reveal offscreen lots.
      const boxes = dialog.locator('.check-list input[type="checkbox"]');
      await boxes.first().evaluate((input) => {
        input.closest(".check-list").scrollTop = 0;
        input.focus({ preventScroll: true });
      });
      const firstChecked = await boxes.first().isChecked();
      await page.keyboard.press("Space");
      assert(
        (await boxes.first().isChecked()) !== firstChecked,
        "Space selects first lot",
      );
      await page.keyboard.press("Space");
      assert(
        (await boxes.first().isChecked()) === firstChecked,
        "Space deselects first lot",
      );
      const total = await boxes.count();
      for (let i = 1; i < total; i++) {
        await page.keyboard.press("Tab");
        const visibleFocus = await boxes.nth(i).evaluate((input) => {
          const list = input.closest(".check-list").getBoundingClientRect();
          const dialog = input.closest("dialog");
          const footer = dialog
            .querySelector(".dialog-footer")
            .getBoundingClientRect();
          const heading = dialog
            .querySelector(".dialog-heading")
            .getBoundingClientRect();
          const r = input.getBoundingClientRect();
          return (
            input === document.activeElement &&
            r.top >= Math.max(list.top, heading.bottom) - 1 &&
            r.bottom <= Math.min(list.bottom, footer.top) + 1
          );
        });
        assert(visibleFocus, `Tab reveals reception ${i + 1}`);
      }
      assert(
        (await position()).list > 0,
        "Keyboard can scroll to offscreen lots",
      );
      const lastChecked = await boxes.last().isChecked();
      const keyboardPosition = await position();
      await page.keyboard.press("Space");
      assert(
        (await boxes.last().isChecked()) !== lastChecked,
        "Space selects last lot",
      );
      await page.keyboard.press("Space");
      await settle();
      const afterKeyboard = await position();
      assert(
        ["dialog", "list", "window"].every(
          (key) => afterKeyboard[key] === keyboardPosition[key],
        ),
        "Space keeps scroll stable",
      );
      // Wheel scrolling remains available inside the nested list.
      const wheel = await dialog.locator(".check-list").evaluate((list) => {
        list.scrollTop = 50;
        const r = list.getBoundingClientRect();
        const d = list.closest("dialog");
        const footer = d
          .querySelector(".dialog-footer")
          .getBoundingClientRect();
        const heading = d
          .querySelector(".dialog-heading")
          .getBoundingClientRect();
        return {
          x: r.left + 70,
          y:
            (Math.max(r.top, heading.bottom) + Math.min(r.bottom, footer.top)) /
            2,
          scroll: list.scrollTop,
        };
      });
      await page.mouse.move(wheel.x, wheel.y);
      await page.mouse.wheel(0, 80);
      await page.waitForFunction(
        (before) =>
          document.querySelector("dialog[open] .check-list").scrollTop > before,
        wheel.scroll,
      );
      if (size.width === 799)
        await page.screenshot({
          path: `.playwright-cli/invoice-scroll-${mode}-after.png`,
        });
      results.push({
        mode,
        ...size,
        clicks,
        maxMouseScrollDelta: Math.max(...deltas),
        keyboard: "passed",
        wheel: "passed",
      });
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      await dialog.waitFor({ state: "hidden" });
    }
  }
  assert(errors.length === 0, "No browser page errors");
  assert(writes.length === 0, "No saved data was changed");
  return {
    results,
    mouseClicks: results.reduce((sum, result) => sum + result.clicks, 0),
    pageErrors: errors,
    postRequests: writes,
  };
};
