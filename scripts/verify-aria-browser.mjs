import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import { chromium, firefox, webkit } from "playwright-core";
import { ariaPage } from "../tests/aria-playwright.mjs";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";

const file = process.argv[2] ?? "tests/browser-journey.js";
const engine = process.argv[3] ?? "chromium";
await mkdir("tests/.tmp", { recursive: true });
const temporary = await mkdtemp(resolve("tests/.tmp/aria-browser-"));
const socket = createServer();
await new Promise((ok) => socket.listen(0, "127.0.0.1", ok));
const port = socket.address().port;
await new Promise((ok) => socket.close(ok));
const server = spawn(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "server/index.ts"],
  {
    env: {
      ...process.env,
      PROTOTIPO_API_PORT: String(port),
      PROTOTIPO_DATA_FILE: join(temporary, "database.json"),
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let browser;
let vite;
try {
  await new Promise((ok, fail) => {
    const timer = setTimeout(
      () => fail(new Error("No inició el servicio de pruebas")),
      15000,
    );
    server.once("error", fail);
    server.stdout.on("data", (data) => {
      if (String(data).includes("Servicio local:")) {
        clearTimeout(timer);
        ok();
      }
    });
    server.stderr.on("data", (data) => process.stderr.write(data));
  });
  browser = await { chromium, firefox, webkit }[engine].launch({
    headless: true,
    ...(engine === "chromium" ? { channel: "chrome" } : {}),
    ...(engine === "firefox" && process.env.PROTOTIPO_FIREFOX_EXECUTABLE
      ? { executablePath: resolve(process.env.PROTOTIPO_FIREFOX_EXECUTABLE) }
      : {}),
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleMessages = [];
  page.on("console", (message) => {
    if (
      ["warning", "error"].includes(message.type()) &&
      !message.text().startsWith("Failed to load resource:")
    )
      consoleMessages.push({ type: message.type(), text: message.text() });
  });
  if (file.includes("live-errors") || file.includes("aria-controls")) {
    vite = await createViteServer({
      configFile: false,
      plugins: [react()],
      server: {
        host: "127.0.0.1",
        port: 0,
        watch: { ignored: ["**/.playwright/**", "**/tests/.tmp/**"] },
      },
      logLevel: "error",
    });
    await vite.listen();
    await page.goto(vite.resolvedUrls.local[0] + "tests/live-errors.html");
  } else await page.goto(`http://127.0.0.1:${port}`);
  if (file.includes("invoice-scroll"))
    await page.goto(
      `http://127.0.0.1:${port}/facturas/000000000000000000000096`,
    );
  const source = await readFile(file, "utf8");
  const journey = Function(
    "return (" + source.trim().replace(/;\s*$/, "") + ")",
  )();
  const result = await journey(
    ariaPage(page, { autoConfirm: !file.includes("aria-controls") && !file.includes("favorites") }),
  );
  assert.deepEqual(
    consoleMessages,
    [],
    "Sin errores ni advertencias de React o React Aria",
  );
  const evidence = file.includes("favorites") ? "tests/evidence/favorites" : "tests/evidence/aria";
  await mkdir(evidence, { recursive: true });
  const report =
    evidence + "/" +
    engine +
    "-" +
    file.split("/").pop().replace(".js", ".json");
  const output = {
    ...result,
    consoleMessages,
    dataFile: join(temporary, "database.json"),
  };
  await writeFile(report, JSON.stringify(output, null, 2) + "\n");
  if (file === "tests/browser-journey.js")
    await writeFile(
      "tests/evidence/browser-report.json",
      JSON.stringify(output, null, 2) + "\n",
    );
  console.log(JSON.stringify({ report, ...result }));
} catch (error) {
  console.error(error.stack);
  if (browser) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page) {
      console.error("URL: " + page.url());
      console.error(
        await page.evaluate(() =>
          JSON.stringify({
            width: innerWidth,
            height: innerHeight,
            scroll: document.documentElement.scrollWidth,
            focus: document.activeElement?.outerHTML.slice(0, 220),
            panels: [
              ...document.querySelectorAll(
                ".column-filter-panel,.column-filter-dialog",
              ),
            ].map((el) => ({
              class: el.className,
              rect: el.getBoundingClientRect().toJSON(),
              max: getComputedStyle(el).maxHeight,
              style: el.getAttribute("style"),
            })),
          }),
        ),
      );
      await page
        .screenshot({ path: "tests/evidence/aria/failure.png" })
        .catch(() => {});
    }
  }
  process.exitCode = 1;
} finally {
  await browser?.close();
  await vite?.close();
  server.kill();
}
