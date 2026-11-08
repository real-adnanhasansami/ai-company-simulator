export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_SYSTEM_CHARS = 30_000;
const MAX_PROMPT_CHARS = 200_000;

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
 * High-speed proxy using Groq Cloud API (Llama 3.1 8B Instant - Free Tier).
 */
export async function POST(req: Request): Promise<Response> {
  const apiKey = (req.headers.get('x-gemini-api-key') ?? '').trim();
  if (!apiKey) {
    return errorResponse(401, 'Missing Groq API key. Add it in Settings.');
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

  const temperature =
    typeof body.temperature === 'number' ? Math.min(1, Math.max(0, body.temperature)) : 0.4;

  try {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: body.systemInstruction },
          { role: 'user', content: body.prompt },
        ],
        temperature,
        max_tokens: 8000,
        stream: true,
        ...(body.json === true ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: req.signal,
    });

    if (!groqResponse.ok || !groqResponse.body) {
      const raw = await groqResponse.text().catch(() => '');
      let message = `Groq request failed (HTTP ${groqResponse.status}).`;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        /* keep default message */
      }
      return errorResponse(groqResponse.status || 502, message);
    }

    return new Response(groqResponse.body, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  } catch (err: any) {
    return errorResponse(500, err?.message || 'Failed to reach Groq API.');
  }
}