"use client";

import type { JsonValue } from "@simplia/agent-chat-core";
import {
  ReactSurfaceRegistry,
  type ReactSurfacePlugin,
  type SurfaceRendererProps,
} from "@simplia/agent-chat-react";

type DeploymentEvidencePayload = {
  releaseSha: string;
  checks: Array<{ label: string; value: string; state: string }>;
};

type PublicationPayload = {
  channel: string;
  headline: string;
  body: string;
  media: string[];
};

type CapacityChartPayload = {
  series: Array<{ label: string; queued: number; capacity: number }>;
  source: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("payload_record_required");
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`payload_${key}_required`);
  return value;
}

function actions({ block, onAction }: SurfaceRendererProps<JsonValue>) {
  if (!block.actions?.length || !onAction) return null;
  return (
    <div className="sac-surface-actions">
      {block.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className={`sac-button ${action.intent === "primary" ? "sac-button-primary" : ""}`}
          onClick={() => onAction(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function DeploymentEvidence({ block, onAction }: SurfaceRendererProps<DeploymentEvidencePayload>) {
  return (
    <div className="sac-surface-body chat-lab-evidence">
      <dl>
        <div><dt>Release SHA</dt><dd>{block.payload.releaseSha}</dd></div>
        {block.payload.checks.map((check) => (
          <div key={check.label}>
            <dt>{check.label}</dt>
            <dd><span className={`chat-lab-dot chat-lab-dot-${check.state}`} aria-hidden />{check.value}</dd>
          </div>
        ))}
      </dl>
      {actions({ block, onAction })}
    </div>
  );
}

function Publication({ block, onAction }: SurfaceRendererProps<PublicationPayload>) {
  return (
    <div className="sac-surface-body chat-lab-publication">
      <span className="chat-lab-channel">{block.payload.channel}</span>
      <h2>{block.payload.headline}</h2>
      <p>{block.payload.body}</p>
      <ul aria-label="Attached media">
        {block.payload.media.map((media) => <li key={media}>{media}</li>)}
      </ul>
      {actions({ block, onAction })}
    </div>
  );
}

function CapacityChart({ block, onAction }: SurfaceRendererProps<CapacityChartPayload>) {
  const maxQueued = Math.max(...block.payload.series.map((entry) => entry.queued), 1);
  return (
    <div className="sac-surface-body chat-lab-chart">
      <div className="chat-lab-bars" role="img" aria-label="Queued tasks decrease from 266 to 188 while worker capacity rises from zero to four">
        {block.payload.series.map((entry) => (
          <div className="chat-lab-bar-column" key={entry.label}>
            <div className="chat-lab-bar-track">
              <span className="chat-lab-bar" style={{ height: `${Math.max(8, entry.queued / maxQueued * 100)}%` }} />
              <span className="chat-lab-capacity" style={{ bottom: `${Math.min(90, entry.capacity * 18)}%` }}>{entry.capacity}</span>
            </div>
            <span>{entry.label}</span>
          </div>
        ))}
      </div>
      <p className="chat-lab-source">Source: {block.payload.source}</p>
      {actions({ block, onAction })}
    </div>
  );
}

const deploymentPlugin: ReactSurfacePlugin<DeploymentEvidencePayload> = {
  kind: "acv2.deployment-evidence",
  versions: [1],
  validate(payload) {
    const record = asRecord(payload);
    if (!Array.isArray(record.checks)) throw new Error("payload_checks_required");
    const checks = record.checks.map((value) => {
      const check = asRecord(value);
      return { label: stringField(check, "label"), value: stringField(check, "value"), state: stringField(check, "state") };
    });
    return { releaseSha: stringField(record, "releaseSha"), checks };
  },
  summarize: (payload) => `Release ${payload.releaseSha}`,
  getA11yLabel: (payload) => `Deployment evidence for release ${payload.releaseSha}`,
  component: DeploymentEvidence,
};

const publicationPlugin: ReactSurfacePlugin<PublicationPayload> = {
  kind: "contenido.publication",
  versions: [1],
  validate(payload) {
    const record = asRecord(payload);
    const media = Array.isArray(record.media) ? record.media.filter((entry): entry is string => typeof entry === "string") : [];
    return {
      channel: stringField(record, "channel"),
      headline: stringField(record, "headline"),
      body: stringField(record, "body"),
      media,
    };
  },
  summarize: (payload) => `${payload.channel}: ${payload.headline}`,
  getA11yLabel: (payload) => `${payload.channel} publication draft titled ${payload.headline}`,
  component: Publication,
};

const chartPlugin: ReactSurfacePlugin<CapacityChartPayload> = {
  kind: "data.capacity-chart",
  versions: [1],
  validate(payload) {
    const record = asRecord(payload);
    if (!Array.isArray(record.series)) throw new Error("payload_series_required");
    const series = record.series.map((value) => {
      const row = asRecord(value);
      if (typeof row.queued !== "number" || typeof row.capacity !== "number") throw new Error("payload_series_numbers_required");
      return { label: stringField(row, "label"), queued: row.queued, capacity: row.capacity };
    });
    return { series, source: stringField(record, "source") };
  },
  summarize: () => "Queue versus effective capacity",
  getA11yLabel: () => "Queue versus effective worker capacity chart",
  component: CapacityChart,
};

export const chatLabSurfaceRegistry = new ReactSurfaceRegistry();
chatLabSurfaceRegistry.register(deploymentPlugin);
chatLabSurfaceRegistry.register(publicationPlugin);
chatLabSurfaceRegistry.register(chartPlugin);
