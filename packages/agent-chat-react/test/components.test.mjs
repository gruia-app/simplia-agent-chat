import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatComposer,
  ChatTimeline,
  PendingInteractions,
  ReactSurfaceRegistry,
  SurfaceHost,
} from "../dist/index.js";

const threadId = "thread-test";
const emptyState = {
  version: 1,
  threads: {},
  turns: {},
  items: {},
  surfaces: {},
  interactions: {},
  eventCursorByThread: {},
};

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

test("approval is rendered as a first-class pending interaction", () => {
  const html = renderToStaticMarkup(
    createElement(PendingInteractions, {
      interactions: [
        {
          id: "approval-1",
          threadId,
          kind: "approval",
          status: "pending",
          title: "Run production smoke?",
          availableDecisions: ["Approve once", "Deny"],
        },
      ],
      onResolve() {},
    }),
  );

  assert.match(html, /APPROVAL_REQUIRED/);
  assert.match(html, /Approve once/);
  assert.match(html, /Deny/);
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
