"use client";

import { useState } from "react";
import type { ChatState, JsonValue, PendingInteraction } from "simplia-agent-chat/core";
import { AgentChatShell } from "simplia-agent-chat/react";
import {
  CHAT_LAB_FIXTURES,
  appendFixtureUserMessage,
  resolveFixtureInteraction,
  type LabFixtureKey,
} from "./fixtures";
import { chatLabSurfaceRegistry } from "./surface-registry";

export function ChatLab() {
  const [activeKey, setActiveKey] = useState<LabFixtureKey>("acv2");
  const [states, setStates] = useState<Record<LabFixtureKey, ChatState>>(() => ({
    acv2: CHAT_LAB_FIXTURES.acv2.state,
    contenido: CHAT_LAB_FIXTURES.contenido.state,
    data: CHAT_LAB_FIXTURES.data.state,
  }));
  const [lastAction, setLastAction] = useState("No local action dispatched");
  const fixture = CHAT_LAB_FIXTURES[activeKey];
  const state = states[activeKey];

  const updateState = (updater: (current: ChatState) => ChatState) => {
    setStates((current) => ({ ...current, [activeKey]: updater(current[activeKey]) }));
  };

  const resolveInteraction = (interaction: PendingInteraction, resolution: JsonValue) => {
    updateState((current) => resolveFixtureInteraction(current, interaction, resolution));
    setLastAction(`Resolved ${interaction.kind}: ${interaction.title}`);
  };

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
      <AgentChatShell
        key={activeKey}
        state={state}
        threadId={fixture.threadId}
        surfaceRegistry={chatLabSurfaceRegistry}
        title={state.threads[fixture.threadId]?.title ?? fixture.label}
        subtitle={`${fixture.description} · ${state.threads[fixture.threadId]?.provider?.provider ?? "provider"}`}
        headerLabel="Operations desk"
        theme="light"
        composerAriaLabel={`Message the ${fixture.label} agent`}
        composerPlaceholder={`Send an instruction to ${fixture.label}…`}
        onSubmit={(message) => {
          updateState((current) => appendFixtureUserMessage(current, fixture.threadId, message));
          setLastAction(`Queued local fixture message for ${fixture.label}`);
        }}
        onResolveInteraction={resolveInteraction}
        onSurfaceAction={(block, action) => {
          setLastAction(`${block.kind}: ${action.action}`);
        }}
        toolbar={
          <>
            <span className="chat-lab-runtime">{fixture.label}</span>
            <span className="chat-lab-runtime">3 SURFACE_PLUGINS</span>
          </>
        }
      />
    </div>
  );
}
