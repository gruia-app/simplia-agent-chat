import assert from "node:assert/strict";
import test from "node:test";

import {
  purgeThreadFromState,
  replayChatEvents,
  selectThreadTurns,
  selectTurnItems,
} from "../dist/index.js";
import { baseInteraction, baseItem, baseSurface, baseThread, baseTurn, chatEvent } from "./helpers.mjs";

function twoThreadState() {
  return replayChatEvents([
    chatEvent("thread.snapshot", {
      thread: baseThread({ id: "thread-1" }),
      turns: [baseTurn({ id: "turn-1", threadId: "thread-1", itemIds: ["item-1"] })],
      items: [baseItem({ id: "item-1", threadId: "thread-1", turnId: "turn-1" })],
      surfaces: [baseSurface({ id: "surface-1", threadId: "thread-1", turnId: "turn-1" })],
      interactions: [baseInteraction({ id: "interaction-1", threadId: "thread-1", turnId: "turn-1" })],
      usage: { totalTokens: 42 },
    }, { id: "snap-1", threadId: "thread-1" }),
    chatEvent("thread.snapshot", {
      thread: baseThread({ id: "thread-2" }),
      turns: [baseTurn({ id: "turn-2", threadId: "thread-2", itemIds: ["item-2"] })],
      items: [baseItem({ id: "item-2", threadId: "thread-2", turnId: "turn-2" })],
      surfaces: [],
      interactions: [],
      usage: { totalTokens: 7 },
    }, { id: "snap-2", threadId: "thread-2" }),
  ]);
}

test("purge removes every thread-owned entity and keeps other threads", () => {
  const state = twoThreadState();
  const purged = purgeThreadFromState(state, "thread-1");

  assert.equal(purged.threads["thread-1"], undefined);
  assert.deepEqual(selectThreadTurns(purged, "thread-1"), []);
  assert.deepEqual(selectTurnItems(purged, "turn-1"), []);
  assert.equal(purged.items["item-1"], undefined);
  assert.equal(purged.surfaces["surface-1"], undefined);
  assert.equal(purged.interactions["interaction-1"], undefined);
  assert.equal(purged.usageByThread["thread-1"], undefined);

  assert.ok(purged.threads["thread-2"]);
  assert.equal(selectThreadTurns(purged, "thread-2").length, 1);
  assert.equal(purged.items["item-2"].text !== undefined, true);
  assert.equal(purged.usageByThread["thread-2"].totalTokens, 7);

  assert.ok(state.threads["thread-1"], "input state must not be mutated");
});

test("purge keeps replay guards so late duplicates cannot resurrect", () => {
  const state = twoThreadState();
  const purged = purgeThreadFromState(state, "thread-1");
  assert.deepEqual(purged.seenEventIds, state.seenEventIds);
});

test("purge of an unknown thread is a no-op returning the same state", () => {
  const state = twoThreadState();
  assert.strictEqual(purgeThreadFromState(state, "missing"), state);
});
