import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SUGGESTION_LIMIT,
  createAccountSnapshotDerive,
  createChatSuggestionRegistry,
  normalizeChatSuggestion,
  resolveChatSuggestions,
} from "../dist/index.js";

const staticSuggestions = [
  { id: "s1", label: "Resume work", prompt: "Resume the pending work item" },
  { id: "s2", label: "Draft brief", prompt: "Draft a brief for the week" },
  { id: "s3", label: "Check quota", prompt: "Check my quota usage" },
];

test("createChatSuggestionRegistry validates and freezes", () => {
  const created = createChatSuggestionRegistry({ staticSuggestions });
  assert.equal(created.ok, true);
  assert.equal(created.registry.staticSuggestions.length, 3);
  assert.ok(Object.isFrozen(created.registry));
  assert.ok(Object.isFrozen(created.registry.staticSuggestions));
});

test("createChatSuggestionRegistry fails closed on invalid entries", () => {
  assert.equal(createChatSuggestionRegistry({ staticSuggestions: [{ id: "x" }] }).reason, "invalid_suggestion");
  assert.equal(createChatSuggestionRegistry({ staticSuggestions: "nope" }).reason, "invalid_suggestion");
  assert.equal(createChatSuggestionRegistry({ staticSuggestions: [], derive: 7 }).reason, "invalid_derive");
});

test("createChatSuggestionRegistry rejects duplicate ids", () => {
  const created = createChatSuggestionRegistry({
    staticSuggestions: [
      { id: "dup", label: "A", prompt: "a" },
      { id: "dup", label: "B", prompt: "b" },
    ],
  });
  assert.equal(created.ok, false);
  assert.equal(created.reason, "duplicate_id");
});

test("normalizeChatSuggestion trims and bounds fields", () => {
  const suggestion = normalizeChatSuggestion({
    id: " s-1 ",
    label: "  Label  ",
    prompt: "  Do the thing  ",
    description: "  details  ",
  });
  assert.deepEqual(suggestion, { id: "s-1", label: "Label", prompt: "Do the thing", description: "details" });
  assert.equal(normalizeChatSuggestion({ id: "BAD ID!", label: "x", prompt: "y" }), undefined);
  assert.equal(normalizeChatSuggestion({ id: "ok", label: "x".repeat(200), prompt: "y" }), undefined);
  assert.equal(normalizeChatSuggestion({ id: "ok", label: "x", prompt: "   " }), undefined);
  assert.equal(normalizeChatSuggestion(null), undefined);
});

test("resolveChatSuggestions appends the derived suggestion last", () => {
  const created = createChatSuggestionRegistry({
    staticSuggestions,
    derive: () => ({ id: "derived", label: "Create your first project", prompt: "Create my first project" }),
  });
  const resolved = resolveChatSuggestions(created.registry, { context: {} });
  assert.equal(resolved.length, 4);
  assert.equal(resolved[3].id, "derived");
});

test("resolveChatSuggestions skips missing or invalid derived entries", () => {
  const registry = createChatSuggestionRegistry({
    staticSuggestions,
    derive: () => ({ id: "bad id!", label: "x", prompt: "y" }),
  }).registry;
  assert.equal(resolveChatSuggestions(registry, { context: {} }).length, 3);

  const throwing = createChatSuggestionRegistry({
    staticSuggestions,
    derive: () => { throw new Error("boom"); },
  }).registry;
  assert.equal(resolveChatSuggestions(throwing, { context: {} }).length, 3);
});

test("resolveChatSuggestions dedupes against static ids and honors limit", () => {
  const registry = createChatSuggestionRegistry({
    staticSuggestions,
    derive: () => ({ id: "s1", label: "dup", prompt: "dup" }),
  }).registry;
  assert.equal(resolveChatSuggestions(registry, { context: {} }).length, 3);
  assert.equal(resolveChatSuggestions(registry, { context: {}, limit: 2 }).length, 2);
  assert.equal(resolveChatSuggestions(registry, { context: {}, limit: 0 }).length, 0);
  assert.equal(DEFAULT_SUGGESTION_LIMIT, 5);
});

test("createAccountSnapshotDerive prefers empty account over quota", () => {
  const derive = createAccountSnapshotDerive({
    emptyAccountSuggestion: { id: "empty", label: "Create your first X", prompt: "Create my first X" },
    quotaWarningSuggestion: { id: "quota", label: "Upgrade plan", prompt: "Upgrade my plan" },
  });
  const snapshot = { isEmpty: true, quotaUsedRatio: 0.95 };
  assert.equal(derive(snapshot).id, "empty");
});

test("createAccountSnapshotDerive emits quota suggestion at threshold", () => {
  const derive = createAccountSnapshotDerive({
    quotaWarningSuggestion: (snapshot) => ({
      id: "quota",
      label: "Upgrade plan",
      prompt: `Upgrade my plan (usage ${Math.round(snapshot.quotaUsedRatio * 100)}%)`,
    }),
  });
  assert.equal(derive({ quotaUsedRatio: 0.82 }).id, "quota");
  assert.equal(derive({ quotaUsedRatio: 0.79 }), undefined);
  assert.equal(derive({ quotaUsedRatio: Number.NaN }), undefined);
  assert.equal(derive({}), undefined);
  assert.equal(derive("nope"), undefined);
});

test("createAccountSnapshotDerive honors custom threshold and fallback", () => {
  const derive = createAccountSnapshotDerive({
    quotaWarningThreshold: 0.5,
    quotaWarningSuggestion: { id: "quota", label: "Upgrade", prompt: "Upgrade" },
    fallback: (snapshot) => snapshot.isEmpty ? undefined : { id: "fb", label: "fb", prompt: "fb" },
  });
  assert.equal(derive({ quotaUsedRatio: 0.5 }).id, "quota");
  assert.equal(derive({ quotaUsedRatio: 0.1 }).id, "fb");
});
