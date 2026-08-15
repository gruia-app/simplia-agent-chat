import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all", "--", "packages/*/dist"],
  {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

if (result.stdout.trim()) {
  process.stderr.write("Committed dist does not match the source build:\n");
  process.stderr.write(result.stdout);
  process.exit(1);
}

process.stdout.write("committed_dist_matches_source\n");
