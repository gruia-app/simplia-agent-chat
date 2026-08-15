import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const revision = process.env.SIMPLIA_AGENT_CHAT_GIT_REF;
if (!revision || !/^[0-9a-f]{40}$/i.test(revision)) {
  throw new Error("SIMPLIA_AGENT_CHAT_GIT_REF must be a full 40-character commit SHA");
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "fixtures", "external-consumer");
const destination = path.join(os.tmpdir(), `simplia-agent-chat-git-consumer-${revision}`);
const packageManagerCli = process.env.npm_execpath;
if (!packageManagerCli) throw new Error("pnpm_cli_path_missing");

const resolvedTemp = path.resolve(os.tmpdir());
const resolvedDestination = path.resolve(destination);
if (!resolvedDestination.startsWith(`${resolvedTemp}${path.sep}`)) {
  throw new Error("git_consumer_destination_outside_temp");
}

function run(args) {
  const result = spawnSync(process.execPath, [packageManagerCli, ...args], {
    cwd: destination,
    encoding: "utf8",
    windowsHide: true,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

rmSync(resolvedDestination, { recursive: true, force: true });
mkdirSync(resolvedDestination, { recursive: true });
for (const filename of ["smoke.mjs", "smoke.tsx", "tsconfig.json"]) {
  cpSync(path.join(fixture, filename), path.join(destination, filename));
}

const packageJson = JSON.parse(readFileSync(path.join(fixture, "package.json"), "utf8"));
packageJson.dependencies["simplia-agent-chat"] =
  `github:gruia-app/simplia-agent-chat#${revision}`;
writeFileSync(path.join(destination, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
writeFileSync(path.join(destination, ".npmrc"), "ignore-scripts=true\n");

run(["install"]);
run(["run", "typecheck"]);
run(["run", "test"]);

const lockfile = readFileSync(path.join(destination, "pnpm-lock.yaml"), "utf8");
if (!lockfile.includes(revision)) {
  throw new Error("git_consumer_lockfile_missing_exact_revision");
}
process.stdout.write(`git_consumer_smoke_ok ${revision}\n`);
