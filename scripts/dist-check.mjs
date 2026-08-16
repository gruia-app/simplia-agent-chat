import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = path.join(root, "packages");
const distPathspecs = readdirSync(packagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(path.join(packagesRoot, entry.name, "dist")))
  .map((entry) => `:(literal)packages/${entry.name}/dist`)
  .sort();

if (distPathspecs.length === 0) throw new Error("no_package_dist_directories_found");

function git(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

// Ask git for actual content deltas instead of porcelain status. On Windows,
// status may report files whose only difference is checkout EOL normalization.
const unstaged = git([
  "diff",
  "--name-only",
  "--ignore-cr-at-eol",
  "--",
  ...distPathspecs,
]);
const staged = git([
  "diff",
  "--cached",
  "--name-only",
  "--ignore-cr-at-eol",
  "--",
  ...distPathspecs,
]);
const untracked = git([
  "ls-files",
  "--others",
  "--exclude-standard",
  "--",
  ...distPathspecs,
]);

const changed = [...new Set(
  `${unstaged}\n${staged}\n${untracked}`
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean),
)].sort();

if (changed.length > 0) {
  process.stderr.write("Committed dist does not match the source build:\n");
  process.stderr.write(`${changed.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("committed_dist_matches_source\n");
