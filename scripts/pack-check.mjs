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

const [manifest] = JSON.parse(result.stdout);
const files = new Set(manifest.files.map((entry) => entry.path));
const required = [
  "LICENSE",
  "NOTICE",
  "README.md",
  "package.json",
  "packages/agent-chat-core/dist/index.js",
  "packages/agent-chat-core/dist/index.d.ts",
  "packages/agent-chat-adapter-acv2/dist/index.js",
  "packages/agent-chat-adapter-acv2/dist/index.d.ts",
  "packages/agent-chat-react/dist/index.js",
  "packages/agent-chat-react/dist/index.d.ts",
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

const license = readFileSync(path.join(root, "LICENSE"), "utf8");
if (!license.includes("Copyright 2026 Simplia Agent Chat contributors.")) {
  throw new Error("git bundle LICENSE missing Simplia copyright");
}

process.stdout.write(`${manifest.id}: ${manifest.entryCount} files, ${manifest.size} bytes\n`);
