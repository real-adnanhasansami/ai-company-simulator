import type { GeminiResult } from './types';

export interface ModelCallOptions {
  apiKey: string;
  /** Accepted for compatibility with callers; the server always uses the Groq model. */
  model?: string;
  systemInstruction: string;
  prompt: string;
  json?: boolean;
  signal?: AbortSignal;
}

interface ChatCompletionChunk {
  choices?: {
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }[];
  error?: { message?: string; code?: string | number; type?: string };
}

class ModelError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(message: string, status: number, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'ModelError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 20_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, MAX_BACKOFF_MS);
}

function mapFinishReason(reason: string | null | undefined): string | null {
  switch (reason) {
    case 'stop':
      return 'STOP';
    case 'length':
      return 'MAX_TOKENS';
    case null:
    case undefined:
      return null;
    default:
      return reason.toUpperCase();
  }
}

async function streamOnce(opts: ModelCallOptions): Promise<GeminiResult> {
  const response = await fetch('/api/execute-agent', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-groq-api-key': opts.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: opts.systemInstruction,
      prompt: opts.prompt,
      json: opts.json === true,
      temperature: opts.json ? 0.2 : 0.5,
    }),
    signal: opts.signal,
  });

  if (!response.ok) {
    let message = `Request failed (HTTP ${response.status}).`;
    try {
      const data = (await response.json()) as { error?: { message?: string } };
      if (data.error?.message) message = data.error.message;
    } catch {
      /* keep the default message */
    }
    throw new ModelError(message, response.status, parseRetryAfter(response.headers.get('retry-after')));
  }

  if (!response.body) {
    throw new ModelError('Empty response from the model route.', 502);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finishReason: string | null = null;

  const handleLine = (rawLine: string): void => {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) return;

    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;

    let chunk: ChatCompletionChunk;
    try {
      chunk = JSON.parse(payload) as ChatCompletionChunk;
    } catch {
      return;
    }

    if (chunk.error) {
      throw new ModelError(chunk.error.message ?? 'Groq stream error.', 502);
    }

    const choice = chunk.choices?.[0];
    const content = choice?.delta?.content;
    if (typeof content === 'string') text += content;
    if (choice?.finish_reason) finishReason = mapFinishReason(choice.finish_reason);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      handleLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) handleLine(buffer);

  if (!text.trim()) {
    throw new ModelError(
      `The model returned no text (finish reason: ${finishReason ?? 'unknown'}).`,
      502,
    );
  }

  return { text, finishReason };
}

/**
 * Streams a completion from the Groq-backed route and resolves with the full accumulated text.
 * Retries rate limits and transient server errors with backoff, honoring Retry-After when present.
 */
export async function callGroq(opts: ModelCallOptions): Promise<GeminiResult> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await streamOnce(opts);
    } catch (error) {
      if (opts.signal?.aborted) throw error;

      const retryable = error instanceof ModelError && RETRYABLE_STATUS.has(error.status);
      if (!retryable || attempt >= MAX_RETRIES) throw error;

      const retryAfter = error instanceof ModelError ? error.retryAfterMs : null;
      const delay = retryAfter ?? Math.min(2500 * 2 ** attempt, MAX_BACKOFF_MS);
      await sleep(delay, opts.signal);
    }
  }
}

/** Alias kept so existing imports in useCompanyEngine.ts continue to work unchanged. */
export const callGemini = callGroq;