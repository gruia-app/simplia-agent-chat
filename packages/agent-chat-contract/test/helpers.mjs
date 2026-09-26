import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FIXTURES_DIR = path.join(packageRoot, "fixtures", "contract");

export function loadFixtures(kind) {
  const dir = path.join(FIXTURES_DIR, kind);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      name: name.replace(/\.json$/, ""),
      file: name,
      ...JSON.parse(readFileSync(path.join(dir, name), "utf8")),
    }));
}
