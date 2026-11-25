import { describe, expect, it } from 'vitest';
import type { Client } from '../../shared/clients';
import type { Order } from '../../shared/orders';
import type { Project } from '../../shared/projects';
import { memoryClientRepository } from '../clients/repository';
import { memoryTables, type StoredProject } from '../memory';
import { memoryOrderRepository } from '../orders/repository';
import { handleOrders } from '../orders/routes';
import { memoryProjectRepository } from './repository';
import { handleProjects } from './routes';

const stamp = '2026-11-01T00:00:00.000Z';
const cafe: Client = { id: 1, name: 'Café Nube', phone: '', instagram: '', email: '', note: '', createdAt: stamp, updatedAt: stamp };
const school: Client = { ...cafe, id: 5, name: 'Escuela N.º 12' };

const order = (overrides: Partial<Order>): Order => ({
  id: '0144', item: 'Piezas de robótica × 30', client: 'Escuela N.º 12', clientId: 5, quoteId: null, projectId: null, project: null,
  channel: 'Email', stage: 'disenando', dueDate: '2026-11-27', dueTime: null, price: 96000, deposit: 48000, paid: false, material: 'PETG',
  note: '', createdAt: stamp, updatedAt: stamp, deliveredAt: null, realCost: null, realProfit: null, ...overrides,
});

// Kit: 0144 (designing, $96000, deposit 48000) and 0147 (delivered, paid, $30000). 0148 is the school's, with no project.
const robotics = order({ projectId: 1, project: 'Kit robótica' });
const gears = order({ id: '0147', item: 'Engranajes × 40', stage: 'entregado', price: 30000, deposit: 10000, paid: true, projectId: 1, project: 'Kit robótica' });
const loose = order({ id: '0148', item: 'Porta sensores', stage: 'nuevo', price: 8000, deposit: null });
const keychains = order({ id: '0142', item: 'Llaveros × 12', client: 'Café Nube', clientId: 1, channel: 'Instagram', price: 36000, deposit: 18000 });

const kitRow: StoredProject = {
  id: 1, name: 'Kit robótica', clientId: 5, status: 'activo', dueDate: '2026-12-05', note: 'Para la feria de ciencias.', createdAt: stamp, updatedAt: stamp,
};
const menuRow: StoredProject = { id: 2, name: 'Carta del café', clientId: 1, status: 'activo', dueDate: '2026-11-20', note: '', createdAt: stamp, updatedAt: stamp };
const signsRow: StoredProject = { id: 3, name: 'Carteles 2025', clientId: 1, status: 'terminado', dueDate: '2025-12-01', note: '', createdAt: stamp, updatedAt: stamp };

const kit: Project = { ...kitRow, client: 'Escuela N.º 12' };
const menu: Project = { ...menuRow, client: 'Café Nube' };
const signs: Project = { ...signsRow, client: 'Café Nube' };
const empty = { orderCount: 0, deliveredCount: 0, progress: 0, totalPrice: 0, totalDeposits: 0, balanceOwed: 0 };
// 1 of 2 delivered; 96000 + 30000; deposits 48000 + 10000; balance: only 0144 is not paid, 96000 − 48000.
const kitSummary = { ...kit, orderCount: 2, deliveredCount: 1, progress: 0.5, totalPrice: 126000, totalDeposits: 58000, balanceOwed: 48000 };

function setup() {
  const tables = memoryTables([cafe, school], [robotics, gears, loose, keychains], [], { projects: [kitRow, menuRow, signsRow] });
  const projects = memoryProjectRepository(tables);
  const orders = memoryOrderRepository(tables);
  const clients = memoryClientRepository(tables);
  const send = async (handler: (request: Request, url: URL) => Promise<Response | null>, method: string, path: string, body?: unknown) => {
    const url = new URL(`https://app.test${path}`);
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const res = await handler(new Request(url, { method, body: payload, headers: { 'Content-Type': 'application/json' } }), url);
    if (!res) throw new Error('route not handled');
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const call = (method: string, path: string, body?: unknown) =>
    send((request, url) => handleProjects(request, url, { projects, orders, clients }), method, path, body);
  const callOrders = (method: string, path: string, body?: unknown) =>
    send((request, url) => handleOrders(request, url, orders, clients, projects), method, path, body);
  return { tables, projects, orders, clients, call, callOrders };
}

describe('GET /api/projects', () => {
  it('lists projects, active first and by due date, each with its client, progress and totals', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/projects')).toEqual({
      status: 200,
      body: { projects: [{ ...menu, ...empty }, kitSummary, { ...signs, ...empty }] },
    });
  });

  it('lists one client\'s projects with ?clientId', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/projects?clientId=5')).toEqual({ status: 200, body: { projects: [kitSummary] } });
  });

  it('rejects a clientId filter that is not a number', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/projects?clientId=abc')).toEqual({
      status: 422, body: { error: 'Revisá el filtro.', fields: { clientId: 'Elegí un cliente de la lista.' } },
    });
  });
});

describe('POST /api/projects', () => {
  it('creates an active project for a client picked by id', async () => {
    const { call, projects } = setup();
    const { status, body } = await call('POST', '/api/projects', { name: 'Señalética', clientId: 1, dueDate: '2026-12-20', note: 'Cinco carteles.' });
    expect(status).toBe(201);
    const created = {
      id: 4, name: 'Señalética', clientId: 1, client: 'Café Nube', status: 'activo', dueDate: '2026-12-20', note: 'Cinco carteles.',
      createdAt: expect.any(String), updatedAt: expect.any(String),
    };
    expect(body).toEqual({ project: { ...created, ...empty } });
    expect(await projects.get(4)).toEqual(created);
  });

  it('creates the client when the name is new, like an order', async () => {
    const { call, clients } = setup();
    const { status, body } = await call('POST', '/api/projects', { name: 'Trofeos', client: 'Club Atlético' });
    expect(status).toBe(201);
    expect(body.project).toMatchObject({ name: 'Trofeos', clientId: 6, client: 'Club Atlético' });
    expect(await clients.get(6)).toMatchObject({ name: 'Club Atlético' });
  });

  it('answers 422 on clientId for an unknown client and stores nothing', async () => {
    const { call, projects, clients } = setup();
    expect(await call('POST', '/api/projects', { name: 'Trofeos', clientId: 99 })).toEqual({
      status: 422, body: { error: 'Revisá los datos del proyecto.', fields: { clientId: 'Ese cliente no existe.' } },
    });
    expect(await projects.list()).toEqual([menu, kit, signs]);
    expect(await clients.list()).toEqual([cafe, school]);
  });

  it('returns field errors and stores nothing, not even a new client, when data is invalid', async () => {
    const { call, projects, clients } = setup();
    expect(await call('POST', '/api/projects', { name: '', client: 'Club Atlético', dueDate: 'mañana' })).toEqual({
      status: 422, body: { error: 'Revisá los datos del proyecto.', fields: { name: 'Completá este dato.', dueDate: 'La fecha tiene que ser AAAA-MM-DD.' } },
    });
    expect(await projects.list()).toEqual([menu, kit, signs]);
    expect(await clients.list()).toEqual([cafe, school]);
  });

  it('rejects a body that is not JSON, and other methods', async () => {
    const { call, projects } = setup();
    expect(await call('POST', '/api/projects', 'no es json')).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    expect(await call('DELETE', '/api/projects')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
    expect(await projects.list()).toEqual([menu, kit, signs]);
  });
});

describe('GET /api/projects/:id', () => {
  it('returns the project with its totals and its orders', async () => {
    const { call } = setup();
    const { status, body } = await call('GET', '/api/projects/1');
    expect(status).toBe(200);
    expect(body.project).toEqual(kitSummary);
    expect(body.orders).toEqual([robotics, gears]);
  });

  it('answers 404 for a project that does not exist', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/projects/99')).toEqual({ status: 404, body: { error: 'No existe el proyecto 99.' } });
  });
});

describe('PUT /api/projects/:id', () => {
  it('changes the fields sent and keeps the rest', async () => {
    const { call, projects } = setup();
    const { status, body } = await call('PUT', '/api/projects/1', { name: 'Kit robótica 2026', dueDate: null });
    expect(status).toBe(200);
    expect(body.project).toEqual({ ...kitSummary, name: 'Kit robótica 2026', dueDate: null, updatedAt: expect.any(String) });
    expect(await projects.get(1)).toEqual({ ...kit, name: 'Kit robótica 2026', dueDate: null, updatedAt: expect.any(String) });
  });

  it('marks a project terminado', async () => {
    const { call, projects } = setup();
    const { status, body } = await call('PUT', '/api/projects/1', { status: 'terminado' });
    expect(status).toBe(200);
    expect(body.project).toMatchObject({ id: 1, status: 'terminado', orderCount: 2 });
    expect((await projects.get(1))?.status).toBe('terminado');
  });

  it('changes the client of a project without orders', async () => {
    const { call, projects } = setup();
    const { status } = await call('PUT', '/api/projects/2', { clientId: 5 });
    expect(status).toBe(200);
    expect(await projects.get(2)).toMatchObject({ clientId: 5, client: 'Escuela N.º 12' });
  });

  it('refuses to change the client of a project with orders, changing nothing', async () => {
    const { call, projects, clients } = setup();
    expect(await call('PUT', '/api/projects/1', { name: 'Otro nombre', clientId: 1 })).toEqual({
      status: 422,
      body: {
        error: 'Revisá los datos del proyecto.',
        fields: { clientId: 'Este proyecto tiene pedidos de Escuela N.º 12: sacalos del proyecto antes de cambiar el cliente.' },
      },
    });
    // A new client name is refused the same way, before the client is created.
    expect((await call('PUT', '/api/projects/1', { client: 'Club Atlético' })).status).toBe(422);
    expect(await projects.get(1)).toEqual(kit);
    expect(await clients.list()).toEqual([cafe, school]);
  });

  it('rejects invalid data without changing the project', async () => {
    const { call, projects } = setup();
    expect(await call('PUT', '/api/projects/1', { name: '', status: 'pausado' })).toEqual({
      status: 422, body: { error: 'Revisá los datos del proyecto.', fields: { name: 'Completá este dato.', status: 'Elegí activo o terminado.' } },
    });
    expect(await projects.get(1)).toEqual(kit);
  });

  it('rejects a body that is not a JSON object, and answers 404 for a project that does not exist', async () => {
    const { call, projects } = setup();
    expect(await call('PUT', '/api/projects/1', '[1]')).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    expect(await call('PUT', '/api/projects/99', { name: 'Otro' })).toEqual({ status: 404, body: { error: 'No existe el proyecto 99.' } });
    expect(await projects.list()).toEqual([menu, kit, signs]);
  });

  it('rejects other methods', async () => {
    const { call } = setup();
    expect(await call('DELETE', '/api/projects/1')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });
});

describe('PUT /api/orders/:id/project', () => {
  it('assigns an order to a project of its client', async () => {
    const { call, orders } = setup();
    const { status, body } = await call('PUT', '/api/orders/0148/project', { projectId: 1 });
    expect(status).toBe(200);
    expect(body).toEqual({ order: { ...loose, projectId: 1, project: 'Kit robótica', updatedAt: expect.any(String) } });
    expect(await orders.get('0148')).toMatchObject({ projectId: 1, project: 'Kit robótica' });
    expect((await orders.listByProject(1)).map((o) => o.id)).toEqual(['0144', '0147', '0148']);
  });

  it('moves an order from one project to another of the same client', async () => {
    const { call, orders } = setup();
    expect((await call('PUT', '/api/orders/0142/project', { projectId: 2 })).status).toBe(200);
    expect((await call('PUT', '/api/orders/0142/project', { projectId: 3 })).status).toBe(200);
    expect(await orders.get('0142')).toMatchObject({ projectId: 3, project: 'Carteles 2025' });
    expect(await orders.listByProject(2)).toEqual([]);
  });

  it('unassigns an order with projectId null', async () => {
    const { call, orders } = setup();
    const { status, body } = await call('PUT', '/api/orders/0144/project', { projectId: null });
    expect(status).toBe(200);
    expect(body).toEqual({ order: { ...robotics, projectId: null, project: null, updatedAt: expect.any(String) } });
    expect(await orders.get('0144')).toMatchObject({ projectId: null, project: null });
    expect((await orders.listByProject(1)).map((o) => o.id)).toEqual(['0147']);
  });

  it('rejects an order of another client with 422, changing nothing', async () => {
    const { call, orders } = setup();
    expect(await call('PUT', '/api/orders/0142/project', { projectId: 1 })).toEqual({
      status: 422,
      body: {
        error: 'Revisá los datos del pedido.',
        fields: { projectId: '«Kit robótica» es de Escuela N.º 12 y este pedido es de Café Nube: un proyecto junta pedidos de un solo cliente.' },
      },
    });
    // Moving the robotics order to a café project is refused too, and it stays in its own.
    expect((await call('PUT', '/api/orders/0144/project', { projectId: 2 })).status).toBe(422);
    expect(await orders.list()).toEqual([robotics, gears, loose, keychains]);
  });

  it('rejects an unknown project, a wrong or missing projectId, and a body that is not JSON, changing nothing', async () => {
    const { call, orders } = setup();
    const invalid = (projectId: string) => ({ status: 422, body: { error: 'Revisá los datos del pedido.', fields: { projectId } } });
    expect(await call('PUT', '/api/orders/0148/project', { projectId: 99 })).toEqual(invalid('Ese proyecto no existe.'));
    expect(await call('PUT', '/api/orders/0148/project', { projectId: 'uno' })).toEqual(invalid('Elegí un proyecto de la lista.'));
    expect(await call('PUT', '/api/orders/0148/project', {})).toEqual(invalid('Elegí un proyecto o «Sin proyecto».'));
    expect(await call('PUT', '/api/orders/0148/project', 'no es json')).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    expect(await orders.list()).toEqual([robotics, gears, loose, keychains]);
  });

  it('answers 404 for an order that does not exist, and 405 for other methods', async () => {
    const { call } = setup();
    expect(await call('PUT', '/api/orders/0999/project', { projectId: 1 })).toEqual({ status: 404, body: { error: 'No existe el pedido #0999.' } });
    expect(await call('GET', '/api/orders/0144/project')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });
});

describe('orders and projects', () => {
  it('GET /api/orders carries each order\'s project id and name', async () => {
    const { callOrders } = setup();
    expect(await callOrders('GET', '/api/orders')).toEqual({ status: 200, body: { orders: [robotics, gears, loose, keychains] } });
  });

  it('reads the project name through the project', async () => {
    const { call, orders } = setup();
    await call('PUT', '/api/projects/1', { name: 'Kit robótica 2026' });
    expect(await orders.get('0144')).toMatchObject({ projectId: 1, project: 'Kit robótica 2026' });
  });

  it('POST /api/orders puts the new order in a project of its client', async () => {
    const { callOrders, orders } = setup();
    const { status, body } = await callOrders('POST', '/api/orders', { item: 'Ruedas × 8', clientId: 5, channel: 'Email', price: 12000, projectId: 1 });
    expect(status).toBe(201);
    expect(body.order).toMatchObject({ id: '0149', clientId: 5, projectId: 1, project: 'Kit robótica' });
    expect(await orders.get('0149')).toMatchObject({ projectId: 1 });
  });

  it('POST /api/orders matches the client by name before checking the project', async () => {
    const { callOrders } = setup();
    const { status, body } = await callOrders('POST', '/api/orders', { item: 'Ruedas × 8', client: 'escuela n.º 12', channel: 'Email', price: 12000, projectId: 1 });
    expect(status).toBe(201);
    expect(body.order).toMatchObject({ clientId: 5, projectId: 1 });
  });

  it('POST /api/orders without a project leaves it out of any', async () => {
    const { callOrders } = setup();
    const { body } = await callOrders('POST', '/api/orders', { item: 'Ruedas × 8', clientId: 5, channel: 'Email', price: 12000 });
    expect(body.order).toMatchObject({ projectId: null, project: null });
  });

  it('POST /api/orders rejects a project of another client, an unknown one or a wrong id, storing nothing', async () => {
    const { callOrders, orders, clients } = setup();
    const newOrder = { item: 'Ruedas × 8', channel: 'Email', price: 12000 };
    const invalid = (projectId: string) => ({ status: 422, body: { error: 'Revisá los datos del pedido.', fields: { projectId } } });
    expect(await callOrders('POST', '/api/orders', { ...newOrder, clientId: 1, projectId: 1 })).toEqual(
      invalid('«Kit robótica» es de Escuela N.º 12 y este pedido es de Café Nube: un proyecto junta pedidos de un solo cliente.'),
    );
    // A new client name can never be the project's client: refused before the client is created.
    expect(await callOrders('POST', '/api/orders', { ...newOrder, client: 'Club Atlético', projectId: 1 })).toEqual(
      invalid('«Kit robótica» es de Escuela N.º 12 y este pedido es de Club Atlético: un proyecto junta pedidos de un solo cliente.'),
    );
    expect(await callOrders('POST', '/api/orders', { ...newOrder, clientId: 5, projectId: 99 })).toEqual(invalid('Ese proyecto no existe.'));
    const { status, body } = await callOrders('POST', '/api/orders', { item: '', clientId: 5, projectId: 'uno' });
    expect(status).toBe(422);
    expect(body.fields).toMatchObject({ item: 'Completá este dato.', projectId: 'Elegí un proyecto de la lista.' });
    expect(await orders.list()).toEqual([robotics, gears, loose, keychains]);
    expect(await clients.list()).toEqual([cafe, school]);
  });
});

it('leaves other paths to the caller', async () => {
  const { tables } = setup();
  const deps = { projects: memoryProjectRepository(tables), orders: memoryOrderRepository(tables), clients: memoryClientRepository(tables) };
  for (const path of ['/api/orders', '/api/orders/0144/stage', '/api/clients/1', '/api/projects/abc']) {
    const url = new URL(`https://app.test${path}`);
    expect(await handleProjects(new Request(url), url, deps)).toBeNull();
  }
});
