import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  beginInteractionResolution,
  beginInterruptRequest,
  cancelApprovalConfirmation,
  AgentChatShell,
  ChatComposer,
  ChatRunStatus,
  ChatTimeline,
  completeInterruptRequest,
  createInteractionResolutionState,
  createInterruptRequestState,
  defaultAgentChatCopy,
  failInterruptRequest,
  isAffirmativeDecision,
  PendingInteractions,
  ProviderAccountPicker,
  ReactSurfaceRegistry,
  reconcileInterruptRequest,
  resetInterruptRequest,
  resolveAgentChatCopy,
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

test("provider account picker exposes account and model selection without credential payloads", () => {
  const html = renderToStaticMarkup(
    createElement(ProviderAccountPicker, {
      providers: [{
        id: "codex_cli",
        displayName: "Codex",
        modes: ["agent"],
        authMethods: ["chatgpt_device", "api_key"],
      }],
      connections: [{
        id: "account-1",
        providerId: "codex_cli",
        label: "Roberto",
        scope: "personal",
        status: "connected",
        authMethod: "chatgpt_device",
        identity: { email: "operator@example.com" },
      }],
      models: [{
        id: "gpt-5.6-sol",
        displayName: "GPT-5.6 Sol",
        providerId: "codex_cli",
        isDefault: true,
      }],
      selectedConnectionId: "account-1",
      selectedModelId: "gpt-5.6-sol",
      accountLabel: "Provider account",
      modelLabel: "Model",
      connectLabel: "Connect provider",
      credentialCanary: "must-not-render",
      onSelectionChange() {},
      onConnect() {},
    }),
  );

  assert.match(html, /Provider account/);
  assert.match(html, /Roberto/);
  assert.match(html, /operator@example.com/);
  assert.match(html, /GPT-5.6 Sol/);
  assert.match(html, /Connect provider/);
  assert.doesNotMatch(html, /must-not-render/);
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

const panelAction = {
  id: "apply-proposal",
  action: "proposal.apply",
  label: "Apply proposal",
  intent: "primary",
};

function placementState(surfaces) {
  return {
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
    surfaces: Object.fromEntries(surfaces.map((surface) => [surface.id, surface])),
  };
}

function createActionRegistry(kind = "test.artifact") {
  const registry = new ReactSurfaceRegistry();
  registry.register({
    kind,
    versions: [1],
    validate(value) {
      return value;
    },
    summarize() {
      return "Artifact";
    },
    getA11yLabel() {
      return "Trusted artifact";
    },
    component({ block, onAction }) {
      return createElement(
        "div",
        { "data-surface-id": block.id },
        (block.actions ?? []).map((action) =>
          createElement(
            "button",
            {
              key: action.id,
              type: "button",
              onClick: () => onAction?.(action),
            },
            action.label,
          ),
        ),
      );
    },
  });
  return registry;
}

test("timeline keeps inline surfaces and omits panel and fullscreen surfaces", () => {
  const state = placementState([
    {
      id: "surface-thread-inline",
      threadId,
      kind: "test.artifact",
      schemaVersion: 1,
      revision: 1,
      status: "ready",
      payload: { source: "thread-inline" },
      presentation: { title: "Thread inline" },
    },
    {
      id: "surface-turn-inline",
      threadId,
      turnId: "turn-1",
      kind: "test.artifact",
      schemaVersion: 1,
      revision: 1,
      status: "ready",
      payload: { source: "turn-inline" },
      presentation: { title: "Turn inline", preferredSurface: "inline" },
    },
    {
      id: "surface-panel",
      threadId,
      turnId: "turn-1",
      kind: "test.artifact",
      schemaVersion: 1,
      revision: 1,
      status: "ready",
      payload: { source: "panel-secret" },
      presentation: { title: "Panel artifact", preferredSurface: "panel" },
    },
    {
      id: "surface-fullscreen",
      threadId,
      kind: "test.artifact",
      schemaVersion: 1,
      revision: 1,
      status: "ready",
      payload: { source: "fullscreen-secret" },
      presentation: { title: "Fullscreen artifact", preferredSurface: "fullscreen" },
    },
  ]);
  const html = renderToStaticMarkup(
    createElement(ChatTimeline, {
      state,
      threadId,
      surfaceRegistry: createActionRegistry(),
    }),
  );

  assert.match(html, /Thread inline/);
  assert.match(html, /Turn inline/);
  assert.doesNotMatch(html, /Panel artifact/);
  assert.doesNotMatch(html, /Fullscreen artifact/);
  assert.doesNotMatch(html, /panel-secret/);
  assert.doesNotMatch(html, /fullscreen-secret/);
});

test("shell without panel surfaces stays single-column", () => {
  const state = placementState([
    {
      id: "surface-inline",
      threadId,
      turnId: "turn-1",
      kind: "test.artifact",
      schemaVersion: 1,
      revision: 1,
      status: "ready",
      payload: { source: "inline-only" },
      presentation: { title: "Inline artifact", preferredSurface: "inline" },
    },
  ]);
  const html = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state,
      threadId,
      surfaceRegistry: createActionRegistry(),
      title: "Application copilot",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
    }),
  );

  assert.match(html, /Inline artifact/);
  assert.doesNotMatch(html, /sac-workspace-with-stage/);
  assert.doesNotMatch(html, /sac-artifact-stage/);
  assert.doesNotMatch(html, />Artifacts</);
});

test("panel surfaces render once in the default stage and stay out of the timeline", () => {
  const state = placementState([
    {
      id: "surface-panel",
      threadId,
      turnId: "turn-1",
      kind: "test.artifact",
      schemaVersion: 1,
      revision: 1,
      status: "ready",
      payload: { source: "panel-only-once" },
      presentation: { title: "Panel artifact", preferredSurface: "panel" },
      actions: [panelAction],
    },
  ]);
  const html = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state,
      threadId,
      surfaceRegistry: createActionRegistry(),
      title: "Application copilot",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
    }),
  );

  assert.match(html, /sac-workspace-with-stage/);
  assert.match(html, /aria-labelledby/);
  assert.match(html, />Artifacts</);
  assert.match(html, /Panel artifact/);
  assert.equal(html.split("Panel artifact").length - 1, 1);
  assert.equal(html.split("data-surface-id=\"surface-panel\"").length - 1, 1);
  assert.match(html, /role="log"/);
  assert.doesNotMatch(html.split("role=\"log\"")[1].split("sac-artifact-stage")[0] ?? "", /Panel artifact/);
});

test("default artifact stage exposes an application-owned label", () => {
  const state = placementState([
    {
      id: "surface-panel",
      threadId,
      kind: "test.artifact",
      schemaVersion: 1,
      revision: 1,
      status: "ready",
      payload: {},
      presentation: { title: "Panel artifact", preferredSurface: "panel" },
    },
  ]);
  const html = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state,
      threadId,
      surfaceRegistry: createActionRegistry(),
      title: "Application copilot",
      artifactStageLabel: "Espacio de trabajo",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
    }),
  );

  assert.match(html, />Espacio de trabajo</);
  assert.doesNotMatch(html, />Artifacts</);
});

test("custom artifact stage receives panel blocks and replaces the default stage", () => {
  const panel = {
    id: "surface-panel",
    threadId,
    turnId: "turn-1",
    kind: "test.artifact",
    schemaVersion: 1,
    revision: 1,
    status: "ready",
    payload: { source: "custom-stage" },
    presentation: { title: "Panel artifact", preferredSurface: "panel" },
    actions: [panelAction],
  };
  const inline = {
    id: "surface-inline",
    threadId,
    turnId: "turn-1",
    kind: "test.artifact",
    schemaVersion: 1,
    revision: 1,
    status: "ready",
    payload: { source: "keep-inline" },
    presentation: { title: "Inline artifact", preferredSurface: "inline" },
  };
  const state = placementState([panel, inline]);
  let received;
  const html = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state,
      threadId,
      surfaceRegistry: createActionRegistry(),
      title: "Application copilot",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
      renderArtifactStage: (props) => {
        received = props;
        return createElement("div", { "data-custom-stage": "panel" }, props.surfaces.map((surface) => surface.id).join(","));
      },
    }),
  );

  assert.ok(received);
  assert.deepEqual(received.surfaces.map((surface) => surface.id), ["surface-panel"]);
  assert.strictEqual(received.surfaces[0], panel);
  assert.match(html, /data-custom-stage="panel"/);
  assert.match(html, /Inline artifact/);
  assert.doesNotMatch(html, />Artifacts</);
  assert.doesNotMatch(html, /data-surface-id="surface-panel"/);
});

test("fullscreen surfaces render only through the host slot", () => {
  const fullscreen = {
    id: "surface-fullscreen",
    threadId,
    kind: "test.artifact",
    schemaVersion: 1,
    revision: 1,
    status: "ready",
    payload: { source: "fullscreen-secret" },
    presentation: { title: "Fullscreen artifact", preferredSurface: "fullscreen" },
  };
  const panel = {
    id: "surface-panel",
    threadId,
    kind: "test.artifact",
    schemaVersion: 1,
    revision: 1,
    status: "ready",
    payload: { source: "panel-in-stage" },
    presentation: { title: "Panel artifact", preferredSurface: "panel" },
  };
  const state = placementState([fullscreen, panel]);
  const withoutSlot = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state,
      threadId,
      surfaceRegistry: createActionRegistry(),
      title: "Application copilot",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
    }),
  );
  assert.match(withoutSlot, /Panel artifact/);
  assert.doesNotMatch(withoutSlot, /Fullscreen artifact/);
  assert.doesNotMatch(withoutSlot, /fullscreen-secret/);
  assert.doesNotMatch(withoutSlot, /role="dialog"/);

  let received;
  const withSlot = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state,
      threadId,
      surfaceRegistry: createActionRegistry(),
      title: "Application copilot",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
      renderFullscreenSurfaces: (props) => {
        received = props;
        return createElement("div", { "data-fullscreen-slot": "host" }, props.surfaces[0].id);
      },
    }),
  );
  assert.ok(received);
  assert.deepEqual(received.surfaces.map((surface) => surface.id), ["surface-fullscreen"]);
  assert.strictEqual(received.surfaces[0], fullscreen);
  assert.match(withSlot, /data-fullscreen-slot="host"/);
  assert.equal(withSlot.split("surface-fullscreen").length - 1, 1);
  assert.doesNotMatch(withSlot, /role="dialog"/);
});

test("unknown panel surfaces fail closed in the default stage", () => {
  const state = placementState([
    {
      id: "surface-unknown-panel",
      threadId,
      turnId: "turn-1",
      kind: "external.untrusted-widget",
      schemaVersion: 1,
      revision: 1,
      status: "ready",
      payload: { secret: "panel-payload-must-not-render" },
      presentation: { title: "Unknown panel", preferredSurface: "panel" },
    },
  ]);
  const html = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state,
      threadId,
      surfaceRegistry: createActionRegistry(),
      title: "Application copilot",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
    }),
  );

  assert.match(html, /SURFACE_UNAVAILABLE/);
  assert.match(html, /Unknown panel/);
  assert.match(html, /No trusted renderer/);
  assert.doesNotMatch(html, /panel-payload-must-not-render/);
});

test("artifact stage callbacks preserve block and action identity", async () => {
  await withDom(async ({ document }) => {
    const panel = {
      id: "surface-panel",
      threadId,
      turnId: "turn-1",
      kind: "test.artifact",
      schemaVersion: 1,
      revision: 1,
      status: "ready",
      payload: { source: "identity" },
      presentation: { title: "Panel artifact", preferredSurface: "panel" },
      actions: [panelAction],
    };
    const state = placementState([panel]);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const received = [];

    await act(async () => {
      root.render(createElement(AgentChatShell, {
        state,
        threadId,
        surfaceRegistry: createActionRegistry(),
        title: "Application copilot",
        composerAriaLabel: "Message application copilot",
        onSubmit() {},
        onResolveInteraction() {},
        onSurfaceAction(block, action) {
          received.push({ block, action });
        },
        renderArtifactStage: ({ surfaces, onSurfaceAction }) =>
          createElement(
            "button",
            {
              type: "button",
              "data-custom-action": "true",
              onClick: () => onSurfaceAction?.(surfaces[0], surfaces[0].actions[0]),
            },
            "Dispatch panel action",
          ),
      }));
    });

    const button = container.querySelector("[data-custom-action]");
    assert.ok(button);
    await act(async () => button.click());
    assert.equal(received.length, 1);
    assert.strictEqual(received[0].block, panel);
    assert.strictEqual(received[0].action, panelAction);

    await act(async () => root.unmount());
  });
});

test("default stage action callbacks keep the bound action identity", async () => {
  await withDom(async ({ document }) => {
    const panel = {
      id: "surface-panel",
      threadId,
      turnId: "turn-1",
      kind: "test.artifact",
      schemaVersion: 1,
      revision: 1,
      status: "ready",
      payload: { source: "default-identity" },
      presentation: { title: "Panel artifact", preferredSurface: "panel" },
      actions: [panelAction],
    };
    const state = placementState([panel]);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const received = [];

    await act(async () => {
      root.render(createElement(AgentChatShell, {
        state,
        threadId,
        surfaceRegistry: createActionRegistry(),
        title: "Application copilot",
        composerAriaLabel: "Message application copilot",
        onSubmit() {},
        onResolveInteraction() {},
        onSurfaceAction(block, action) {
          received.push({ block, action });
        },
      }));
    });

    const button = [...container.querySelectorAll("button")]
      .find((candidate) => candidate.textContent === "Apply proposal");
    assert.ok(button);
    await act(async () => button.click());
    assert.equal(received.length, 1);
    assert.equal(received[0].block.id, panel.id);
    assert.strictEqual(received[0].block.actions, panel.actions);
    assert.strictEqual(received[0].action, panelAction);

    await act(async () => root.unmount());
  });
});

test("partial copy overrides fall back to defaults without mutating defaultAgentChatCopy", () => {
  const originalEmpty = defaultAgentChatCopy.emptyLabel;
  const originalDecision = defaultAgentChatCopy.decisionLabel("approve");
  assert.ok(Object.isFrozen(defaultAgentChatCopy));

  const resolved = resolveAgentChatCopy({
    emptyLabel: "Todavía no hay mensajes.",
    decisionLabel: (decision) => decision === "approve" ? "Aprobar" : decision,
  });

  assert.ok(Object.isFrozen(resolved));
  assert.equal(resolved.emptyLabel, "Todavía no hay mensajes.");
  assert.equal(resolved.decisionLabel("approve"), "Aprobar");
  assert.equal(resolved.composerSubmitLabel, defaultAgentChatCopy.composerSubmitLabel);
  assert.equal(resolved.jumpToLive, defaultAgentChatCopy.jumpToLive);
  assert.equal(defaultAgentChatCopy.emptyLabel, originalEmpty);
  assert.equal(defaultAgentChatCopy.decisionLabel("approve"), originalDecision);
  assert.equal(resolveAgentChatCopy().emptyLabel, originalEmpty);
  assert.strictEqual(resolveAgentChatCopy(resolved), resolved);
});

test("shell has no library brand by default and renders application headerLabel", () => {
  const withoutBrand = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state: emptyState,
      threadId,
      surfaceRegistry: new ReactSurfaceRegistry(),
      title: "Application copilot",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
    }),
  );
  assert.doesNotMatch(withoutBrand, /SHARED_AGENT_CHAT/);
  assert.doesNotMatch(withoutBrand, /sac-header-label/);
  assert.doesNotMatch(withoutBrand, /data-sac-theme/);

  const withLabel = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state: emptyState,
      threadId,
      surfaceRegistry: new ReactSurfaceRegistry(),
      title: "Application copilot",
      headerLabel: "Mesa de operaciones",
      theme: "light",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
    }),
  );
  assert.match(withLabel, /sac-header-label/);
  assert.match(withLabel, /Mesa de operaciones/);
  assert.match(withLabel, /data-sac-theme="light"/);
  assert.equal(withLabel.split("data-sac-theme=\"light\"").length - 1, 1);
  assert.doesNotMatch(withLabel, /SHARED_AGENT_CHAT/);
});

test("shell copy overrides reach timeline, composer, interactions, artifact stage and fallbacks", () => {
  const state = {
    ...placementState([
      {
        id: "surface-unknown-panel",
        threadId,
        kind: "external.untrusted-widget",
        schemaVersion: 2,
        revision: 1,
        status: "ready",
        payload: { secret: "copy-payload-must-not-render" },
        presentation: { title: "Unknown panel", preferredSurface: "panel" },
      },
    ]),
    interactions: {
      "approval-copy": {
        id: "approval-copy",
        threadId,
        kind: "approval",
        status: "pending",
        title: "¿Publicar?",
        payload: { secret: "copy-interaction-secret" },
        availableDecisions: ["approve"],
      },
    },
  };
  const html = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state,
      threadId,
      surfaceRegistry: new ReactSurfaceRegistry(),
      title: "Application copilot",
      composerAriaLabel: "Message application copilot",
      copy: {
        emptyLabel: "must-not-win-over-messages",
        artifactStageLabel: "Espacio de revisión",
        composerPlaceholder: "Describe la siguiente acción",
        composerSubmitLabel: "Enviar",
        pendingInteractionsLabel: "Interacciones pendientes",
        approvalRequiredLabel: "REQUIERE_APROBACION",
        surfaceUnavailableLabel: "SUPERFICIE_NO_DISPONIBLE",
        surfaceUnknownMessage: (kind, version) => `Sin renderer para ${kind} v${version}`,
      },
      onSubmit() {},
      onResolveInteraction() {},
    }),
  );

  assert.match(html, />Espacio de revisión</);
  assert.match(html, /placeholder="Describe la siguiente acción"/);
  assert.match(html, />Enviar</);
  assert.match(html, /aria-label="Interacciones pendientes"/);
  assert.match(html, /REQUIERE_APROBACION/);
  assert.match(html, /SUPERFICIE_NO_DISPONIBLE/);
  assert.match(html, /Sin renderer para external\.untrusted-widget v2/);
  assert.doesNotMatch(html, /copy-payload-must-not-render/);
  assert.doesNotMatch(html, /copy-interaction-secret/);
  assert.doesNotMatch(html, />Artifacts</);
  assert.doesNotMatch(html, />Send</);
});

test("standalone components accept copy overrides", () => {
  const composer = renderToStaticMarkup(
    createElement(ChatComposer, {
      ariaLabel: "Standalone composer",
      onSubmit() {},
      copy: {
        composerPlaceholder: "Instrucción",
        composerSubmitLabel: "Enviar",
        composerHint: "Enter envía",
      },
      theme: "light",
    }),
  );
  assert.match(composer, /class="sac-composer sac-theme"/);
  assert.match(composer, /data-sac-theme="light"/);
  assert.match(composer, /placeholder="Instrucción"/);
  assert.match(composer, />Enviar</);
  assert.match(composer, /Enter envía/);

  const timeline = renderToStaticMarkup(
    createElement(ChatTimeline, {
      state: emptyState,
      threadId,
      surfaceRegistry: new ReactSurfaceRegistry(),
      copy: { emptyLabel: "Sin mensajes todavía." },
    }),
  );
  assert.match(timeline, /Sin mensajes todavía\./);
  assert.match(timeline, /sac-theme/);

  const interactions = renderToStaticMarkup(
    createElement(PendingInteractions, {
      interactions: [{
        id: "q-1",
        threadId,
        kind: "question",
        status: "pending",
        title: "¿Canal?",
        payload: { secret: "standalone-question-secret" },
      }],
      copy: {
        pendingInteractionsLabel: "Pendientes",
        inputRequiredLabel: "ENTRADA_REQUERIDA",
        answerLabel: (title) => `Respuesta para ${title}`,
        submitAnswerLabel: "Enviar respuesta",
      },
      onResolve() {},
    }),
  );
  assert.match(interactions, /aria-label="Pendientes"/);
  assert.match(interactions, /ENTRADA_REQUERIDA/);
  assert.match(interactions, /Respuesta para ¿Canal\?/);
  assert.match(interactions, /Enviar respuesta/);
  assert.doesNotMatch(interactions, /standalone-question-secret/);

  const surface = renderToStaticMarkup(
    createElement(SurfaceHost, {
      block: {
        id: "unknown-copy",
        threadId,
        kind: "app.unknown",
        schemaVersion: 3,
        revision: 1,
        status: "ready",
        payload: { secret: "host-copy-secret" },
      },
      registry: new ReactSurfaceRegistry(),
      copy: {
        surfaceUnavailableLabel: "NO_DISPONIBLE",
        surfaceUnknownMessage: (kind, version) => `Falta ${kind}@${version}`,
      },
    }),
  );
  assert.match(surface, /NO_DISPONIBLE/);
  assert.match(surface, /Falta app\.unknown@3/);
  assert.doesNotMatch(surface, /host-copy-secret/);
});

test("dynamic copy formatters receive only documented primitive arguments", () => {
  const received = [];
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
        itemIds: ["message-1", "tool-1"],
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
        output: { secret: "item-output-secret" },
      },
      "tool-1": {
        id: "tool-1",
        threadId,
        turnId: "turn-1",
        kind: "tool",
        status: "completed",
        title: "Inspect repo",
        output: { secret: "tool-output-secret" },
      },
    },
  };

  const html = renderToStaticMarkup(
    createElement(ChatTimeline, {
      state: populatedState,
      threadId,
      surfaceRegistry: new ReactSurfaceRegistry(),
      copy: {
        itemStatusLabel: (status) => {
          received.push(["itemStatus", status]);
          return `estado:${status}`;
        },
        itemAriaLabel: (label, status) => {
          received.push(["itemAria", label, status]);
          return `${label}/${status}`;
        },
        turnAriaLabel: (status) => {
          received.push(["turn", status]);
          return `turno ${status}`;
        },
      },
    }),
  );

  const surfaceHtml = renderToStaticMarkup(
    createElement(SurfaceHost, {
      block: {
        id: "unknown-args",
        threadId,
        kind: "app.chart",
        schemaVersion: 4,
        revision: 1,
        status: "ready",
        presentation: { title: "Trusted chart" },
        payload: { secret: "surface-args-secret" },
      },
      registry: new ReactSurfaceRegistry(),
      copy: {
        surfaceUnknownMessage: (kind, version) => {
          received.push(["unknown", kind, version]);
          return `missing ${kind} ${version}`;
        },
        surfaceFallbackAriaLabel: (kind, version, title) => {
          received.push(["fallbackAria", kind, version, title]);
          return `${title}:${kind}:${version}`;
        },
        surfaceKindLabel: (kind) => {
          received.push(["kind", kind]);
          return kind;
        },
      },
    }),
  );

  assert.match(html, /estado:completed/);
  assert.match(html, /turno completed/);
  assert.match(surfaceHtml, /missing app\.chart 4/);
  assert.doesNotMatch(surfaceHtml, /surface-args-secret/);
  assert.ok(received.length > 0);
  for (const entry of received) {
    for (const value of entry.slice(1)) {
      assert.equal(["string", "number", "undefined"].includes(typeof value), true, String(value));
    }
  }
});

test("translated decision labels preserve the original decision identity", async () => {
  await withDom(async ({ document }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const received = [];

    await act(async () => {
      root.render(createElement(PendingInteractions, {
        interactions: [{
          id: "approval-translated",
          threadId,
          kind: "approval",
          status: "pending",
          title: "¿Aplicar el cambio?",
          payload: { secret: "translated-decision-secret" },
          availableDecisions: ["approve", "deny"],
        }],
        copy: {
          decisionLabel: (decision) => {
            if (decision === "approve") return "Aprobar";
            if (decision === "deny") return "Rechazar";
            return decision;
          },
          confirmDecisionLabel: (decision) => decision === "approve" ? "Confirmar aprobar" : `Confirmar ${decision}`,
          confirmChoicePrefix: "Confirmar decisión:",
        },
        onResolve(interaction, resolution) {
          received.push({ interaction, resolution });
        },
      }));
    });

    const choose = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Aprobar");
    assert.ok(choose);
    await act(async () => choose.click());
    assert.match(container.textContent, /Confirmar decisión:\s*Aprobar/);

    const confirm = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Confirmar aprobar");
    assert.ok(confirm);
    await act(async () => confirm.click());

    assert.equal(received.length, 1);
    assert.deepEqual(received[0].resolution, { decision: "approve" });
    assert.equal(received[0].interaction.id, "approval-translated");
    assert.doesNotMatch(container.textContent, /translated-decision-secret/);

    await act(async () => root.unmount());
  });
});

test("throwing copy formatters fail closed without payload or exception text", () => {
  const exceptionText = "formatter-secret-must-not-render";
  const payloadSecret = "throwing-copy-payload";
  const resolved = resolveAgentChatCopy({
    decisionLabel() {
      throw new Error(exceptionText);
    },
    surfaceUnknownMessage() {
      throw new Error(exceptionText);
    },
    itemStatusLabel() {
      throw new Error(exceptionText);
    },
  });
  assert.equal(resolved.decisionLabel("approve"), "approve");
  assert.match(resolved.surfaceUnknownMessage("app.table", 1), /app\.table v1/);
  assert.equal(resolved.itemStatusLabel("completed"), "completed");

  const html = renderToStaticMarkup(
    createElement(SurfaceHost, {
      block: {
        id: "throw-copy",
        threadId,
        kind: "app.secret",
        schemaVersion: 1,
        revision: 1,
        status: "ready",
        payload: { secret: payloadSecret },
      },
      registry: new ReactSurfaceRegistry(),
      copy: {
        surfaceUnknownMessage() {
          throw new Error(exceptionText);
        },
        surfaceFallbackAriaLabel() {
          throw new Error(exceptionText);
        },
      },
    }),
  );
  assert.match(html, /SURFACE_UNAVAILABLE/);
  assert.match(html, /No trusted renderer is registered for app\.secret v1/);
  assert.doesNotMatch(html, new RegExp(exceptionText));
  assert.doesNotMatch(html, new RegExp(payloadSecret));
});

test("explicit granular props keep precedence over copy overrides", () => {
  const composer = renderToStaticMarkup(
    createElement(ChatComposer, {
      ariaLabel: "Message application copilot",
      onSubmit() {},
      placeholder: "Prop placeholder",
      submitLabel: "Prop send",
      hint: "Prop hint",
      copy: {
        composerPlaceholder: "Copy placeholder",
        composerSubmitLabel: "Copy send",
        composerHint: "Copy hint",
      },
    }),
  );
  assert.match(composer, /placeholder="Prop placeholder"/);
  assert.match(composer, />Prop send</);
  assert.match(composer, /Prop hint/);
  assert.doesNotMatch(composer, /Copy placeholder/);
  assert.doesNotMatch(composer, /Copy send/);

  const html = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state: placementState([{
        id: "surface-panel",
        threadId,
        kind: "test.artifact",
        schemaVersion: 1,
        revision: 1,
        status: "ready",
        payload: {},
        presentation: { title: "Panel artifact", preferredSurface: "panel" },
      }]),
      threadId,
      surfaceRegistry: createActionRegistry(),
      title: "Application copilot",
      emptyLabel: "Prop empty",
      composerPlaceholder: "Prop composer",
      artifactStageLabel: "Prop artifacts",
      composerAriaLabel: "Message application copilot",
      copy: {
        emptyLabel: "Copy empty",
        composerPlaceholder: "Copy composer",
        artifactStageLabel: "Copy artifacts",
      },
      onSubmit() {},
      onResolveInteraction() {},
    }),
  );
  assert.match(html, /placeholder="Prop composer"/);
  assert.match(html, />Prop artifacts</);
  assert.doesNotMatch(html, /Copy composer/);
  assert.doesNotMatch(html, /Copy artifacts/);
});

function runningState(status = "running", itemStatus = "streaming") {
  return {
    ...emptyState,
    threads: {
      [threadId]: { id: threadId, appKey: "test", status: "active" },
    },
    turns: {
      "turn-1": { id: "turn-1", threadId, status, itemIds: ["message-1"] },
    },
    items: {
      "message-1": {
        id: "message-1",
        threadId,
        turnId: "turn-1",
        kind: "message",
        role: "assistant",
        status: itemStatus,
        text: "Working on the next step.",
        input: { secret: "item-input-secret" },
        output: { secret: "item-output-secret" },
        metadata: { secret: "item-metadata-secret" },
      },
    },
  };
}

function setTextareaValue(window, textarea, value) {
  const propsKey = Object.keys(textarea).find((key) => key.startsWith("__reactProps$"));
  const onChange = propsKey ? textarea[propsKey]?.onChange : undefined;
  if (typeof onChange === "function") {
    onChange({ target: { value } });
    return;
  }
  const tracker = textarea._valueTracker;
  if (tracker && typeof tracker.setValue === "function") tracker.setValue("");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  if (setter) setter.call(textarea, value);
  else textarea.value = value;
  textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
}

test("interrupt helpers reject a second request for the same turn and unlock after failure", () => {
  const idle = createInterruptRequestState();
  assert.equal(idle.status, "idle");
  const first = beginInterruptRequest(idle, "turn-1");
  assert.equal(first.accepted, true);
  assert.equal(first.state.status, "submitting");
  assert.equal(first.state.turnId, "turn-1");

  const duplicateSubmitting = beginInterruptRequest(first.state, "turn-1");
  assert.equal(duplicateSubmitting.accepted, false);
  assert.strictEqual(duplicateSubmitting.state, first.state);

  const submitted = completeInterruptRequest(first.state);
  assert.equal(submitted.status, "submitted");
  const duplicateSubmitted = beginInterruptRequest(submitted, "turn-1");
  assert.equal(duplicateSubmitted.accepted, false);
  assert.strictEqual(duplicateSubmitted.state, submitted);

  const failed = failInterruptRequest(first.state);
  assert.equal(failed.status, "failed");
  const retry = beginInterruptRequest(failed, "turn-1");
  assert.equal(retry.accepted, true);
  assert.equal(retry.state.status, "submitting");

  const reset = resetInterruptRequest(submitted);
  assert.equal(reset.status, "idle");
  assert.equal(reset.turnId, undefined);
  assert.strictEqual(resetInterruptRequest(idle), idle);

  const active = { id: "turn-1", threadId, status: "running", itemIds: [] };
  assert.strictEqual(reconcileInterruptRequest(first.state, active), first.state);
  assert.equal(reconcileInterruptRequest(first.state, { ...active, id: "turn-2" }).status, "idle");
  assert.equal(reconcileInterruptRequest(first.state, { ...active, status: "completed" }).status, "idle");
  assert.equal(reconcileInterruptRequest(first.state, undefined).status, "idle");
});

test("run status is theme and copy aware and keeps Stop separate from Send", () => {
  const html = renderToStaticMarkup(
    createElement(ChatRunStatus, {
      runState: { phase: "streaming", turn: runningState().turns["turn-1"], streaming: true },
      onInterrupt() {},
      copy: {
        runPhaseLabel: (phase) => `fase:${phase}`,
        interruptLabel: "Detener",
        interruptDescription: "Solicita detener el turno actual",
      },
      theme: "light",
    }),
  );
  assert.match(html, /class="sac-run-status sac-theme"/);
  assert.match(html, /data-sac-theme="light"/);
  assert.match(html, /data-sac-run-phase="streaming"/);
  assert.match(html, /fase:streaming/);
  assert.match(html, />Detener</);
  assert.match(html, /aria-describedby="[^"]+"/);
  assert.match(html, /Solicita detener el turno actual/);
  assert.match(html, /type="button"/);
  assert.doesNotMatch(html, />Send</);
  assert.doesNotMatch(html, /cancelled|interrupted/i);
});

test("shell shows Stop only when an active turn and interrupt handler both exist", () => {
  const withoutHandler = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state: runningState(),
      threadId,
      surfaceRegistry: new ReactSurfaceRegistry(),
      title: "Application copilot",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
    }),
  );
  assert.match(withoutHandler, /Streaming/);
  assert.doesNotMatch(withoutHandler, />Stop</);

  const idleWithHandler = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state: emptyState,
      threadId,
      surfaceRegistry: new ReactSurfaceRegistry(),
      title: "Application copilot",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
      onInterrupt() {},
    }),
  );
  assert.doesNotMatch(idleWithHandler, />Stop</);
  assert.doesNotMatch(idleWithHandler, /sac-run-status/);

  const withHandler = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state: runningState(),
      threadId,
      surfaceRegistry: new ReactSurfaceRegistry(),
      title: "Application copilot",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
      onInterrupt() {},
    }),
  );
  assert.match(withHandler, />Stop</);
  assert.match(withHandler, /aria-describedby="[^"]+"/);
  assert.match(withHandler, /Requests that the provider stop the current turn/);
  assert.match(withHandler, />Send</);
  assert.doesNotMatch(withHandler, /cancelled/);
});

test("custom run status slot replaces default chrome", () => {
  let received;
  const html = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state: runningState(),
      threadId,
      surfaceRegistry: new ReactSurfaceRegistry(),
      title: "Application copilot",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
      onInterrupt() {},
      renderRunStatus: (props) => {
        received = props;
        return createElement("div", { "data-custom-run": "host" }, props.runState.phase);
      },
    }),
  );
  assert.ok(received);
  assert.equal(received.runState.phase, "streaming");
  assert.equal(received.activeTurn.id, "turn-1");
  assert.match(html, /data-custom-run="host"/);
  assert.doesNotMatch(html, /sac-run-status/);
  assert.doesNotMatch(html, />Stop</);
});

test("composerActions reach only the default composer", () => {
  const withDefault = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state: emptyState,
      threadId,
      surfaceRegistry: new ReactSurfaceRegistry(),
      title: "Application copilot",
      composerAriaLabel: "Message application copilot",
      composerActions: createElement("button", { type: "button" }, "Insert note"),
      onSubmit() {},
      onResolveInteraction() {},
    }),
  );
  assert.match(withDefault, /sac-composer-actions/);
  assert.match(withDefault, />Insert note</);

  const withCustom = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state: emptyState,
      threadId,
      surfaceRegistry: new ReactSurfaceRegistry(),
      title: "Application copilot",
      composer: createElement("div", { "data-app-composer": "custom" }, "Host composer"),
      composerActions: createElement("button", { type: "button" }, "Insert note"),
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
    }),
  );
  assert.match(withCustom, /data-app-composer="custom"/);
  assert.doesNotMatch(withCustom, /Insert note/);
  assert.doesNotMatch(withCustom, /sac-composer-actions/);
});

test("interrupt request stays honest and never claims cancelled until protocol confirms", async () => {
  await withDom(async ({ document }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const state = runningState();
    let rejectInterrupt;
    let calls = 0;
    const pending = new Promise((_, reject) => {
      rejectInterrupt = reject;
    });

    await act(async () => {
      root.render(createElement(AgentChatShell, {
        state,
        threadId,
        surfaceRegistry: new ReactSurfaceRegistry(),
        title: "Application copilot",
        composerAriaLabel: "Message application copilot",
        onSubmit() {},
        onResolveInteraction() {},
        onInterrupt() {
          calls += 1;
          return pending;
        },
      }));
    });

    const stop = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Stop");
    assert.ok(stop);
    await act(async () => {
      stop.click();
      stop.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(calls, 1);
    assert.equal(stop.disabled, true);
    assert.equal(stop.getAttribute("aria-busy"), "true");
    assert.equal(stop.getAttribute("aria-label"), null);
    assert.equal(stop.textContent, "Stopping…");
    assert.match(container.querySelector(".sac-run-status-copy").textContent, /Stopping/);
    assert.match(container.textContent, /Stopping/);
    assert.doesNotMatch(container.textContent, /cancelled|interrupted/i);
    assert.equal(state.turns["turn-1"].status, "running");

    await act(async () => {
      rejectInterrupt(new Error("provider-interrupt-secret"));
      await pending.catch(() => undefined);
    });
    assert.match(container.textContent, /could not be sent/);
    assert.doesNotMatch(container.textContent, /provider-interrupt-secret/);
    assert.equal(state.turns["turn-1"].status, "running");

    const retry = container.querySelector("button.sac-run-status-stop");
    assert.ok(retry);
    assert.equal(retry.disabled, false);

    await act(async () => {
      root.render(createElement(AgentChatShell, {
        state: runningState("completed", "completed"),
        threadId,
        surfaceRegistry: new ReactSurfaceRegistry(),
        title: "Application copilot",
        composerAriaLabel: "Message application copilot",
        onSubmit() {},
        onResolveInteraction() {},
        onInterrupt() {},
      }));
    });
    const remainingStop = Boolean(container.querySelector("button.sac-run-status-stop"));
    assert.equal(remainingStop, false);
    assert.doesNotMatch(container.textContent, /Stop requested/);

    await act(async () => root.unmount());
  });
});

test("a stale interrupt promise cannot settle the request for a newer turn", async () => {
  await withDom(async ({ document }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let resolveFirst;
    let resolveSecond;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    const second = new Promise((resolve) => { resolveSecond = resolve; });
    const calls = [];
    const stateFor = (turnId) => ({
      ...emptyState,
      threads: { [threadId]: { id: threadId, appKey: "test", organizationId: "org", status: "active" } },
      turns: { [turnId]: { id: turnId, threadId, status: "running", itemIds: [] } },
    });
    const renderTurn = async (turnId) => {
      await act(async () => {
        root.render(createElement(AgentChatShell, {
          state: stateFor(turnId),
          threadId,
          surfaceRegistry: new ReactSurfaceRegistry(),
          title: "Application copilot",
          composerAriaLabel: "Message application copilot",
          onSubmit() {},
          onResolveInteraction() {},
          onInterrupt(turn) {
            calls.push(turn.id);
            return turn.id === "turn-1" ? first : second;
          },
        }));
      });
    };

    await renderTurn("turn-1");
    await act(async () => {
      container.querySelector("button.sac-run-status-stop").click();
      await Promise.resolve();
    });
    await renderTurn("turn-2");
    const secondStop = container.querySelector("button.sac-run-status-stop");
    assert.equal(secondStop.disabled, false);
    await act(async () => {
      secondStop.click();
      await Promise.resolve();
    });
    assert.deepEqual(calls, ["turn-1", "turn-2"]);

    await act(async () => {
      resolveFirst();
      await first;
      await Promise.resolve();
    });
    assert.match(container.textContent, /Stopping/);
    assert.doesNotMatch(container.textContent, /Stop requested/);
    assert.equal(secondStop.getAttribute("aria-busy"), "true");

    await act(async () => {
      resolveSecond();
      await second;
      await Promise.resolve();
    });
    assert.match(container.textContent, /Stop requested/);
    assert.equal(secondStop.getAttribute("aria-busy"), "false");

    await act(async () => root.unmount());
  });
});

test("host busy overlays idle protocol state without inventing an interrupt target", () => {
  const html = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state: emptyState,
      threadId,
      busy: true,
      surfaceRegistry: new ReactSurfaceRegistry(),
      title: "Application copilot",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
      onInterrupt() {},
    }),
  );
  assert.match(html, /data-sac-run-phase="busy"/);
  assert.match(html, />Busy</);
  assert.doesNotMatch(html, />Stop</);

  const completedHtml = renderToStaticMarkup(
    createElement(AgentChatShell, {
      state: runningState("completed", "completed"),
      threadId,
      busy: true,
      surfaceRegistry: new ReactSurfaceRegistry(),
      title: "Application copilot",
      composerAriaLabel: "Message application copilot",
      onSubmit() {},
      onResolveInteraction() {},
      onInterrupt() {},
    }),
  );
  assert.match(completedHtml, /data-sac-run-phase="busy"/);
  assert.doesNotMatch(completedHtml, />Stop</);
});

test("message renderer failures fall back to escaped text without secrets or exception text", async () => {
  await withDom(async ({ document }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const exceptionText = "renderer-exception-secret";
    const state = {
      ...emptyState,
      threads: { [threadId]: { id: threadId, appKey: "test", status: "active" } },
      turns: {
        "turn-1": { id: "turn-1", threadId, status: "completed", itemIds: ["message-1", "tool-1", "empty-1"] },
      },
      items: {
        "message-1": {
          id: "message-1",
          threadId,
          turnId: "turn-1",
          kind: "message",
          role: "assistant",
          status: "completed",
          text: "Visible <script>answer</script>",
          input: { secret: "message-input-secret" },
          output: { secret: "message-output-secret" },
          metadata: { secret: "message-metadata-secret" },
        },
        "tool-1": {
          id: "tool-1",
          threadId,
          turnId: "turn-1",
          kind: "tool",
          status: "completed",
          title: "Inspect repo",
          text: "tool title",
          input: { secret: "tool-input-secret" },
          output: { secret: "tool-output-secret" },
        },
        "empty-1": {
          id: "empty-1",
          threadId,
          turnId: "turn-1",
          kind: "message",
          role: "assistant",
          status: "completed",
          text: "   ",
          metadata: { secret: "empty-metadata-secret" },
        },
      },
    };
    const renderedKinds = [];

    await act(async () => {
      root.render(createElement(ChatTimeline, {
        state,
        threadId,
        surfaceRegistry: new ReactSurfaceRegistry(),
        renderMessage: (item) => {
          renderedKinds.push(item.kind);
          throw new Error(exceptionText);
        },
      }));
    });

    assert.deepEqual(renderedKinds, ["message", "message"]);
    assert.match(container.textContent, /Visible <script>answer<\/script>/);
    assert.match(container.textContent, /This message could not be displayed/);
    assert.match(container.innerHTML, /Visible &lt;script&gt;answer&lt;\/script&gt;/);
    assert.doesNotMatch(container.textContent, new RegExp(exceptionText));
    assert.doesNotMatch(container.textContent, /message-input-secret/);
    assert.doesNotMatch(container.textContent, /message-output-secret/);
    assert.doesNotMatch(container.textContent, /message-metadata-secret/);
    assert.doesNotMatch(container.textContent, /empty-metadata-secret/);
    assert.match(container.textContent, /tool title/);
    assert.match(container.textContent, /tool-output-secret/);

    const recoveredState = {
      ...state,
      items: {
        ...state.items,
        "message-1": { ...state.items["message-1"], text: "Recovered answer" },
      },
    };
    await act(async () => {
      root.render(createElement(ChatTimeline, {
        state: recoveredState,
        threadId,
        surfaceRegistry: new ReactSurfaceRegistry(),
        renderMessage: (item) => createElement("strong", null, item.text),
      }));
    });
    assert.match(container.innerHTML, /<strong>Recovered answer<\/strong>/);

    await act(async () => root.unmount());
  });
});

test("message error boundary recovers a descendant renderer after content advances", async () => {
  await withDom(async ({ document }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const originalError = console.error;
    console.error = () => {};
    const ThrowingMessage = () => {
      throw new Error("descendant-renderer-secret");
    };
    const base = runningState("running", "streaming");

    try {
      await act(async () => {
        root.render(createElement(ChatTimeline, {
          state: base,
          threadId,
          surfaceRegistry: new ReactSurfaceRegistry(),
          renderMessage: () => createElement(ThrowingMessage),
        }));
      });
      assert.match(container.textContent, /Working on the next step/);
      assert.doesNotMatch(container.textContent, /descendant-renderer-secret/);

      const advanced = {
        ...base,
        items: {
          ...base.items,
          "message-1": {
            ...base.items["message-1"],
            status: "completed",
            text: "Recovered streamed answer",
          },
        },
      };
      await act(async () => {
        root.render(createElement(ChatTimeline, {
          state: advanced,
          threadId,
          surfaceRegistry: new ReactSurfaceRegistry(),
          renderMessage: (item) => createElement("strong", null, item.text),
        }));
      });
      assert.match(container.innerHTML, /<strong>Recovered streamed answer<\/strong>/);
    } finally {
      console.error = originalError;
      await act(async () => root.unmount());
    }
  });
});

test("composer fences double submit, restores rejected drafts, and keeps editing while busy", async () => {
  await withDom(async ({ document, window }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const drafts = [];
    let calls = 0;
    let rejectSubmit;
    const pending = new Promise((_, reject) => {
      rejectSubmit = reject;
    });

    await act(async () => {
      root.render(createElement(ChatComposer, {
        ariaLabel: "Message application copilot",
        initialValue: "first instruction",
        onDraftChange: (value) => drafts.push(value),
        actions: createElement("button", { "data-action": "insert" }, "Insert note"),
        onSubmit() {
          calls += 1;
          return pending;
        },
      }));
    });

    const textarea = container.querySelector("textarea");
    const form = container.querySelector("form");
    const send = container.querySelector("button.sac-button-primary");
    assert.ok(textarea);
    assert.ok(form);
    assert.equal(textarea.disabled, false);
    assert.equal(textarea.value, "first instruction");
    assert.equal(send.disabled, false);

    const action = container.querySelector("[data-action=insert]");
    await act(async () => action.click());
    assert.equal(calls, 0);
    assert.equal(textarea.value, "first instruction");

    await act(async () => {
      send.click();
      send.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(calls, 1);
    assert.equal(form.getAttribute("aria-busy"), "true");
    assert.match(send.textContent, /Working/);
    assert.equal(textarea.disabled, false);
    assert.equal(textarea.value, "");

    await act(async () => action.click());
    assert.equal(calls, 1);

    await act(async () => {
      rejectSubmit(new Error("submit-secret-error"));
      await pending.catch(() => undefined);
    });
    assert.equal(textarea.value, "first instruction");
    assert.doesNotMatch(container.textContent, /submit-secret-error/);
    assert.equal(form.getAttribute("aria-busy"), null);
    assert.deepEqual(drafts.at(-1), "first instruction");

    await act(async () => root.unmount());
  });
});

test("composer restores a rejected snapshot only when the operator has not typed a replacement", async () => {
  await withDom(async ({ document, window }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let rejectSubmit;
    const pending = new Promise((_, reject) => {
      rejectSubmit = reject;
    });

    await act(async () => {
      root.render(createElement(ChatComposer, {
        ariaLabel: "Message application copilot",
        initialValue: "original",
        onSubmit() {
          return pending;
        },
      }));
    });

    await act(async () => container.querySelector("button.sac-button-primary").click());
    const textarea = container.querySelector("textarea");
    await act(async () => setTextareaValue(window, textarea, "replacement draft"));
    await act(async () => {
      rejectSubmit(new Error("hidden-rejection"));
      await pending.catch(() => undefined);
    });
    assert.equal(textarea.value, "replacement draft");
    assert.doesNotMatch(container.textContent, /hidden-rejection/);

    await act(async () => root.unmount());
  });
});

test("composer catches synchronous submit throws and preserves IME enter", async () => {
  await withDom(async ({ document, window }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let calls = 0;

    await act(async () => {
      root.render(createElement(ChatComposer, {
        ariaLabel: "Message application copilot",
        initialValue: "send me",
        onSubmit() {
          calls += 1;
          throw new Error("sync-submit-secret");
        },
      }));
    });

    const textarea = container.querySelector("textarea");
    const send = container.querySelector("button.sac-button-primary");
    await act(async () => {
      const composing = new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      Object.defineProperty(composing, "keyCode", { get: () => 229 });
      Object.defineProperty(composing, "isComposing", { get: () => true });
      textarea.dispatchEvent(composing);
    });
    assert.equal(calls, 0);
    assert.equal(textarea.value, "send me");

    await act(async () => {
      textarea.dispatchEvent(new window.KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });
    assert.equal(calls, 0);

    await act(async () => {
      send.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(calls, 1);
    assert.equal(textarea.value, "send me");
    assert.doesNotMatch(container.textContent, /sync-submit-secret/);

    await act(async () => root.unmount());
  });
});

test("composer submits exactly once on a normal Enter key", async () => {
  await withDom(async ({ document }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const submitted = [];
    await act(async () => {
      root.render(createElement(ChatComposer, {
        ariaLabel: "Message application copilot",
        initialValue: "send with enter",
        onSubmit(value) {
          submitted.push(value);
        },
      }));
    });

    const textarea = container.querySelector("textarea");
    const propsKey = Object.keys(textarea).find((key) => key.startsWith("__reactProps$"));
    const onKeyDown = propsKey ? textarea[propsKey]?.onKeyDown : undefined;
    assert.equal(typeof onKeyDown, "function");
    let prevented = false;
    await act(async () => {
      onKeyDown({
        key: "Enter",
        shiftKey: false,
        nativeEvent: { isComposing: false, keyCode: 13 },
        isDefaultPrevented: () => false,
        preventDefault() { prevented = true; },
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(prevented, true);
    assert.deepEqual(submitted, ["send with enter"]);
    assert.equal(textarea.value, "");

    await act(async () => root.unmount());
  });
});

test("composer busy disables send but not the textarea; disabled still blocks editing", () => {
  const busy = renderToStaticMarkup(
    createElement(ChatComposer, {
      ariaLabel: "Message application copilot",
      busy: true,
      initialValue: "next instruction",
      onSubmit() {},
    }),
  );
  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, />Working…</);
  assert.match(busy, /disabled=""/);
  assert.doesNotMatch(busy, /<textarea[^>]*disabled/);

  const blocked = renderToStaticMarkup(
    createElement(ChatComposer, {
      ariaLabel: "Message application copilot",
      disabled: true,
      initialValue: "locked",
      onSubmit() {},
    }),
  );
  assert.match(blocked, /<textarea[^>]*disabled/);
});

test("run phase copy formatters receive only a documented primitive", () => {
  const received = [];
  const html = renderToStaticMarkup(
    createElement(ChatRunStatus, {
      runState: { phase: "queued", turn: { id: "turn-1", threadId, status: "queued", itemIds: [] } },
      copy: {
        runPhaseLabel: (phase) => {
          received.push(phase);
          return `fase ${phase}`;
        },
      },
    }),
  );
  assert.match(html, /fase queued/);
  assert.deepEqual(received, ["queued"]);
  for (const value of received) assert.equal(typeof value, "string");

  const throwing = resolveAgentChatCopy({
    runPhaseLabel() {
      throw new Error("phase-secret");
    },
  });
  assert.equal(throwing.runPhaseLabel("busy"), "Busy");
});
