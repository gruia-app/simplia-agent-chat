import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  AgentChatShell,
  LimitNoticeBar,
  ReactSurfaceRegistry,
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

const NOTICE = {
  kind: "quota_exceeded",
  message: "Has agotado tu cuota mensual.",
  actionLabel: "Upgrade",
  actionId: "billing.upgrade",
};

async function withDom(run) {
  const window = new Window({ url: "https://agent-chat.test/" });
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
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

function shellProps(extra = {}) {
  return {
    state: emptyState,
    threadId,
    surfaceRegistry: new ReactSurfaceRegistry(),
    title: "Test",
    onSubmit: async () => {},
    onResolveInteraction: async () => {},
    composerAriaLabel: "Message",
    ...extra,
  };
}

test("LimitNoticeBar renders an alert with message and CTA", () => {
  const html = renderToStaticMarkup(
    createElement(LimitNoticeBar, { notice: NOTICE, ariaLabel: "Usage limit", onAction() {} }),
  );
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-label="Usage limit"/);
  assert.match(html, /data-limit-kind="quota_exceeded"/);
  assert.match(html, /Has agotado tu cuota mensual\./);
  assert.match(html, /data-action-id="billing\.upgrade"/);
  assert.match(html, />Upgrade</);
});

test("LimitNoticeBar without actionLabel renders no CTA", () => {
  const html = renderToStaticMarkup(
    createElement(LimitNoticeBar, {
      notice: { kind: "rate_limited", message: "Slow down." },
      ariaLabel: "Usage limit",
    }),
  );
  assert.doesNotMatch(html, /sac-limit-notice-action/);
});

test("shell renders the notice and blocks submit while blocking", () => {
  const html = renderToStaticMarkup(createElement(AgentChatShell, shellProps({ limitNotice: NOTICE })));
  assert.match(html, /sac-limit-notice/);
  assert.match(html, /<textarea[^>]*disabled/);
});

test("non-blocking notice keeps the composer editable and submittable", () => {
  const html = renderToStaticMarkup(
    createElement(AgentChatShell, shellProps({
      limitNotice: { kind: "quota_exceeded", message: "At your limit.", blocking: false },
    })),
  );
  assert.match(html, /sac-limit-notice/);
  assert.doesNotMatch(html, /<textarea[^>]*disabled/);
});

test("shell without notice renders no banner and an enabled composer", () => {
  const html = renderToStaticMarkup(createElement(AgentChatShell, shellProps()));
  assert.doesNotMatch(html, /sac-limit-notice/);
  assert.doesNotMatch(html, /<textarea[^>]*disabled/);
});

test("CTA click hands the typed notice to onLimitAction", async () => {
  await withDom(async ({ document }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const received = [];
    await act(async () => {
      root.render(createElement(LimitNoticeBar, {
        notice: NOTICE,
        ariaLabel: "Usage limit",
        onAction: (notice) => received.push(notice),
      }));
    });
    const button = container.querySelector(".sac-limit-notice-action");
    assert.ok(button);
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(received.length, 1);
    assert.equal(received[0].actionId, "billing.upgrade");
    await act(async () => root.unmount());
  });
});
