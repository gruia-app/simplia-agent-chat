import {
  createAccountSnapshotDerive,
  createChatSuggestionRegistry,
  replayChatEvents,
  resolveChatSuggestions,
  selectTimelinePage,
  CHAT_PROTOCOL_VERSION,
} from "simplia-agent-chat/core";

const ISO = "2026-09-21T12:00:00.000Z";

function event(type, payload, overrides = {}) {
  return {
    protocolVersion: CHAT_PROTOCOL_VERSION,
    id: overrides.id ?? `demo:${type}:${overrides.turnId ?? "plain"}`,
    type,
    source: "headless-lab",
    occurredAt: ISO,
    threadId: "demo-thread",
    payload,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildDemoState(turnCount = 6) {
  const turns = [];
  const items = [];
  for (let index = 1; index <= turnCount; index += 1) {
    const turnId = `turn-${String(index).padStart(3, "0")}`;
    const itemId = `item-${index}`;
    items.push({
      id: itemId,
      threadId: "demo-thread",
      turnId,
      kind: "message",
      role: index % 2 === 0 ? "assistant" : "user",
      status: "completed",
      text: `Turn ${index} message`,
    });
    turns.push({ id: turnId, threadId: "demo-thread", status: "completed", itemIds: [itemId] });
  }
  return replayChatEvents([
    event("thread.snapshot", {
      thread: { id: "demo-thread", appKey: "headless-lab", organizationId: "org-demo", status: "active" },
      turns,
      items,
      surfaces: [],
      interactions: [],
    }),
  ]);
}

export function renderTimelineHtml(state, threadId, { limit = 3, cursor } = {}) {
  const result = selectTimelinePage(state, threadId, { limit, ...(cursor ? { cursor } : {}) });
  if (!result.ok) return `<p class="timeline-error">invalid cursor</p>`;
  const rows = result.page.entries
    .flatMap((entry) =>
      entry.items.map(
        (item) =>
          `<article class="msg msg-${escapeHtml(item.role ?? "unknown")}" data-turn="${escapeHtml(entry.turn.id)}">` +
          `<p>${escapeHtml(item.text ?? "")}</p></article>`,
      ),
    )
    .join("");
  const older = result.page.hasMore
    ? `<button data-cursor="${escapeHtml(result.page.nextCursor)}">Load older</button>`
    : "";
  return `<section class="timeline" data-total="${result.page.totalTurns}">${older}${rows}</section>`;
}

export function resolveDemoSuggestions() {
  const created = createChatSuggestionRegistry({
    staticSuggestions: [
      { id: "resume", label: "Resume work", prompt: "Resume the pending work item" },
      { id: "quota", label: "Check quota", prompt: "Check my quota usage" },
    ],
    derive: createAccountSnapshotDerive({
      emptyAccountSuggestion: { id: "first", label: "Create your first project", prompt: "Create my first project" },
      quotaWarningSuggestion: { id: "upgrade", label: "Upgrade plan", prompt: "Help me upgrade my plan" },
    }),
  });
  if (!created.ok) throw new Error(`registry_failed:${created.reason}`);
  return resolveChatSuggestions(created.registry, { context: { isEmpty: false, quotaUsedRatio: 0.82 } });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const state = buildDemoState();
  const firstPage = renderTimelineHtml(state, "demo-thread");
  console.log(firstPage);
  const next = selectTimelinePage(state, "demo-thread", { limit: 3 });
  const older = renderTimelineHtml(state, "demo-thread", { limit: 3, cursor: next.page.nextCursor });
  console.log(older);
  console.log(resolveDemoSuggestions().map((s) => `- ${s.label}`).join("\n"));
}
