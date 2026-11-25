import { findClientByName, validateClient } from '../../shared/clients';
import { isStage, validateNewOrder, type NewOrder } from '../../shared/orders';
import type { ClientRepository } from '../clients/repository';
import { json, problem, readJson } from '../http';
import type { OrderRepository } from './repository';

const STAGE_PATH = /^\/api\/orders\/(\d{4,})\/stage$/;
const INVALID = 'Revisá los datos del pedido.';

/**
 * The id of the order's client: the one picked by id, or the one whose name matches, or a new client with
 * that name. Returns field errors, having stored nothing, when the client cannot be used.
 */
async function resolveClient(input: NewOrder, clients: ClientRepository): Promise<{ id: number } | { errors: Record<string, string> }> {
  if (input.clientId !== null) {
    return (await clients.get(input.clientId)) ? { id: input.clientId } : { errors: { clientId: 'Ese cliente no existe.' } };
  }
  const match = findClientByName(await clients.list(), input.client);
  if (match) return { id: match.id };
  const draft = validateClient({ name: input.client });
  if (!draft.ok) return { errors: { client: draft.errors.name ?? 'Revisá el nombre del cliente.' } };
  return { id: (await clients.create(draft.value)).id };
}

/** Handle /api/orders requests. Returns null when the path is not an order route. */
export async function handleOrders(request: Request, url: URL, repo: OrderRepository, clients: ClientRepository): Promise<Response | null> {
  if (url.pathname === '/api/orders') {
    if (request.method === 'GET') return json({ orders: await repo.list() });
    if (request.method === 'POST') {
      const body = await readJson(request);
      if (body === undefined) return problem(400, 'El cuerpo tiene que ser JSON.');
      const result = validateNewOrder(body);
      if (!result.ok) return json({ error: INVALID, fields: result.errors }, 422);
      const client = await resolveClient(result.value, clients);
      if ('errors' in client) return json({ error: INVALID, fields: client.errors }, 422);
      const { client: _name, clientId: _id, ...input } = result.value;
      return json({ order: await repo.create(input, client.id) }, 201);
    }
    return problem(405, 'Método no permitido.');
  }

  const stageMatch = STAGE_PATH.exec(url.pathname);
  if (stageMatch) {
    if (request.method !== 'PUT') return problem(405, 'Método no permitido.');
    const body = await readJson(request);
    const stage = typeof body === 'object' && body !== null ? (body as { stage?: unknown }).stage : undefined;
    if (!isStage(stage)) return problem(422, 'Esa etapa no existe.');
    const order = await repo.setStage(stageMatch[1], stage);
    if (!order) return problem(404, `No existe el pedido #${stageMatch[1]}.`);
    return json({ order });
  }

  return null;
}
