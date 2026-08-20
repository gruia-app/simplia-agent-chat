import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  assertConformance,
  formatConformanceReport,
} from "simplia-agent-chat/core/conformance";
import {
  AGENT_CHAT_WORKSPACE_PANE_IDS,
  AgentChatShell,
  AgentChatWorkspace,
  ReactSurfaceRegistry,
  runSurfaceHostMarkupConformance,
  runWorkspaceMarkupConformance,
  SurfaceHost,
} from "../dist/index.js";

const CANARY = "markup-canary-secret-value";

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

function reportText(report) {
  return `${formatConformanceReport(report)}\n${report.checks.map((check) => check.detail).join("\n")}`;
}

test("workspace markup conformance accepts home and work fixtures", () => {
  const homeHtml = renderToStaticMarkup(
    createElement(AgentChatWorkspace, {
      ariaLabel: "Home workspace",
      historyLabel: "History",
      history: "History pane",
      conversation: "Conversation pane",
    }),
  );
  const home = runWorkspaceMarkupConformance({
    html: homeHtml,
    expected: {
      ariaLabel: "Home workspace",
      historyLabel: "History",
      layout: "home",
      visiblePanes: [
        AGENT_CHAT_WORKSPACE_PANE_IDS.history,
        AGENT_CHAT_WORKSPACE_PANE_IDS.conversation,
      ],
      textOnly: true,
    },
  });
  assert.equal(home.ok, true);
  assertConformance(home);

  const workHtml = renderToStaticMarkup(
    createElement(AgentChatWorkspace, {
      ariaLabel: "Work workspace",
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
      workQueueLabel: "Queue",
      workQueue: "Queue pane",
      workbenchLabel: "Workbench",
      workbench: "Workbench pane",
    }),
  );
  const work = runWorkspaceMarkupConformance({
    html: workHtml,
    expected: {
      ariaLabel: "Work workspace",
      historyLabel: "History",
      layout: "work",
      visiblePanes: [
        AGENT_CHAT_WORKSPACE_PANE_IDS.history,
        AGENT_CHAT_WORKSPACE_PANE_IDS.conversation,
        AGENT_CHAT_WORKSPACE_PANE_IDS.workQueue,
        AGENT_CHAT_WORKSPACE_PANE_IDS.workbench,
      ],
      workQueueLabel: "Queue",
      workbenchLabel: "Workbench",
      nestedShell: true,
    },
  });
  assert.equal(work.ok, true);
});

test("workspace markup conformance fails closed without echoing html or canaries", () => {
  const report = runWorkspaceMarkupConformance({
    html: `<div data-secret="${CANARY}"><button type="button">Switch</button></div>`,
    expected: {
      ariaLabel: "Missing workspace",
      historyLabel: "History",
      layout: "home",
      visiblePanes: [
        AGENT_CHAT_WORKSPACE_PANE_IDS.history,
        AGENT_CHAT_WORKSPACE_PANE_IDS.conversation,
      ],
      textOnly: true,
      canary: CANARY,
    },
  });

  assert.equal(report.ok, false);
  assert.ok(report.checks.some((check) => check.id === "workspace.region" && !check.passed));
  assert.ok(report.checks.some((check) => check.id === "workspace.no-library-nav" && !check.passed));
  assert.ok(report.checks.some((check) => check.id === "workspace.canary-isolation" && !check.passed));
  assert.doesNotMatch(reportText(report), new RegExp(CANARY));
  assert.doesNotMatch(reportText(report), /<button/);
  assert.throws(() => assertConformance(report));
});

test("surface host markup conformance covers fallback canary isolation", () => {
  const html = renderToStaticMarkup(
    createElement(SurfaceHost, {
      block: {
        id: "surface-1",
        threadId: "thread-1",
        kind: "consumer.example",
        schemaVersion: 1,
        revision: 1,
        status: "ready",
        payload: { secret: CANARY },
      },
      registry: new ReactSurfaceRegistry(),
    }),
  );

  const report = runSurfaceHostMarkupConformance({
    html,
    expected: {
      fallback: true,
      kind: "consumer.example",
      canary: CANARY,
    },
  });
  assert.equal(report.ok, true);
  assert.doesNotMatch(html, new RegExp(CANARY));
  assert.doesNotMatch(reportText(report), new RegExp(CANARY));

  const leaked = runSurfaceHostMarkupConformance({
    html: `<section class="sac-surface-fallback">${CANARY}</section>`,
    expected: {
      fallback: true,
      canary: CANARY,
    },
  });
  assert.equal(leaked.ok, false);
  assert.equal(
    leaked.checks.find((check) => check.id === "surface-host.canary-isolation").detail,
    "markup leaked the payload canary",
  );
  assert.doesNotMatch(reportText(leaked), new RegExp(CANARY));
});

test("workspace conformance scopes labels and nested shells to their own panes", () => {
  const misplaced = runWorkspaceMarkupConformance({
    html: `<div data-sac-workspace="" role="region" data-sac-workspace-layout="home"><span aria-label="Workspace"></span><nav data-sac-pane="history"></nav><div data-sac-pane="conversation"></div><div class="sac-shell"></div><span aria-label="History"></span></div>`,
    expected: {
      ariaLabel: "Workspace",
      historyLabel: "History",
      layout: "home",
      visiblePanes: [
        AGENT_CHAT_WORKSPACE_PANE_IDS.conversation,
        AGENT_CHAT_WORKSPACE_PANE_IDS.history,
      ],
      nestedShell: true,
    },
  });

  assert.equal(misplaced.ok, false);
  assert.equal(misplaced.checks.find((check) => check.id === "workspace.region").passed, false);
  assert.equal(misplaced.checks.find((check) => check.id === "workspace.history-label").passed, false);
  assert.equal(misplaced.checks.find((check) => check.id === "workspace.nested-shell").passed, false);

  const deceptiveAttribute = runWorkspaceMarkupConformance({
    html: `<span data-info='data-sac-workspace=""' role="region" aria-label="Workspace" data-sac-workspace-layout="home"></span><nav data-sac-pane="history" aria-label="History"></nav><div data-sac-pane="conversation"></div>`,
    expected: {
      ariaLabel: "Workspace",
      historyLabel: "History",
      layout: "home",
      visiblePanes: [
        AGENT_CHAT_WORKSPACE_PANE_IDS.history,
        AGENT_CHAT_WORKSPACE_PANE_IDS.conversation,
      ],
    },
  });
  assert.equal(deceptiveAttribute.checks.find((check) => check.id === "workspace.region").passed, false);
});

test("workspace conformance normalizes caller pane order and rejects blank labels", () => {
  const html = renderToStaticMarkup(
    createElement(AgentChatWorkspace, {
      ariaLabel: "Workspace",
      historyLabel: "History",
      history: "History pane",
      conversation: "Conversation pane",
    }),
  );
  const normalized = runWorkspaceMarkupConformance({
    html,
    expected: {
      ariaLabel: "Workspace",
      historyLabel: "History",
      layout: "home",
      visiblePanes: [
        AGENT_CHAT_WORKSPACE_PANE_IDS.conversation,
        AGENT_CHAT_WORKSPACE_PANE_IDS.history,
      ],
    },
  });
  assert.equal(normalized.ok, true);

  const blank = runWorkspaceMarkupConformance({
    html,
    expected: {
      ariaLabel: " ",
      historyLabel: "\n",
      layout: "home",
      visiblePanes: [
        AGENT_CHAT_WORKSPACE_PANE_IDS.history,
        AGENT_CHAT_WORKSPACE_PANE_IDS.conversation,
      ],
    },
  });
  assert.equal(blank.ok, false);
});

test("markup conformance detects escaped canaries and ignores unrelated surface markers", () => {
  const encodedCanary = '<secret "value">';
  const workspace = runWorkspaceMarkupConformance({
    html: `<div data-sac-workspace="" role="region" aria-label="Workspace" data-sac-workspace-layout="home"><nav data-sac-pane="history" aria-label="History">&lt;secret &quot;value&quot;&gt;</nav><div data-sac-pane="conversation"></div></div>`,
    expected: {
      ariaLabel: "Workspace",
      historyLabel: "History",
      layout: "home",
      visiblePanes: [
        AGENT_CHAT_WORKSPACE_PANE_IDS.history,
        AGENT_CHAT_WORKSPACE_PANE_IDS.conversation,
      ],
      canary: encodedCanary,
    },
  });
  assert.equal(workspace.checks.find((check) => check.id === "workspace.canary-isolation").passed, false);

  const unrelated = runSurfaceHostMarkupConformance({
    html: `<div class="sac-surface-fallbackish">consumer.example</div>`,
    expected: { fallback: true, kind: "consumer.example" },
  });
  assert.equal(unrelated.ok, false);
});
