/** Paridad de contrato: las mismas fixtures que valida
 * agent-chat-contract (TS) y gruia_agent_tools (Python) deben dar el
 * mismo veredicto aquí.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { validateContractDocument } from "@simplia/agent-chat-contract";

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/agent-chat-contract/fixtures/contract",
);

function load(kind) {
  return readdirSync(path.join(FIXTURES, kind))
    .filter((n) => n.endsWith(".json"))
    .sort()
    .map((n) => ({ name: n.replace(/\.json$/, ""), ...JSON.parse(readFileSync(path.join(FIXTURES, kind, n), "utf8")) }));
}

for (const fixture of load("valid")) {
  test(`valid/${fixture.name}`, () => {
    const errors = validateContractDocument(fixture.entity, fixture.document);
    assert.deepEqual(errors, []);
  });
}

for (const fixture of load("invalid")) {
  test(`invalid/${fixture.name}`, () => {
    const errors = validateContractDocument(fixture.entity, fixture.document);
    const codes = errors.map((e) => e.code);
    assert.ok(codes.includes(fixture.expected_error), `expected ${fixture.expected_error}, got ${codes}`);
  });
}
