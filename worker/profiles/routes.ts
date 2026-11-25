import { DUPLICATE_PROFILE_NAME, validateCalcProfile } from '../../shared/calc-profiles';
import { sentFields } from '../../shared/fields';
import { isJsonObject, json, problem, readJson } from '../http';
import { DUPLICATE, type CalcProfileRepository } from './repository';

const LIST_PATH = '/api/calculator/profiles';
const ITEM_PATH = /^\/api\/calculator\/profiles\/(\d+)$/;
const INVALID = 'Revisá los datos del perfil.';

const notAllowed = () => problem(405, 'Método no permitido.');
const notJson = () => problem(400, 'El cuerpo tiene que ser JSON.');
const notFound = (id: number) => problem(404, `No existe el perfil ${id}.`);
const invalid = (fields: Record<string, string>) => json({ error: INVALID, fields }, 422);
const duplicate = () => invalid({ name: DUPLICATE_PROFILE_NAME });

/**
 * Handle the saved calculator profiles: list and create at /api/calculator/profiles, rename or overwrite (PUT, only the
 * fields sent) and delete at /api/calculator/profiles/:id. Returns null for any other path.
 */
export async function handleCalcProfiles(request: Request, url: URL, profiles: CalcProfileRepository): Promise<Response | null> {
  if (url.pathname === LIST_PATH) {
    if (request.method === 'GET') return json({ profiles: await profiles.list() });
    if (request.method !== 'POST') return notAllowed();
    const body = await readJson(request);
    if (body === undefined) return notJson();
    const result = validateCalcProfile(body);
    if (!result.ok) return invalid(result.errors);
    const profile = await profiles.create(result.value);
    return profile === DUPLICATE ? duplicate() : json({ profile }, 201);
  }

  const match = ITEM_PATH.exec(url.pathname);
  if (!match) return null;
  const id = Number(match[1]);

  if (request.method === 'PUT') {
    const body = await readJson(request);
    if (!isJsonObject(body)) return notJson();
    const current = await profiles.get(id);
    if (!current) return notFound(id);
    // Fields left out of the body keep their stored value, and only the sent ones are written.
    const result = validateCalcProfile({ ...current, ...body });
    if (!result.ok) return invalid(result.errors);
    const profile = await profiles.update(id, sentFields(result.value, body));
    if (profile === DUPLICATE) return duplicate();
    return profile ? json({ profile }) : notFound(id);
  }
  if (request.method === 'DELETE') {
    const profile = await profiles.delete(id);
    return profile ? json({ profile }) : notFound(id);
  }
  return notAllowed();
}
