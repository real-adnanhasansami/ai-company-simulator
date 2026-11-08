export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';
const ALLOWED_MODELS = new Set<string>([
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
]);
const MAX_SYSTEM_CHARS = 30_000;
const MAX_PROMPT_CHARS = 200_000;
const MAX_OUTPUT_TOKENS = 8000;
const MAX_KEY_LENGTH = 256;

interface ExecuteBody {
  model?: unknown;
  systemInstruction?: unknown;
  prompt?: unknown;
  json?: unknown;
  temperature?: unknown;
  apiKey?: unknown;
}

function jsonError(status: number, message: string, retryAfter?: string | null): Response {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
  if (retryAfter) headers['retry-after'] = retryAfter;
  return new Response(JSON.stringify({ error: { message } }), { status, headers });
}

/**
 * Accepts the user's Groq key from, in priority order:
 * x-groq-api-key header, Authorization: Bearer header, x-gemini-api-key header (legacy), JSON body apiKey.
 */
function extractApiKey(req: Request, body: ExecuteBody): string {
  const candidates: (string | null | undefined)[] = [
    req.headers.get('x-groq-api-key'),
    /^Bearer\s+(.+)$/i.exec((req.headers.get('authorization') ?? '').trim())?.[1],
    req.headers.get('x-gemini-api-key'),
    typeof body.apiKey === 'string' ? body.apiKey : null,
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return '';
}

async function readUpstreamError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => '');
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      const message = (parsed as { error?: { message?: unknown } }).error?.message;
      if (typeof message === 'string' && message.trim()) return message;
    }
  } catch {
    /* the body was not JSON; use the generic message below */
  }
  return `Groq request failed (HTTP ${response.status}).`;
}

/**
 * Stateless streaming proxy to Groq's OpenAI-compatible chat endpoint.
 * The key is forwarded as a Bearer token, never stored, and never logged.
 */
export async function POST(req: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return jsonError(400, 'Request body must be valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return jsonError(400, 'Request body must be a JSON object.');
  }
  const body = parsed as ExecuteBody;

  const apiKey = extractApiKey(req, body);
  if (!apiKey || apiKey.length > MAX_KEY_LENGTH || /\s/.test(apiKey)) {
    return jsonError(401, 'Missing or malformed Groq API key. Add it in Settings.');
  }

  if (typeof body.systemInstruction !== 'string' || typeof body.prompt !== 'string') {
    return jsonError(400, 'systemInstruction and prompt are required strings.');
  }
  if (body.systemInstruction.length > MAX_SYSTEM_CHARS || body.prompt.length > MAX_PROMPT_CHARS) {
    return jsonError(413, 'The prompt is too large.');
  }

  const requestedModel = typeof body.model === 'string' ? body.model : '';
  const model = ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;
  const json = body.json === true;
  const temperature =
    typeof body.temperature === 'number' && Number.isFinite(body.temperature)
      ? Math.min(1, Math.max(0, body.temperature))
      : 0.5;

  const payload: Record<string, unknown> = {
    model,
    stream: true,
    temperature,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: body.systemInstruction },
      { role: 'user', content: body.prompt },
    ],
  };
  // gpt-oss models spend output tokens on reasoning; keep it light so content is never starved.
  if (model.startsWith('openai/gpt-oss')) payload.reasoning_effort = 'low';
  if (json) payload.response_format = { type: 'json_object' };

  let upstream: Response;
  try {
    upstream = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: req.signal,
    });
  } catch {
    if (req.signal.aborted) return jsonError(499, 'Request cancelled.');
    return jsonError(502, 'Could not reach Groq. Check your connection and try again.');
  }

  if (!upstream.ok || !upstream.body) {
    const message = await readUpstreamError(upstream);
    return jsonError(upstream.status || 502, message, upstream.headers.get('retry-after'));
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}