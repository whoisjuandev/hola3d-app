import { findClientByName } from '../../shared/clients';
import {
  projectClientProblem, projectTotals, summarizeProjects, validateProject, validateProjectId, type NewProject, type Project,
} from '../../shared/projects';
import type { ClientRepository } from '../clients/repository';
import { resolveClient } from '../clients/resolve';
import { isJsonObject, json, problem, readJson } from '../http';
import type { OrderRepository } from '../orders/repository';
import type { ProjectRepository } from './repository';

export interface ProjectDeps {
  projects: ProjectRepository;
  orders: OrderRepository;
  clients: ClientRepository;
}

const ITEM_PATH = /^\/api\/projects\/(\d+)$/;
const ORDER_PROJECT_PATH = /^\/api\/orders\/(\d{4,})\/project$/;
const INVALID = 'Revisá los datos del proyecto.';
const INVALID_ORDER = 'Revisá los datos del pedido.';
/** Answered when a project changed between the checks and the guarded write. */
export const PROJECT_CHANGED = 'El proyecto cambió mientras tanto: recargá la página y probá de nuevo.';

const notFound = (id: number) => problem(404, `No existe el proyecto ${id}.`);
const invalid = (fields: Record<string, string>) => json({ error: INVALID, fields }, 422);
const clientLocked = (project: Project) =>
  invalid({ clientId: `Este proyecto tiene pedidos de ${project.client}: sacalos del proyecto antes de cambiar el cliente.` });

/**
 * The client a request names, without creating it: the one picked by id (undefined when that id does not exist), the
 * one whose name matches, or null for a new name. Lets a route refuse a request before `resolveClient` creates a client.
 */
export async function namedClient(
  input: { client: string; clientId: number | null }, clients: ClientRepository,
): Promise<{ id: number; name: string } | null | undefined> {
  if (input.clientId !== null) return (await clients.get(input.clientId)) ?? undefined;
  return findClientByName(await clients.list(), input.client);
}

/** Handle /api/projects requests and the project of an order. Returns null when the path is neither. */
export async function handleProjects(request: Request, url: URL, deps: ProjectDeps): Promise<Response | null> {
  const { projects, orders } = deps;

  if (url.pathname === '/api/projects') {
    if (request.method === 'GET') {
      const raw = url.searchParams.get('clientId');
      if (raw === null) {
        const [list, all] = await Promise.all([projects.list(), orders.list()]);
        return json({ projects: summarizeProjects(list, all) });
      }
      if (!/^\d+$/.test(raw)) return json({ error: 'Revisá el filtro.', fields: { clientId: 'Elegí un cliente de la lista.' } }, 422);
      const clientId = Number(raw);
      const [list, own] = await Promise.all([projects.list({ clientId }), orders.listByClient(clientId)]);
      return json({ projects: summarizeProjects(list, own) });
    }
    if (request.method === 'POST') return create(request, deps);
    return problem(405, 'Método no permitido.');
  }

  const itemMatch = ITEM_PATH.exec(url.pathname);
  if (itemMatch) {
    const id = Number(itemMatch[1]);
    if (request.method === 'GET') {
      const project = await projects.get(id);
      if (!project) return notFound(id);
      const own = await orders.listByProject(id);
      return json({ project: { ...project, ...projectTotals(own) }, orders: own });
    }
    if (request.method === 'PUT') return update(request, id, deps);
    return problem(405, 'Método no permitido.');
  }

  const orderMatch = ORDER_PROJECT_PATH.exec(url.pathname);
  if (orderMatch) {
    if (request.method !== 'PUT') return problem(405, 'Método no permitido.');
    return assign(request, orderMatch[1], deps);
  }

  return null;
}

async function create(request: Request, deps: ProjectDeps): Promise<Response> {
  const body = await readJson(request);
  if (body === undefined) return problem(400, 'El cuerpo tiene que ser JSON.');
  const result = validateProject(body);
  if (!result.ok) return invalid(result.errors);
  const client = await resolveClient(result.value, deps.clients);
  if ('errors' in client) return invalid(client.errors);
  const { client: _name, clientId: _id, ...rest } = result.value;
  const project = await deps.projects.create({ ...rest, clientId: client.id });
  return json({ project: { ...project, ...projectTotals([]) } }, 201);
}

/** Edit the fields sent. The client changes only while the project has no orders. */
async function update(request: Request, id: number, deps: ProjectDeps): Promise<Response> {
  const body = await readJson(request);
  if (!isJsonObject(body)) return problem(400, 'El cuerpo tiene que ser JSON.');
  const current = await deps.projects.get(id);
  if (!current) return notFound(id);

  // Fields left out of the body keep their stored value. A client sent by name replaces the stored id.
  const stored: Record<string, unknown> = {
    name: current.name, clientId: current.clientId, status: current.status, dueDate: current.dueDate, note: current.note,
  };
  if (Object.hasOwn(body, 'client') && !Object.hasOwn(body, 'clientId')) stored.clientId = null;
  const result = validateProject({ ...stored, ...body });
  if (!result.ok) return invalid(result.errors);

  // Checked before the client is resolved, so a refused edit never leaves a new client behind.
  const named = await namedClient(result.value, deps.clients);
  if (named === undefined) return invalid({ clientId: 'Ese cliente no existe.' });
  if (named?.id !== current.clientId && (await deps.orders.listByProject(id)).length > 0) return clientLocked(current);

  const client = await resolveClient(result.value, deps.clients);
  if ('errors' in client) return invalid(client.errors);
  const { client: _name, clientId: _id, ...rest }: NewProject = result.value;
  const project = await deps.projects.update(id, { ...rest, clientId: client.id });
  if (!project) {
    // Null here means the project went away or got an order after the checks above; nothing was written.
    const now = await deps.projects.get(id);
    return now ? clientLocked(now) : notFound(id);
  }
  return json({ project: { ...project, ...projectTotals(await deps.orders.listByProject(id)) } });
}

/** Put an order in a project of its client, or take it out with `projectId: null`. */
async function assign(request: Request, orderId: string, deps: ProjectDeps): Promise<Response> {
  const body = await readJson(request);
  if (body === undefined) return problem(400, 'El cuerpo tiene que ser JSON.');
  const result = validateProjectId(body, true);
  if (!result.ok) return json({ error: INVALID_ORDER, fields: result.errors }, 422);
  const order = await deps.orders.get(orderId);
  if (!order) return problem(404, `No existe el pedido #${orderId}.`);

  const projectId = result.value;
  if (projectId !== null) {
    const project = await deps.projects.get(projectId);
    if (!project) return json({ error: INVALID_ORDER, fields: { projectId: 'Ese proyecto no existe.' } }, 422);
    const mismatch = projectClientProblem(project, order);
    if (mismatch) return json({ error: INVALID_ORDER, fields: { projectId: mismatch } }, 422);
  }

  const saved = await deps.orders.setProject(orderId, projectId);
  // Null here means the order or the project changed after the checks above; nothing was written.
  return saved ? json({ order: saved }) : problem(409, PROJECT_CHANGED);
}
