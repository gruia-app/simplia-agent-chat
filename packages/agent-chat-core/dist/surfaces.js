import { isJsonValue } from "./protocol.js";
export class SurfaceRegistry {
    #plugins = new Map();
    register(plugin) {
        if (!plugin.kind.trim())
            throw new Error("surface_plugin_kind_required");
        if (this.#plugins.has(plugin.kind))
            throw new Error(`surface_plugin_duplicate:${plugin.kind}`);
        if (plugin.versions.length === 0 || plugin.versions.some((version) => !Number.isInteger(version) || version < 1)) {
            throw new Error(`surface_plugin_invalid_versions:${plugin.kind}`);
        }
        this.#plugins.set(plugin.kind, plugin);
        return () => {
            if (this.#plugins.get(plugin.kind) === plugin)
                this.#plugins.delete(plugin.kind);
        };
    }
    resolve(kind) {
        return this.#plugins.get(kind);
    }
    kinds() {
        return [...this.#plugins.keys()].sort();
    }
    decode(block) {
        const plugin = this.#plugins.get(block.kind);
        if (!plugin || !plugin.versions.includes(block.schemaVersion))
            return undefined;
        const payload = plugin.validate(block.payload, block.schemaVersion);
        if (!isJsonValue(payload))
            throw new Error(`surface_plugin_non_json_payload:${block.kind}`);
        return {
            block: { ...block, payload },
            plugin,
        };
    }
}
export function createSurfaceActionCommand(args) {
    const action = args.block.actions?.find((candidate) => candidate.id === args.actionId);
    if (!action)
        throw new Error(`surface_action_unknown:${args.actionId}`);
    if (!args.idempotencyKey.trim())
        throw new Error("surface_action_idempotency_key_required");
    if (args.input !== undefined && !isJsonValue(args.input))
        throw new Error("surface_action_input_must_be_json");
    return {
        idempotencyKey: args.idempotencyKey,
        threadId: args.block.threadId,
        ...(args.block.turnId ? { turnId: args.block.turnId } : {}),
        surfaceId: args.block.id,
        revision: args.block.revision,
        actionId: action.id,
        action: action.action,
        ...(args.input !== undefined ? { input: args.input } : {}),
    };
}
export function findSurfaceAction(block, actionId) {
    return block.actions?.find((action) => action.id === actionId);
}
export function unknownSurfaceSummary(block) {
    const title = block.presentation?.title?.trim();
    return title ? `${title} (${block.kind} v${block.schemaVersion})` : `${block.kind} v${block.schemaVersion}`;
}
//# sourceMappingURL=surfaces.js.map