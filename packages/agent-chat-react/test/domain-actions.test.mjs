import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Window } from "happy-dom";
import { useSurfaceAction } from "../dist/index.js";

const command = {
  idempotencyKey: "react-action-key",
  threadId: "thread-react",
  surfaceId: "surface-react",
  revision: 2,
  actionId: "apply",
  action: "example.apply",
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function withHook(transport, initialState, run) {
  const window = new Window({ url: "https://agent-chat.test/" });
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    Event: window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = new Map(
    Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  let controller;
  function Harness() {
    controller = useSurfaceAction({ transport, ...(initialState ? { initialState } : {}) });
    return createElement("output", {
      "aria-live": "polite",
      "aria-busy": controller.busy ? "true" : "false",
    }, controller.status);
  }

  try {
    await act(async () => root.render(createElement(Harness)));
    await run(() => controller, container);
  } finally {
    await act(async () => root.unmount());
    window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test("hook guards double-click and exposes pending 202 state", async () => {
  const request = deferred();
  const calls = [];
  const transport = {
    execute(received) {
      calls.push(received);
      return request.promise;
    },
    getReceipt() { throw new Error("not used"); },
    abandonUnknown() { throw new Error("not used"); },
  };

  await withHook(transport, undefined, async (current, container) => {
    let first;
    let second;
    await act(async () => {
      first = current().execute(command);
      second = current().execute(command);
      await Promise.resolve();
    });
    assert.equal(await second, false);
    assert.equal(calls.length, 1);
    assert.equal(container.textContent, "pending");
    assert.equal(container.querySelector("output").getAttribute("aria-busy"), "true");

    await act(async () => {
      request.resolve({ idempotencyKey: command.idempotencyKey, status: "pending" });
      await first;
    });
    assert.equal(current().status, "pending");
    assert.equal(current().busy, false);
  });
});

test("hook retries a conflict with the exact same command and accepts replay", async () => {
  const calls = [];
  const receipts = [
    {
      idempotencyKey: command.idempotencyKey,
      status: "conflicted",
      error: { code: "surface_revision_conflict", retryable: true },
    },
    { idempotencyKey: command.idempotencyKey, status: "succeeded", result: { replayed: true } },
  ];
  const transport = {
    async execute(received) {
      calls.push(received);
      return receipts.shift();
    },
    getReceipt() { throw new Error("not used"); },
    abandonUnknown() { throw new Error("not used"); },
  };

  await withHook(transport, undefined, async (current) => {
    await act(async () => current().execute(command));
    assert.equal(current().status, "conflicted");
    await act(async () => current().retry());
    assert.equal(current().status, "succeeded");
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], command);
    assert.deepEqual(calls[1], command);
    assert.notStrictEqual(calls[0], command);
    assert.notStrictEqual(calls[1], calls[0]);
    assert.deepEqual(current().state.receipt.result, { replayed: true });
  });
});

test("hook reconciles unknown and abandons only with explicit acknowledgement", async () => {
  let executeCalls = 0;
  let reconcileCalls = 0;
  let abandonCalls = 0;
  const transport = {
    async execute() {
      executeCalls += 1;
      throw new Error("response lost");
    },
    async getReceipt(key) {
      reconcileCalls += 1;
      assert.equal(key, command.idempotencyKey);
      return undefined;
    },
    async abandonUnknown(key, options) {
      abandonCalls += 1;
      assert.equal(key, command.idempotencyKey);
      assert.equal(options.acknowledgePossibleEffects, true);
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.signal.aborted, false);
      return {
        idempotencyKey: key,
        status: "failed",
        error: { code: "unknown_abandoned", retryable: true },
      };
    },
  };

  await withHook(transport, undefined, async (current) => {
    await act(async () => current().execute(command));
    assert.equal(current().status, "unknown");
    assert.equal(current().state.receipt.idempotencyKey, command.idempotencyKey);

    await act(async () => current().reconcile());
    assert.equal(reconcileCalls, 1);
    assert.equal(current().status, "unknown");

    assert.equal(await current().abandonUnknown(false), false);
    assert.equal(abandonCalls, 0);
    await act(async () => current().abandonUnknown(true));
    assert.equal(abandonCalls, 1);
    assert.equal(executeCalls, 1);
    assert.equal(current().status, "failed");
    assert.equal(current().state.receipt.error.code, "unknown_abandoned");
    assert.equal(await current().retry(), false);
    assert.equal(executeCalls, 1);
  });
});

test("failed abandonment remains unknown and can never re-enable execute", async () => {
  let executeCalls = 0;
  let abandonCalls = 0;
  const transport = {
    async execute() {
      executeCalls += 1;
      throw new Error("response lost");
    },
    async getReceipt(key) {
      return { idempotencyKey: key, status: "unknown" };
    },
    async abandonUnknown() {
      abandonCalls += 1;
      throw new Error("abandon response lost");
    },
  };

  await withHook(transport, undefined, async (current) => {
    await act(async () => current().execute(command));
    await act(async () => current().abandonUnknown(true));

    assert.equal(current().status, "unknown");
    assert.equal(current().state.abandonedUnknown, true);
    assert.equal(await current().abandonUnknown(true), false);
    assert.equal(await current().retry(), false);
    assert.equal(abandonCalls, 1);
    assert.equal(executeCalls, 1);
  });
});

test("hydrated unknown action reconciles after reload with its original key", async () => {
  let observedKey;
  const transport = {
    execute() { throw new Error("not used"); },
    async getReceipt(key) {
      observedKey = key;
      return { idempotencyKey: key, status: "succeeded" };
    },
    abandonUnknown() { throw new Error("not used"); },
  };

  await withHook(transport, {
    command,
    receipt: { idempotencyKey: command.idempotencyKey, status: "unknown" },
  }, async (current) => {
    await act(async () => current().reconcile());
    assert.equal(observedKey, command.idempotencyKey);
    assert.equal(current().status, "succeeded");
  });
});

test("failed reconciliation preserves an authoritative pending receipt", async () => {
  const transport = {
    async execute() {
      return {
        idempotencyKey: command.idempotencyKey,
        status: "pending",
        receiptId: "pending-react",
      };
    },
    async getReceipt() {
      throw new Error("receipt service unavailable");
    },
    abandonUnknown() { throw new Error("not used"); },
  };

  await withHook(transport, undefined, async (current) => {
    await act(async () => current().execute(command));
    assert.equal(current().status, "pending");
    await act(async () => current().reconcile());
    assert.equal(current().status, "pending");
    assert.equal(current().state.receipt.receiptId, "pending-react");
  });
});

test("unmount aborts the signal without waiting for a never-resolving execute", async () => {
  let executeCalls = 0;
  let observedSignal;
  const never = new Promise(() => {});
  const transport = {
    execute(received, options) {
      executeCalls += 1;
      assert.deepEqual(received, command);
      observedSignal = options.signal;
      assert.equal(observedSignal.aborted, false);
      return never;
    },
    getReceipt() { throw new Error("not used"); },
    abandonUnknown() { throw new Error("not used"); },
  };

  await withHook(transport, undefined, async (current) => {
    await act(async () => {
      void current().execute(command);
      await Promise.resolve();
    });
    assert.equal(current().busy, true);
    assert.equal(executeCalls, 1);
  });
  assert.equal(executeCalls, 1);
  assert.equal(observedSignal.aborted, true);
});
