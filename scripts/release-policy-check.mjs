import { readFileSync } from "node:fs";
import { validateReleasePolicy } from "./release-policy.mjs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const errors = validateReleasePolicy({
  tagName: process.env.GITHUB_REF_NAME,
  packageVersion: packageJson.version,
  tagObjectType: process.env.RELEASE_TAG_OBJECT_TYPE,
  tagVerified: process.env.RELEASE_TAG_VERIFIED === "true",
  tagVerificationReason: process.env.RELEASE_TAG_VERIFICATION_REASON,
  targetObjectType: process.env.RELEASE_TAG_TARGET_TYPE,
  targetSha: process.env.RELEASE_TAG_TARGET_SHA,
});

if (errors.length > 0) {
  throw new Error(`release_policy_failed:\n- ${errors.join("\n- ")}`);
}

process.stdout.write(`release_policy_ok ${process.env.GITHUB_REF_NAME} ${process.env.RELEASE_TAG_TARGET_SHA}\n`);
