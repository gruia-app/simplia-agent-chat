import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTRACT_ENTITIES,
  ContractValidationError,
  assertContractDocument,
  validateContractDocument,
} from "../dist/index.js";
import { loadFixtures } from "./helpers.mjs";

const validFixtures = loadFixtures("valid");
const invalidFixtures = loadFixtures("invalid");

test("fixtures cover every contract entity", () => {
  const covered = new Set(validFixtures.map((fixture) => fixture.entity));
  for (const entity of CONTRACT_ENTITIES) {
    assert.ok(covered.has(entity), `no valid fixture covers entity ${entity}`);
  }
});

for (const fixture of validFixtures) {
  test(`valid fixture ${fixture.name} passes`, () => {
    const errors = validateContractDocument(fixture.entity, fixture.document);
    assert.deepEqual(errors, [], `unexpected errors: ${JSON.stringify(errors)}`);
  });
}

for (const fixture of invalidFixtures) {
  test(`invalid fixture ${fixture.name} fails with ${fixture.expected_error}`, () => {
    assert.ok(fixture.expected_error, "invalid fixtures must declare expected_error");
    const errors = validateContractDocument(fixture.entity, fixture.document);
    assert.ok(errors.length > 0, "expected validation errors, got none");
    const codes = errors.map((error) => error.code);
    assert.ok(
      codes.includes(fixture.expected_error),
      `expected error code ${fixture.expected_error}, got ${codes.join(", ")}`,
    );
  });
}

test("assertContractDocument throws ContractValidationError on invalid input", () => {
  const fixture = invalidFixtures.find((entry) => entry.name === "proposal-missing-expires");
  assert.throws(
    () => assertContractDocument(fixture.entity, fixture.document),
    ContractValidationError,
  );
});

test("assertContractDocument narrows a valid document", () => {
  const fixture = validFixtures.find((entry) => entry.name === "proposal-proposed");
  assertContractDocument("proposal", fixture.document);
});
