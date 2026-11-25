import { describe, expect, it } from 'vitest';
import type { Client } from '../../shared/clients';
import type { Order } from '../../shared/orders';
import { memoryClientRepository } from '../clients/repository';
import { memoryTables } from '../memory';
import { memoryOrderRepository } from './repository';
import { handleOrders } from './routes';

const cafe: Client = {
  id: 1, name: 'Café Nube', phone: '', instagram: 'cafe.nube', email: '', note: '',
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};

const base: Order = {
  id: '0142', item: 'Llaveros con logo × 12', client: 'Café Nube', clientId: 1, quoteId: null, channel: 'Instagram', stage: 'imprimiendo',
  dueDate: '2026-11-23', dueTime: null, price: 36000, deposit: 18000, paid: false, material: 'PLA', note: '',
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};

function call(method: string, path: string, body?: unknown) {
  const tables = memoryTables([cafe], [base]);
  const repo = memoryOrderRepository(tables);
  const clients = memoryClientRepository(tables);
  const url = new URL(`https://app.test${path}`);
  const request = new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  return { repo, clients, run: () => handleOrders(request, url, repo, clients) };
}

async function read(res: Response | null) {
  if (!res) throw new Error('route not handled');
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const newOrder = { item: 'Maceta', channel: 'Tienda web', price: 12000 };

describe('GET /api/orders', () => {
  it('lists orders with the client name and id', async () => {
    const { run } = call('GET', '/api/orders');
    const { status, body } = await read(await run());
    expect(status).toBe(200);
    expect(body).toEqual({ orders: [base] });
  });

  it('reads the client name through the client', async () => {
    const { run, clients } = call('GET', '/api/orders');
    await clients.update(1, { ...cafe, name: 'Café Nube Palermo' });
    const { body } = await read(await run());
    expect((body.orders as Order[])[0]).toMatchObject({ client: 'Café Nube Palermo', clientId: 1 });
  });
});

describe('POST /api/orders', () => {
  it('creates the next numbered order in stage nuevo', async () => {
    const { run, repo } = call('POST', '/api/orders', { ...newOrder, client: 'Lucía M.' });
    const { status, body } = await read(await run());
    expect(status).toBe(201);
    expect(body.order).toMatchObject({ id: '0143', stage: 'nuevo', client: 'Lucía M.', price: 12000, deposit: null });
    expect(await repo.get('0143')).not.toBeNull();
  });

  it('still creates the order from a plain client name, creating that client', async () => {
    const { run, repo, clients } = call('POST', '/api/orders', { ...newOrder, client: '  Lucía M. ' });
    const { status, body } = await read(await run());
    expect(status).toBe(201);
    expect(body.order).toMatchObject({ id: '0143', client: 'Lucía M.', clientId: 2 });
    expect(await repo.get('0143')).toMatchObject({ client: 'Lucía M.', clientId: 2 });
    expect(await clients.list()).toEqual([cafe, expect.objectContaining({ id: 2, name: 'Lucía M.', phone: '', instagram: '', email: '', note: '' })]);
  });

  it('reuses the client whose name matches ignoring case, accents and surrounding spaces', async () => {
    const { run, repo, clients } = call('POST', '/api/orders', { ...newOrder, client: '  CAFE nube ' });
    const { status, body } = await read(await run());
    expect(status).toBe(201);
    expect(body.order).toMatchObject({ id: '0143', client: 'Café Nube', clientId: 1 });
    expect(await repo.get('0143')).toMatchObject({ clientId: 1 });
    expect(await clients.list()).toEqual([cafe]);
  });

  it('links an existing client by id', async () => {
    const { run, repo, clients } = call('POST', '/api/orders', { ...newOrder, clientId: 1 });
    const { status, body } = await read(await run());
    expect(status).toBe(201);
    expect(body.order).toMatchObject({ id: '0143', client: 'Café Nube', clientId: 1 });
    expect(await repo.get('0143')).toMatchObject({ clientId: 1 });
    expect(await clients.list()).toEqual([cafe]);
  });

  it('answers 422 on clientId for an unknown client and stores nothing', async () => {
    const { run, repo, clients } = call('POST', '/api/orders', { ...newOrder, clientId: 99, client: 'Lucía M.' });
    const { status, body } = await read(await run());
    expect(status).toBe(422);
    expect(body).toEqual({ error: 'Revisá los datos del pedido.', fields: { clientId: 'Ese cliente no existe.' } });
    expect(await repo.list()).toEqual([base]);
    expect(await clients.list()).toEqual([cafe]);
  });

  it('returns field errors and stores nothing when data is missing', async () => {
    const { run, repo, clients } = call('POST', '/api/orders', { item: '', client: 'Cliente nuevo' });
    const { status, body } = await read(await run());
    expect(status).toBe(422);
    expect(body.error).toBe('Revisá los datos del pedido.');
    expect(Object.keys(body.fields as object)).toContain('item');
    expect(await repo.list()).toHaveLength(1);
    expect(await clients.list()).toEqual([cafe]);
  });
});

describe('PUT /api/orders/:id/stage', () => {
  it('moves an order to the given stage and persists it', async () => {
    const { run, repo } = call('PUT', '/api/orders/0142/stage', { stage: 'listo' });
    const { status, body } = await read(await run());
    expect(status).toBe(200);
    expect((body.order as Order).stage).toBe('listo');
    expect((await repo.get('0142'))?.stage).toBe('listo');
  });

  it('rejects an unknown stage without changing the order', async () => {
    const { run, repo } = call('PUT', '/api/orders/0142/stage', { stage: 'volando' });
    const { status, body } = await read(await run());
    expect(status).toBe(422);
    expect(body.error).toBe('Esa etapa no existe.');
    expect((await repo.get('0142'))?.stage).toBe('imprimiendo');
  });

  it('moves an order numbered past 9999', async () => {
    const tables = memoryTables([cafe], [{ ...base, id: '10000' }]);
    const repo = memoryOrderRepository(tables);
    const url = new URL('https://app.test/api/orders/10000/stage');
    const request = new Request(url, { method: 'PUT', body: JSON.stringify({ stage: 'listo' }) });
    const { status, body } = await read(await handleOrders(request, url, repo, memoryClientRepository(tables)));
    expect(status).toBe(200);
    expect((body.order as Order).stage).toBe('listo');
    expect((await repo.get('10000'))?.stage).toBe('listo');
  });

  it('answers 404 for an order that does not exist', async () => {
    const { run } = call('PUT', '/api/orders/0999/stage', { stage: 'listo' });
    const { status, body } = await read(await run());
    expect(status).toBe(404);
    expect(body.error).toBe('No existe el pedido #0999.');
  });
});

it('leaves non-order paths to the caller', async () => {
  const { run } = call('GET', '/api/otra-cosa');
  expect(await run()).toBeNull();
});
