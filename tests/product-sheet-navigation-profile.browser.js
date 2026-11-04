async (page) => {
  const fs = await import("node:fs/promises");
  let source = await fs.readFile(
    "tests/product-sheet-keyboard-diagnostic.browser.js",
    "utf8",
  );
  source = source.replace(
    'const out = "tests/evidence/product-sheet-keyboard";',
    'const out = "tests/evidence/product-sheet-navigation/profile";',
  );
  source = source.replace(
    'const columns = await page.locator(".product-sheet-grid thead th").count();',
    'const columns = Number(await page.locator(".product-sheet-grid").getAttribute("aria-colcount"));',
  );
  return Function("return (" + source.trim().replace(/;\s*$/, "") + ")")()(
    page,
  );
};
