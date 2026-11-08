import type { GeminiResult, ModelId } from './types';

export interface GeminiCallOptions {
  apiKey: string;
  model: ModelId;
  systemInstruction: string;
  prompt: string;
  json?: boolean;
  signal?: AbortSignal;
}

interface GeminiStreamEvent {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  error?: { code?: number; message?: string };
}

class GeminiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'GeminiError';
  }
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

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

async function streamOnce(opts: GeminiCallOptions): Promise<GeminiResult> {
  const response = await fetch('/api/execute-agent', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-gemini-api-key': opts.apiKey,
    },
    body: JSON.stringify({
      model: opts.model,
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
      /* keep default message */
    }
    throw new GeminiError(message, response.status);
  }

  if (!response.body) throw new GeminiError('Empty response from the model route.', 502);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finishReason: string | null = null;

  const handleLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload) return;

    let event: GeminiStreamEvent;
    try {
      event = JSON.parse(payload) as GeminiStreamEvent;
    } catch {
      return;
    }
    if (event.error) {
      throw new GeminiError(event.error.message ?? 'Gemini stream error.', event.error.code ?? 500);
    }
    const candidate = event.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      if (!part.thought && typeof part.text === 'string') text += part.text;
    }
    if (candidate?.finishReason) finishReason = candidate.finishReason;
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
    throw new GeminiError(`The model returned no text (finish reason: ${finishReason ?? 'unknown'}).`, 502);
  }
  return { text, finishReason };
}

export async function callGemini(opts: GeminiCallOptions): Promise<GeminiResult> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await streamOnce(opts);
    } catch (error) {
      if (opts.signal?.aborted) throw error;
      const retryable = error instanceof GeminiError && RETRYABLE_STATUS.has(error.status);
      if (!retryable || attempt >= MAX_RETRIES) throw error;
      await sleep(2500 * 2 ** attempt, opts.signal);
    }
  }
}
