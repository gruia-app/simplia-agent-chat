import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("generated types and schema module match schema/*.schema.json (no drift)", () => {
  const output = execFileSync(
    process.execPath,
    [path.join(packageRoot, "scripts", "generate.mjs"), "--check"],
    { encoding: "utf8" },
  );
  assert.match(output, /up to date/);
});

test("SPEC-CHAT-F1-R687 §4: no free-text action parsing markers in package sources", () => {
  const scan = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return scan(full);
      return /\.(ts|mts|mjs)$/.test(entry.name) ? [full] : [];
    });
  const offenders = [];
  for (const file of scan(path.join(packageRoot, "src"))) {
    const content = readFileSync(file, "utf8");
    for (const marker of ["[ACTION:", "[TOOL:", "[CALL:"]) {
      if (content.includes(marker)) offenders.push(`${file}: ${marker}`);
    }
  }
  assert.deepEqual(offenders, []);
});
