export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const ALLOWED_MODELS = ['gemini-3.8-flash', 'gemini-3.1-pro-preview'] as const;
const MAX_SYSTEM_CHARS = 30_000;
const MAX_PROMPT_CHARS = 200_000;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface ExecuteBody {
  model?: unknown;
  systemInstruction?: unknown;
  prompt?: unknown;
  json?: unknown;
  temperature?: unknown;
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/**
 * Thin, stateless proxy to the Gemini streaming REST API.
 * The user's key arrives in the x-gemini-api-key header, is forwarded as x-goog-api-key,
 * and is never stored or logged on the server.
 */
export async function POST(req: Request): Promise<Response> {
  const apiKey = (req.headers.get('x-gemini-api-key') ?? '').trim();
  if (!apiKey) {
    return errorResponse(401, 'Missing Gemini API key. Add it in Settings.');
  }

  let body: ExecuteBody;
  try {
    body = (await req.json()) as ExecuteBody;
  } catch {
    return errorResponse(400, 'Request body must be valid JSON.');
  }

  if (typeof body.systemInstruction !== 'string' || typeof body.prompt !== 'string') {
    return errorResponse(400, 'systemInstruction and prompt are required strings.');
  }
  if (body.systemInstruction.length > MAX_SYSTEM_CHARS || body.prompt.length > MAX_PROMPT_CHARS) {
    return errorResponse(413, 'The prompt is too large.');
  }

  const requestedModel = typeof body.model === 'string' ? body.model : '';
  const model = (ALLOWED_MODELS as readonly string[]).includes(requestedModel)
    ? requestedModel
    : 'gemini-3.8-flash';

  const temperature =
    typeof body.temperature === 'number' ? Math.min(1, Math.max(0, body.temperature)) : 0.4;

  const generationConfig: Record<string, unknown> = {
    temperature,
    maxOutputTokens: 16384,
  };
  if (body.json === true) {
    generationConfig.responseMimeType = 'application/json';
  }

  const upstream = await fetch(`${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: body.systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: body.prompt }] }],
      generationConfig,
    }),
    signal: req.signal,
  });

  if (!upstream.ok || !upstream.body) {
    const raw = await upstream.text().catch(() => '');
    let message = `Gemini request failed (HTTP ${upstream.status}).`;
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      /* keep default message */
    }
    return errorResponse(upstream.status || 502, message);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
