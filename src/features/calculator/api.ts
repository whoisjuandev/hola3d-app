import type { CostSettings } from '../../../shared/cost-settings';
import { request } from '../../ui/api';

export async function fetchCostSettings(): Promise<CostSettings> {
  return (await request<{ settings: CostSettings }>('/api/settings/costs')).settings;
}

/** Send only the fields that changed; the API keeps the rest. */
export async function updateCostSettings(changes: Record<string, unknown>): Promise<CostSettings> {
  return (await request<{ settings: CostSettings }>('/api/settings/costs', { method: 'PUT', body: JSON.stringify(changes) })).settings;
}
