import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

test("La interfaz utiliza controles compartidos de React Aria en todas las pantallas", () => {
  const forbidden = new Set([
    "button",
    "a",
    "form",
    "label",
    "input",
    "textarea",
    "select",
    "datalist",
    "dialog",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "details",
    "summary",
  ]);
  const files = readdirSync("src", { recursive: true })
    .map(String)
    .filter(
      (name) =>
        name.endsWith(".tsx") &&
        !name.startsWith("components/") &&
        !name.startsWith("components\\"),
    );
  const violations: string[] = [];
  for (const file of files) {
    const source = readFileSync(join("src", file), "utf8");
    const tree = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        forbidden.has(node.tagName.getText(tree))
      )
        violations.push(
          `${file}:${tree.getLineAndCharacterOfPosition(node.pos).line + 1} ${node.tagName.getText(tree)}`,
        );
      ts.forEachChild(node, visit);
    };
    visit(tree);
    if (/window\.confirm\s*\(|\.showModal\s*\(|\.showPopover\s*\(/.test(source))
      violations.push(file + ": gestión nativa sustituida");
  }
  assert.deepEqual(violations, []);
});
