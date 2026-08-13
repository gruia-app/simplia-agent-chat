export interface SseMessage {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

export interface SseDecoderOptions {
  maxBufferChars?: number;
  maxEventChars?: number;
}

export class SseDecoder {
  #buffer = "";
  #event = "message";
  #data: string[] = [];
  #id: string | undefined;
  #retry: number | undefined;
  readonly #maxBufferChars: number;
  readonly #maxEventChars: number;
  #eventChars = 0;

  constructor(options: SseDecoderOptions = {}) {
    this.#maxBufferChars = options.maxBufferChars ?? 1_048_576;
    this.#maxEventChars = options.maxEventChars ?? 2_097_152;
    if (this.#maxBufferChars < 1 || this.#maxEventChars < 1) {
      throw new Error("sse_decoder_limits_must_be_positive");
    }
  }

  push(chunk: string): SseMessage[] {
    this.#buffer += chunk;
    if (this.#buffer.length > this.#maxBufferChars) throw new Error("sse_buffer_limit_exceeded");
    const messages: SseMessage[] = [];
    let lineEnd = this.#findLineEnd();
    while (lineEnd) {
      const line = this.#buffer.slice(0, lineEnd.index);
      this.#buffer = this.#buffer.slice(lineEnd.index + lineEnd.length);
      const message = this.#consumeLine(line);
      if (message) messages.push(message);
      lineEnd = this.#findLineEnd();
    }
    return messages;
  }

  flush(): SseMessage[] {
    const messages: SseMessage[] = [];
    if (this.#buffer) {
      const message = this.#consumeLine(this.#buffer);
      if (message) messages.push(message);
      this.#buffer = "";
    }
    const finalMessage = this.#dispatch();
    if (finalMessage) messages.push(finalMessage);
    return messages;
  }

  reset(): void {
    this.#buffer = "";
    this.#resetEvent();
  }

  #findLineEnd(): { index: number; length: number } | undefined {
    for (let index = 0; index < this.#buffer.length; index += 1) {
      const char = this.#buffer[index];
      if (char === "\n") return { index, length: 1 };
      if (char === "\r") {
        if (index === this.#buffer.length - 1) return undefined;
        return { index, length: this.#buffer[index + 1] === "\n" ? 2 : 1 };
      }
    }
    return undefined;
  }

  #consumeLine(line: string): SseMessage | undefined {
    if (line === "") return this.#dispatch();
    if (line.startsWith(":")) return undefined;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (field) {
      case "event":
        this.#event = value || "message";
        break;
      case "data":
        this.#eventChars += value.length;
        if (this.#eventChars > this.#maxEventChars) throw new Error("sse_event_limit_exceeded");
        this.#data.push(value);
        break;
      case "id":
        if (!value.includes("\0")) this.#id = value;
        break;
      case "retry": {
        const retry = Number(value);
        if (Number.isInteger(retry) && retry >= 0) this.#retry = retry;
        break;
      }
    }
    return undefined;
  }

  #dispatch(): SseMessage | undefined {
    if (this.#data.length === 0) {
      this.#resetEvent();
      return undefined;
    }
    const message: SseMessage = {
      event: this.#event || "message",
      data: this.#data.join("\n"),
      ...(this.#id !== undefined ? { id: this.#id } : {}),
      ...(this.#retry !== undefined ? { retry: this.#retry } : {}),
    };
    this.#resetEvent();
    return message;
  }

  #resetEvent(): void {
    this.#event = "message";
    this.#data = [];
    this.#eventChars = 0;
    this.#retry = undefined;
  }
}

export function decodeSsePayload<T = unknown>(message: SseMessage): T | "[DONE]" {
  if (message.data.trim() === "[DONE]") return "[DONE]";
  return JSON.parse(message.data) as T;
}
