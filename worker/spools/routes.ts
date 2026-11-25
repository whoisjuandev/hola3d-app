import { sentFields } from '../../shared/fields';
import { validateSpool } from '../../shared/spools';
import { isJsonObject, json, problem, readJson } from '../http';
import type { SpoolRepository } from './repository';

const ITEM_PATH = /^\/api\/spools\/(\d+)$/;
const INVALID = 'Revisá los datos de la bobina.';

/** Handle /api/spools requests. Returns null when the path is not a spool route. */
export async function handleSpools(request: Request, url: URL, repo: SpoolRepository): Promise<Response | null> {
  if (url.pathname === '/api/spools') {
    if (request.method === 'GET') return json({ spools: await repo.list() });
    if (request.method === 'POST') {
      const body = await readJson(request);
      if (body === undefined) return problem(400, 'El cuerpo tiene que ser JSON.');
      const result = validateSpool(body);
      if (!result.ok) return json({ error: INVALID, fields: result.errors }, 422);
      return json({ spool: await repo.create(result.value) }, 201);
    }
    return problem(405, 'Método no permitido.');
  }

  const itemMatch = ITEM_PATH.exec(url.pathname);
  if (itemMatch) {
    if (request.method !== 'PUT') return problem(405, 'Método no permitido.');
    const id = Number(itemMatch[1]);
    const body = await readJson(request);
    if (!isJsonObject(body)) return problem(400, 'El cuerpo tiene que ser JSON.');
    const current = await repo.get(id);
    if (!current) return problem(404, `No existe la bobina ${id}.`);
    // Fields left out of the body keep their stored value.
    const result = validateSpool({ ...current, ...body });
    if (!result.ok) return json({ error: INVALID, fields: result.errors }, 422);
    // Only the fields sent are written: a print job may have changed the counters since the read above.
    const spool = await repo.update(id, sentFields(result.value, body));
    if (!spool) return problem(404, `No existe la bobina ${id}.`);
    return json({ spool });
  }

  return null;
}
