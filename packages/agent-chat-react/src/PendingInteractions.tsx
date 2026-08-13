"use client";

import { useState, type FormEvent } from "react";
import type { JsonValue, PendingInteraction } from "@simplia/agent-chat-core";

export interface PendingInteractionsProps {
  interactions: PendingInteraction[];
  onResolve: (interaction: PendingInteraction, resolution: JsonValue) => void | Promise<void>;
}

function InteractionCard({
  interaction,
  onResolve,
}: {
  interaction: PendingInteraction;
  onResolve: PendingInteractionsProps["onResolve"];
}) {
  const [answer, setAnswer] = useState("");
  const titleId = `sac-interaction-${interaction.id}`;
  const decisions = interaction.availableDecisions ??
    (interaction.kind === "approval" ? ["approve", "deny"] : []);

  const submitAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = answer.trim();
    if (!value) return;
    void onResolve(interaction, { answer: value });
  };

  return (
    <section className={`sac-interaction sac-interaction-${interaction.kind}`} aria-labelledby={titleId}>
      <div className="sac-interaction-copy">
        <span className="sac-eyebrow">
          {interaction.kind === "approval" ? "APPROVAL_REQUIRED" : "INPUT_REQUIRED"}
        </span>
        <h3 id={titleId}>{interaction.title}</h3>
        {interaction.description ? <p>{interaction.description}</p> : null}
      </div>
      {decisions.length > 0 ? (
        <div className="sac-interaction-actions" role="group" aria-label={`Respond to ${interaction.title}`}>
          {decisions.map((decision) => (
            <button
              className={`sac-button ${decision.toLowerCase().includes("approve") ? "sac-button-primary" : ""}`}
              key={decision}
              type="button"
              onClick={() => void onResolve(interaction, { decision })}
            >
              {decision}
            </button>
          ))}
        </div>
      ) : (
        <form className="sac-answer-form" onSubmit={submitAnswer}>
          <label htmlFor={`${titleId}-answer`}>Answer</label>
          <div>
            <input
              id={`${titleId}-answer`}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              autoComplete="off"
            />
            <button className="sac-button sac-button-primary" type="submit" disabled={!answer.trim()}>
              Submit
            </button>
          </div>
        </form>
      )}
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
