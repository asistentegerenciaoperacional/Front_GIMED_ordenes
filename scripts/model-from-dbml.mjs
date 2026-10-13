// Development generator. Never writes to the source DBML.
import { readFile, writeFile, mkdir } from "node:fs/promises";
const source = await readFile(
  new URL("../../Planeacion/db.md", import.meta.url),
  "utf8",
);
const enums = Object.fromEntries(
  [...source.matchAll(/enum\s+(\w+)\s*\{([^}]+)\}/g)].map((m) => [
    m[1],
    m[2].trim().split(/\s+/),
  ]),
);
const tables = {};
for (const match of source.matchAll(/Table\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
  const fields = {};
  const unique = [];
  let pk = [];
  for (const raw of match[2].split("\n")) {
    const line = raw.split("//")[0].trim();
    const m = line.match(
      /^(\w+)\s+(object_id|varchar|integer|boolean|datetime|decimal\(14,2\)|float\(5,2\)|\w+)(?:\s*\[([^\]]+)\])?\s*$/,
    );
    if (!m || line.startsWith("indexes")) continue;
    const [, name, type, options = ""] = m;
    if (!(
      enums[type] ||
      [
        "object_id",
        "varchar",
        "integer",
        "boolean",
        "datetime",
        "decimal(14,2)",
        "float(5,2)",
      ].includes(type)
    ))
      continue;
    const def = options.match(/default:\s*(['"]?)([^'",\]]+)\1/);
    let value = def?.[2]?.trim();
    fields[name] = {
      type,
      required: options.includes("not null") || options.includes("primary key"),
      ...(value !== undefined
        ? {
            default:
              type === "boolean"
                ? value === "true"
                : type.startsWith("float")
                  ? Number(value)
                  : value,
          }
        : {}),
    };
    if (options.includes("primary key")) pk.push(name);
    if (options.includes("unique")) unique.push([name]);
  }
  for (const m of match[2].matchAll(/\(([^)]+)\)\s*\[(pk|unique)\]/g)) {
    const keys = m[1].split(",").map((k) => k.trim());
    if (m[2] === "pk") pk = keys;
    else unique.push(keys);
  }
  tables[match[1]] = { fields, pk, unique };
}
tables.orden_producto.fields.cantidad_sticker = {
  type: "integer",
  required: false,
  prototype: true,
};
tables.orden_producto.fields.cantidad_cinta = {
  type: "integer",
  required: false,
  prototype: true,
};
const refs = [];
for (const m of source.matchAll(
  /Ref:\s*"(\w+)"\."(\w+)"\s*[^\n"]*"(\w+)"\."(\w+)"/g,
)) {
  refs.push({ table: m[3], field: m[4], target: m[1], targetField: m[2] });
}
const meta = { enums, tables, refs };
await mkdir(new URL("../shared/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../shared/entities.json", import.meta.url),
  JSON.stringify(meta, null, 2) + "\n",
);
const jsType = (type) =>
  enums[type]
    ? enums[type].map((x) => JSON.stringify(x)).join(" | ")
    : ["integer", "float(5,2)"].includes(type)
      ? "number"
      : type === "boolean"
        ? "boolean"
        : "string";
let types =
  "// Generated from Planeacion/db.md. Monetary decimals are exact strings.\n";
for (const [name, table] of Object.entries(tables)) {
  types += `export interface ${name} {\n`;
  for (const [field, spec] of Object.entries(table.fields))
    types += `  ${field}: ${jsType(spec.type)}${spec.required ? "" : " | null"};${spec.prototype ? " // Prototype extension; not in production DBML." : ""}\n`;
  types += "}\n\n";
}
types +=
  "export interface EntityMap {\n" +
  Object.keys(tables)
    .map((t) => `  ${t}: ${t};`)
    .join("\n") +
  "\n}\nexport type Database = { [K in keyof EntityMap]: EntityMap[K][] };\n";
await writeFile(new URL("../shared/models.ts", import.meta.url), types);
console.log(
  `Generated ${Object.keys(tables).length} entity models, ${refs.length} simple foreign keys.`,
);
