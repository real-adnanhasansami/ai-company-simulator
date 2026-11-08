import type { GeminiResult, ModelId } from './types';

export interface GeminiCallOptions {
  apiKey: string;
  model: ModelId;
  systemInstruction: string;
  prompt: string;
  json?: boolean;
  signal?: AbortSignal;
}

class GroqError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'GroqError';
  }
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
    throw new GroqError(message, response.status);
  }

  if (!response.body) throw new GroqError('Empty response from the API route.', 502);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let finishReason: string | null = null;

  const handleLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;

    try {
      const event = JSON.parse(payload);
      // Handles Groq / OpenAI stream chunk
      const delta = event.choices?.[0]?.delta?.content;
      if (typeof delta === 'string') {
        text += delta;
      }
      if (event.choices?.[0]?.finish_reason) {
        finishReason = event.choices[0].finish_reason;
      }
    } catch {
      return;
    }
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
    throw new GroqError(`The model returned no text (finish reason: ${finishReason ?? 'unknown'}).`, 502);
  }
  return { text, finishReason };
}

export async function callGemini(opts: GeminiCallOptions): Promise<GeminiResult> {
  return await streamOnce(opts);
}