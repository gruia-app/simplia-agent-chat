"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { JsonValue, PendingInteraction } from "@simplia/agent-chat-core";

export interface PendingInteractionsProps {
  interactions: PendingInteraction[];
  onResolve: (interaction: PendingInteraction, resolution: JsonValue) => void | Promise<void>;
}

const AFFIRMATIVE_DECISIONS = new Set([
  "accept",
  "allow",
  "approve",
  "approved",
  "confirm",
  "yes",
]);

export function isAffirmativeDecision(decision: string): boolean {
  return AFFIRMATIVE_DECISIONS.has(decision.trim().toLowerCase());
}

export interface InteractionResolutionState {
  readonly inFlight: boolean;
  readonly confirmation: string | undefined;
}

export function createInteractionResolutionState(): InteractionResolutionState {
  return { inFlight: false, confirmation: undefined };
}

export function selectApprovalDecision(
  state: InteractionResolutionState,
  decision: string,
): InteractionResolutionState {
  if (state.inFlight || state.confirmation !== undefined) return state;
  return { ...state, confirmation: decision };
}

export function cancelApprovalConfirmation(
  state: InteractionResolutionState,
): InteractionResolutionState {
  if (state.inFlight) return state;
  return { ...state, confirmation: undefined };
}

export function beginInteractionResolution(
  state: InteractionResolutionState,
): { readonly accepted: boolean; readonly state: InteractionResolutionState } {
  if (state.inFlight) return { accepted: false, state };
  return { accepted: true, state: { ...state, inFlight: true } };
}

export function unlockInteractionResolution(
  state: InteractionResolutionState,
): InteractionResolutionState {
  return { ...state, inFlight: false };
}

function InteractionCard({
  interaction,
  onResolve,
}: {
  interaction: PendingInteraction;
  onResolve: PendingInteractionsProps["onResolve"];
}) {
  const [answer, setAnswer] = useState("");
  const [resolution, setResolution] = useState(createInteractionResolutionState);
  const [resolutionError, setResolutionError] = useState<string>();
  const resolutionRef = useRef(resolution);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = `sac-interaction-${interaction.id}`;
  const decisions = interaction.availableDecisions ??
    (interaction.kind === "approval" ? ["approve", "deny"] : []);
  const requiresConfirmation = interaction.kind === "approval";

  const submitResolution = (value: JsonValue) => {
    const attempt = beginInteractionResolution(resolutionRef.current);
    if (!attempt.accepted) return;
    resolutionRef.current = attempt.state;
    setResolution(attempt.state);
    setResolutionError(undefined);
    void Promise.resolve()
      .then(() => onResolve(interaction, value))
      .catch(() => {
        const unlocked = unlockInteractionResolution(resolutionRef.current);
        resolutionRef.current = unlocked;
        setResolution(unlocked);
        setResolutionError("The response could not be submitted. Try again.");
      });
  };

  const submitAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = answer.trim();
    if (!value) return;
    submitResolution({ answer: value });
  };

  const chooseDecision = (decision: string) => {
    if (resolutionRef.current.inFlight) return;
    if (requiresConfirmation) {
      const next = selectApprovalDecision(resolutionRef.current, decision);
      resolutionRef.current = next;
      setResolution(next);
      return;
    }
    submitResolution({ decision });
  };

  const confirmation = resolution.confirmation;

  useEffect(() => {
    if (confirmation !== undefined && !resolution.inFlight) {
      confirmButtonRef.current?.focus();
    }
  }, [confirmation, resolution.inFlight]);

  return (
    <section
      className={`sac-interaction sac-interaction-${interaction.kind}`}
      aria-labelledby={titleId}
      {...(resolution.inFlight ? { "aria-busy": true } : {})}
    >
      <div className="sac-interaction-copy">
        <span className="sac-eyebrow">
          {interaction.kind === "approval" ? "APPROVAL_REQUIRED" : "INPUT_REQUIRED"}
        </span>
        <h3 id={titleId}>{interaction.title}</h3>
        {interaction.description ? <p>{interaction.description}</p> : null}
        {requiresConfirmation ? (
          <p className="sac-interaction-confirm-hint">
            Selecting a decision requires Confirm before it is submitted.
          </p>
        ) : null}
      </div>
      {decisions.length > 0 ? (
        confirmation !== undefined ? (
          <div
            className="sac-interaction-actions sac-interaction-confirm"
            role="group"
            aria-label={`Confirm ${confirmation} for ${interaction.title}`}
          >
            <p className="sac-interaction-confirm-choice">
              Confirm decision: <strong>{confirmation}</strong>
            </p>
            <button
              className={`sac-button${isAffirmativeDecision(confirmation) ? " sac-button-primary" : ""}`}
              type="button"
              disabled={resolution.inFlight}
              aria-label={`Confirm ${confirmation} for ${interaction.title}`}
              ref={confirmButtonRef}
              onClick={() => submitResolution({ decision: confirmation })}
            >
              Confirm {confirmation}
            </button>
            <button
              className="sac-button"
              type="button"
              disabled={resolution.inFlight}
              aria-label={`Back to decisions for ${interaction.title}`}
              onClick={() => {
                const next = cancelApprovalConfirmation(resolutionRef.current);
                resolutionRef.current = next;
                setResolution(next);
              }}
            >
              Back
            </button>
          </div>
        ) : (
          <div className="sac-interaction-actions" role="group" aria-label={`Respond to ${interaction.title}`}>
            {decisions.map((decision) => (
              <button
                className={`sac-button${isAffirmativeDecision(decision) ? " sac-button-primary" : ""}`}
                key={decision}
                type="button"
                disabled={resolution.inFlight}
                onClick={() => chooseDecision(decision)}
              >
                {decision}
              </button>
            ))}
          </div>
        )
      ) : (
        <form className="sac-answer-form" onSubmit={submitAnswer}>
          <label htmlFor={`${titleId}-answer`}>{`Answer for ${interaction.title}`}</label>
          <div>
            <input
              id={`${titleId}-answer`}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              autoComplete="off"
              disabled={resolution.inFlight}
            />
            <button
              className="sac-button sac-button-primary"
              type="submit"
              disabled={resolution.inFlight || !answer.trim()}
            >
              Submit
            </button>
          </div>
        </form>
      )}
      {resolutionError ? <p className="sac-interaction-error" role="alert">{resolutionError}</p> : null}
    </section>
  );
}

export function PendingInteractions({ interactions, onResolve }: PendingInteractionsProps) {
  const pending = interactions.filter((interaction) => interaction.status === "pending");
  if (pending.length === 0) return null;
  return (
    <div className="sac-interactions" aria-label="Pending agent interactions">
      {pending.map((interaction) => (
        <InteractionCard key={interaction.id} interaction={interaction} onResolve={onResolve} />
      ))}
    </div>
  );
}
