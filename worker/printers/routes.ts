import { asBody, sentFields } from '../../shared/fields';
import { validatePrinter } from '../../shared/printers';
import { isJsonObject, json, problem, readJson } from '../http';
import type { ServiceRepository } from '../service/repository';
import type { PrinterRepository } from './repository';

/** What creating a printer with its default service plan needs. */
export interface PrinterServicePlan {
  service: ServiceRepository;
  /** The workshop's date, YYYY-MM-DD: the plan counts from it. */
  today: () => string;
}

const ITEM_PATH = /^\/api\/printers\/(\d+)$/;
const INVALID = 'Revisá los datos de la impresora.';

/**
 * Handle /api/printers requests. Returns null when the path is not a printer route. With `plan`, a new printer can come
 * with the default service plan (`servicePlan: true`), written together with it.
 */
export async function handlePrinters(request: Request, url: URL, repo: PrinterRepository, plan?: PrinterServicePlan): Promise<Response | null> {
  if (url.pathname === '/api/printers') {
    if (request.method === 'GET') return json({ printers: await repo.list() });
    if (request.method === 'POST') {
      const body = await readJson(request);
      if (body === undefined) return problem(400, 'El cuerpo tiene que ser JSON.');
      const result = validatePrinter(body);
      const withPlan = asBody(body).servicePlan ?? false;
      const errors = result.ok ? {} : { ...result.errors };
      if (typeof withPlan !== 'boolean') errors.servicePlan = 'Elegí si va con el plan de servicio o sin él.';
      if (!result.ok || Object.keys(errors).length) return json({ error: INVALID, fields: errors }, 422);
      if (withPlan && plan) return json({ printer: (await plan.service.createPrinterWithPlan(result.value, plan.today())).printer }, 201);
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
    // Only the fields sent are written: a print job may have changed the counters since the read above.
    const printer = await repo.update(id, sentFields(result.value, body));
    if (!printer) return problem(404, `No existe la impresora ${id}.`);
    return json({ printer });
  }

  return null;
}
