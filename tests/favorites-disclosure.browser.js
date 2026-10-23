async (page) => {
  page.setDefaultTimeout(8000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const origin = new URL(page.url()).origin;
  const checks = [];
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  const group = () => page.locator(".relation-group-row").filter({ hasText: "Envase" });
  const toggle = () => group().locator(".relation-toggle");
  const sample = (id) => page.evaluate(async (id) => {
    const heights = [];
    let start;
    await new Promise((resolve) => {
      const frame = (now) => {
        start ??= now;
        heights.push(document.getElementById(id)?.getBoundingClientRect().height ?? 0);
        if (now - start >= 260) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    return heights;
  }, id);
  let requests = 0;
  page.on("request", () => requests++);
  for (const width of [1440, 803, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + "/catalogos?tab=proveedores_favoritos");
    await toggle().waitFor();
    check(await page.locator(".relation-details").count() === 0, `Sin espacios ni filas de detalle antes de desplegar a ${width}px`);
    const beforeRequests = requests;
    await toggle().click();
    const id = await toggle().getAttribute("aria-controls");
    const opening = await sample(id);
    const maximum = Math.max(...opening);
    check(maximum > 0 && opening.some((height) => height > 0 && height < maximum - 1), `Apertura suave con alturas intermedias a ${width}px`);
    check(await toggle().getAttribute("aria-expanded") === "true", `Estado abierto accesible a ${width}px`);
    const panel = page.locator(`[id="${id}"]`);
    const geometry = await panel.evaluate((el) => {
      const type = el.closest("tr").previousElementSibling.querySelector("strong").getBoundingClientRect();
      const name = el.querySelector(".relation-provider-name");
      const list = el.querySelector(".relation-provider-list tbody tr td");
      const cell = el.closest("td,th");
      const details = el.querySelector(".relation-details");
      return { indent: name.getBoundingClientRect().left - type.left,
        weight: getComputedStyle(name).fontWeight,
        rowPadding: getComputedStyle(list).paddingBlock,
        cellPadding: getComputedStyle(cell).paddingBlock,
        bottom: getComputedStyle(details).paddingBottom,
        background: getComputedStyle(details).backgroundColor };
    });
    check(Math.abs(geometry.indent - 34) < 1, `Proveedores comparten sangría y padding de costos a ${width}px`);
    check(geometry.weight === "400", `Nombres sin negrita a ${width}px`);
    check(geometry.rowPadding === "8px" && geometry.cellPadding === "0px" && geometry.bottom === "4px", `Separación vertical igual a costos a ${width}px`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Sin desbordamiento horizontal a ${width}px`);
    await page.screenshot({ path: `tests/evidence/favorites/compact-expanded-${width}.png`, fullPage: true });
    await toggle().click();
    check(await panel.getAttribute("inert") !== null && await panel.getAttribute("aria-hidden") === "true", `Contenido retirado del teclado y árbol accesible durante el cierre a ${width}px`);
    const closing = await sample(id);
    check(closing.some((height) => height > 0 && height < maximum - 1) && closing.at(-1) === 0, `Cierre suave hasta altura cero a ${width}px`);
    check(await page.locator(".relation-details-row").count() === 0, `Sin fila residual al terminar a ${width}px`);
    check(await toggle().evaluate((el) => el === document.activeElement), `El foco permanece en el botón a ${width}px`);
    check(requests === beforeRequests, `Alternar no descarga ni guarda datos a ${width}px`);
    await toggle().press("Enter");
    check(await toggle().getAttribute("aria-expanded") === "true", `Enter despliega a ${width}px`);
    await toggle().press("Space");
    await page.waitForFunction(() => document.querySelectorAll(".relation-details-row").length === 0);
    check(await toggle().getAttribute("aria-expanded") === "false", `Espacio oculta a ${width}px`);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await toggle().click();
  check(await page.locator(".relation-disclosure").evaluate((el) => getComputedStyle(el).transitionDuration === "0s"), "Movimiento reducido desactiva la transición");
  await toggle().click();
  check(await page.locator(".relation-details-row").count() === 0, "Movimiento reducido cierra sin esperar el temporizador");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await toggle().press("Enter");
  await toggle().press("Space");
  await toggle().press("Enter");
  await page.waitForFunction(() => {
    const panel = document.querySelector(".relation-disclosure");
    return panel && getComputedStyle(panel).opacity === "1";
  });
  check(await toggle().getAttribute("aria-expanded") === "true" && await page.locator(".relation-details-row").count() === 1, "Alternancias rápidas no pierden el estado ni duplican filas");
  return { checks };
}
