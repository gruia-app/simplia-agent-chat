"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  activeMemoryEntries,
  canTransition,
  type AgentServerClient,
  type ByoPanelState,
  type ChatItem,
  type MemoryPanelState,
  type StructuredDiff,
} from "simplia-agent-chat/core";

export type Proposal = Awaited<ReturnType<AgentServerClient["listProposals"]>>[number];

function useUndoWindow(deadline: number, now?: Date): boolean {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (now || !Number.isFinite(deadline)) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setTick((value) => value + 1), Math.min(remaining, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [deadline, now, tick]);
  return Number.isFinite(deadline) && deadline > (now?.getTime() ?? Date.now());
}

/** Messages remain ordinary text; streamed fragments are only announced once complete. */
export function ChatLog({ items, label = "Conversación" }: { items: readonly ChatItem[]; label?: string }) {
  return (
    <div className="sac-f1-log" role="log" aria-live="polite" aria-relevant="additions" aria-label={label}>
      {items.filter((item) => item.kind === "message" && item.text).map((item) => (
        <div key={`${item.id}:${item.status === "streaming" ? "stream" : "final"}`} className="sac-f1-message" aria-hidden={item.status === "streaming" ? true : undefined}>
          <strong>{item.role === "user" ? "Tú" : "Asistente"}</strong>
          <p>{item.text}</p>
        </div>
      ))}
    </div>
  );
}

function DisplayValue({ value }: { value: unknown }) {
  if (value === undefined) return <span>∅</span>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return <span>{String(value)}</span>;
  return <span>Dato estructurado</span>;
}

/** Only the trusted StructuredDiff model is rendered, never Proposal.preview. */
export function ProposalDiff({ diff }: { diff: StructuredDiff }) {
  if (diff.kind === "text") return <div className="sac-f1-diff">{diff.hunks.map((hunk, index) => (
    <div key={`${hunk.path}:${index}`}><strong>{hunk.path}</strong><del>{hunk.before}</del><ins>{hunk.after}</ins></div>
  ))}</div>;
  if (diff.kind === "fields") return <div className="sac-f1-diff">{diff.changes.map((change, index) => (
    <div key={`${change.path}:${index}`}><strong>{change.path}</strong>{change.op !== "add" && <del><DisplayValue value={change.before} /></del>}{change.op !== "remove" && <ins><DisplayValue value={change.after} /></ins>}</div>
  ))}</div>;
  return <div className="sac-f1-diff">{diff.changes.map((change, index) => (
    <div key={`${change.table}:${change.key}:${index}`}><strong>{change.table}: {change.key}</strong>{change.op !== "add" && <del>Fila anterior</del>}{change.op !== "remove" && <ins>Fila nueva</ins>}</div>
  ))}</div>;
}

export interface ProposalCardProps {
  proposal: Proposal;
  title?: string;
  effect?: "reversible" | "irreversible";
  diff?: StructuredDiff;
  costLabel?: string;
  undoUntil?: string;
  now?: Date;
  onAccept?: (proposal: Proposal) => void;
  onModify?: (proposal: Proposal) => void;
  onDiscard?: (proposal: Proposal) => void;
  onUndo?: (proposal: Proposal) => void;
}

export function ProposalCard({ proposal, title, effect, diff, costLabel, undoUntil, now, onAccept, onModify, onDiscard, onUndo }: ProposalCardProps) {
  const headingId = useId();
  const actionable = canTransition(proposal.state, "accept");
  const withinUndoWindow = useUndoWindow(undoUntil ? Date.parse(undoUntil) : NaN, now);
  const canUndo = proposal.state === "applied" && !!proposal.change_id && withinUndoWindow;
  return <article className="sac-f1-card" aria-labelledby={headingId}>
    <h3 id={headingId}>{title ?? proposal.tool}</h3>
    <div className="sac-f1-meta">
      {effect && <span className="sac-f1-chip">{effect === "reversible" ? "Reversible" : "Irreversible"}</span>}
      {costLabel && <span className="sac-f1-chip">{costLabel}</span>}
      {proposal.confirm_effective !== "none" && <span className="sac-f1-chip">Pide confirmación</span>}
    </div>
    {diff && <ProposalDiff diff={diff} />}
    {actionable && <div className="sac-f1-actions">
      {onAccept && <button type="button" className="sac-button sac-button-primary" onClick={() => onAccept(proposal)}>Aceptar</button>}
      {onModify && <button type="button" className="sac-button" onClick={() => onModify(proposal)}>Modificar</button>}
      {onDiscard && <button type="button" className="sac-button" onClick={() => onDiscard(proposal)}>Descartar</button>}
    </div>}
    {canUndo && onUndo && <button type="button" className="sac-button" onClick={() => onUndo(proposal)}>Deshacer</button>}
  </article>;
}

export interface IrreversibleDialogProps {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
}

export function IrreversibleDialog({ open, title, description, onConfirm, onCancel, confirmLabel = "Confirmar acción irreversible" }: IrreversibleDialogProps) {
  const headingId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const checkRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAcknowledged(false);
    checkRef.current?.focus();
    return () => previousFocus.current?.focus();
  }, [open]);
  if (!open) return null;
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)') ?? []);
    const first = controls[0]; const last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <div className="sac-f1-dialog-backdrop"><div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={descriptionId} className="sac-f1-dialog" onKeyDown={onKeyDown}>
    <h2 id={headingId}>{title}</h2><p id={descriptionId}>{description}</p>
    <label><input ref={checkRef} type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> Entiendo que esta acción puede ser irreversible</label>
    <div className="sac-f1-actions"><button className="sac-button" type="button" onClick={onCancel}>Cancelar</button><button className="sac-button sac-button-primary" type="button" disabled={!acknowledged} onClick={onConfirm}>{confirmLabel}</button></div>
  </div></div>;
}

export interface UndoToastProps {
  change: { change_id: string; applied_at: string; undo_window_s: number; undo_mode: "revert" | "compensate" | "none" };
  onUndo: (changeId: string) => void;
  now?: Date;
  message?: string;
}

export function UndoToast({ change, onUndo, now, message = "Cambio aplicado" }: UndoToastProps) {
  const until = Date.parse(change.applied_at) + change.undo_window_s * 1000;
  const withinUndoWindow = useUndoWindow(until, now);
  if (change.undo_mode === "none" || !withinUndoWindow) return null;
  return <div className="sac-f1-toast" role="status">{message} <button className="sac-button" type="button" onClick={() => onUndo(change.change_id)}>Deshacer</button></div>;
}

export interface PlanStep { id: string; label: string; status: "pending" | "current" | "completed" | "failed"; proposal?: Proposal; }
export function PlanSteps({ steps, onAcceptStep }: { steps: readonly PlanStep[]; onAcceptStep?: (step: PlanStep, proposal: Proposal) => void }) {
  return <ol className="sac-f1-steps" aria-label="Pasos del plan">{steps.map((step) => <li key={step.id} aria-current={step.status === "current" ? "step" : undefined}>{step.label} <span>{step.status === "completed" ? "Completado" : step.status === "failed" ? "Error" : step.status === "current" ? "En curso" : "Pendiente"}</span>{step.proposal && onAcceptStep && canTransition(step.proposal.state, "accept") && <button className="sac-button" type="button" onClick={() => onAcceptStep(step, step.proposal!)}>Aceptar paso: {step.label}</button>}</li>)}</ol>;
}

export function MemoryPanel({ state, title = "Memoria" }: { state: MemoryPanelState; title?: string }) {
  return <section className="sac-f1-panel" aria-label={title}><h2>{title}</h2>{activeMemoryEntries(state).length ? <ul>{activeMemoryEntries(state).map((entry) => <li key={entry.id}>{entry.text}</li>)}</ul> : <p>Sin recuerdos guardados.</p>}</section>;
}

export function BYOPanel({ state, title = "Claves propias", actions }: { state: ByoPanelState; title?: string; actions?: ReactNode }) {
  return <section className="sac-f1-panel" aria-label={title}><h2>{title}</h2>{state.keys.length ? <ul>{state.keys.map((key) => <li key={key.provider}>{key.provider}: {key.status === "active" ? "Activa" : key.status === "revoked" ? "Revocada" : "Ausente"}{key.keyLast4 && <> ····{key.keyLast4.slice(-4)}</>}</li>)}</ul> : <p>Sin claves configuradas.</p>}{actions}</section>;
}
