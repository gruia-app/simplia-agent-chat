import { copyFileSync, readdirSync, rmSync, mkdirSync } from "node:fs";
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

function stageGeneratedTarball(unscopedName) {
  const prefix = `${unscopedName}-`;
  const matches = readdirSync(destination).filter(
    (file) => file.startsWith(prefix) && file.endsWith(".tgz"),
  );
  if (matches.length !== 1) {
    throw new Error(`${unscopedName}: expected 1 generated tarball, found ${JSON.stringify(matches)}`);
  }
  const filename = matches[0];
  const version = filename.slice(prefix.length, -".tgz".length);
  copyFileSync(path.join(destination, filename), path.join(destination, `${unscopedName}.tgz`));
  process.stdout.write(`staged ${unscopedName}@${version} as ${unscopedName}.tgz\n`);
  return version;
}

const resolvedRoot = path.resolve(root);
const resolvedDestination = path.resolve(destination);
if (!resolvedDestination.startsWith(`${resolvedRoot}${path.sep}`)) {
  throw new Error("pack_destination_outside_repository");
}
rmSync(resolvedDestination, { recursive: true, force: true });
mkdirSync(resolvedDestination, { recursive: true });

for (const relative of packageDirectories) {
  run(["run", "build"], path.join(root, relative));
  run(["pack", "--pack-destination", destination], path.join(root, relative));
}
stageGeneratedTarball("simplia-agent-chat-core");
stageGeneratedTarball("simplia-agent-chat-adapter-acv2");
stageGeneratedTarball("simplia-agent-chat-react");
run(["install", "--no-frozen-lockfile", "--lockfile=false"], consumer);
run(["run", "typecheck"], consumer);
run(["run", "test"], consumer);
