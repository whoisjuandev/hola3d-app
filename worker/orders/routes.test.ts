import { describe, expect, it } from 'vitest';
import type { Order } from '../../shared/orders';
import { memoryOrderRepository } from './repository';
import { handleOrders } from './routes';

const base: Order = {
  id: '0142', item: 'Llaveros con logo × 12', client: 'Café Nube', channel: 'Instagram', stage: 'imprimiendo',
  dueDate: '2026-11-23', dueTime: null, price: 36000, deposit: 18000, paid: false, material: 'PLA', note: '',
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};

function call(method: string, path: string, body?: unknown) {
  const repo = memoryOrderRepository([base]);
  const url = new URL(`https://app.test${path}`);
  const request = new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  return { repo, run: () => handleOrders(request, url, repo) };
}

async function read(res: Response | null) {
  if (!res) throw new Error('route not handled');
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('GET /api/orders', () => {
  it('lists orders', async () => {
    const { run } = call('GET', '/api/orders');
    const { status, body } = await read(await run());
    expect(status).toBe(200);
    expect((body.orders as Order[]).map((o) => o.id)).toEqual(['0142']);
  });
});

describe('POST /api/orders', () => {
  it('creates the next numbered order in stage nuevo', async () => {
    const { run, repo } = call('POST', '/api/orders', { item: 'Maceta', client: 'Lucía M.', channel: 'Tienda web', price: 12000 });
    const { status, body } = await read(await run());
    expect(status).toBe(201);
    expect(body.order).toMatchObject({ id: '0143', stage: 'nuevo', client: 'Lucía M.', price: 12000, deposit: null });
    expect(await repo.get('0143')).not.toBeNull();
  });

  it('returns field errors and stores nothing when data is missing', async () => {
    const { run, repo } = call('POST', '/api/orders', { item: '' });
    const { status, body } = await read(await run());
    expect(status).toBe(422);
    expect(body.error).toBe('Revisá los datos del pedido.');
    expect(Object.keys(body.fields as object)).toContain('item');
    expect(await repo.list()).toHaveLength(1);
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
    const repo = memoryOrderRepository([{ ...base, id: '10000' }]);
    const url = new URL('https://app.test/api/orders/10000/stage');
    const request = new Request(url, { method: 'PUT', body: JSON.stringify({ stage: 'listo' }) });
    const { status, body } = await read(await handleOrders(request, url, repo));
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
