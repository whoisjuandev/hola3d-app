import type { ClientSummary } from '../../../shared/clients';
import type { Order } from '../../../shared/orders';
import { request } from '../../ui/api';

export async function fetchClients(): Promise<ClientSummary[]> {
  return (await request<{ clients: ClientSummary[] }>('/api/clients')).clients;
}

export async function fetchClient(id: number): Promise<{ client: ClientSummary; orders: Order[] }> {
  return request<{ client: ClientSummary; orders: Order[] }>(`/api/clients/${id}`);
}

export async function createClient(input: Record<string, unknown>): Promise<ClientSummary> {
  return (await request<{ client: ClientSummary }>('/api/clients', { method: 'POST', body: JSON.stringify(input) })).client;
}

/** Send only the fields that changed; the API keeps the rest. */
export async function updateClient(id: number, changes: Record<string, unknown>): Promise<ClientSummary> {
  return (await request<{ client: ClientSummary }>(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(changes) })).client;
}
