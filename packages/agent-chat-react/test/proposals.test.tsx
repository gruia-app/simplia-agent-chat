// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { ChatLog, IrreversibleDialog, PlanSteps, ProposalCard, UndoToast, type Proposal } from "../src/index.js";

afterEach(cleanup);

const proposal = {
  id: "p1", tool: "campanas.lanzar", state: "proposed", confirm_effective: "strong", change_id: null,
} as Proposal;

describe("F1 proposal surfaces", () => {
  it("keeps streamed fragments out of the live log until completion", () => {
    const item = { id: "m1", threadId: "t1", turnId: "u1", kind: "message", role: "assistant", status: "streaming", text: "Hola" } as const;
    const { rerender } = render(createElement(ChatLog, { items: [item] }));
    const log = screen.getByRole("log");
    expect(log.getAttribute("aria-live")).toBe("polite");
    expect(log.querySelector(".sac-f1-message")?.getAttribute("aria-hidden")).toBe("true");
    rerender(createElement(ChatLog, { items: [{ ...item, status: "completed", text: "Hola, mundo" }] }));
    expect(log.querySelector(".sac-f1-message")?.hasAttribute("aria-hidden")).toBe(false);
    expect(log.textContent).toContain("Hola, mundo");
  });

  it("shows typed diff and callbacks without moving focus for a new proposal", () => {
    const accept = vi.fn();
    const input = document.createElement("input"); document.body.append(input); input.focus();
    render(createElement(ProposalCard, { proposal, effect: "irreversible", costLabel: "5 créditos", diff: { kind: "text", hunks: [{ path: "Asunto", before: "Viejo", after: "Nuevo" }] }, onAccept: accept }));
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("article").textContent).toContain("Pide confirmación");
    expect(document.querySelector("del")?.textContent).toBe("Viejo");
    expect(document.querySelector("ins")?.textContent).toBe("Nuevo");
    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    expect(accept).toHaveBeenCalledWith(proposal);
    input.remove();
  });

  it("requires the explicit checkbox, traps Tab, and restores focus", () => {
    const confirm = vi.fn(); const cancel = vi.fn();
    const opener = document.createElement("button"); document.body.append(opener); opener.focus();
    const { rerender } = render(createElement(IrreversibleDialog, { open: true, title: "Enviar", description: "Se enviará el mensaje.", onConfirm: confirm, onCancel: cancel }));
    const dialog = screen.getByRole("alertdialog");
    const checkbox = screen.getByRole("checkbox");
    const button = screen.getByRole("button", { name: "Confirmar acción irreversible" });
    expect(document.activeElement).toBe(checkbox);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(checkbox);
    expect((button as HTMLButtonElement).disabled).toBe(false);
    button.focus(); fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(checkbox);
    fireEvent.click(button); expect(confirm).toHaveBeenCalledOnce();
    rerender(createElement(IrreversibleDialog, { open: false, title: "Enviar", description: "Se enviará el mensaje.", onConfirm: confirm, onCancel: cancel }));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("only offers undo within the server supplied window", () => {
    const undo = vi.fn();
    const change = { change_id: "c1", applied_at: "2026-09-26T12:00:00.000Z", undo_window_s: 30, undo_mode: "revert" as const };
    const { rerender } = render(createElement(UndoToast, { change, onUndo: undo, now: new Date("2026-09-26T12:00:20.000Z") }));
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(undo).toHaveBeenCalledWith("c1");
    rerender(createElement(UndoToast, { change, onUndo: undo, now: new Date("2026-09-26T12:00:31.000Z") }));
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
  });

  it("hides both undo controls at the deadline without a parent rerender", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-26T12:00:00.000Z"));
      const applied = { ...proposal, state: "applied" as const, change_id: "c1" };
      const change = { change_id: "c1", applied_at: "2026-09-26T12:00:00.000Z", undo_window_s: 2, undo_mode: "revert" as const };
      render(<><ProposalCard proposal={applied} undoUntil="2026-09-26T12:00:02.000Z" onUndo={vi.fn()} /><UndoToast change={change} onUndo={vi.fn()} /></>);
      expect(screen.getAllByRole("button", { name: "Deshacer" })).toHaveLength(2);
      act(() => vi.advanceTimersByTime(2_000));
      expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it("accepts plan proposals one step at a time and leaves terminal proposals inert", () => {
    const acceptStep = vi.fn();
    const first = { id: "s1", label: "Preparar", status: "current" as const, proposal };
    const secondProposal = { ...proposal, id: "p2", state: "modified" as const };
    const second = { id: "s2", label: "Publicar", status: "pending" as const, proposal: secondProposal };
    render(createElement(PlanSteps, { steps: [first, second], onAcceptStep: acceptStep }));
    fireEvent.click(screen.getByRole("button", { name: "Aceptar paso: Preparar" }));
    expect(acceptStep).toHaveBeenCalledWith(first, proposal);
    expect(screen.queryByRole("button", { name: "Aceptar paso: Publicar" })).toBeNull();
    cleanup();
    render(createElement(ProposalCard, { proposal: secondProposal, onAccept: vi.fn() }));
    expect(screen.queryByRole("button", { name: "Aceptar" })).toBeNull();
  });
});
