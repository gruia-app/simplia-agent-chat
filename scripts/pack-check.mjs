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

function parsePackJson(...outputs) {
  for (const output of outputs) {
    // npm or its launcher may surround the JSON with log lines or use stderr.
    // Walk forward so malformed arrays at offset zero cannot cause a retry loop.
    for (let start = output.indexOf("["); start >= 0; start = output.indexOf("[", start + 1)) {
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let end = start; end < output.length; end += 1) {
        const char = output[end];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '\"') quoted = false;
          continue;
        }
        if (char === '\"') quoted = true;
        else if (char === "[") depth += 1;
        else if (char === "]" && --depth === 0) {
          try {
            const manifests = JSON.parse(output.slice(start, end + 1));
            if (manifests.length === 1 && Array.isArray(manifests[0]?.files)
                && manifests[0].files.every((entry) => typeof entry?.path === "string")) {
              return manifests;
            }
          } catch {
            // Continue looking for a complete npm manifest, never accept log arrays.
          }
          break;
        }
      }
    }
  }
  throw new Error("npm pack did not emit a JSON manifest");
}

const [manifest] = parsePackJson(result.stdout, result.stderr);
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
