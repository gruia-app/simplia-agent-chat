import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  beginInteractionResolution,
  cancelApprovalConfirmation,
  AgentChatShell,
  ChatComposer,
  ChatTimeline,
  createInteractionResolutionState,
  isAffirmativeDecision,
  PendingInteractions,
  ReactSurfaceRegistry,
  selectApprovalDecision,
  SurfaceHost,
  unlockInteractionResolution,
} from "../dist/index.js";

const threadId = "thread-test";
const emptyState = {
  version: 1,
  threads: {},
  turns: {},
  items: {},
  surfaces: {},
  interactions: {},
  usageByThread: {},
  streamSequences: {},
  seenEventIds: [],
  resyncRequests: {},
  warnings: [],
};

async function withDom(run) {
  const window = new Window({ url: "https://agent-chat.test/" });
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map(
    Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  try {
    await run(window);
  } finally {
    window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test("composer exposes its application-specific aria label", () => {
  const html = renderToStaticMarkup(
    createElement(ChatComposer, {
      ariaLabel: "Message the ACV2 release agent",
      onSubmit() {},
    }),
  );

  assert.match(html, /aria-label="Message the ACV2 release agent"/);
  assert.match(html, /Shift\+Enter/);
  assert.match(html, /type="submit"/);
});

test("shell exposes generic context rail and application-specific empty copy", () => {
  const html = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state: emptyState,
      threadId,
      surfaceRegistry: new ReactSurfaceRegistry(),
      title: "Application copilot",
      contextRail: createElement("nav", { "aria-label": "Context actions" }, "Context rail"),
      emptyLabel: "Ask about this application.",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
    }),
  );

  assert.match(html, /class="sac-context-rail"/);
  assert.match(html, /aria-label="Context actions"/);
  assert.match(html, /Ask about this application\./);
});

test("shell accepts an application composer and message renderer without forking the timeline", () => {
  const state = {
    ...emptyState,
    threads: {
      [threadId]: { id: threadId, status: "idle" },
    },
    turns: {
      "turn-1": { id: "turn-1", threadId, status: "completed", itemIds: ["message-1"] },
    },
    items: {
      "message-1": {
        id: "message-1",
        threadId,
        turnId: "turn-1",
        kind: "message",
        role: "assistant",
        status: "completed",
        text: "Open C:/workspace/report.md",
      },
    },
  };
  const html = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state,
      threadId,
      surfaceRegistry: new ReactSurfaceRegistry(),
      title: "Application copilot",
      composer: createElement("div", { "data-app-composer": "attachments" }, "Voice and files"),
      renderMessage: (item) => createElement("button", { type: "button" }, item.text),
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
    }),
  );

  assert.match(html, /data-app-composer="attachments"/);
  assert.match(html, /<button type="button">Open C:\/workspace\/report\.md<\/button>/);
  assert.doesNotMatch(html, /<textarea/);
});

test("approval markup exposes confirmation and omits payload", () => {
  const html = renderToStaticMarkup(
    createElement(PendingInteractions, {
      interactions: [
        {
          id: "approval-1",
          threadId,
          kind: "approval",
          status: "pending",
          title: "Run production smoke?",
          payload: { secret: "interaction-secret-payload" },
          availableDecisions: ["Approve once", "Deny"],
        },
      ],
      onResolve() {},
    }),
  );

  assert.match(html, /APPROVAL_REQUIRED/);
  assert.match(html, /Approve once/);
  assert.match(html, /Deny/);
  assert.match(html, /requires Confirm/);
  assert.doesNotMatch(html, /interaction-secret-payload/);
  assert.doesNotMatch(html, /window\.confirm/);

  const confirming = selectApprovalDecision(createInteractionResolutionState(), "Deny");
  assert.equal(confirming.confirmation, "Deny");
});

test("question answer label names the interaction and omits payload", () => {
  const html = renderToStaticMarkup(
    createElement(PendingInteractions, {
      interactions: [
        {
          id: "question-1",
          threadId,
          kind: "question",
          status: "pending",
          title: "Which channel?",
          payload: { secret: "question-secret-payload" },
        },
      ],
      onResolve() {},
    }),
  );

  assert.match(html, /Answer for Which channel\?/);
  assert.doesNotMatch(html, /question-secret-payload/);
});

test("affirmative decisions use an exact allowlist", () => {
  assert.equal(isAffirmativeDecision("approve"), true);
  assert.equal(isAffirmativeDecision("Approve"), true);
  assert.equal(isAffirmativeDecision("disapprove"), false);
  assert.equal(isAffirmativeDecision("Approve once"), false);

  const html = renderToStaticMarkup(
    createElement(PendingInteractions, {
      interactions: [
        {
          id: "approval-2",
          threadId,
          kind: "approval",
          status: "pending",
          title: "Ship?",
          payload: { secret: "classifier-secret" },
          availableDecisions: ["disapprove", "approve"],
        },
      ],
      onResolve() {},
    }),
  );

  const disapprove = html.match(/<button[^>]*>disapprove<\/button>/);
  const approve = html.match(/<button[^>]*>approve<\/button>/);
  assert.ok(disapprove);
  assert.ok(approve);
  assert.doesNotMatch(disapprove[0], /sac-button-primary/);
  assert.match(approve[0], /sac-button-primary/);
  assert.doesNotMatch(html, /classifier-secret/);
});

test("resolution helpers suppress double submit and unlock after rejection", () => {
  const first = beginInteractionResolution(createInteractionResolutionState());
  assert.equal(first.accepted, true);
  assert.equal(first.state.inFlight, true);

  const second = beginInteractionResolution(first.state);
  assert.equal(second.accepted, false);
  assert.equal(second.state.inFlight, true);

  const unlocked = unlockInteractionResolution(first.state);
  assert.equal(unlocked.inFlight, false);
  const third = beginInteractionResolution(unlocked);
  assert.equal(third.accepted, true);

  const confirming = selectApprovalDecision(createInteractionResolutionState(), "approve");
  assert.equal(confirming.confirmation, "approve");
  assert.equal(selectApprovalDecision(confirming, "deny").confirmation, "approve");
  assert.equal(cancelApprovalConfirmation(confirming).confirmation, undefined);
  assert.equal(cancelApprovalConfirmation(first.state).inFlight, true);
  assert.equal(unlockInteractionResolution(confirming).confirmation, "approve");
});

test("approval confirmation focuses, submits once, and unlocks with a safe error", async () => {
  await withDom(async ({ document }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let rejectResolution;
    let calls = 0;
    const pendingResolution = new Promise((_, reject) => {
      rejectResolution = reject;
    });

    await act(async () => {
      root.render(createElement(PendingInteractions, {
        interactions: [{
          id: "approval-live",
          threadId,
          turnId: "turn-live",
          kind: "approval",
          status: "pending",
          title: "Apply production change?",
          payload: { secret: "live-secret-must-not-render" },
          availableDecisions: ["approve"],
        }],
        onResolve() {
          calls += 1;
          return pendingResolution;
        },
      }));
    });

    const choose = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "approve");
    assert.ok(choose);
    await act(async () => choose.click());

    const confirm = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Confirm approve");
    assert.ok(confirm);
    assert.equal(document.activeElement, confirm);
    assert.match(container.textContent, /Confirm decision: approve/);
    assert.doesNotMatch(container.textContent, /live-secret-must-not-render/);

    await act(async () => {
      confirm.click();
      confirm.click();
    });
    assert.equal(calls, 1);
    assert.equal(confirm.disabled, true);

    await act(async () => {
      rejectResolution(new Error("internal-secret-error"));
      await pendingResolution.catch(() => undefined);
    });
    assert.match(container.textContent, /could not be submitted/);
    assert.doesNotMatch(container.textContent, /internal-secret-error/);
    assert.equal(confirm.disabled, false);

    await act(async () => root.unmount());
  });
});

test("unknown and invalid surfaces fail closed without exposing their payload", () => {
  const registry = new ReactSurfaceRegistry();
  const unknown = {
    id: "unknown-surface",
    threadId,
    kind: "external.untrusted-widget",
    schemaVersion: 1,
    revision: 1,
    status: "ready",
    payload: { secret: "must-not-render" },
  };
  const unknownHtml = renderToStaticMarkup(createElement(SurfaceHost, { block: unknown, registry }));
  assert.match(unknownHtml, /SURFACE_UNAVAILABLE/);
  assert.match(unknownHtml, /No trusted renderer/);
  assert.doesNotMatch(unknownHtml, /must-not-render/);

  registry.register({
    kind: "known.surface",
    versions: [1],
    validate() {
      throw new Error("bad payload");
    },
    summarize() {
      return "Known";
    },
    getA11yLabel() {
      return "Known surface";
    },
    component() {
      return createElement("p", null, "should not render");
    },
  });
  const invalidHtml = renderToStaticMarkup(
    createElement(SurfaceHost, {
      block: { ...unknown, kind: "known.surface" },
      registry,
    }),
  );
  assert.match(invalidHtml, /did not pass its local schema/);
  assert.doesNotMatch(invalidHtml, /should not render/);
  assert.doesNotMatch(invalidHtml, /bad payload/);
  assert.doesNotMatch(invalidHtml, /must-not-render/);
});

test("getA11yLabel and summarize failures fail closed without payload or exception text", () => {
  const secret = "payload-secret-must-not-render";
  const exceptionText = "plugin-exception-must-not-render";
  const registry = new ReactSurfaceRegistry();

  registry.register({
    kind: "throw.a11y",
    versions: [1],
    validate(value) {
      return value;
    },
    summarize() {
      return "A11y summary must not render";
    },
    getA11yLabel() {
      throw new Error(exceptionText);
    },
    component() {
      return createElement("p", null, "a11y-renderer-must-not-show");
    },
  });
  const a11yHtml = renderToStaticMarkup(
    createElement(SurfaceHost, {
      block: {
        id: "a11y-throw",
        threadId,
        kind: "throw.a11y",
        schemaVersion: 1,
        revision: 1,
        status: "ready",
        presentation: { title: "Trusted presentation" },
        payload: { secret },
      },
      registry,
    }),
  );
  assert.match(a11yHtml, /SURFACE_UNAVAILABLE/);
  assert.match(a11yHtml, /Trusted presentation/);
  assert.match(a11yHtml, /throw\.a11y/);
  assert.match(a11yHtml, /v1/);
  assert.doesNotMatch(a11yHtml, new RegExp(secret));
  assert.doesNotMatch(a11yHtml, new RegExp(exceptionText));
  assert.doesNotMatch(a11yHtml, /A11y summary must not render/);
  assert.doesNotMatch(a11yHtml, /a11y-renderer-must-not-show/);

  registry.register({
    kind: "throw.summarize",
    versions: [1],
    validate(value) {
      return value;
    },
    summarize() {
      throw new Error(exceptionText);
    },
    getA11yLabel() {
      return "Summarize a11y must not render";
    },
    component() {
      return createElement("p", null, "summarize-renderer-must-not-show");
    },
  });
  const summarizeHtml = renderToStaticMarkup(
    createElement(SurfaceHost, {
      block: {
        id: "summarize-throw",
        threadId,
        kind: "throw.summarize",
        schemaVersion: 1,
        revision: 1,
        status: "ready",
        payload: { secret },
      },
      registry,
    }),
  );
  assert.match(summarizeHtml, /SURFACE_UNAVAILABLE/);
  assert.match(summarizeHtml, /throw\.summarize/);
  assert.match(summarizeHtml, /v1/);
  assert.doesNotMatch(summarizeHtml, new RegExp(secret));
  assert.doesNotMatch(summarizeHtml, new RegExp(exceptionText));
  assert.doesNotMatch(summarizeHtml, /Summarize a11y must not render/);
  assert.doesNotMatch(summarizeHtml, /summarize-renderer-must-not-show/);
});

test("timeline exposes log semantics and an empty state", () => {
  const html = renderToStaticMarkup(
    createElement(ChatTimeline, {
      state: emptyState,
      threadId,
      surfaceRegistry: new ReactSurfaceRegistry(),
    }),
  );
  assert.match(html, /No messages yet/);

  const populatedState = {
    ...emptyState,
    threads: {
      [threadId]: { id: threadId, appKey: "test", status: "active" },
    },
    turns: {
      "turn-1": {
        id: "turn-1",
        threadId,
        status: "completed",
        itemIds: ["message-1"],
      },
    },
    items: {
      "message-1": {
        id: "message-1",
        threadId,
        turnId: "turn-1",
        kind: "message",
        status: "completed",
        role: "assistant",
        text: "Evidence is ready.",
      },
    },
  };
  const populatedHtml = renderToStaticMarkup(
    createElement(ChatTimeline, {
      state: populatedState,
      threadId,
      surfaceRegistry: new ReactSurfaceRegistry(),
    }),
  );
  assert.match(populatedHtml, /role="log"/);
  assert.match(populatedHtml, /aria-live="off"/);
  assert.match(populatedHtml, /Evidence is ready/);
});
