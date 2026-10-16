import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export async function ariaBrowserSource(source, { autoConfirm = true } = {}) {
  const adapter = (
    await readFile(
      new URL("../tests/aria-playwright.mjs", import.meta.url),
      "utf8",
    )
  ).replace(/^export /gm, "");
  const opening=/=>\s*\{/.exec(source);
  if(!opening)throw new Error("Expected an async browser function");
  const start=opening.index+opening[0].length;
  return (
    source.slice(0, start) +
    "\n" +
    adapter +
    "\npage=ariaPage(page,{autoConfirm:" +
    autoConfirm +
    "});\n" +
    source.slice(start)
  );
}
export async function ariaBrowserFile(filename) {
  const content = await ariaBrowserSource(await readFile(filename, "utf8"), {
    autoConfirm: !filename.includes("aria-controls"),
  });
  await mkdir("tests/.tmp", { recursive: true });
  const generated = resolve("tests/.tmp/aria-" + basename(filename));
  await writeFile(generated, content);
  return generated;
}
if (
  resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url) &&
  process.argv[2]
)
  console.log(await ariaBrowserFile(process.argv[2]));
