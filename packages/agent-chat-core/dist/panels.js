export function createMemoryPanel(entries = []) {
    return { entries: [...entries] };
}
export function reduceMemoryPanel(state, event) {
    switch (event.type) {
        case "entry.recorded": {
            if (state.entries.some((entry) => entry.id === event.entry.id)) {
                return {
                    entries: state.entries.map((entry) => entry.id === event.entry.id ? event.entry : entry),
                };
            }
            return { entries: [...state.entries, event.entry] };
        }
        case "entry.forgotten":
            return {
                entries: state.entries.map((entry) => entry.id === event.entryId ? { ...entry, forgottenAt: event.forgottenAt } : entry),
            };
    }
}
/** Solo las entradas vigentes (no olvidadas) — lo que ve el modelo. */
export function activeMemoryEntries(state) {
    return state.entries.filter((entry) => entry.forgottenAt === undefined);
}
/**
 * Deriva el panel del plan: uso del mes + presión de umbral (§1.3, §8).
 * `exceeded` si el uso supera el umbral; `at_threshold` si lo alcanza.
 */
export function derivePlanPanel(usage, thresholds = {}) {
    const checks = [
        [usage.creditsUsed, thresholds.credits],
        [usage.moneyCentsUsed, thresholds.money_cents],
    ];
    let pressure = "normal";
    for (const [used, limit] of checks) {
        if (typeof used !== "number" || typeof limit !== "number")
            continue;
        if (used > limit)
            pressure = "exceeded";
        else if (used === limit && pressure !== "exceeded")
            pressure = "at_threshold";
    }
    return { usage: { ...usage }, thresholds: { ...thresholds }, pressure };
}
export function createByoPanel(keys = []) {
    return { keys: keys.map((key) => ({ ...key })) };
}
export function reduceByoPanel(state, event) {
    switch (event.type) {
        case "key.added": {
            const exists = state.keys.some((key) => key.provider === event.entry.provider);
            return {
                keys: exists
                    ? state.keys.map((key) => (key.provider === event.entry.provider ? { ...event.entry } : key))
                    : [...state.keys, { ...event.entry }],
            };
        }
        case "key.revoked":
            return {
                keys: state.keys.map((key) => key.provider === event.provider
                    ? { ...key, status: "revoked", revokedAt: event.revokedAt }
                    : key),
            };
    }
}
/** true si la org tiene alguna clave BYO activa (habilita el plan superior). */
export function hasActiveByoKey(state) {
    return state.keys.some((key) => key.status === "active");
}
//# sourceMappingURL=panels.js.map