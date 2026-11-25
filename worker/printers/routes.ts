import { validatePrinter } from '../../shared/printers';
import { isJsonObject, json, problem, readJson } from '../http';
import type { PrinterRepository } from './repository';

const ITEM_PATH = /^\/api\/printers\/(\d+)$/;
const INVALID = 'Revisá los datos de la impresora.';

/** Handle /api/printers requests. Returns null when the path is not a printer route. */
export async function handlePrinters(request: Request, url: URL, repo: PrinterRepository): Promise<Response | null> {
  if (url.pathname === '/api/printers') {
    if (request.method === 'GET') return json({ printers: await repo.list() });
    if (request.method === 'POST') {
      const body = await readJson(request);
      if (body === undefined) return problem(400, 'El cuerpo tiene que ser JSON.');
      const result = validatePrinter(body);
      if (!result.ok) return json({ error: INVALID, fields: result.errors }, 422);
      return json({ printer: await repo.create(result.value) }, 201);
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
    if (!current) return problem(404, `No existe la impresora ${id}.`);
    // Fields left out of the body keep their stored value.
    const result = validatePrinter({ ...current, ...body });
    if (!result.ok) return json({ error: INVALID, fields: result.errors }, 422);
    const printer = await repo.update(id, result.value);
    if (!printer) return problem(404, `No existe la impresora ${id}.`);
    return json({ printer });
  }

  return null;
}
