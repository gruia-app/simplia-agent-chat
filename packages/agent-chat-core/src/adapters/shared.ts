import {
  eventBase,
  isJsonValue,
  recordValue,
  stringValue,
  type AdapterContext,
  type ChatEvent,
  type ProviderMetadata,
} from "../protocol.js";

export function event<T extends ChatEvent["type"]>(
  type: T,
  context: AdapterContext,
  suffix: string,
  payload: Extract<ChatEvent, { type: T }>["payload"],
  provider?: ProviderMetadata,
): Extract<ChatEvent, { type: T }> {
  return {
    ...eventBase(type, context, suffix),
    ...(provider ? { provider } : {}),
    payload,
  } as Extract<ChatEvent, { type: T }>;
}

export function providerFrom(input: unknown, fallback: string): ProviderMetadata {
  const value = recordValue(input);
  const model = stringValue(value.model);
  const reasoningEffort = stringValue(value.reasoning_effort);
  const sessionId = stringValue(value.session_id);
  const raw = Object.fromEntries(
    Object.entries(value)
      .filter(([, nested]) => isJsonValue(nested)),
  ) as Record<string, import("../protocol.js").JsonValue>;
  return {
    provider: stringValue(value.backend_provider) ?? stringValue(value.cli_provider) ?? stringValue(value.provider) ?? fallback,
    ...(model ? { model } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(Object.keys(raw).length > 0 ? { raw } : {}),
  };
}

export function stableSuffix(...parts: Array<string | number | undefined>): string {
  return parts.map((part) => String(part ?? "unknown").replace(/[^a-zA-Z0-9._:-]+/g, "_")).join(":");
}
