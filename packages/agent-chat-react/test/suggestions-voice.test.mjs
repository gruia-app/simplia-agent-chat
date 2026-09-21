import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  AgentChatShell,
  ChatComposer,
  ReactSurfaceRegistry,
  SuggestionChips,
  useVoiceCapture,
  VoiceButton,
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

const SUGGESTIONS = [
  { id: "s1", label: "Resume work", prompt: "Resume the pending work item" },
  { id: "s2", label: "Draft brief", prompt: "Draft a brief", description: "Opens a drafting flow" },
];

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

test("SuggestionChips renders a labelled group of buttons", () => {
  const html = renderToStaticMarkup(
    createElement(SuggestionChips, {
      suggestions: SUGGESTIONS,
      ariaLabel: "Suggested actions",
      onSelect() {},
    }),
  );
  assert.match(html, /role="group"/);
  assert.match(html, /aria-label="Suggested actions"/);
  assert.match(html, /Resume work/);
  assert.match(html, /aria-label="Opens a drafting flow"/);
});

test("SuggestionChips roving tabindex follows arrow keys", async () => {
  await withDom(async ({ document, window }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(SuggestionChips, {
        suggestions: SUGGESTIONS,
        ariaLabel: "Suggested actions",
        onSelect() {},
      }));
    });
    const buttons = [...container.querySelectorAll(".sac-suggestion-chip")];
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].tabIndex, 0);
    assert.equal(buttons[1].tabIndex, -1);

    const group = container.querySelector(".sac-suggestions");
    await act(async () => {
      group.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    assert.equal(document.activeElement, buttons[1]);
    assert.equal(buttons[1].tabIndex, 0);

    await act(async () => {
      group.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    assert.equal(document.activeElement, buttons[0]);

    await act(async () => root.unmount());
  });
});

test("shell suggestion chip stages its prompt into the composer", async () => {
  await withDom(async ({ document }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const selected = [];
    await act(async () => {
      root.render(createElement(AgentChatShell, {
        state: emptyState,
        threadId,
        surfaceRegistry: new ReactSurfaceRegistry(),
        title: "Copilot",
        composerAriaLabel: "Message copilot",
        onSubmit() {},
        onResolveInteraction() {},
        suggestions: SUGGESTIONS,
        onSuggestionSelect: (s) => selected.push(s.id),
      }));
    });
    const chip = [...container.querySelectorAll(".sac-suggestion-chip")]
      .find((button) => button.textContent === "Draft brief");
    assert.ok(chip);
    await act(async () => chip.click());
    const textarea = container.querySelector(".sac-composer-input");
    assert.equal(textarea.value, "Draft a brief");
    assert.deepEqual(selected, ["s2"]);
    await act(async () => root.unmount());
  });
});

test("composer adopts a bumped external draft revision", async () => {
  await withDom(async ({ document }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const props = {
      ariaLabel: "Message copilot",
      onSubmit() {},
      draft: { value: "first", revision: 1 },
    };
    await act(async () => {
      root.render(createElement(ChatComposer, props));
    });
    const textarea = container.querySelector(".sac-composer-input");
    assert.equal(textarea.value, "first");

    await act(async () => {
      root.render(createElement(ChatComposer, { ...props, draft: { value: "second", revision: 1 } }));
    });
    assert.equal(textarea.value, "first");

    await act(async () => {
      root.render(createElement(ChatComposer, { ...props, draft: { value: "second", revision: 2 } }));
    });
    assert.equal(textarea.value, "second");
    await act(async () => root.unmount());
  });
});

test("VoiceButton stays disabled without capture support", () => {
  const html = renderToStaticMarkup(
    createElement(VoiceButton, {
      capture: { status: "idle", supported: false, transcript: "", interim: "", start() {}, stop() {} },
    }),
  );
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /sac-voice-button/);
});

test("useVoiceCapture records, transcribes and meters one session", async () => {
  await withDom(async ({ document }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    const transportHandlers = { current: undefined };
    const sent = [];
    const metered = [];
    const transport = {
      open: async (_config, handlers) => {
        transportHandlers.current = handlers;
        return { send: (chunk) => sent.push(chunk.size), close() {} };
      },
    };
    const sourceHandlers = { current: undefined };
    const sourceLog = [];
    const createSource = async (handlers) => {
      sourceHandlers.current = handlers;
      return {
        start: () => sourceLog.push("start"),
        stop: () => sourceLog.push("stop"),
      };
    };

    function Harness() {
      const capture = useVoiceCapture({
        transport,
        supported: true,
        createSource,
        tenantId: "tenant-1",
        meter: (event) => metered.push(event),
      });
      return createElement("div", null,
        createElement("output", {
          "data-status": capture.status,
          "data-transcript": capture.transcript,
          "data-interim": capture.interim,
        }),
        createElement(VoiceButton, { capture }));
    }

    await act(async () => {
      root.render(createElement(Harness));
    });

    const button = container.querySelector(".sac-voice-button");
    const output = () => container.querySelector("output").dataset;
    assert.equal(output().status, "idle");

    const window = document.defaultView;
    await act(async () => {
      button.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(output().status, "recording");
    assert.deepEqual(sourceLog, ["start"]);

    sourceHandlers.current.onChunk(new Blob(["abcd"]));
    await act(async () => {
      transportHandlers.current.onTranscript({ text: "hola", isFinal: false });
    });
    assert.equal(output().interim, "hola");
    await act(async () => {
      transportHandlers.current.onTranscript({ text: "hola mundo", isFinal: true });
    });
    assert.equal(output().transcript, "hola mundo");
    assert.equal(output().interim, "");

    await act(async () => {
      button.dispatchEvent(new window.KeyboardEvent("keyup", { key: " ", bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(output().status, "idle");
    assert.deepEqual(sourceLog, ["start", "stop"]);
    assert.equal(metered.length, 1);
    assert.equal(metered[0].provider, "deepgram");
    assert.equal(metered[0].audioBytes, 4);
    assert.equal(metered[0].tenantId, "tenant-1");
    assert.equal(metered[0].finalTranscripts, 1);
    assert.equal(metered[0].endReason, "stopped");

    await act(async () => root.unmount());
  });
});

test("useVoiceCapture reports unsupported capture", async () => {
  await withDom(async ({ document }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const errors = [];

    function Harness() {
      const capture = useVoiceCapture({
        transport: { open: async () => ({ send() {}, close() {} }) },
        supported: false,
        onError: (reason) => errors.push(reason),
      });
      return createElement("output", { "data-status": capture.status });
    }

    await act(async () => {
      root.render(createElement(Harness));
    });
    // Direct start() call: no VoiceButton needed for the unsupported path.
    await act(async () => {
      root.render(createElement(function Harness2() {
        const capture = useVoiceCapture({
          transport: { open: async () => ({ send() {}, close() {} }) },
          supported: false,
          onError: (reason) => errors.push(reason),
        });
        globalThis.__capture = capture;
        return createElement("output", { "data-status": capture.status });
      }));
    });
    await act(async () => globalThis.__capture.start());
    assert.equal(container.querySelector("output").dataset.status, "error");
    assert.equal(globalThis.__capture.errorReason, "unsupported");
    assert.deepEqual(errors, ["unsupported"]);
    delete globalThis.__capture;
    await act(async () => root.unmount());
  });
});

test("useVoiceCapture exposes the transport failure reason and stays retryable", async () => {
  await withDom(async ({ document }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const errors = [];
    let openAttempts = 0;
    const transport = {
      open: async () => {
        openAttempts += 1;
        throw new Error("deepgram unreachable");
      },
    };
    const createSource = async () => ({ start() {}, stop() {} });

    function Harness() {
      const capture = useVoiceCapture({
        transport,
        supported: true,
        createSource,
        onError: (reason) => errors.push(reason),
      });
      globalThis.__capture = capture;
      return createElement("div", null,
        createElement("output", {
          "data-status": capture.status,
          "data-reason": capture.errorReason ?? "",
        }),
        createElement(VoiceButton, { capture }));
    }

    await act(async () => {
      root.render(createElement(Harness));
    });
    const window = document.defaultView;
    const button = container.querySelector(".sac-voice-button");
    const output = () => container.querySelector("output").dataset;

    await act(async () => {
      button.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(output().status, "error");
    assert.equal(output().reason, "transport_failed");
    assert.deepEqual(errors, ["transport_failed"]);
    assert.equal(openAttempts, 1);
    // Degraded UI: error label on the button, composer text path untouched.
    assert.match(button.getAttribute("aria-label"), /failed/i);

    await act(async () => {
      button.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(openAttempts, 2);
    assert.equal(output().status, "error");
    delete globalThis.__capture;
    await act(async () => root.unmount());
  });
});

test("useVoiceCapture reports mic denial without opening the transport", async () => {
  await withDom(async ({ document }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const errors = [];
    const metered = [];
    let openAttempts = 0;
    const transport = {
      open: async () => {
        openAttempts += 1;
        return { send() {}, close() {} };
      },
    };
    const createSource = async () => {
      const denied = new Error("denied");
      denied.name = "NotAllowedError";
      throw denied;
    };

    function Harness() {
      const capture = useVoiceCapture({
        transport,
        supported: true,
        createSource,
        meter: (event) => metered.push(event),
        onError: (reason) => errors.push(reason),
      });
      globalThis.__capture = capture;
      return createElement("output", {
        "data-status": capture.status,
        "data-reason": capture.errorReason ?? "",
      });
    }

    await act(async () => {
      root.render(createElement(Harness));
    });
    await act(async () => {
      globalThis.__capture.start();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const output = container.querySelector("output").dataset;
    assert.equal(output.status, "error");
    assert.equal(output.reason, "capture_failed");
    assert.deepEqual(errors, ["capture_failed"]);
    // Mic was never granted: transport never opened, and the metering event
    // records a zero-byte failed attempt — nothing billable.
    assert.equal(openAttempts, 0);
    assert.equal(metered.length, 1);
    assert.equal(metered[0].endReason, "error");
    assert.equal(metered[0].audioBytes, 0);
    delete globalThis.__capture;
    await act(async () => root.unmount());
  });
});
