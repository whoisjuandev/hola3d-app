// JSON calls to the Worker API. Errors carry the Spanish message the API sent, and its field messages.

export class ApiError extends Error {
  readonly fields: Record<string, string>;
  constructor(message: string, fields: Record<string, string> = {}) {
    super(message);
    this.fields = fields;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  } catch {
    throw new ApiError('No hay conexión. Revisá internet y probá de nuevo.');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> } & T;
  if (!res.ok) throw new ApiError(body.error ?? 'Algo salió mal. Probá de nuevo.', body.fields);
  return body;
}
