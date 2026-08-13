import { rmSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, ".artifacts", "packs");
const consumer = path.join(root, "fixtures", "external-consumer");
const packageDirectories = [
  "packages/agent-chat-core",
  "packages/agent-chat-adapter-acv2",
  "packages/agent-chat-react",
];

function run(args, cwd = root) {
  const packageManagerCli = process.env.npm_execpath;
  if (!packageManagerCli) throw new Error("pnpm_cli_path_missing");
  const result = spawnSync(process.execPath, [packageManagerCli, ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const resolvedRoot = path.resolve(root);
const resolvedDestination = path.resolve(destination);
if (!resolvedDestination.startsWith(`${resolvedRoot}${path.sep}`)) {
  throw new Error("pack_destination_outside_repository");
}
rmSync(resolvedDestination, { recursive: true, force: true });
mkdirSync(resolvedDestination, { recursive: true });

run(["run", "build"]);
for (const relative of packageDirectories) {
  run(["pack", "--pack-destination", destination], path.join(root, relative));
}
run(["install", "--no-frozen-lockfile", "--lockfile=false"], consumer);
run(["run", "typecheck"], consumer);
run(["run", "test"], consumer);
