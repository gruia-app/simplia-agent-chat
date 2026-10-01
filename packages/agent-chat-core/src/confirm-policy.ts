import type { ToolSpec } from "@simplia/agent-chat-contract";

/**
 * SPEC-CHAT-F1-R687 rev 2 §2/§4: política de confirmación efectiva.
 *
 * El servidor decide `confirm_effective`; la interfaz solo lo refleja.
 * Escalado por coste: si `estimate` supera el umbral de la organización,
 * `card` pasa a `strong`. Nunca baja el nivel. El umbral vive en el kernel
 * (§8); la app puede ser más estricta, nunca más laxa — esta función solo
 * compara contra el umbral que el llamante ya haya resuelto.
 */

export type ConfirmLevel = NonNullable<ToolSpec["confirm"]>;

export type CostKind = "none" | "credits" | "money";

/** Umbral por organización (§8: `{credits, money_cents}` en el kernel). */
export interface CostThresholds {
  credits?: number | null;
  money_cents?: number | null;
}

export interface EffectiveEstimate {
  kind: CostKind;
  /** Créditos si kind=credits; money_cents si kind=money. */
  amount: number;
}

const CONFIRM_ORDER: Record<ConfirmLevel, number> = { none: 0, card: 1, strong: 2 };

/**
 * Devuelve el confirm efectivo: el base de la ToolSpec escalado a `strong`
 * si el coste estimado supera el umbral vigente. Solo sube `card`→`strong`
 * (§2); `none` y `strong` no cambian.
 */
export function resolveConfirmEffective(
  base: ConfirmLevel,
  estimate: EffectiveEstimate | null,
  thresholds: CostThresholds = {},
): ConfirmLevel {
  if (base !== "card" || estimate === null || estimate.kind === "none") return base;
  const limit = estimate.kind === "credits" ? thresholds.credits : thresholds.money_cents;
  if (typeof limit === "number" && estimate.amount > limit) return "strong";
  return base;
}

export function isConfirmEscalated(base: ConfirmLevel, effective: ConfirmLevel): boolean {
  return CONFIRM_ORDER[effective] > CONFIRM_ORDER[base];
}

/** §4: `confirm_effective=strong` exige `ack_irreversible=true` en apply. */
export function requiresIrreversibleAck(confirmEffective: ConfirmLevel): boolean {
  return confirmEffective === "strong";
}

export class IrreversibleAckRequiredError extends Error {
  readonly code = "ack_irreversible_required";

  constructor() {
    super("confirm_effective=strong requires ack_irreversible=true");
    this.name = "IrreversibleAckRequiredError";
  }
}

/** Guarda de apply (§4): lanza si falta el ack exigido por strong. */
export function assertIrreversibleAck(
  confirmEffective: ConfirmLevel,
  ackIrreversible: boolean | undefined,
): void {
  if (requiresIrreversibleAck(confirmEffective) && ackIrreversible !== true) {
    throw new IrreversibleAckRequiredError();
  }
}
