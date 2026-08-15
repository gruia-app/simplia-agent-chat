import assert from "node:assert/strict";
import test from "node:test";

import { validateReleasePolicy } from "./release-policy.mjs";

const VALID = {
  tagName: "v0.2.0",
  packageVersion: "0.2.0",
  tagObjectType: "tag",
  tagVerified: true,
  tagVerificationReason: "valid",
  targetObjectType: "commit",
  targetSha: "a".repeat(40),
};

test("accepts an exact semver tag with a verified annotated signature", () => {
  assert.deepEqual(validateReleasePolicy(VALID), []);
});

test("rejects version drift and malformed package versions", () => {
  assert.deepEqual(
    validateReleasePolicy({ ...VALID, tagName: "v0.2.1" }),
    ["tag_must_exactly_match_package_version"],
  );
  assert.deepEqual(
    validateReleasePolicy({ ...VALID, tagName: "v01.2.0", packageVersion: "01.2.0" }),
    ["package_version_must_be_semver"],
  );
  assert.deepEqual(
    validateReleasePolicy({ ...VALID, tagName: "v1.0.0-01", packageVersion: "1.0.0-01" }),
    ["package_version_must_be_semver"],
  );
});

test("rejects lightweight, unverified, indirect, or malformed tag targets", () => {
  assert.deepEqual(
    validateReleasePolicy({
      ...VALID,
      tagObjectType: "commit",
      tagVerified: false,
      tagVerificationReason: "unsigned",
      targetObjectType: "tag",
      targetSha: "short",
    }),
    [
      "release_tag_must_be_annotated",
      "release_tag_signature_not_verified:unsigned",
      "release_tag_must_target_commit",
      "release_tag_target_must_be_full_commit_sha",
    ],
  );
});
