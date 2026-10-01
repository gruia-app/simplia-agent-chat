/** Paridad de la proyección MCP §9.1 (F1.6): cada ToolSpec válido del
 * contrato proyecta a un Tool válido del schema MCP 2025-06-18
 * vendorizado, y fromMcpName es la inversa exacta de toMcpName.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { fromMcpName, toMcpName, toMcpTool } from "../dist/index.js";
import { SCHEMAS } from "@simplia/agent-chat-contract";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FIXTURES_DIR = join(REPO_ROOT, "packages", "agent-chat-contract", "fixtures");

const MCP_SCHEMA = JSON.parse(
  readFileSync(join(FIXTURES_DIR, "mcp", "2025-06-18.schema.json"), "utf8"),
);
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateMcpTool = ajv.compile({
  $ref: "#/definitions/Tool",
  definitions: MCP_SCHEMA.definitions,
});

const MCP_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

const validToolSpecs = readdirSync(join(FIXTURES_DIR, "contract", "valid"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, "contract", "valid", f), "utf8"));
    return fixture.entity === "tool-spec" ? [f.replace(/\.json$/, ""), fixture.document] : null;
  })
  .filter(Boolean);

test("hay fixtures tool-spec válidas en el contrato", () => {
  assert.ok(validToolSpecs.length >= 3, `solo ${validToolSpecs.length}`);
});

for (const [name, spec] of validToolSpecs) {
  test(`tool-spec ${name} proyecta a un Tool MCP válido`, () => {
    const tool = toMcpTool(spec);
    assert.equal(validateMcpTool(tool), true, JSON.stringify(validateMcpTool.errors));
    assert.match(tool.name, MCP_NAME_PATTERN);
    assert.deepEqual(tool.inputSchema, spec.input_schema);
    const expectedOutput = spec.effect === "read" ? spec.output_schema : SCHEMAS["proposal-ref"];
    assert.deepEqual(tool.outputSchema, expectedOutput);
    assert.deepEqual(tool.annotations, {
      title: spec.name,
      readOnlyHint: spec.effect === "read",
      destructiveHint: false,
      idempotentHint: spec.effect === "read",
      openWorldHint: false,
    });
  });

  test(`fromMcpName es inversa exacta para ${name}`, () => {
    const parts = fromMcpName(toMcpName(spec));
    const [ns, verb] = spec.name.split(".");
    assert.deepEqual(parts, { app_key: spec.app_key, ns, verb });
  });
}

for (const bad of ["", "a__b", "a__b__c__d", "a__b__", "has space__x__y", `${"x".repeat(65)}__a__b`]) {
  test(`fromMcpName rechaza ${JSON.stringify(bad.slice(0, 30))}`, () => {
    assert.throws(() => fromMcpName(bad));
  });
}
