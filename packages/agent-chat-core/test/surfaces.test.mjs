import assert from "node:assert/strict";
import test from "node:test";

import {
  createSurfaceActionCommand,
  findSurfaceAction,
  SurfaceRegistry,
  unknownSurfaceSummary,
} from "../dist/index.js";
import { baseSurface } from "./helpers.mjs";

function tablePlugin(overrides = {}) {
  return {
    kind: "data.table",
    versions: [1, 2],
    validate(payload) {
      if (!payload || typeof payload !== "object" || !Array.isArray(payload.rows)) {
        throw new Error("rows_required");
      }
      return payload;
    },
    summarize(payload) {
      return `${payload.rows.length} rows`;
    },
    getA11yLabel(payload) {
      return `Table with ${payload.rows.length} rows`;
    },
    ...overrides,
  };
}

test("surface registry resolves, validates, decodes and unregisters plugins", () => {
  const registry = new SurfaceRegistry();
  const plugin = tablePlugin();
  const unregister = registry.register(plugin);

  assert.strictEqual(registry.resolve("data.table"), plugin);
  assert.deepEqual(registry.kinds(), ["data.table"]);
  const decoded = registry.decode(baseSurface());
  assert.strictEqual(decoded.plugin, plugin);
  assert.equal(decoded.plugin.summarize(decoded.block.payload), "1 rows");
  assert.equal(decoded.plugin.getA11yLabel(decoded.block.payload), "Table with 1 rows");

  assert.equal(registry.decode(baseSurface({ schemaVersion: 99 })), undefined);
  assert.equal(registry.decode(baseSurface({ kind: "unknown" })), undefined);
  assert.throws(() => registry.decode(baseSurface({ payload: {} })), /rows_required/);

  unregister();
  assert.equal(registry.resolve("data.table"), undefined);
});

test("surface registry rejects ambiguous or unsafe plugins", () => {
  const registry = new SurfaceRegistry();
  registry.register(tablePlugin());
  assert.throws(() => registry.register(tablePlugin()), /surface_plugin_duplicate:data\.table/);
  assert.throws(() => new SurfaceRegistry().register(tablePlugin({ kind: " " })), /surface_plugin_kind_required/);
  assert.throws(() => new SurfaceRegistry().register(tablePlugin({ versions: [] })), /surface_plugin_invalid_versions/);
  assert.throws(() => new SurfaceRegistry().register(tablePlugin({ versions: [0, 1.5] })), /surface_plugin_invalid_versions/);

  const unsafe = new SurfaceRegistry();
  unsafe.register(tablePlugin({ validate: () => ({ rows: [undefined] }) }));
  assert.throws(() => unsafe.decode(baseSurface()), /surface_plugin_non_json_payload/);
});

test("surface actions are revision-bound and idempotent command envelopes", () => {
  const block = baseSurface();
  assert.equal(findSurfaceAction(block, "refresh")?.action, "data.refresh");
  assert.equal(findSurfaceAction(block, "missing"), undefined);

  assert.deepEqual(createSurfaceActionCommand({
    block,
    actionId: "refresh",
    input: { force: true },
    idempotencyKey: "idem-1",
  }), {
    idempotencyKey: "idem-1",
    threadId: "thread-1",
    turnId: "turn-1",
    surfaceId: "surface-1",
    revision: 1,
    actionId: "refresh",
    action: "data.refresh",
    input: { force: true },
  });

  assert.throws(() => createSurfaceActionCommand({ block, actionId: "missing", idempotencyKey: "x" }), /surface_action_unknown/);
  assert.throws(() => createSurfaceActionCommand({ block, actionId: "refresh", idempotencyKey: " " }), /surface_action_idempotency_key_required/);
  assert.throws(() => createSurfaceActionCommand({ block, actionId: "refresh", idempotencyKey: "x", input: () => {} }), /surface_action_input_must_be_json/);
});

test("unknown surfaces retain a useful safe summary", () => {
  assert.equal(unknownSurfaceSummary(baseSurface()), "data.table v1");
  assert.equal(
    unknownSurfaceSummary(baseSurface({ presentation: { title: "Quarterly metrics" } })),
    "Quarterly metrics (data.table v1)",
  );
});
