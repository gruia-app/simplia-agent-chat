"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  isTerminalTurnStatus,
  type ChatTurn,
  type ThreadRunState,
} from "simplia-agent-chat/core";
import {
  resolveAgentChatCopy,
  sacThemeAttributes,
  type AgentChatCopyOverrides,
  type AgentChatTheme,
} from "./copy.js";
import {
  beginInterruptRequest,
  completeInterruptRequest,
  createInterruptRequestState,
  failInterruptRequest,
  reconcileInterruptRequest,
} from "./interrupt.js";

export interface ChatRunStatusProps {
  runState: ThreadRunState;
  onInterrupt?: ((turn: ChatTurn) => void | Promise<void>) | undefined;
  copy?: AgentChatCopyOverrides | undefined;
  theme?: AgentChatTheme | undefined;
}

export function ChatRunStatus({ runState, onInterrupt, copy, theme }: ChatRunStatusProps) {
  const resolved = resolveAgentChatCopy(copy);
  const [request, setRequest] = useState(createInterruptRequestState);
  const [interruptError, setInterruptError] = useState<string>();
  const interruptDescriptionId = useId();
  const requestRef = useRef(request);
  const activeTurn = runState.turn && !isTerminalTurnStatus(runState.turn.status) ? runState.turn : undefined;
  const activeTurnRef = useRef(activeTurn);
  activeTurnRef.current = activeTurn;

  useEffect(() => {
    const next = reconcileInterruptRequest(requestRef.current, activeTurn);
    if (next === requestRef.current) return;
    requestRef.current = next;
    setRequest(next);
    setInterruptError(undefined);
  }, [activeTurn]);

  const showStop = Boolean(activeTurn && onInterrupt);
  const interruptLocked = request.status === "submitting" || request.status === "submitted";
  const interruptLabel = request.status === "submitting"
    ? resolved.interruptBusyLabel
    : request.status === "submitted"
      ? resolved.interruptRequestedLabel
      : resolved.interruptLabel;
  const interruptAnnouncement = request.status === "submitting" || request.status === "submitted"
    ? interruptLabel
    : undefined;

  const requestStop = () => {
    if (!activeTurn || !onInterrupt) return;
    const attempt = beginInterruptRequest(requestRef.current, activeTurn.id);
    if (!attempt.accepted) return;
    requestRef.current = attempt.state;
    setRequest(attempt.state);
    setInterruptError(undefined);
    const requestedTurnId = activeTurn.id;
    const isCurrentRequest = () => (
      activeTurnRef.current?.id === requestedTurnId
      && requestRef.current.turnId === requestedTurnId
      && requestRef.current.status === "submitting"
    );
    void Promise.resolve()
      .then(() => onInterrupt(activeTurn))
      .then(() => {
        if (!isCurrentRequest()) return;
        const completed = completeInterruptRequest(requestRef.current);
        requestRef.current = completed;
        setRequest(completed);
      })
      .catch(() => {
        if (!isCurrentRequest()) return;
        const failed = failInterruptRequest(requestRef.current);
        requestRef.current = failed;
        setRequest(failed);
        setInterruptError(resolved.interruptError);
      });
  };

  return (
    <div
      className="sac-run-status sac-theme"
      data-sac-run-phase={runState.phase}
      data-sac-interrupt-status={request.status}
      {...sacThemeAttributes(theme)}
    >
      <div className="sac-run-status-copy" role="status" aria-live="polite" aria-atomic="true">
        <span className={`sac-status sac-status-${runState.phase}`}>{resolved.runPhaseLabel(runState.phase)}</span>
        {runState.waitingKind === "approval" ? (
          <span className="sac-run-status-kind">{resolved.approvalRequiredLabel}</span>
        ) : runState.waitingKind === "input" ? (
          <span className="sac-run-status-kind">{resolved.inputRequiredLabel}</span>
        ) : null}
        {interruptAnnouncement ? <span className="sac-sr-only">{interruptAnnouncement}</span> : null}
      </div>
      {showStop ? (
        <>
          <button
            className="sac-button sac-run-status-stop"
            type="button"
            disabled={interruptLocked}
            aria-busy={request.status === "submitting"}
            aria-describedby={interruptDescriptionId}
            onClick={requestStop}
          >
            {interruptLabel}
          </button>
          <span className="sac-sr-only" id={interruptDescriptionId}>{resolved.interruptDescription}</span>
        </>
      ) : null}
      {interruptError ? <p className="sac-run-status-error" role="alert">{interruptError}</p> : null}
    </div>
  );
}
