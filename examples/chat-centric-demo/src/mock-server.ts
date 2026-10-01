import { createAgentServerClient } from "simplia-agent-chat/core";
import { SCHEMAS, type Proposal, type ToolSpec } from "@simplia/agent-chat-contract";

export type AppKey = "insaidr" | "famitale";
export type Scenario = {
  say: string; tool: string; text: string; title: string; label: string;
  before: string | null; after: string; field: string; effect: "reversible" | "irreversible";
  cost?: number; grace?: number; remember?: { k: string; v: string };
};

export const scenarios: Record<AppKey, Scenario[]> = {
  insaidr: [
    { say: "Mejora el asunto del primer email; que suene menos a venta", tool: "secuencias.editar_paso", text: "Te propongo un asunto más concreto, centrado en su operación y no en nosotros.", title: "Editar asunto · paso 1 de «Logística Q4»", label: "Paso 1 · asunto", before: "Una pregunta sobre vuestros envíos de noviembre", after: "¿Cómo vais a absorber el pico de noviembre?", field: "subject", effect: "reversible" },
    { say: "Añade un tercer paso de cierre a los 7 días", tool: "secuencias.crear_paso", text: "Añado un paso breve de cierre. No se envía nada hasta que lances la secuencia.", title: "Nuevo paso 3 · Día 7", label: "Paso 3 · nuevo", before: null, after: "Cierro el hilo: si no es el momento, te escribo en enero", field: "step3", effect: "reversible" },
    { say: "Lánzala a los 12 leads", tool: "campanas.lanzar", text: "Esto enviará correos reales a personas externas. Revisa la propuesta y confirma.", title: "Lanzar «Logística Q4» a 12 leads", label: "Estado de la campaña", before: "Borrador", after: "Programada · primer envío hoy 16:00", field: "sent", effect: "irreversible", grace: 30000 },
  ],
  famitale: [
    { say: "La abuela se llama Carmen, no Rosa", tool: "cuento.editar_texto", text: "Cambio el nombre en la página 1. También lo recordaré para siguientes cuentos.", title: "Página 1 · nombre de la abuela", label: "Página 1", before: "Lucía llegó al pueblo con su abuela Rosa una tarde de viento.", after: "Lucía llegó al pueblo con su abuela Carmen una tarde de viento.", field: "page1", effect: "reversible", remember: { k: "Abuela", v: "Carmen" } },
    { say: "Haz la página 3 más tranquila, es para dormir", tool: "cuento.reescribir_pagina", text: "Reescribo la escena para que baje el ritmo, como prefieres en los finales.", title: "Página 3 · escena más tranquila", label: "Página 3", before: "Subieron corriendo, gritando, y el gato saltó al mar.", after: "Subieron despacio, contando escalones, y el gato se durmió en el regazo de Lucía.", field: "page3", effect: "reversible" },
    { say: "Genera las ilustraciones", tool: "ilustracion.generar_libro", text: "Generar 3 ilustraciones consume créditos. Te enseño el coste antes de empezar.", title: "Ilustrar 3 páginas en acuarela", label: "Ilustraciones", before: "Sin ilustrar", after: "3 ilustraciones · estilo acuarela suave", field: "illustrated", effect: "reversible", cost: 6 },
  ],
};

export type ViewData = { subject: string; step3: string | null; sent: boolean; page1: string; page3: string; illustrated: boolean; credits: number };
export const initialView: ViewData = {
  subject: scenarios.insaidr[0]!.before!, step3: null, sent: false,
  page1: scenarios.famitale[0]!.before!, page3: scenarios.famitale[1]!.before!, illustrated: false, credits: 24,
};

const tools: ToolSpec[] = (Object.entries(scenarios) as [AppKey, Scenario[]][]).flatMap(([app, list]) => list.map((s) => ({
  name: s.tool, description: s.title, input_schema: { type: "object" }, effect: s.effect,
  cost: { kind: s.cost ? "credits" : "none", estimator: !!s.cost },
  confirm: s.effect === "irreversible" ? "strong" : s.cost ? "card" : "card",
  undo: { mode: s.effect === "irreversible" ? "none" : "revert", window_s: s.effect === "irreversible" ? 0 : 3600, grace_s: (s.grace ?? 0) / 1000 }, app_key: app,
  output_schema: SCHEMAS["proposal-ref"],
})));

type Stored = { proposal: Proposal; scenario: Scenario; acceptedCost: number; tokenHash?: string; tokenAt?: number; consumed?: boolean; graceTimer?: ReturnType<typeof setTimeout>; changeId?: string; appliedAt?: number; prior?: string | null | boolean; };
const proposals = new Map<string, Stored>();
const changes = new Map<string, Stored>();
const revertTokens = new Map<string, string>();
let serial = 0;
let view: ViewData = { ...initialView };
let costRise = false;
let onViewChange: (() => void) | undefined;
export function getView(): ViewData { return { ...view }; }
export function subscribeView(listener: () => void): () => void { onViewChange = listener; return () => { if (onViewChange === listener) onViewChange = undefined; }; }
export function setCostRise(value: boolean): void { costRise = value; }
const next = () => `00000000-0000-4000-8000-${(++serial).toString().padStart(12, "0")}`;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fail = (status: number, code: string, message: string) => json(status, { code, message });
const hash = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))))).map((b) => b.toString(16).padStart(2, "0")).join("");
const equalHash = (a: string | undefined, b: string) => { let difference = 0; const expected = a ?? ""; for (let i = 0; i < 64; i++) difference |= (expected.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return expected.length === 64 && b.length === 64 && difference === 0; };
const updateView = (record: Stored, value: string | boolean | null) => {
  const { field } = record.scenario;
  if (field === "sent") view.sent = Boolean(value);
  else if (field === "illustrated") { view.illustrated = Boolean(value); view.credits += view.illustrated ? -6 : 6; }
  else if (field === "step3") view.step3 = value as string | null;
  else if (field === "subject" || field === "page1" || field === "page3") view[field] = value as string;
  onViewChange?.();
};

export const mockFetch: typeof fetch = async (url, init) => {
  const requestUrl = new URL(String(url));
  const pathname = requestUrl.pathname;
  const parts = pathname.split("/").filter(Boolean);
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
  if (pathname === "/agent/tools" && method === "GET") return json(200, tools);
  if (pathname === "/agent/proposals" && method === "GET") return json(200, [...proposals.values()].map((r) => r.proposal).filter((p) => p.thread_id === requestUrl.searchParams.get("thread_id")));
  if (pathname === "/agent/proposals" && method === "POST") {
    const scenario = scenarios.insaidr.concat(scenarios.famitale).find((s) => s.tool === body.tool);
    if (!scenario || !body.input || typeof body.input !== "object") return fail(422, "invalid_tool", "Herramienta o entrada inválida");
    const app = scenario.tool.startsWith("cuento.") || scenario.tool.startsWith("ilustracion.") ? "famitale" : "insaidr";
    const id = next(); const now = new Date();
    const proposal: Proposal = { id, tool: scenario.tool, input: body.input as Record<string, unknown>, payload_hash: await hash({ tool: scenario.tool, input: body.input }), preview: { label: scenario.label, before: scenario.before, after: (body.input as Record<string, unknown>).value ?? scenario.after }, estimate: { credits: scenario.cost ?? 0 }, confirm_effective: scenario.effect === "irreversible" ? "strong" : "card", state: "proposed", created_at: now.toISOString(), expires_at: new Date(now.getTime() + 600000).toISOString(), supersedes: null, plan_id: null, step: null, change_id: null, org_id: "demo-org", user_id: "demo-user", thread_id: app };
    proposals.set(id, { proposal, scenario, acceptedCost: scenario.cost ?? 0 }); return json(200, proposal);
  }
  if (parts[0] === "agent" && parts[1] === "proposals" && parts[2]) {
    const record = proposals.get(parts[2]); if (!record) return fail(404, "not_found", "Propuesta no encontrada");
    const p = record.proposal; const action = parts[3];
    if (action === "modify" && method === "POST") {
      if (p.state !== "proposed") return fail(409, "invalid_transition", "La propuesta ya no se puede modificar");
      const input = body.input as Record<string, unknown>;
      if (!input || typeof input.value !== "string") return fail(422, "invalid_input", "Escribe el nuevo valor");
      const result = await mockFetch(new URL("/agent/proposals", String(url)).toString(), { method: "POST", body: JSON.stringify({ tool: p.tool, input }) });
      if (!result.ok) return result;
      const nextProposal = await result.json() as Proposal; p.state = "discarded"; nextProposal.supersedes = p.id; return json(200, nextProposal);
    }
    if (action === "accept" && method === "POST") {
      if (p.state !== "proposed") return fail(409, "invalid_transition", "Propuesta no disponible");
      const token = crypto.randomUUID();
      p.state = "accepted"; record.tokenHash = await hash(token); record.tokenAt = Date.now(); record.acceptedCost = Number(p.estimate.credits ?? 0); return json(200, { token, expires_in: 120 });
    }
    if (action === "apply" && method === "POST") {
      const validToken = typeof body.token === "string" && equalHash(record.tokenHash, await hash(body.token));
      if (p.state === "applied" && validToken && record.consumed) return json(200, { change_id: record.changeId });
      if (p.state !== "accepted" || !validToken || record.consumed || !record.tokenAt || Date.now() - record.tokenAt > 120000) return fail(403, "invalid_token", "Token inválido o caducado");
      if (p.confirm_effective === "strong" && body.ack_irreversible !== true) return fail(403, "ack_required", "Confirma el efecto irreversible");
      const currentCost = (record.scenario.cost ?? 0) + (costRise && (record.scenario.cost ?? 0) > 0 ? 1 : 0);
      if (currentCost > record.acceptedCost) { p.state = "expired"; record.consumed = true; return fail(409, "cost_changed", "El coste ha subido; vuelve a revisar la propuesta"); }
      record.consumed = true; record.changeId = next(); p.change_id = record.changeId; changes.set(record.changeId, record);
      const field = record.scenario.field; record.prior = field === "step3" ? view.step3 : field === "sent" ? view.sent : field === "illustrated" ? view.illustrated : view[field as "subject" | "page1" | "page3"];
      const apply = () => { if (p.state === "accepted") { p.state = "applied"; record.appliedAt = Date.now(); updateView(record, field === "sent" || field === "illustrated" ? true : String(p.input.value ?? record.scenario.after)); } };
      if (record.scenario.grace) record.graceTimer = setTimeout(apply, record.scenario.grace); else apply();
      return json(200, { change_id: record.changeId });
    }
    if (action === "discard" && method === "POST") {
      if (p.state === "accepted" && record.graceTimer) { clearTimeout(record.graceTimer); delete record.graceTimer; p.state = "discarded"; changes.delete(record.changeId!); return json(200, p); }
      if (p.state !== "proposed" && p.state !== "modified") return fail(409, "invalid_transition", "No se puede descartar");
      p.state = "discarded"; return json(200, p);
    }
  }
  if (parts[0] === "agent" && parts[1] === "changes" && parts[2]) {
    const record = changes.get(parts[2]); if (!record) return fail(404, "not_found", "Cambio no encontrado");
    if (parts[3] === "revert-token") { const token = crypto.randomUUID(); revertTokens.set(parts[2], token); return json(200, { token, expires_in: 120 }); }
    if (parts[3] === "revert" || parts[3] === "compensate") {
      if (body.token !== revertTokens.get(parts[2])) return fail(403, "invalid_token", "Token de reversión inválido");
      revertTokens.delete(parts[2]); if (record.scenario.effect === "irreversible") return fail(409, "not_reversible", "Este cambio no admite reversión");
      if (record.proposal.state !== "applied") return fail(409, "invalid_transition", "Cambio no aplicado");
      if (!record.appliedAt || Date.now() - record.appliedAt > 3600000) return fail(410, "undo_expired", "La ventana para deshacer ha caducado");
      updateView(record, record.prior ?? null); record.proposal.state = "reverted"; return json(200, { change_id: parts[2] });
    }
  }
  return fail(404, "not_found", "Ruta no encontrada");
};

export const client = createAgentServerClient({ baseUrl: "https://demo.invalid", fetch: mockFetch, headers: () => ({ "x-demo-session": "demo-user", "x-demo-csrf": "demo" }) });
