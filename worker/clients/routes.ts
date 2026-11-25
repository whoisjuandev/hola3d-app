import { summarizeClients, validateClient, type Client } from '../../shared/clients';
import { isJsonObject, json, problem, readJson } from '../http';
import type { OrderRepository } from '../orders/repository';
import type { ClientRepository } from './repository';

const ITEM_PATH = /^\/api\/clients\/(\d+)$/;
const INVALID = 'Revisá los datos del cliente.';

/** Handle /api/clients requests. Returns null when the path is not a client route. */
export async function handleClients(request: Request, url: URL, repo: ClientRepository, orders: OrderRepository): Promise<Response | null> {
  const summary = async (client: Client) => summarizeClients([client], await orders.listByClient(client.id))[0];

  if (url.pathname === '/api/clients') {
    if (request.method === 'GET') {
      const [clients, all] = await Promise.all([repo.list(), orders.list()]);
      return json({ clients: summarizeClients(clients, all) });
    }
    if (request.method === 'POST') {
      const body = await readJson(request);
      if (body === undefined) return problem(400, 'El cuerpo tiene que ser JSON.');
      const result = validateClient(body);
      if (!result.ok) return json({ error: INVALID, fields: result.errors }, 422);
      const client = await repo.create(result.value);
      return json({ client: summarizeClients([client], [])[0] }, 201);
    }
    return problem(405, 'Método no permitido.');
  }

  const itemMatch = ITEM_PATH.exec(url.pathname);
  if (itemMatch) {
    const id = Number(itemMatch[1]);
    const notFound = () => problem(404, `No existe el cliente ${id}.`);

    if (request.method === 'GET') {
      const client = await repo.get(id);
      if (!client) return notFound();
      const own = await orders.listByClient(id);
      return json({ client: summarizeClients([client], own)[0], orders: own });
    }

    if (request.method === 'PUT') {
      const body = await readJson(request);
      if (!isJsonObject(body)) return problem(400, 'El cuerpo tiene que ser JSON.');
      const current = await repo.get(id);
      if (!current) return notFound();
      // Fields left out of the body keep their stored value.
      const result = validateClient({ ...current, ...body });
      if (!result.ok) return json({ error: INVALID, fields: result.errors }, 422);
      const client = await repo.update(id, result.value);
      if (!client) return notFound();
      return json({ client: await summary(client) });
    }

    return problem(405, 'Método no permitido.');
  }

  return null;
}
