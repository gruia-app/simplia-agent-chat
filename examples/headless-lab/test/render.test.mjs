import assert from "node:assert/strict";
import test from "node:test";

import { selectTimelinePage } from "simplia-agent-chat/core";
import { buildDemoState, renderTimelineHtml, resolveDemoSuggestions } from "../main.mjs";

test("renders the newest page as escaped HTML without a framework", () => {
  const state = buildDemoState(6);
  const html = renderTimelineHtml(state, "demo-thread", { limit: 2 });

  assert.match(html, /data-total="6"/);
  assert.match(html, /Turn 6 message/);
  assert.match(html, /Turn 5 message/);
  assert.doesNotMatch(html, /Turn 4 message/);
  assert.match(html, /data-cursor="turn:turn-005"/);
});

test("pages backwards with the opaque cursor until the oldest turn", () => {
  const state = buildDemoState(4);
  const first = selectTimelinePage(state, "demo-thread", { limit: 2 });
  const html = renderTimelineHtml(state, "demo-thread", { limit: 2, cursor: first.page.nextCursor });

  assert.match(html, /Turn 1 message/);
  assert.match(html, /Turn 2 message/);
  assert.doesNotMatch(html, /data-cursor=/);
});

test("invalid cursor renders a fail-closed marker instead of throwing", () => {
  const state = buildDemoState(2);
  assert.equal(
    renderTimelineHtml(state, "demo-thread", { cursor: "bogus" }),
    '<p class="timeline-error">invalid cursor</p>',
  );
});

test("item text is escaped against markup injection", () => {
  const state = buildDemoState(1);
  const item = Object.values(state.items)[0];
  item.text = '<img src=x onerror=alert(1)>';
  const html = renderTimelineHtml(state, "demo-thread");

  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img/);
});

test("quota-pressure snapshot resolves the derived suggestion last", () => {
  const suggestions = resolveDemoSuggestions();
  assert.deepEqual(suggestions.map((s) => s.id), ["resume", "quota", "upgrade"]);
});
