import { useEffect, useRef, useState } from "react";
import { createByoPanel, createMemoryPanel, reduceByoPanel, reduceMemoryPanel, type ChatItem, type MemoryPanelState, type ByoPanelState } from "simplia-agent-chat/core";
import { BYOPanel, ChatComposer, ChatLog, IrreversibleDialog, MemoryPanel, ProposalCard, SuggestionChips, UndoToast } from "@simplia/agent-chat-react";
import type { Proposal } from "@simplia/agent-chat-contract";
import { AgentServerError } from "simplia-agent-chat/core";
import { client, getView, scenarios, setCostRise, subscribeView, type AppKey, type Scenario } from "./mock-server";

type Entry = { proposal: Proposal; scenario: Scenario; appliedAt?: string };
const initialMemory: Record<AppKey, MemoryPanelState> = {
  insaidr: createMemoryPanel([
    { id: "tone", text: "Tono: Tuteo, frases cortas, sin emojis", createdAt: new Date().toISOString() },
    { id: "signature", text: "Firma: Roberto · Simplificando", createdAt: new Date().toISOString() },
    { id: "icp", text: "ICP: Logística y 3PL de 20 a 200 empleados", createdAt: new Date().toISOString() },
  ]),
  famitale: createMemoryPanel([
    { id: "family", text: "Familia: Lucía (6 años) y su abuela", createdAt: new Date().toISOString() },
    { id: "style", text: "Estilo: Acuarela suave, tonos cálidos", createdAt: new Date().toISOString() },
    { id: "ending", text: "Final: Siempre con una escena de calma", createdAt: new Date().toISOString() },
  ]),
};
const greeting: Record<AppKey, string> = {
  insaidr: "Tienes 12 leads nuevos de logística y la secuencia «Logística Q4» en borrador.",
  famitale: "Tu cuento «Lucía y el faro» tiene 3 páginas sin ilustrar.",
};
const asItem = (text: string, role: "user" | "assistant", threadId: AppKey): ChatItem => ({ id: crypto.randomUUID(), threadId, turnId: crypto.randomUUID(), kind: "message", status: "completed", role, text });

export function App() {
  const [app, setApp] = useState<AppKey>("insaidr");
  const [tab, setTab] = useState<"chat" | "view">("chat");
  const [messages, setMessages] = useState<Record<AppKey, ChatItem[]>>({ insaidr: [asItem(greeting.insaidr, "assistant", "insaidr")], famitale: [asItem(greeting.famitale, "assistant", "famitale")] });
  const [entries, setEntries] = useState<Record<AppKey, Entry[]>>({ insaidr: [], famitale: [] });
  const [step, setStep] = useState<Record<AppKey, number>>({ insaidr: 0, famitale: 0 });
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [view, setView] = useState(getView);
  const [memory, setMemory] = useState(initialMemory);
  const [byo, setByo] = useState<ByoPanelState>(() => createByoPanel());
  const [accountOpen, setAccountOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [keyStatus, setKeyStatus] = useState("");
  const [error, setError] = useState("");
  const [costIncreased, setCostIncreased] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const memDialog = useRef<HTMLDialogElement>(null);
  const byoDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => subscribeView(() => setView(getView())), []);
  useEffect(() => { if (memoryOpen) memDialog.current?.showModal(); else memDialog.current?.close(); }, [memoryOpen]);
  useEffect(() => { if (accountOpen) byoDialog.current?.showModal(); else byoDialog.current?.close(); }, [accountOpen]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [messages, entries, app]);
  const active = entries[app];
  const pending = active.filter((e) => e.proposal.state === "proposed" || e.proposal.state === "modified").length;
  const pendingField = (field: string) => active.some((e) => e.scenario.field === field && (e.proposal.state === "proposed" || e.proposal.state === "modified"));
  const scenario = scenarios[app][step[app]];
  const announce = (text: string, role: "user" | "assistant" = "assistant") => setMessages((m) => ({ ...m, [app]: [...m[app], asItem(text, role, app)] }));
  const replaceEntry = (proposal: Proposal, patch: Partial<Entry> = {}) => setEntries((all) => ({ ...all, [app]: all[app].map((e) => e.proposal.id === proposal.id ? { ...e, ...patch, proposal: { ...proposal } } : e) }));
  const activeEntry = (id: string) => active.find((e) => e.proposal.id === id);
  const errorText = (cause: unknown) => cause instanceof AgentServerError ? cause.message : cause instanceof Error ? cause.message : "No se pudo completar la operación";

  async function send(value: string) {
    const text = value.trim(); if (!text) return;
    setError(""); announce(text, "user");
    const match = scenarios[app].find((s) => s.say === text) ?? scenarios[app].find((s) => text.toLowerCase().includes(s.tool.split(".")[1] ?? "~~~"));
    if (!match) { announce("Puedo proponer cambios en esta vista. Elige una sugerencia para ver el flujo completo."); return; }
    try {
      const proposal = await client.createProposal({ tool: match.tool, input: { value: match.after } });
      setEntries((all) => ({ ...all, [app]: [...all[app], { proposal, scenario: match }] }));
      announce(match.text);
      setStep((s) => ({ ...s, [app]: Math.min(s[app] + 1, scenarios[app].length) }));
    } catch (cause) { setError(errorText(cause)); }
  }
  async function apply(proposal: Proposal, strong = false) {
    setError("");
    try {
      const { token } = await client.acceptProposal(proposal.id);
      const result = await client.applyProposal(proposal.id, { token, ack_irreversible: strong });
      const updated = (await client.listProposals({ thread_id: app })).find((p) => p.id === proposal.id)!;
      replaceEntry(updated, { appliedAt: new Date().toISOString() });
      const e = activeEntry(proposal.id);
      if (e?.scenario.grace) setTimeout(async () => {
        const current = (await client.listProposals({ thread_id: app })).find((p) => p.id === proposal.id);
        if (current) replaceEntry(current);
      }, e.scenario.grace + 20);
      if (e?.scenario.remember) {
        const item = e.scenario.remember;
        setMemory((m) => ({ ...m, [app]: reduceMemoryPanel(m[app], { type: "entry.recorded", entry: { id: crypto.randomUUID(), text: `${item.k}: ${item.v}`, createdAt: new Date().toISOString(), sourceChangeId: result.change_id } }) }));
      }
      announce(e?.scenario.grace ? "Programado con 30 segundos de gracia. Puedes cancelar el envío." : "Cambio aplicado. Puedes deshacerlo durante una hora si es reversible.");
      setConfirm(null);
    } catch (cause) {
      setError(errorText(cause)); setConfirm(null);
      const current = (await client.listProposals({ thread_id: app })).find((p) => p.id === proposal.id);
      if (current) replaceEntry(current);
    }
  }
  async function discard(proposal: Proposal) {
    try { const next = await client.discardProposal(proposal.id); replaceEntry(next); announce("Propuesta descartada."); } catch (cause) { setError(errorText(cause)); }
  }
  async function modify(proposal: Proposal) {
    try {
      const next = await client.modifyProposal(proposal.id, { input: { value: editValue.trim() } });
      const existing = activeEntry(proposal.id);
      if (!existing) return;
      setEntries((all) => ({ ...all, [app]: [...all[app].map((e) => e.proposal.id === proposal.id ? { ...e, proposal: { ...proposal, state: "discarded" as const } } : e), { proposal: next, scenario: existing.scenario }] }));
      setEditId(null); announce("Propuesta modificada. Revisa el nuevo valor antes de aceptar.");
    } catch (cause) { setError(errorText(cause)); }
  }
  async function undo(entry: Entry) {
    try {
      if (entry.scenario.grace && entry.proposal.state === "accepted") { const next = await client.discardProposal(entry.proposal.id); replaceEntry(next); announce("Envío cancelado durante la gracia; no se envió nada."); return; }
      if (!entry.proposal.change_id) return;
      const { token } = await client.createRevertToken(entry.proposal.change_id);
      await client.revertChange(entry.proposal.change_id, { token });
      const updated = (await client.listProposals({ thread_id: app })).find((p) => p.id === entry.proposal.id)!;
      replaceEntry(updated); announce("Cambio deshecho.");
    } catch (cause) { setError(errorText(cause)); }
  }
  function connectKey() {
    if (apiKey.trim().length < 8) { setKeyStatus("La clave parece incompleta."); return; }
    const last4 = apiKey.trim().slice(-4); setApiKey("");
    setByo((b) => reduceByoPanel(b, { type: "key.added", entry: { provider: "Anthropic/OpenAI", status: "active", keyLast4: last4 } }));
    setKeyStatus(`Conectada · termina en ${last4}`);
  }
  return <>
    <a className="skip" href="#composer" onClick={(event) => { event.preventDefault(); document.querySelector<HTMLTextAreaElement>("#composer .sac-composer-input")?.focus(); }}>Saltar al campo de mensaje</a>
    <div className="app sac-theme" data-sac-theme="light">
      <header className="top"><h1 className="brand">gruia <small>· patrón chat-céntrico</small></h1>
        <label className="sr-only" htmlFor="appsel">App</label><select id="appsel" value={app} onChange={(e) => { setApp(e.target.value as AppKey); setTab("chat"); setError(""); }}><option value="insaidr">Insaidr · secuencias</option><option value="famitale">Famitale · cuento</option></select>
        <span className="spacer" /><button id="planbtn" type="button" onClick={() => setAccountOpen(true)}>Plan Pro · IA de gruia</button><button id="membtn" type="button" onClick={() => setMemoryOpen(true)}>Memoria</button>
      </header>
      <nav className="tabs" aria-label="Vistas"><div className="tablist" role="tablist"><button id="tab-chat" role="tab" aria-selected={tab === "chat"} aria-controls="chatsec" onClick={() => setTab("chat")}>Chat</button><button id="tab-view" role="tab" aria-selected={tab === "view"} aria-controls="viewsec" onClick={() => setTab("view")}>Vista {pending > 0 && <span className="badge" id="pendbadge">{pending}</span>}</button></div></nav>
      <main data-tab={tab}><section className="chat" id="chatsec" aria-label="Chat"><div className="log" id="log" ref={logRef} tabIndex={0}><ChatLog items={messages[app]} />
        {active.map((e) => <div key={e.proposal.id} className="proposal-wrap" data-open={e.proposal.state === "proposed" || e.proposal.state === "modified" ? "1" : "0"}>
          <ProposalCard proposal={e.proposal} title={e.scenario.title} effect={e.scenario.effect} costLabel={e.scenario.cost ? `${e.scenario.cost} créditos de imagen` : "Sin coste"} diff={{ kind: "fields", changes: [{ path: e.scenario.label, op: e.scenario.before === null ? "add" : "replace", ...(e.scenario.before === null ? {} : { before: e.scenario.before }), after: String(e.proposal.input.value ?? e.scenario.after) }] }} onAccept={(p) => p.confirm_effective === "strong" ? setConfirm(p.id) : void apply(p)} onModify={(p) => { setEditId(p.id); setEditValue(String(p.input.value ?? e.scenario.after)); }} onDiscard={(p) => void discard(p)} onUndo={() => void undo(e)} {...(e.appliedAt ? { undoUntil: new Date(Date.parse(e.appliedAt) + 3600000).toISOString() } : {})} />
          {editId === e.proposal.id && <div className="editbox"><label htmlFor="proposal-edit">Modificar propuesta</label><textarea id="proposal-edit" aria-label="Modificar propuesta" value={editValue} onChange={(ev) => setEditValue(ev.target.value)} /><button type="button" onClick={() => void modify(e.proposal)}>Guardar cambio</button><button type="button" onClick={() => setEditId(null)}>Cancelar</button></div>}
          {e.scenario.grace && e.proposal.state === "accepted" && <button type="button" onClick={() => void undo(e)}>Cancelar envío</button>}
        </div>)}
      </div>
      <div className="composer" id="composer"><SuggestionChips ariaLabel="Sugerencias" suggestions={scenario ? [{ id: scenario.tool, label: scenario.say, prompt: scenario.say }, { id: "help", label: "¿Qué puedes hacer aquí?", prompt: "¿Qué puedes hacer aquí?" }] : [{ id: "help", label: "¿Qué puedes hacer aquí?", prompt: "¿Qué puedes hacer aquí?" }]} onSelect={(suggestion) => void send(suggestion.prompt)} theme="light" /><ChatComposer ariaLabel="Escribe una instrucción" placeholder="Pide lo que quieras hacer…" submitLabel="Enviar" onSubmit={send} hint="Enter envía · Mayús+Enter salto de línea" actions={<button type="button" onClick={() => setMemoryOpen(true)}>ver memoria</button>} theme="light" /></div>
      </section>
      <section className="view" id="viewsec" aria-label="Vista clásica" tabIndex={-1}>{app === "insaidr" ? <><h2>Secuencias</h2><p>La vista clásica sigue disponible. Los cambios aparecen aquí al aplicarse.</p><div className="panel"><strong>Logística Q4</strong><span className={`pill ${pendingField("sent") ? "pending" : ""}`}>{view.sent ? "Programada" : "Borrador"} · 12 leads</span><table><thead><tr><th>Paso</th><th>Día</th><th>Asunto</th><th>Estado</th></tr></thead><tbody><tr data-k="s1" className={pendingField("subject") ? "pending" : undefined}><td>1</td><td>Día 0</td><td>{view.subject}</td><td>{view.sent ? "Programado" : "Borrador"}</td></tr><tr><td>2</td><td>Día 3</td><td>Lo que vimos en 3 operadores como vosotros</td><td>Borrador</td></tr>{view.step3 && <tr data-k="s3"><td>3</td><td>Día 7</td><td>{view.step3}</td><td>Borrador</td></tr>}</tbody></table></div></> : <><h2>Lucía y el faro</h2><p>Editor clásico del cuento. Créditos de imagen: <strong>{view.credits}</strong></p><div className={`panel ${pendingField("page1") ? "pending" : ""}`}>Página 1 <p>{view.page1}</p></div><div className="panel">Página 2 <p>En lo alto del faro vivía un gato que no sabía dormir.</p></div><div className={`panel ${pendingField("page3") ? "pending" : ""}`}>Página 3 <p>{view.page3}</p></div><div className={`panel ${pendingField("illustrated") ? "pending" : ""}`}>Ilustraciones: {view.illustrated ? "3 ilustraciones · acuarela suave" : "Sin ilustrar"}</div></>}<div className="panel"><strong>Historial de cambios</strong><ul className="history">{active.filter((entry) => entry.proposal.state === "applied" || entry.proposal.state === "reverted").map((entry) => <li key={entry.proposal.id}>{entry.scenario.title} · chat · {entry.proposal.state === "reverted" ? "deshecho" : "aplicado"}</li>)}{active.every((entry) => entry.proposal.state !== "applied" && entry.proposal.state !== "reverted") && <li>Sin cambios aún</li>}</ul></div></section>
      </main>
    </div>
    {error && <div className="error" role="alert">{error}</div>}
    {active.filter((e) => e.appliedAt && e.proposal.change_id && e.scenario.effect === "reversible" && e.proposal.state === "applied").slice(-1).map((e) => <div id="toast" key={e.proposal.id}><UndoToast change={{ change_id: e.proposal.change_id!, applied_at: e.appliedAt!, undo_window_s: 3600, undo_mode: "revert" }} onUndo={() => void undo(e)} /></div>)}
    <div id="confirm"><IrreversibleDialog open={!!confirm} title="Confirmar envío a 12 personas" description="Se enviarán correos reales a 12 personas. Una vez enviado un correo no se puede recuperar. Dispones de 30 segundos para cancelar antes del primer envío." onCancel={() => setConfirm(null)} onConfirm={() => { const entry = activeEntry(confirm!); if (entry) void apply(entry.proposal, true); }} confirmLabel="Enviar ahora" /></div>
    <dialog id="memdlg" ref={memDialog} onClose={() => setMemoryOpen(false)} aria-label="Lo que el asistente recuerda"><MemoryPanel state={memory[app]} title="Lo que el asistente recuerda" /><ul id="memlist" className="memory-actions">{memory[app].entries.filter((m) => !m.forgottenAt).map((m) => <li key={m.id}><span>{m.text}</span><button type="button" aria-label={`Olvidar ${m.text}`} onClick={() => setMemory((old) => ({ ...old, [app]: reduceMemoryPanel(old[app], { type: "entry.forgotten", entryId: m.id, forgottenAt: new Date().toISOString() }) }))}>Olvidar</button></li>)}</ul><button id="mem-close" type="button" onClick={() => setMemoryOpen(false)}>Cerrar</button></dialog>
    <dialog id="byo" ref={byoDialog} onClose={() => setAccountOpen(false)} aria-label="Tu cuenta de IA"><BYOPanel state={byo} title="Tu cuenta de IA" actions={<><p>IA incluida en gruia · Activa</p><label htmlFor="apikey">API key de Anthropic u OpenAI</label><div className="keyrow"><input id="apikey" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-… o sk-…" /><button id="apikey-save" type="button" onClick={connectKey}>Conectar</button></div><p id="apikey-state" role="status">{keyStatus}</p>{byo.keys.some((k) => k.status === "active") && <button type="button" onClick={() => { setByo((b) => reduceByoPanel(b, { type: "key.revoked", provider: "Anthropic/OpenAI", revokedAt: new Date().toISOString() })); setKeyStatus("Clave revocada"); }}>Revocar</button>}<p>Uso este mes: IA de gruia 412 de 2.000 créditos</p></>} /><button id="byo-close" type="button" onClick={() => setAccountOpen(false)}>Cerrar</button></dialog>
    <aside className="demo-controls" aria-label="Simulación de servidor"><label><input type="checkbox" checked={costIncreased} onChange={(e) => { setCostIncreased(e.target.checked); setCostRise(e.target.checked); }} /> Simular subida de coste en apply</label></aside>
  </>;
}
