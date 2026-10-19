async (page) => {
  page.setDefaultTimeout(8000);
  const origin = new URL(page.url()).origin;
  const checks = [];
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  const state = async () => (await page.request.get(origin + "/api/state")).json();
  const dialog = () => page.getByRole("dialog");
  const code = () => dialog().getByRole("textbox", { name: "Código MAIA (3 dígitos)", exact: true });
  const chooseType = (label) => dialog().getByRole("combobox", { name: "Tipo de material", exact: true }).selectOption({ label });
  const save = () => dialog().getByRole("button", { name: "Guardar registro", exact: true }).click();
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin + "/catalogos?tab=materiales");
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    const name = `Corrugado sin código ${width}`;
    await dialog().getByRole("textbox", { name: "Material", exact: true }).fill(name);
    await chooseType("Corrugado");
    check(!await code().evaluate((el) => el.required || el.getAttribute("aria-required") === "true"), `Código opcional para Corrugado a ${width}px`);
    // Reproduce the original defect: leave the initially-null field untouched.
    await save();
    await dialog().waitFor({ state: "hidden" });
    let db = await state();
    const box = db.materiales.find((row) => row.nombre_material === name);
    check(!!box && box.codigo_material === null, `Crear corrugado sin tocar código persiste null a ${width}px`);
    await page.getByRole("row").filter({ hasText: name }).getByRole("button", { name: /^Editar/ }).click();
    check(await code().inputValue() === "", `Editar corrugado precarga código vacío a ${width}px`);
    await dialog().getByRole("textbox", { name: "Material", exact: true }).fill(name + " editado");
    await save();
    await dialog().waitFor({ state: "hidden" });
    check((await state()).materiales.find((row) => row.id === box.id).codigo_material === null, `Editar conserva null sin transformarlo en cero a ${width}px`);
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    const second = `Material con validación ${width}`;
    await dialog().getByRole("textbox", { name: "Material", exact: true }).fill(second);
    await chooseType("Envase");
    check(await code().evaluate((el) => el.required || el.getAttribute("aria-required") === "true"), `Envase requiere código a ${width}px`);
    await save();
    check(await dialog().isVisible() && await code().getAttribute("aria-invalid") === "true", `Envase vacío se rechaza con error de campo a ${width}px`);
    check(!(await state()).materiales.some((row) => row.nombre_material === second), `Rechazo no crea material a ${width}px`);
    await chooseType("Corrugado");
    await page.waitForFunction(() => document.querySelector('input[name="codigo_material"]').getAttribute("aria-invalid") !== "true");
    check(!await code().evaluate((el) => el.required || el.getAttribute("aria-required") === "true"), `Cambiar a Corrugado retira obligación y error a ${width}px`);
    await code().fill("12");
    await save();
    check(await code().getAttribute("aria-invalid") === "true", `Corrugado rechaza código escrito de dos dígitos a ${width}px`);
    await code().fill("101");
    await save();
    check(await dialog().isVisible() && await code().getAttribute("aria-invalid") === "true", `Corrugado rechaza código duplicado a ${width}px`);
    const validCode = width === 1440 ? "007" : "008";
    await code().fill(validCode);
    await save();
    await dialog().waitFor({ state: "hidden" });
    db = await state();
    check(db.materiales.find((row) => row.nombre_material === second).codigo_material === Number(validCode), `Código válido conserva su valor entero a ${width}px`);
    check((await page.getByRole("row").filter({ hasText: second }).innerText()).includes(validCode), `Listado muestra los tres dígitos a ${width}px`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Sin desbordamiento horizontal a ${width}px`);
  }
  return { checks };
}
