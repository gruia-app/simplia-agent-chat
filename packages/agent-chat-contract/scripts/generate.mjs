import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(packageRoot, "schema");
const generatedDir = path.join(packageRoot, "src", "generated");

const BANNER = [
  "/* eslint-disable */",
  "/**",
  " * GENERADO — no editar a mano.",
  " * Fuente: schema/*.schema.json (JSON Schema draft 2020-12, SPEC-CHAT-F1-R687 rev 2).",
  " * Regenerar: pnpm --filter @simplia/agent-chat-contract run generate",
  " */",
  "",
].join("\n");

function readSchemas() {
  const files = readdirSync(schemaDir)
    .filter((name) => name.endsWith(".schema.json"))
    .sort();
  return files.map((file) => ({
    file,
    key: file.replace(/\.schema\.json$/, ""),
    schema: JSON.parse(readFileSync(path.join(schemaDir, file), "utf8")),
  }));
}

function constName(key) {
  return `${key.replace(/-/g, "_").toUpperCase()}_SCHEMA`;
}

function renderSchemasTs(entries) {
  const parts = [BANNER];
  for (const { key, file, schema } of entries) {
    parts.push(
      `/** Fuente: schema/${file} */\n` +
        `export const ${constName(key)} = ${JSON.stringify(schema, null, 2)} as const;\n`,
    );
  }
  const mapEntries = entries
    .map(({ key }) => `  ${JSON.stringify(key)}: ${constName(key)},`)
    .join("\n");
  parts.push(`export const SCHEMAS = {\n${mapEntries}\n} as const;\n`);
  parts.push(`export type ContractEntityName = keyof typeof SCHEMAS;\n`);
  return parts.join("\n");
}

async function renderEntityTypes({ file, schema }) {
  const title = typeof schema.title === "string" ? schema.title : file;
  const output = await compile(schema, title, {
    bannerComment: "",
    unreachableDefinitions: false,
    strictIndexSignatures: true,
    style: { semi: true, singleQuote: false, printWidth: 100 },
    format: false,
  });
  return `${BANNER}/** Fuente: schema/${file} */\n${output.trimEnd()}\n`;
}

function renderTypesBarrel(entries) {
  const parts = [BANNER];
  for (const { key, schema } of entries) {
    const title = typeof schema.title === "string" ? schema.title : key;
    parts.push(`export type { ${title} } from "./types/${key}.js";`);
  }
  return parts.join("\n");
}

const targets = [{ file: "schemas.ts", render: renderSchemasTs }];

function typeTargets(entries) {
  return entries.map((entry) => ({
    file: `types/${entry.key}.ts`,
    render: () => renderEntityTypes(entry),
  }));
}

async function main() {
  const checkMode = process.argv.includes("--check");
  const entries = readSchemas();
  const expectedTypeFiles = new Set(entries.map((entry) => `types/${entry.key}.ts`));
  const typesDir = path.join(generatedDir, "types");
  const allTargets = [
    ...targets,
    ...typeTargets(entries),
    { file: "types.ts", render: () => Promise.resolve(renderTypesBarrel(entries)) },
  ];
  const stale = [];
  for (const { file, render } of allTargets) {
    const rendered = await render(entries);
    const targetPath = path.join(generatedDir, file);
    let current = null;
    try {
      current = readFileSync(targetPath, "utf8");
    } catch {
      current = null;
    }
    if (checkMode) {
      if (current !== rendered) stale.push(file);
      continue;
    }
    if (current !== rendered) {
      mkdirSync(path.dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, rendered);
      process.stdout.write(`generated src/generated/${file}\n`);
    }
  }
  if (checkMode) {
    try {
      for (const file of readdirSync(typesDir)) {
        if (!expectedTypeFiles.has(`types/${file}`)) stale.push(`types/${file}`);
      }
    } catch {
      stale.push("types/");
    }
  }
  if (checkMode && stale.length > 0) {
    process.stderr.write(
      `generated files out of date: ${stale.join(", ")} — run pnpm --filter @simplia/agent-chat-contract run generate\n`,
    );
    process.exit(1);
  }
  if (checkMode) process.stdout.write("generated files are up to date\n");
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exit(1);
});
