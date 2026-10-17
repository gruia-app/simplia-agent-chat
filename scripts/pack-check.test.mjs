import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./pack-check.mjs", import.meta.url), "utf8");
const parser = source.slice(source.indexOf("function parsePackJson("), source.indexOf("const [manifest]"));
const manifest = [{ id: "fixture@1.0.0", files: [{ path: 'file[with]brackets".js' }] }];
const json = JSON.stringify(manifest, null, 2);
function parse(...outputs) {
  return runInNewContext(`${parser}; parsePackJson(...outputs)`, { outputs }, { timeout: 1000 });
}

for (const [name, outputs] of [
  ["clean stdout", [json, ""]],
  ["launcher noise before and after JSON", [`[info] starting\n${json}\nfinished [ok]`, ""]],
  ["JSON on stderr", ["launcher completed", json]],
  ["malformed stdout followed by valid stderr", ["[invalid", json]],
  ["unrelated JSON array before manifest", [`[1, 2]\n${json}`, ""]],
]) {
  test(name, () => assert.equal(JSON.stringify(parse(...outputs)), JSON.stringify(manifest)));
}

for (const output of ["", "[invalid", "[]", "[{}]", '[{"files":[{}]}]', `${json} ${json}`.replace(/]\s+\[/, ",")]) {
  test(`rejects missing or invalid manifest: ${output.slice(0, 30)}`, () => {
    assert.throws(() => parse(output, ""), /npm pack did not emit a JSON manifest/);
  });
}
