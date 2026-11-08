export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const MAX_SYSTEM_CHARS = 30_000;
const MAX_PROMPT_CHARS = 200_000;
const MAX_OUTPUT_TOKENS = 8192;

interface ExecuteBody {
  systemInstruction?: unknown;
  prompt?: unknown;
  json?: unknown;
  temperature?: unknown;
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function readUpstreamError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === 'string' && parsed.error.message.trim()) {
      return parsed.error.message;
    }
  } catch {
    /* body was not JSON; fall through to the generic message */
  }
  return `Groq request failed (HTTP ${response.status}).`;
}

/**
 * Stateless proxy to Groq's OpenAI-compatible streaming chat endpoint.
 * The user's key arrives in the x-groq-api-key header, is forwarded as a Bearer token,
 * and is never stored or logged on the server.
 */
export async function POST(req: Request): Promise<Response> {
  const apiKey = (req.headers.get('x-groq-api-key') ?? '').trim();
  if (!apiKey || apiKey.length > 256 || /\s/.test(apiKey)) {
    return jsonError(401, 'Missing or malformed Groq API key. Add it in Settings.');
  }

  let body: ExecuteBody;
  try {
    body = (await req.json()) as ExecuteBody;
  } catch {
    return jsonError(400, 'Request body must be valid JSON.');
  }

  if (typeof body !== 'object' || body === null) {
    return jsonError(400, 'Request body must be a JSON object.');
  }
  if (typeof body.systemInstruction !== 'string' || typeof body.prompt !== 'string') {
    return jsonError(400, 'systemInstruction and prompt are required strings.');
  }
  if (body.systemInstruction.length > MAX_SYSTEM_CHARS || body.prompt.length > MAX_PROMPT_CHARS) {
    return jsonError(413, 'The prompt is too large.');
  }

  const json = body.json === true;
  const temperature =
    typeof body.temperature === 'number' && Number.isFinite(body.temperature)
      ? Math.min(1, Math.max(0, body.temperature))
      : 0.5;

  const payload = {
    model: GROQ_MODEL,
    stream: true,
    temperature,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: body.systemInstruction },
      { role: 'user', content: body.prompt },
    ],
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  };

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
    return jsonError(upstream.status || 502, message);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}