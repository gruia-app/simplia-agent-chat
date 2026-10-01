import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Gate de cobertura F1.2 (SPEC §7): los módulos del contrato §3/§7 deben
 * mantener >= 90% de líneas. Ejecuta sus suites con --experimental-test-coverage
 * y parsea la tabla por fichero.
 */

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIN_LINE_COVERAGE = 90;

const CONTRACT_MODULES = [
  "proposal-machine",
  "confirm-policy",
  "diff-model",
  "panels",
  "agent-server-client",
];

const testFiles = CONTRACT_MODULES.map((name) => `test/${name}.test.mjs`);

const result = spawnSync(
  process.execPath,
  ["--test", "--experimental-test-coverage", ...testFiles],
  { cwd: packageRoot, encoding: "utf8" },
);

const output = `${result.stdout}\n${result.stderr}`;
if (result.status !== 0) {
  process.stderr.write(output);
  process.stderr.write("coverage gate: test run failed\n");
  process.exit(result.status ?? 1);
}

const coverage = new Map();
for (const line of output.split(/\r?\n/)) {
  const match = line.match(/^ℹ\s+([\w.-]+\.js)\s*\|\s*([\d.]+)\s*\|/);
  if (match) coverage.set(match[1], Number.parseFloat(match[2]));
}

const failures = [];
for (const name of CONTRACT_MODULES) {
  const file = `${name}.js`;
  const linePct = coverage.get(file);
  if (linePct === undefined) {
    failures.push(`${file}: no coverage data`);
  } else if (linePct < MIN_LINE_COVERAGE) {
    failures.push(`${file}: ${linePct}% lines < ${MIN_LINE_COVERAGE}%`);
  } else {
    process.stdout.write(`${file}: ${linePct}% lines ok\n`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`coverage gate failed:\n${failures.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`coverage gate ok (>= ${MIN_LINE_COVERAGE}% lines)\n`);
