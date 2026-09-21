import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TIMELINE_PAGE_LIMIT,
  MAX_TIMELINE_PAGE_LIMIT,
  createTimelineCursor,
  replayChatEvents,
  selectTimelinePage,
} from "../dist/index.js";
import { baseItem, baseThread, baseTurn, chatEvent } from "./helpers.mjs";

function turnId(index) {
  return `turn-${String(index).padStart(3, "0")}`;
}

function stateWithTurns(count, { itemsPerTurn = 1, threadId = "thread-1", idPrefix = "turn" } = {}) {
  const turns = [];
  const items = [];
  for (let index = 1; index <= count; index += 1) {
    const itemIds = [];
    const currentTurnId = `${idPrefix}-${String(index).padStart(3, "0")}`;
    for (let slot = 0; slot < itemsPerTurn; slot += 1) {
      const itemId = `item-${index}-${slot}`;
      itemIds.push(itemId);
      items.push(baseItem({ id: itemId, turnId: currentTurnId, threadId, text: `item ${index}.${slot}` }));
    }
    turns.push(baseTurn({ id: currentTurnId, threadId, status: "completed", itemIds }));
  }
  return replayChatEvents([
    chatEvent("thread.snapshot", {
      thread: baseThread({ id: threadId }),
      turns,
      items,
      surfaces: [],
      interactions: [],
    }, { threadId }),
  ]);
}

test("returns the newest page with resolved items in chronological order", () => {
  const state = stateWithTurns(5, { itemsPerTurn: 2 });
  const result = selectTimelinePage(state, "thread-1", { limit: 3 });

  assert.equal(result.ok, true);
  assert.equal(result.page.totalTurns, 5);
  assert.equal(result.page.hasMore, true);
  assert.deepEqual(
    result.page.entries.map((entry) => entry.turn.id),
    ["turn-003", "turn-004", "turn-005"],
  );
  assert.deepEqual(
    result.page.entries[0].items.map((item) => item.id),
    ["item-3-0", "item-3-1"],
  );
});

test("cursor pages backwards until the oldest turn without gaps or repeats", () => {
  const state = stateWithTurns(7);
  const seen = [];
  let cursor;

  for (let page = 0; page < 10; page += 1) {
    const result = selectTimelinePage(state, "thread-1", { limit: 3, ...(cursor ? { cursor } : {}) });
    assert.equal(result.ok, true);
    seen.unshift(...result.page.entries.map((entry) => entry.turn.id));
    if (!result.page.hasMore) break;
    cursor = result.page.nextCursor;
  }

  assert.deepEqual(seen, Array.from({ length: 7 }, (_, i) => turnId(i + 1)));
});

test("rejects malformed, unknown and foreign-thread cursors", () => {
  const state = stateWithTurns(3);
  const foreign = stateWithTurns(3, { threadId: "thread-2", idPrefix: "foreign-turn" });

  assert.equal(selectTimelinePage(state, "thread-1", { cursor: "nope" }).reason, "invalid_cursor");
  assert.equal(selectTimelinePage(state, "thread-1", { cursor: "turn:" }).reason, "invalid_cursor");
  assert.equal(selectTimelinePage(state, "thread-1", { cursor: "turn:missing" }).reason, "invalid_cursor");
  assert.equal(
    selectTimelinePage(state, "thread-1", { cursor: createTimelineCursor("turn-001") }).ok,
    true,
  );
  const foreignCursor = selectTimelinePage(foreign, "thread-2", { limit: 1 }).page.nextCursor;
  assert.equal(selectTimelinePage(state, "thread-1", { cursor: foreignCursor }).reason, "invalid_cursor");
});

test("clamps limit to defaults and the documented maximum", () => {
  const state = stateWithTurns(MAX_TIMELINE_PAGE_LIMIT + 10);

  assert.equal(selectTimelinePage(state, "thread-1", { limit: 0 }).page.entries.length, DEFAULT_TIMELINE_PAGE_LIMIT);
  assert.equal(selectTimelinePage(state, "thread-1", { limit: -5 }).page.entries.length, DEFAULT_TIMELINE_PAGE_LIMIT);
  assert.equal(selectTimelinePage(state, "thread-1", { limit: Number.NaN }).page.entries.length, DEFAULT_TIMELINE_PAGE_LIMIT);
  assert.equal(
    selectTimelinePage(state, "thread-1", { limit: MAX_TIMELINE_PAGE_LIMIT + 1000 }).page.entries.length,
    MAX_TIMELINE_PAGE_LIMIT,
  );
});

test("empty and unknown threads return an empty page without a cursor", () => {
  const state = stateWithTurns(2);
  const result = selectTimelinePage(state, "unknown-thread");

  assert.equal(result.ok, true);
  assert.deepEqual(result.page.entries, []);
  assert.equal(result.page.hasMore, false);
  assert.equal(result.page.nextCursor, undefined);
  assert.equal(result.page.totalTurns, 0);
});

test("cursor stays valid when newer turns append at the tail", () => {
  const state = stateWithTurns(4);
  const first = selectTimelinePage(state, "thread-1", { limit: 2 });
  const cursor = first.page.nextCursor;

  const appended = replayChatEvents(
    [chatEvent("turn.upsert", baseTurn({ id: "turn-005", status: "completed" }), { id: "new-turn", turnId: "turn-005" })],
    state,
  );

  const paged = selectTimelinePage(appended, "thread-1", { limit: 2, cursor });
  assert.equal(paged.ok, true);
  assert.deepEqual(
    paged.page.entries.map((entry) => entry.turn.id),
    ["turn-001", "turn-002"],
  );
  assert.equal(paged.page.hasMore, false);
  assert.equal(paged.page.totalTurns, 5);
});

test("single-turn page reports hasMore only when older turns exist", () => {
  const state = stateWithTurns(1);
  const result = selectTimelinePage(state, "thread-1", { limit: 10 });

  assert.equal(result.page.hasMore, false);
  assert.equal(result.page.nextCursor, undefined);
});
