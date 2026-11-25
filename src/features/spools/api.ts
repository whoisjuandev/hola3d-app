import type { Spool } from '../../../shared/spools';
import { request } from '../../ui/api';

export async function fetchSpools(): Promise<Spool[]> {
  return (await request<{ spools: Spool[] }>('/api/spools')).spools;
}

export async function createSpool(input: Record<string, unknown>): Promise<Spool> {
  return (await request<{ spool: Spool }>('/api/spools', { method: 'POST', body: JSON.stringify(input) })).spool;
}

/** Send only the fields that changed; the API keeps the rest. */
export async function updateSpool(id: number, changes: Record<string, unknown>): Promise<Spool> {
  return (await request<{ spool: Spool }>(`/api/spools/${id}`, { method: 'PUT', body: JSON.stringify(changes) })).spool;
}
