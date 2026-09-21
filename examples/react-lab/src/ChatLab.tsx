"use client";

import { useRef, useState } from "react";
import {
  createAccountSnapshotDerive,
  createChatSuggestionRegistry,
  createScriptedVoiceTransport,
  resolveChatSuggestions,
  type ChatAccountSnapshot,
  type ChatState,
  type JsonValue,
  type PendingInteraction,
} from "simplia-agent-chat/core";
import {
  AgentChatShell,
  AgentChatWorkspace,
  useVoiceCapture,
  VoiceButton,
  type ChatComposerDraft,
} from "simplia-agent-chat/react";
import {
  CHAT_LAB_FIXTURES,
  appendFixtureUserMessage,
  resolveFixtureInteraction,
  type LabFixtureKey,
} from "./fixtures";
import { chatLabSurfaceRegistry } from "./surface-registry";

/**
 * Example chat-first home registry: three curated prompts plus one
 * state-derived suggestion (empty account first, then quota pressure).
 */
const homeSuggestionRegistry = (() => {
  const created = createChatSuggestionRegistry<ChatAccountSnapshot>({
    staticSuggestions: [
      { id: "daily-brief", label: "Briefing del día", prompt: "Prepara mi briefing del día con lo pendiente." },
      { id: "pending-work", label: "Trabajo pendiente", prompt: "Resume el trabajo pendiente y su prioridad." },
      { id: "weekly-report", label: "Informe semanal", prompt: "Redacta el informe semanal con evidencias." },
    ],
    derive: createAccountSnapshotDerive({
      emptyAccountSuggestion: {
        id: "first-project",
        label: "Crea tu primer proyecto",
        prompt: "Crea mi primer proyecto paso a paso.",
        description: "La cuenta todavía no tiene proyectos",
      },
      quotaWarningSuggestion: (snapshot) => ({
        id: "upgrade-plan",
        label: "Amplía tu plan",
        prompt: `Mi uso de cuota está al ${Math.round((snapshot.quotaUsedRatio ?? 0) * 100)}%. ¿Qué plan me conviene?`,
      }),
    }),
  });
  if (!created.ok) throw new Error(`home suggestion registry: ${created.reason}`);
  return created.registry;
})();

/** Account scenarios the lab can simulate for the derived suggestion. */
const ACCOUNT_SCENARIOS = {
  new: { label: "Cuenta nueva", snapshot: { isEmpty: true } },
  quota: { label: "Cuota al 82%", snapshot: { quotaUsedRatio: 0.82 } },
  normal: { label: "Cuenta normal", snapshot: {} },
} satisfies Record<string, { label: string; snapshot: ChatAccountSnapshot }>;

type AccountScenarioKey = keyof typeof ACCOUNT_SCENARIOS;

/**
 * Mock voice transport — no credentials, no network. Replays a scripted
 * Deepgram-like frame sequence so apps can copy the wiring shape.
 */
const labVoiceTransport = createScriptedVoiceTransport({
  intervalMs: 550,
  script: [
    { text: "hola", isFinal: false },
    { text: "hola, revisa", isFinal: false },
    { text: "hola, revisa el estado", isFinal: false },
    { text: "hola, revisa el estado de la release", isFinal: true },
  ],
});

export function ChatLab() {
  const [activeKey, setActiveKey] = useState<LabFixtureKey>("acv2");
  const [states, setStates] = useState<Record<LabFixtureKey, ChatState>>(() => ({
    acv2: CHAT_LAB_FIXTURES.acv2.state,
    contenido: CHAT_LAB_FIXTURES.contenido.state,
    data: CHAT_LAB_FIXTURES.data.state,
    home: CHAT_LAB_FIXTURES.home.state,
  }));
  const [lastAction, setLastAction] = useState("No local action dispatched");
  const [workspaceLayout, setWorkspaceLayout] = useState<"home" | "work">("home");
  const [accountScenario, setAccountScenario] = useState<AccountScenarioKey>("new");
  const [composerDraft, setComposerDraft] = useState<ChatComposerDraft | undefined>(undefined);
  const voiceDraftBaseRef = useRef("");
  const voiceRevisionRef = useRef(0);
  const fixture = CHAT_LAB_FIXTURES[activeKey];
  const state = states[activeKey];
  const workLayout = workspaceLayout === "work";
  const isHome = activeKey === "home";

  const voiceCapture = useVoiceCapture({
    transport: labVoiceTransport,
    tenantId: "simplia-lab",
    organizationId: "simplia-lab",
    meter: (event) => {
      setLastAction(
        `voice usage ${event.provider} · ${event.audioBytes}B · ${event.durationMs}ms · tenant=${event.tenantId ?? "n/a"} · ${event.endReason}`,
      );
    },
    onTranscript: (frame) => {
      if (!frame.isFinal) return;
      voiceDraftBaseRef.current = voiceDraftBaseRef.current
        ? `${voiceDraftBaseRef.current} ${frame.text}`
        : frame.text;
      voiceRevisionRef.current += 1;
      setComposerDraft({ value: voiceDraftBaseRef.current, revision: voiceRevisionRef.current });
    },
    onError: (reason) => setLastAction(`voice error: ${reason}`),
  });

  const updateState = (updater: (current: ChatState) => ChatState) => {
    setStates((current) => ({ ...current, [activeKey]: updater(current[activeKey]) }));
  };

  const resolveInteraction = (interaction: PendingInteraction, resolution: JsonValue) => {
    updateState((current) => resolveFixtureInteraction(current, interaction, resolution));
    setLastAction(`Resolved ${interaction.kind}: ${interaction.title}`);
  };

  const stageDraft = (value: string) => {
    voiceDraftBaseRef.current = value;
    voiceRevisionRef.current += 1;
    setComposerDraft({ value, revision: voiceRevisionRef.current });
  };

  const homeSuggestions = isHome && Object.keys(state.items).length === 0
    ? resolveChatSuggestions(homeSuggestionRegistry, {
      context: ACCOUNT_SCENARIOS[accountScenario].snapshot,
    })
    : undefined;

  return (
    <div className="chat-lab-page">
      <div className="chat-lab-intro">
        <div>
          <span>FRONTEND_PROTOCOL_LAB</span>
          <h1>Shared agent chat</h1>
          <p>One runtime and interaction model, rendered with app-owned trusted surfaces.</p>
        </div>
        <output aria-live="polite">{lastAction}</output>
      </div>
      <nav className="chat-lab-switcher" aria-label="Chat fixture">
        {(Object.keys(CHAT_LAB_FIXTURES) as LabFixtureKey[]).map((key) => {
          const option = CHAT_LAB_FIXTURES[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={activeKey === key}
              onClick={() => setActiveKey(key)}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          );
        })}
      </nav>
      <div className="chat-lab-workspace-host">
        <AgentChatWorkspace
          ariaLabel="Shared agent chat workspace"
          historyLabel="Session history"
          theme="light"
          header={(
            <div className="chat-lab-workspace-toggle">
              <button
                type="button"
                aria-pressed={workspaceLayout === "home"}
                onClick={() => setWorkspaceLayout("home")}
              >
                Home
              </button>
              <button
                type="button"
                aria-pressed={workspaceLayout === "work"}
                onClick={() => setWorkspaceLayout("work")}
              >
                Work
              </button>
            </div>
          )}
          history={{
            header: "Sessions",
            body: <p>{fixture.label}</p>,
          }}
          conversation={(
            <AgentChatShell
              key={activeKey}
              state={state}
              threadId={fixture.threadId}
              surfaceRegistry={chatLabSurfaceRegistry}
              title={state.threads[fixture.threadId]?.title ?? fixture.label}
              subtitle={`${fixture.description} · ${state.threads[fixture.threadId]?.provider?.provider ?? "provider"}`}
              headerLabel={isHome ? "Simplia" : "Operations desk"}
              theme="light"
              composerAriaLabel={`Message the ${fixture.label} agent`}
              composerPlaceholder={isHome ? "¿Qué quieres hacer hoy?" : `Send an instruction to ${fixture.label}…`}
              onSubmit={(message) => {
                updateState((current) => appendFixtureUserMessage(current, fixture.threadId, message));
                voiceDraftBaseRef.current = "";
                setLastAction(`Queued local fixture message for ${fixture.label}`);
              }}
              onInterrupt={(turn) => {
                setLastAction(`Stop requested for ${turn.id}`);
              }}
              composerActions={isHome ? (
                <>
                  <VoiceButton capture={voiceCapture} />
                  <span className="chat-lab-voice-status" aria-live="polite">
                    {voiceCapture.status === "recording"
                      ? (voiceCapture.interim || "Grabando…")
                      : voiceCapture.status === "starting"
                        ? "Conectando…"
                        : voiceCapture.status === "error"
                          ? `Voz no disponible (${voiceCapture.errorReason ?? "error"}) — escribe tu mensaje`
                          : "Mantén para hablar"}
                  </span>
                </>
              ) : (
                <button
                  className="sac-button"
                  type="button"
                  onClick={() => setLastAction(`Composer action on ${fixture.label}`)}
                >
                  Insert note
                </button>
              )}
              {...(homeSuggestions !== undefined ? { suggestions: homeSuggestions } : {})}
              onSuggestionSelect={(suggestion) => {
                stageDraft(suggestion.prompt);
                setLastAction(`Suggestion selected: ${suggestion.id}`);
              }}
              {...(composerDraft !== undefined ? { composerDraft } : {})}
              onResolveInteraction={resolveInteraction}
              onSurfaceAction={(block, action) => {
                setLastAction(`${block.kind}: ${action.action}`);
              }}
              toolbar={isHome ? (
                <div className="chat-lab-account-switch" role="group" aria-label="Account scenario">
                  {(Object.keys(ACCOUNT_SCENARIOS) as AccountScenarioKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={accountScenario === key}
                      onClick={() => setAccountScenario(key)}
                    >
                      {ACCOUNT_SCENARIOS[key].label}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <span className="chat-lab-runtime">{fixture.label}</span>
                  <span className="chat-lab-runtime">3 SURFACE_PLUGINS</span>
                </>
              )}
            />
          )}
          {...(workLayout
            ? {
              workQueueLabel: "Work queue",
              workQueue: { body: <p>No queued work.</p> },
              workbenchLabel: "Workbench",
              workbench: { body: <p>Inspect work here.</p> },
            }
            : {})}
        />
      </div>
    </div>
  );
}
