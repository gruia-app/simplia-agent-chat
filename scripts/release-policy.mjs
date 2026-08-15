const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;

function isSemVer(value) {
  if (typeof value !== "string") return false;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(value);
  if (!match) return false;

  const prerelease = match[4];
  if (prerelease) {
    for (const identifier of prerelease.split(".")) {
      if (!identifier || !/^[0-9A-Za-z-]+$/.test(identifier)) return false;
      if (/^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith("0")) return false;
    }
  }

  const build = match[5];
  return !build || build.split(".").every((identifier) => identifier && /^[0-9A-Za-z-]+$/.test(identifier));
}

export function validateReleasePolicy({
  tagName,
  packageVersion,
  tagObjectType,
  tagVerified,
  tagVerificationReason,
  targetObjectType,
  targetSha,
}) {
  const errors = [];

  if (!isSemVer(packageVersion)) {
    errors.push("package_version_must_be_semver");
  }
  if (tagName !== `v${packageVersion}`) {
    errors.push("tag_must_exactly_match_package_version");
  }
  if (tagObjectType !== "tag") {
    errors.push("release_tag_must_be_annotated");
  }
  if (tagVerified !== true) {
    errors.push(`release_tag_signature_not_verified:${tagVerificationReason || "unknown"}`);
  }
  if (targetObjectType !== "commit") {
    errors.push("release_tag_must_target_commit");
  }
  if (typeof targetSha !== "string" || !FULL_SHA_PATTERN.test(targetSha)) {
    errors.push("release_tag_target_must_be_full_commit_sha");
  }

  return errors;
}
