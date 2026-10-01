import assert from "node:assert/strict";
import test from "node:test";

import { diffSize, fieldsDiff, isEmptyDiff, rowsDiff, textDiff } from "../dist/diff-model.js";

test("fieldsDiff construye el diff de campos", () => {
  const diff = fieldsDiff([
    { path: "/subject", op: "replace", before: "hola", after: "adiós" },
    { path: "/tags/-", op: "add", after: "urgente" },
    { path: "/cc/0", op: "remove", before: "a@b.c" },
  ]);
  assert.equal(diff.kind, "fields");
  assert.equal(diffSize(diff), 3);
  assert.equal(isEmptyDiff(diff), false);
});

test("textDiff construye el diff de texto", () => {
  const diff = textDiff([{ path: "/body", before: "v1", after: "v2" }]);
  assert.equal(diff.kind, "text");
  assert.equal(diffSize(diff), 1);
});

test("rowsDiff construye el diff de filas", () => {
  const diff = rowsDiff([
    { table: "lineas", key: "l-1", op: "replace", before: { qty: 1 }, after: { qty: 2 } },
    { table: "lineas", key: "l-2", op: "add", after: { qty: 3 } },
  ]);
  assert.equal(diff.kind, "rows");
  assert.equal(diffSize(diff), 2);
});

test("isEmptyDiff detecta diffs vacíos", () => {
  assert.equal(isEmptyDiff(fieldsDiff([])), true);
  assert.equal(isEmptyDiff(textDiff([])), true);
  assert.equal(isEmptyDiff(rowsDiff([])), true);
  assert.equal(isEmptyDiff(fieldsDiff([{ path: "/a", op: "add", after: 1 }])), false);
});
