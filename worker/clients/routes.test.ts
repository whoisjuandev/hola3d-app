import { describe, expect, it } from 'vitest';
import type { Client } from '../../shared/clients';
import type { Order } from '../../shared/orders';
import { memoryTables } from '../memory';
import { memoryOrderRepository } from '../orders/repository';
import { memoryClientRepository } from './repository';
import { handleClients } from './routes';

const stamp = '2026-11-01T00:00:00.000Z';
const cafe: Client = { id: 1, name: 'Café Nube', phone: '11 5555-0142', instagram: 'cafe.nube', email: '', note: '', createdAt: stamp, updatedAt: stamp };
const lucia: Client = { id: 2, name: 'Lucía M.', phone: '', instagram: '', email: '', note: '', createdAt: stamp, updatedAt: stamp };

const printing: Order = {
  id: '0142', item: 'Llaveros con logo × 12', client: 'Café Nube', clientId: 1, quoteId: null, channel: 'Instagram', stage: 'imprimiendo',
  dueDate: '2026-11-23', dueTime: null, price: 36000, deposit: 18000, paid: false, material: 'PLA', note: '', createdAt: stamp, updatedAt: stamp,
};
const delivered: Order = { ...printing, id: '0130', item: 'Cartel con logo', stage: 'entregado', price: 20000, deposit: null, paid: true };

function call(method: string, path: string, body?: unknown) {
  const tables = memoryTables([cafe, lucia], [printing, delivered]);
  const repo = memoryClientRepository(tables);
  const orders = memoryOrderRepository(tables);
  const url = new URL(`https://app.test${path}`);
  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  const request = new Request(url, { method, body: payload, headers: { 'Content-Type': 'application/json' } });
  return { repo, orders, run: () => handleClients(request, url, repo, orders) };
}

async function read(res: Response | null) {
  if (!res) throw new Error('route not handled');
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const cafeSummary = { ...cafe, orderCount: 2, totalSpent: 20000, balanceOwed: 18000 };
const luciaSummary = { ...lucia, orderCount: 0, totalSpent: 0, balanceOwed: 0 };

describe('GET /api/clients', () => {
  it('lists clients with order count, total spent and balance owed', async () => {
    const { run } = call('GET', '/api/clients');
    const { status, body } = await read(await run());
    expect(status).toBe(200);
    expect(body).toEqual({ clients: [cafeSummary, luciaSummary] });
  });
});

describe('POST /api/clients', () => {
  it('creates a client with the next id and stores it', async () => {
    const { run, repo } = call('POST', '/api/clients', { name: 'Tomás G.', phone: '+54 9 11 4444-0140', instagram: '@tomas.g' });
    const { status, body } = await read(await run());
    expect(status).toBe(201);
    expect(body.client).toEqual({
      id: 3, name: 'Tomás G.', phone: '+54 9 11 4444-0140', instagram: 'tomas.g', email: '', note: '',
      createdAt: expect.any(String), updatedAt: expect.any(String), orderCount: 0, totalSpent: 0, balanceOwed: 0,
    });
    expect(await repo.get(3)).toMatchObject({ name: 'Tomás G.', instagram: 'tomas.g' });
  });

  it('returns field errors and stores nothing when data is invalid', async () => {
    const { run, repo } = call('POST', '/api/clients', { name: '', email: 'no' });
    const { status, body } = await read(await run());
    expect(status).toBe(422);
    expect(body).toEqual({ error: 'Revisá los datos del cliente.', fields: { name: 'Completá este dato.', email: 'Revisá el email.' } });
    expect(await repo.list()).toEqual([cafe, lucia]);
  });

  it('rejects a body that is not JSON', async () => {
    const { run, repo } = call('POST', '/api/clients', 'no es json');
    const { status, body } = await read(await run());
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'El cuerpo tiene que ser JSON.' });
    expect(await repo.list()).toEqual([cafe, lucia]);
  });

  it('rejects other methods', async () => {
    const { run } = call('DELETE', '/api/clients');
    const { status, body } = await read(await run());
    expect(status).toBe(405);
    expect(body).toEqual({ error: 'Método no permitido.' });
  });
});

describe('GET /api/clients/:id', () => {
  it('returns the client with its totals and its orders', async () => {
    const { run } = call('GET', '/api/clients/1');
    const { status, body } = await read(await run());
    expect(status).toBe(200);
    expect(body.client).toEqual(cafeSummary);
    expect((body.orders as Order[]).map((o) => o.id).sort()).toEqual(['0130', '0142']);
  });

  it('returns a client without orders', async () => {
    const { run } = call('GET', '/api/clients/2');
    const { status, body } = await read(await run());
    expect(status).toBe(200);
    expect(body).toEqual({ client: luciaSummary, orders: [] });
  });

  it('answers 404 for a client that does not exist', async () => {
    const { run } = call('GET', '/api/clients/99');
    const { status, body } = await read(await run());
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'No existe el cliente 99.' });
  });
});

describe('PUT /api/clients/:id', () => {
  it('changes the fields sent, keeps the rest and stores it', async () => {
    const { run, repo } = call('PUT', '/api/clients/1', { email: 'hola@cafenube.com.ar', note: 'Paga por transferencia.' });
    const { status, body } = await read(await run());
    expect(status).toBe(200);
    expect(body.client).toEqual({ ...cafeSummary, email: 'hola@cafenube.com.ar', note: 'Paga por transferencia.', updatedAt: expect.any(String) });
    expect(await repo.get(1)).toMatchObject({ name: 'Café Nube', phone: '11 5555-0142', email: 'hola@cafenube.com.ar', note: 'Paga por transferencia.' });
  });

  it('renames the client on its orders too', async () => {
    const { run, orders } = call('PUT', '/api/clients/1', { name: 'Café Nube Palermo' });
    expect((await read(await run())).status).toBe(200);
    expect((await orders.get('0142'))?.client).toBe('Café Nube Palermo');
  });

  it('rejects invalid data without changing the client', async () => {
    const { run, repo } = call('PUT', '/api/clients/1', { name: 'Otro', phone: 'sin teléfono' });
    const { status, body } = await read(await run());
    expect(status).toBe(422);
    expect(body).toEqual({ error: 'Revisá los datos del cliente.', fields: { phone: 'Poné el teléfono con números (podés usar +, espacios y guiones).' } });
    expect(await repo.get(1)).toEqual(cafe);
  });

  it('rejects a body that is not a JSON object without changing the client', async () => {
    const { run, repo } = call('PUT', '/api/clients/1', '[1]');
    const { status, body } = await read(await run());
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'El cuerpo tiene que ser JSON.' });
    expect(await repo.get(1)).toEqual(cafe);
  });

  it('answers 404 for a client that does not exist', async () => {
    const { run, repo } = call('PUT', '/api/clients/99', { name: 'Otra' });
    const { status, body } = await read(await run());
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'No existe el cliente 99.' });
    expect(await repo.list()).toEqual([cafe, lucia]);
  });

  it('rejects other methods', async () => {
    const { run } = call('DELETE', '/api/clients/1');
    const { status, body } = await read(await run());
    expect(status).toBe(405);
    expect(body).toEqual({ error: 'Método no permitido.' });
  });
});

it('leaves non-client paths to the caller', async () => {
  expect(await call('GET', '/api/orders').run()).toBeNull();
  expect(await call('GET', '/api/clients/abc').run()).toBeNull();
});
