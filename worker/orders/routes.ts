import { isStage, validateNewOrder } from '../../shared/orders';
import { projectClientProblem, validateProjectId } from '../../shared/projects';
import type { ClientRepository } from '../clients/repository';
import { resolveClient } from '../clients/resolve';
import { json, problem, readJson } from '../http';
import type { ProjectRepository } from '../projects/repository';
import { namedClient, PROJECT_CHANGED } from '../projects/routes';
import type { OrderRepository } from './repository';

const STAGE_PATH = /^\/api\/orders\/(\d{4,})\/stage$/;
const INVALID = 'Revisá los datos del pedido.';

/** Handle /api/orders requests. Returns null when the path is not an order route. */
export async function handleOrders(
  request: Request, url: URL, repo: OrderRepository, clients: ClientRepository, projects: ProjectRepository,
): Promise<Response | null> {
  if (url.pathname === '/api/orders') {
    if (request.method === 'GET') return json({ orders: await repo.list() });
    if (request.method === 'POST') {
      const body = await readJson(request);
      if (body === undefined) return problem(400, 'El cuerpo tiene que ser JSON.');
      const result = validateNewOrder(body);
      const project = validateProjectId(body, false);
      if (!result.ok || !project.ok) {
        return json({ error: INVALID, fields: { ...(result.ok ? {} : result.errors), ...(project.ok ? {} : project.errors) } }, 422);
      }
      const projectId = project.value;
      if (projectId !== null) {
        // Checked before the client is resolved, so a refused order never leaves a new client behind.
        const target = await projects.get(projectId);
        if (!target) return json({ error: INVALID, fields: { projectId: 'Ese proyecto no existe.' } }, 422);
        const named = await namedClient(result.value, clients);
        if (named === undefined) return json({ error: INVALID, fields: { clientId: 'Ese cliente no existe.' } }, 422);
        const mismatch = projectClientProblem(target, { clientId: named?.id ?? null, client: named?.name ?? result.value.client });
        if (mismatch) return json({ error: INVALID, fields: { projectId: mismatch } }, 422);
      }
      const client = await resolveClient(result.value, clients);
      if ('errors' in client) return json({ error: INVALID, fields: client.errors }, 422);
      const { client: _name, clientId: _id, ...input } = result.value;
      const order = await repo.create(input, client.id, projectId);
      // Null only when the project changed client after the check above; nothing was written.
      return order ? json({ order }, 201) : problem(409, PROJECT_CHANGED);
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
