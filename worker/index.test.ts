import { describe, expect, it } from 'vitest';
import worker from './index';

/** A D1 stand-in whose tables are all empty. Enough to see which module answered. */
const emptyDb = {
  prepare() {
    const statement = {
      bind: () => statement,
      all: async () => ({ results: [] }),
      first: async () => null,
    };
    return statement;
  },
} as unknown as D1Database;

async function get(path: string) {
  const request = new Request(`https://app.test${path}`) as Request<unknown, IncomingRequestCfProperties>;
  const res = await worker.fetch(request, { DB: emptyDb } as Env);
  return { status: res.status, body: (await res.json()) as unknown };
}

describe('API dispatch', () => {
  it('sends each path to its module', async () => {
    expect(await get('/api/orders')).toEqual({ status: 200, body: { orders: [] } });
    expect(await get('/api/printers')).toEqual({ status: 200, body: { printers: [] } });
    expect(await get('/api/spools')).toEqual({ status: 200, body: { spools: [] } });
  });

  it('answers 404 when no module owns the path', async () => {
    expect(await get('/api/nada')).toEqual({ status: 404, body: { error: 'Esa ruta no existe.' } });
  });
});
