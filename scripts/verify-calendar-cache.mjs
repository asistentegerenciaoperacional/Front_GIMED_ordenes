import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { createFixtureVite } from "./fixture-vite.mjs";

const project = resolve(".");
await mkdir(resolve("tests/.tmp"), { recursive: true });
const temporary = await mkdtemp(resolve("tests/.tmp/calendar-cache-"));
const root = join(temporary, "project");
await mkdir(root);
for (const file of ["src", "shared", "package.json", "vite.config.ts"]) {
  await cp(resolve(file), join(root, file), { recursive: true });
}
await writeFile(
  join(root, "calendar-cache.fixture.tsx"),
  `import {useState} from "react";
import {createRoot} from "react-dom/client";
import {I18nProvider} from "react-aria-components/I18nProvider";
import {DateInput,Dialog,Field} from "./src/ui";
import "./src/components/aria.css";
import "./src/styles.css";
function Fixture(){
  const [date,setDate]=useState("2026-10-24");
  return <Dialog title="Formulario de prueba" onClose={()=>{}}>
    <div className="dialog-body"><Field id="date" label="Fecha">
      <DateInput value={date} onChange={setDate} calendarLabel="Fecha"/>
    </Field></div>
  </Dialog>;
}
createRoot(document.getElementById("root")).render(
  <I18nProvider locale="es-CO"><Fixture/></I18nProvider>
);`,
);
await writeFile(
  join(root, "calendar-cache.html"),
  '<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/calendar-cache.fixture.tsx"></script></body></html>',
);

const errors = [];
const checks = [];
let app;
let fixture;
let browser;
function observe(page, name) {
  page.on("pageerror", (error) =>
    errors.push({ page: name, text: error.message }),
  );
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push({ page: name, text: message.text() });
    }
  });
}
async function exercise(page, name, width) {
  await page.setViewportSize({ width, height: 800 });
  const date = page.getByRole("textbox", { name: "Fecha", exact: true });
  const trigger = page.getByRole("button", {
    name: "Abrir calendario: Fecha",
    exact: true,
  });
  const calendar = page.getByRole("dialog", {
    name: "Calendario: Fecha",
    exact: true,
  });
  await date.fill("24/10/2026");
  await trigger.click();
  await calendar.getByRole("gridcell").first().waitFor();
  await page.waitForFunction(() =>
    Boolean(document.activeElement?.closest('[role="gridcell"]')),
  );
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await calendar.waitFor({ state: "hidden" });
  assert.equal(await date.inputValue(), "25/10/2026");
  await trigger.click();
  await calendar.getByRole("gridcell").first().waitFor();
  const heading = await calendar.getByRole("heading").textContent();
  await calendar
    .getByRole("button", { name: "Mes siguiente", exact: true })
    .click();
  assert.notEqual(await calendar.getByRole("heading").textContent(), heading);
  await calendar
    .getByRole("button", { name: "Mes anterior", exact: true })
    .click();
  assert.equal(await calendar.getByRole("heading").textContent(), heading);
  await page.keyboard.press("Escape");
  await calendar.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("dialog", { name: "Formulario de prueba", exact: true })
      .isVisible(),
    true,
  );
  checks.push({
    page: name,
    width,
    selected: await date.inputValue(),
    monthNavigation: true,
    parentFormPreserved: true,
  });
}

try {
  app = await createServer({
    root,
    configFile: join(root, "vite.config.ts"),
    optimizeDeps: { entries: ["calendar-cache.html"] },
    server: { port: 0, strictPort: true, fs: { allow: [project] } },
    logLevel: "error",
  });
  await app.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const appPage = await browser.newPage();
  observe(appPage, "development");
  await appPage.goto(app.resolvedUrls.local[0] + "calendar-cache.html");
  await appPage
    .getByRole("button", { name: "Abrir calendario: Fecha", exact: true })
    .waitFor();

  fixture = await createFixtureVite({
    root,
    temporary,
    server: { fs: { allow: [project] } },
  });
  assert.notEqual(app.config.cacheDir, fixture.config.cacheDir);
  await fixture.listen();
  const fixturePage = await browser.newPage();
  observe(fixturePage, "fixture");
  await fixturePage.goto(fixture.resolvedUrls.local[0] + "calendar-cache.html");
  await exercise(fixturePage, "fixture", 1440);
  await exercise(fixturePage, "fixture", 375);
  await fixture.close();
  fixture = undefined;

  await exercise(appPage, "development-after-fixture", 1440);
  await exercise(appPage, "development-after-fixture", 375);
  await exercise(appPage, "development-after-fixture", 1440);
  assert.deepEqual(errors, [], "No browser exceptions or console errors");
  await mkdir(resolve("tests/evidence/calendar"), { recursive: true });
  await writeFile(
    resolve("tests/evidence/calendar/cache-regression.json"),
    JSON.stringify(
      { checks, errors, cacheIsolation: true, temporary },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ checks, errors, cacheIsolation: true }));
} finally {
  await browser?.close();
  await fixture?.close();
  await app?.close();
}
