// Test interactions use visible React Aria controls, including portalled options.
// Existing business assertions are retained while their native-widget commands migrate.
export function ariaPage(page, { autoConfirm = true } = {}) {
  const wrapped = new WeakMap();
  const unwrap = new WeakMap();
  async function settleConfirmation() {
    if (!autoConfirm) return;
    const confirmation = page.getByRole("alertdialog");
    if (await confirmation.count())
      await confirmation.getByRole("button").last().click();
  }
  const transformSelector = (selector) =>
    typeof selector === "string"
      ? selector
          .replaceAll("dialog[open]", '[role="dialog"]')
          .replaceAll(
            "dialog#app-navigation[open]",
            '#app-navigation[data-modal="true"]',
          )
          .replaceAll("select[data-field-path", "button[data-field-path")
          .replaceAll(
            "select.custom-filter-select",
            "button.custom-filter-select",
          )
      : selector;
  function wrap(target) {
    if (
      !target ||
      typeof target !== "object" ||
      (!target.getByRole && !target.selectOption && !target.newPage)
    )
      return target;
    if (wrapped.has(target)) return wrapped.get(target);
    const proxy = new Proxy(target, {
      get(object, key) {
        if (key === "getByRole")
          return (role, options) => {
            const result = object.getByRole(role, options);
            if (role === "combobox" && options?.name)
              return wrap(result.or(object.getByRole("button", options)));
            if (role === "table")
              return wrap(result.or(object.getByRole("grid", options)));
            if (role === "cell")
              return wrap(
                result
                  .or(object.getByRole("gridcell", options))
                  .or(object.getByRole("rowheader", options)),
              );
            if (role === "textbox")
              return wrap(result.or(object.getByRole("searchbox", options)));
            if (role === "spinbutton")
              return wrap(result.or(object.getByRole("textbox", options)));
            if (
              role === "dialog" &&
              typeof options?.name === "string" &&
              options.name.startsWith("Filtrar")
            )
              return wrap(result.or(object.getByRole("group", options)));
            return result instanceof Promise ? result.then(wrap) : wrap(result);
          };
        if (key === "locator")
          return (selector, options) =>
            wrap(object.locator(transformSelector(selector), options));
        if (key === "selectOption")
          return async (requested) => {
            const choice = Array.isArray(requested) ? requested[0] : requested;
            const wanted =
              typeof choice === "object"
                ? (choice.label ?? choice.value)
                : String(choice);
            const byLabel = typeof choice === "object" && choice.label != null;
            const kind = await object.evaluate((el) => el.tagName);
            if (kind === "SELECT") return object.selectOption(requested);
            const currentPage = object.page();
            if (kind === "INPUT") {
              if (wanted === "") {
                await object.fill("");
                await object.press("Tab");
                return [""];
              }
              if (byLabel) await object.fill(wanted);
              else {
                await object.fill("");
                await object.press("ArrowDown");
              }
            } else await object.click();
            let item = byLabel
              ? currentPage.getByRole("option", { name: wanted, exact: true })
              : currentPage.locator(
                  '[role="option"][data-key=' + JSON.stringify(wanted) + "]",
                );
            if (!(await item.count())) {
              const items = currentPage.getByRole("option");
              const values = await items.evaluateAll((nodes) =>
                nodes.map((n) => ({
                  key: n.dataset.key,
                  label: n.textContent,
                })),
              );
              const matched = values.find(
                (v) => v.key === wanted || v.label === wanted,
              );
              if (!matched)
                throw new Error(
                  "No option " +
                    JSON.stringify(wanted) +
                    " in " +
                    JSON.stringify(values),
                );
              item = currentPage.getByRole("option", {
                name: matched.label,
                exact: true,
              });
            }
            const result = await item.getAttribute("data-key");
            await item.click();
            return [result ?? wanted];
          };
        if (key === "inputValue")
          return async (...args) => {
            const tag = await object.evaluate((el) => el.tagName);
            return tag === "BUTTON"
              ? await object.getAttribute("data-value")
              : object.inputValue(...args);
          };
        if (key === "check" || key === "uncheck")
          return async () => {
            const expected = key === "check";
            if ((await object.isChecked()) === expected) return;
            await object[key]();
            if ((await object.isChecked()) !== expected)
              throw new Error("Checkbox did not change to " + expected);
          };
        if (key === "click" || key === "press")
          return async (...args) => {
            if (
              key === "click" &&
              (await object.evaluate((el) =>
                el.classList.contains("column-filter-button"),
              ))
            ) {
              await object.scrollIntoViewIfNeeded();
              await object
                .page()
                .evaluate(
                  () =>
                    new Promise((resolve) =>
                      requestAnimationFrame(() =>
                        requestAnimationFrame(resolve),
                      ),
                    ),
                );
            }
            const result = await object[key](...args);
            if (key === "press" && args[0] === "Escape")
              await object
                .page()
                .evaluate(
                  () =>
                    new Promise((resolve) =>
                      requestAnimationFrame(() =>
                        requestAnimationFrame(resolve),
                      ),
                    ),
                );
            await settleConfirmation();
            return result;
          };
        if (key === "keyboard")
          return new Proxy(object.keyboard, {
            get(keyboard, name) {
              const value = keyboard[name];
              if (name === "press")
                return async (...args) => {
                  const result = await value.apply(keyboard, args);
                  if (args[0] === "Escape")
                    await object.evaluate(
                      () =>
                        new Promise((resolve) =>
                          requestAnimationFrame(() =>
                            requestAnimationFrame(resolve),
                          ),
                        ),
                    );
                  await settleConfirmation();
                  return result;
                };
              return typeof value === "function" ? value.bind(keyboard) : value;
            },
          });
        const value = Reflect.get(object, key, object);
        if (typeof value !== "function") return value;
        return (...args) => {
          const result = value.apply(
            object,
            args.map((arg) => unwrap.get(arg) ?? arg),
          );
          return result instanceof Promise ? result.then(wrap) : wrap(result);
        };
      },
    });
    wrapped.set(target, proxy);
    unwrap.set(proxy, target);
    return proxy;
  }
  return wrap(page);
}
