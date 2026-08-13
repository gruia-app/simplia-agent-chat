import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
  "packages/agent-chat-core",
  "packages/agent-chat-adapter-acv2",
  "packages/agent-chat-react",
];

for (const relative of packages) {
  const cwd = path.join(root, relative);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => ![
      "npm_config_recursive",
      "npm_config_workspace_concurrency",
    ].includes(key.toLowerCase())),
  );
  const result = spawnSync("npm pack --dry-run --json", {
    cwd,
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
  for (const required of ["LICENSE", "NOTICE", "README.md", "dist/index.js", "dist/index.d.ts", "package.json"]) {
    if (!files.has(required)) throw new Error(`${relative}: missing ${required}`);
  }
  for (const file of files) {
    if (file.startsWith("src/") || file.startsWith("test/") || file.includes("node_modules")) {
      throw new Error(`${relative}: unexpected packed file ${file}`);
    }
  }
  if (relative.endsWith("agent-chat-react") && !files.has("dist/styles.css")) {
    throw new Error(`${relative}: missing dist/styles.css`);
  }
  process.stdout.write(`${manifest.id}: ${manifest.entryCount} files, ${manifest.size} bytes\n`);
}
