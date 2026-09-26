import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  fromMcpName,
  MCP_NAME_PATTERN,
  SCHEMAS,
  toMcpName,
  toMcpTool,
} from "../dist/index.js";
import { loadFixtures } from "./helpers.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MCP_SCHEMA = JSON.parse(
  readFileSync(path.join(packageRoot, "fixtures", "mcp", "2025-06-18.schema.json"), "utf8"),
);

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
// El schema MCP es draft-07 con "definitions": proyectamos $ref al def Tool.
const validateMcpTool = ajv.compile({
  $ref: "#/definitions/Tool",
  definitions: MCP_SCHEMA.definitions,
});

const validToolspecs = loadFixtures("valid").filter((f) => f.entity === "tool-spec");

test("every valid ToolSpec projects to a valid MCP Tool (2025-06-18)", () => {
  assert.ok(validToolspecs.length > 0);
  for (const fixture of validToolspecs) {
    const tool = toMcpTool(fixture.document);
    const ok = validateMcpTool(tool);
    assert.ok(ok, `${fixture.name}: ${JSON.stringify(validateMcpTool.errors)}`);
    assert.ok(MCP_NAME_PATTERN.test(tool.name));
    assert.equal(tool.inputSchema, fixture.document.input_schema);
    assert.equal(
      tool.outputSchema,
      fixture.document.effect === "read"
        ? fixture.document.output_schema
        : SCHEMAS["proposal-ref"],
    );
    assert.deepEqual(tool.annotations, {
      title: fixture.document.name,
      readOnlyHint: fixture.document.effect === "read",
      destructiveHint: false,
      idempotentHint: fixture.document.effect === "read",
      openWorldHint: false,
    });
  }
});

test("fromMcpName is the exact inverse of toMcpName", () => {
  for (const fixture of validToolspecs) {
    const spec = fixture.document;
    const mcpName = toMcpName(spec);
    const parts = fromMcpName(mcpName);
    const [ns, verb] = spec.name.split(".");
    assert.deepEqual(parts, { app_key: spec.app_key, ns, verb });
  }
});

test("fromMcpName rejects malformed names", () => {
  for (const bad of ["", "a__b", "a__b__c__d", "a__b__", "has space__x__y", "x".repeat(65) + "__a__b"]) {
    assert.throws(() => fromMcpName(bad), undefined, bad);
  }
});

test("system tool names use the reserved proposal namespace (§9.3)", () => {
  for (const verb of ["apply", "revert", "get"]) {
    const parts = fromMcpName(`insaidr__proposal__${verb}`);
    assert.deepEqual(parts, { app_key: "insaidr", ns: "proposal", verb });
  }
});
