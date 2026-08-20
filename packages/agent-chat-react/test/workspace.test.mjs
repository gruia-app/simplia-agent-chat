import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AGENT_CHAT_WORKSPACE_PANE_IDS,
  AgentChatShell,
  AgentChatWorkspace,
  ReactSurfaceRegistry,
} from "../dist/index.js";

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

function paneOrder(html) {
  return [
    AGENT_CHAT_WORKSPACE_PANE_IDS.history,
    AGENT_CHAT_WORKSPACE_PANE_IDS.conversation,
    AGENT_CHAT_WORKSPACE_PANE_IDS.workQueue,
    AGENT_CHAT_WORKSPACE_PANE_IDS.workbench,
  ]
    .map((id) => ({ id, index: html.indexOf(`data-sac-pane="${id}"`) }))
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.id);
}

test("workspace home layout keeps history and conversation in DOM order", () => {
  const html = renderToStaticMarkup(
    createElement(AgentChatWorkspace, {
      ariaLabel: "Operator workspace",
      historyLabel: "Session history",
      history: "History pane",
      conversation: "Conversation pane",
      theme: "light",
      className: "app-workspace",
    }),
  );

  assert.match(html, /role="region"/);
  assert.match(html, /aria-label="Operator workspace"/);
  assert.match(html, /data-sac-workspace=""/);
  assert.match(html, /data-sac-workspace-layout="home"/);
  assert.match(html, /data-sac-theme="light"/);
  assert.match(html, /class="sac-workspace app-workspace"/);
  assert.match(html, /aria-label="Session history"/);
  assert.deepEqual(paneOrder(html), [
    AGENT_CHAT_WORKSPACE_PANE_IDS.history,
    AGENT_CHAT_WORKSPACE_PANE_IDS.conversation,
  ]);
  assert.doesNotMatch(html, /data-sac-pane="workQueue"/);
  assert.doesNotMatch(html, /data-sac-pane="workbench"/);
  assert.doesNotMatch(html, /<header class="sac-workspace-header"/);
  assert.doesNotMatch(html, /<button/);
});

test("workspace work layout renders four panes with required labels", () => {
  const html = renderToStaticMarkup(
    createElement(AgentChatWorkspace, {
      ariaLabel: "Work workspace",
      historyLabel: "History",
      history: "History pane",
      conversation: "Conversation pane",
      workQueueLabel: "Queue",
      workQueue: "Queue pane",
      workbenchLabel: "Workbench",
      workbench: "Workbench pane",
    }),
  );

  assert.match(html, /data-sac-workspace-layout="work"/);
  assert.match(html, /aria-label="Queue"/);
  assert.match(html, /aria-label="Workbench"/);
  assert.deepEqual(paneOrder(html), [
    AGENT_CHAT_WORKSPACE_PANE_IDS.history,
    AGENT_CHAT_WORKSPACE_PANE_IDS.conversation,
    AGENT_CHAT_WORKSPACE_PANE_IDS.workQueue,
    AGENT_CHAT_WORKSPACE_PANE_IDS.workbench,
  ]);
  assert.match(html, /<nav class="sac-workspace-pane sac-workspace-history"/);
  assert.match(html, /<aside class="sac-workspace-pane sac-workspace-queue"/);
  assert.match(html, /<section class="sac-workspace-pane sac-workspace-workbench"/);
});

test("structured panes pin header body and footer without inventing chrome", () => {
  const html = renderToStaticMarkup(
    createElement(AgentChatWorkspace, {
      ariaLabel: "Pinned workspace",
      historyLabel: "History",
      header: "Application header",
      history: {
        header: "History header",
        body: "History body",
        footer: "History footer",
      },
      conversation: "Conversation pane",
    }),
  );

  assert.match(html, /<header class="sac-workspace-header">Application header<\/header>/);
  assert.match(html, /<div class="sac-workspace-pane-header">History header<\/div>/);
  assert.match(html, /<div class="sac-workspace-pane-body">History body<\/div>/);
  assert.match(html, /<div class="sac-workspace-pane-footer">History footer<\/div>/);
  assert.doesNotMatch(html, /<button/);
});

test("visiblePanes false unmounts that pane and omitted slots stay absent", () => {
  const html = renderToStaticMarkup(
    createElement(AgentChatWorkspace, {
      ariaLabel: "Controlled workspace",
      historyLabel: "History",
      history: "History pane",
      conversation: "Conversation pane",
      workQueueLabel: "Queue",
      workQueue: "Queue pane",
      workbenchLabel: "Workbench",
      workbench: "Workbench pane",
      visiblePanes: {
        history: true,
        conversation: true,
        workQueue: false,
        workbench: false,
      },
    }),
  );

  assert.match(html, /data-sac-workspace-layout="home"/);
  assert.deepEqual(paneOrder(html), [
    AGENT_CHAT_WORKSPACE_PANE_IDS.history,
    AGENT_CHAT_WORKSPACE_PANE_IDS.conversation,
  ]);
  assert.doesNotMatch(html, /data-sac-pane="workQueue"/);
  assert.doesNotMatch(html, /Queue pane/);
  assert.doesNotMatch(html, /Workbench pane/);
});

test("runtime-invalid optional labels never make application content disappear", () => {
  const html = renderToStaticMarkup(
    createElement(AgentChatWorkspace, {
      ariaLabel: "Visible content workspace",
      historyLabel: "History",
      history: "History pane",
      conversation: "Conversation pane",
      workQueueLabel: "",
      workQueue: "Queue must remain visible",
    }),
  );

  assert.match(html, /data-sac-pane="workQueue"/);
  assert.match(html, /Queue must remain visible/);
  assert.match(html, /aria-label=""/);
});

test("workspace does not treat React elements or arrays as structured panes", () => {
  const html = renderToStaticMarkup(
    createElement(AgentChatWorkspace, {
      ariaLabel: "Node workspace",
      historyLabel: "History",
      history: createElement("div", { body: "not-a-slot" }, "Element history"),
      conversation: [
        createElement("span", { key: "one" }, "One"),
        createElement("span", { key: "two" }, "Two"),
      ],
    }),
  );

  assert.match(html, /Element history/);
  assert.match(html, /body="not-a-slot"/);
  assert.doesNotMatch(html, /<div class="sac-workspace-pane-header"/);
  assert.match(html, /<span>One<\/span><span>Two<\/span>/);
});

test("nested conversation shell keeps its marker inside the workspace", () => {
  const html = renderToStaticMarkup(
    createElement(AgentChatWorkspace, {
      ariaLabel: "Nested shell workspace",
      historyLabel: "History",
      history: "History pane",
      conversation: createElement(AgentChatShell, {
        state: emptyState,
        threadId: "thread-test",
        surfaceRegistry: new ReactSurfaceRegistry(),
        title: "Nested conversation",
        composerAriaLabel: "Message nested conversation",
        onSubmit() {},
        onResolveInteraction() {},
      }),
    }),
  );

  assert.match(html, /class="sac-workspace-pane sac-workspace-conversation"/);
  assert.match(html, /class="sac-shell"/);
  assert.match(html, /aria-label="Nested conversation"/);
});
