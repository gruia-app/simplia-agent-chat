const CONFIRM_ORDER = { none: 0, card: 1, strong: 2 };
/**
 * Devuelve el confirm efectivo: el base de la ToolSpec escalado a `strong`
 * si el coste estimado supera el umbral vigente. Solo sube `card`→`strong`
 * (§2); `none` y `strong` no cambian.
 */
export function resolveConfirmEffective(base, estimate, thresholds = {}) {
    if (base !== "card" || estimate === null || estimate.kind === "none")
        return base;
    const limit = estimate.kind === "credits" ? thresholds.credits : thresholds.money_cents;
    if (typeof limit === "number" && estimate.amount > limit)
        return "strong";
    return base;
}
export function isConfirmEscalated(base, effective) {
    return CONFIRM_ORDER[effective] > CONFIRM_ORDER[base];
}
/** §4: `confirm_effective=strong` exige `ack_irreversible=true` en apply. */
export function requiresIrreversibleAck(confirmEffective) {
    return confirmEffective === "strong";
}
export class IrreversibleAckRequiredError extends Error {
    code = "ack_irreversible_required";
    constructor() {
        super("confirm_effective=strong requires ack_irreversible=true");
        this.name = "IrreversibleAckRequiredError";
    }
}
/** Guarda de apply (§4): lanza si falta el ack exigido por strong. */
export function assertIrreversibleAck(confirmEffective, ackIrreversible) {
    if (requiresIrreversibleAck(confirmEffective) && ackIrreversible !== true) {
        throw new IrreversibleAckRequiredError();
    }
}
//# sourceMappingURL=confirm-policy.js.map