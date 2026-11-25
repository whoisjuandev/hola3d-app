import type { CalcProfile } from '../../../shared/calc-profiles';
import type { CalcInput } from '../../../shared/calculator';
import type { CostSettings } from '../../../shared/cost-settings';
import { request } from '../../ui/api';

export async function fetchCostSettings(): Promise<CostSettings> {
  return (await request<{ settings: CostSettings }>('/api/settings/costs')).settings;
}

/** Send only the fields that changed; the API keeps the rest. */
export async function updateCostSettings(changes: Record<string, unknown>): Promise<CostSettings> {
  return (await request<{ settings: CostSettings }>('/api/settings/costs', { method: 'PUT', body: JSON.stringify(changes) })).settings;
}

export async function fetchProfiles(): Promise<CalcProfile[]> {
  return (await request<{ profiles: CalcProfile[] }>('/api/calculator/profiles')).profiles;
}

export async function createProfile(fields: { name: string; input: CalcInput }): Promise<CalcProfile> {
  return (await request<{ profile: CalcProfile }>('/api/calculator/profiles', { method: 'POST', body: JSON.stringify(fields) })).profile;
}

/** Rename, overwrite the input, or both: the API writes only what is sent. */
export async function updateProfile(id: number, changes: { name?: string; input?: CalcInput }): Promise<CalcProfile> {
  return (await request<{ profile: CalcProfile }>(`/api/calculator/profiles/${id}`, { method: 'PUT', body: JSON.stringify(changes) })).profile;
}

export async function deleteProfile(id: number): Promise<void> {
  await request<{ profile: CalcProfile }>(`/api/calculator/profiles/${id}`, { method: 'DELETE' });
}
