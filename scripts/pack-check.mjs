import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => ![
    "npm_config_recursive",
    "npm_config_workspace_concurrency",
  ].includes(key.toLowerCase())),
);
const result = spawnSync("npm pack --dry-run --json --ignore-scripts", {
  cwd: root,
  env,
  encoding: "utf8",
  shell: true,
  windowsHide: true,
});
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

function parsePackJson(output) {
  const trimmed = output.trim();
  let cursor = trimmed.lastIndexOf("[");
  while (cursor >= 0) {
    try {
      return JSON.parse(trimmed.slice(cursor));
    } catch {
      cursor = trimmed.lastIndexOf("[", cursor - 1);
    }
  }
  throw new Error("npm pack did not emit a JSON manifest");
}

const [manifest] = parsePackJson(result.stdout);
const files = new Set(manifest.files.map((entry) => entry.path));
const required = [
  "LICENSE",
  "NOTICE",
  "README.md",
  "package.json",
  "packages/agent-chat-core/dist/index.js",
  "packages/agent-chat-core/dist/index.d.ts",
  "packages/agent-chat-core/dist/conformance.js",
  "packages/agent-chat-core/dist/conformance.d.ts",
  "packages/agent-chat-core/dist/domain-actions.js",
  "packages/agent-chat-core/dist/domain-actions.d.ts",
  "packages/agent-chat-core/dist/protocol.js",
  "packages/agent-chat-core/dist/state.js",
  "packages/agent-chat-core/dist/adapters/shared.js",
  "packages/agent-chat-adapter-acv2/dist/index.js",
  "packages/agent-chat-adapter-acv2/dist/index.d.ts",
  "packages/agent-chat-react/dist/index.js",
  "packages/agent-chat-react/dist/index.d.ts",
  "packages/agent-chat-react/dist/AgentChatWorkspace.js",
  "packages/agent-chat-react/dist/AgentChatWorkspace.d.ts",
  "packages/agent-chat-react/dist/conformance.js",
  "packages/agent-chat-react/dist/conformance.d.ts",
  "packages/agent-chat-react/dist/use-surface-action.js",
  "packages/agent-chat-react/dist/use-surface-action.d.ts",
  "packages/agent-chat-react/dist/styles.css",
];
for (const requiredFile of required) {
  if (!files.has(requiredFile)) throw new Error(`git bundle: missing ${requiredFile}`);
}
for (const file of files) {
  if (file.includes("/src/") || file.includes("/test/") || file.includes("node_modules")) {
    throw new Error(`git bundle: unexpected file ${file}`);
  }
}

const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
if (packageJson.private !== true) {
  throw new Error("git bundle must remain private:true to prevent registry publication");
}
if (packageJson.scripts?.release || packageJson.publishConfig) {
  throw new Error("git bundle must not expose a registry publishing path");
}
if (packageJson.scripts?.prepare || packageJson.scripts?.prepack) {
  throw new Error("git bundle must install from committed dist without lifecycle builds");
}

const npmrc = readFileSync(path.join(root, ".npmrc"), "utf8");
if (/^\s*(access|registry)\s*=/m.test(npmrc)) {
  throw new Error("git bundle must not configure registry publication");
}

const license = readFileSync(path.join(root, "LICENSE"), "utf8");
if (!license.includes("Copyright 2026 Simplia Agent Chat contributors.")) {
  throw new Error("git bundle LICENSE missing Simplia copyright");
}

process.stdout.write(`${manifest.id}: ${manifest.entryCount} files, ${manifest.size} bytes\n`);
