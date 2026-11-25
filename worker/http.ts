export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function problem(status: number, error: string): Response {
  return json({ error }, status);
}

const MAX_BODY_BYTES = 32 * 1024;

/** Parse a small JSON body. Returns undefined when it is missing, too big or not JSON. */
export async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('Content-Length') ?? '0');
  if (length > MAX_BODY_BYTES) return undefined;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** True for a JSON object body (not an array, string, number or null). */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
