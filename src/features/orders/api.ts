import type { NewOrder, Order, Stage } from '../../../shared/orders';

export class ApiError extends Error {
  readonly fields: Record<string, string>;
  constructor(message: string, fields: Record<string, string> = {}) {
    super(message);
    this.fields = fields;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

export async function fetchOrders(): Promise<Order[]> {
  return (await request<{ orders: Order[] }>('/api/orders')).orders;
}

export async function createOrder(input: Partial<NewOrder>): Promise<Order> {
  return (await request<{ order: Order }>('/api/orders', { method: 'POST', body: JSON.stringify(input) })).order;
}

export async function saveStage(id: string, stage: Stage): Promise<Order> {
  return (await request<{ order: Order }>(`/api/orders/${id}/stage`, { method: 'PUT', body: JSON.stringify({ stage }) })).order;
}
