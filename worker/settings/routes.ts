import { DEFAULT_COST_SETTINGS, validateCostSettings, type CostSettings } from '../../shared/cost-settings';
import { isJsonObject, json, problem, readJson } from '../http';
import type { CostSettingsRepository } from './repository';

const INVALID = 'Revisá los costos del taller.';

/** Handle /api/settings/costs requests. Returns null when the path is not a settings route. */
export async function handleCostSettings(request: Request, url: URL, repo: CostSettingsRepository): Promise<Response | null> {
  if (url.pathname !== '/api/settings/costs') return null;

  if (request.method === 'GET') return json({ settings: await currentCostSettings(repo) });
  if (request.method === 'PUT') {
    const body = await readJson(request);
    if (!isJsonObject(body)) return problem(400, 'El cuerpo tiene que ser JSON.');
    // Fields left out of the body keep their stored value.
    const result = validateCostSettings({ ...(await currentCostSettings(repo)), ...body });
    if (!result.ok) return json({ error: INVALID, fields: result.errors }, 422);
    return json({ settings: await repo.save(result.value) });
  }
  return problem(405, 'Método no permitido.');
}

/** The stored settings, or the defaults while they have never been saved. The calculator and quotes price with these. */
export async function currentCostSettings(repo: CostSettingsRepository): Promise<CostSettings> {
  return (await repo.get()) ?? { ...DEFAULT_COST_SETTINGS, updatedAt: null };
}
