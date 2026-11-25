import { describe, expect, it } from 'vitest';
import type { Spool } from '../../shared/spools';
import { memorySpoolRepository, type SpoolRepository } from './repository';
import { handleSpools } from './routes';

const base: Spool = {
  id: 1, material: 'PLA', colorName: 'Blanco', colorHex: '#ffffff', brand: 'Grilon3', netGrams: 1000, remainingGrams: 820,
  price: 21000, lowStockGrams: 150, note: '', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};

function call(method: string, path: string, body?: unknown) {
  const repo = memorySpoolRepository([base]);
  const url = new URL(`https://app.test${path}`);
  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  const request = new Request(url, { method, body: payload, headers: { 'Content-Type': 'application/json' } });
  return { repo, run: () => handleSpools(request, url, repo) };
}

async function read(res: Response | null) {
  if (!res) throw new Error('route not handled');
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('GET /api/spools', () => {
  it('lists spools', async () => {
    const { run } = call('GET', '/api/spools');
    const { status, body } = await read(await run());
    expect(status).toBe(200);
    expect(body).toEqual({ spools: [base] });
  });
});

describe('POST /api/spools', () => {
  it('creates a full spool with the default threshold and stores it', async () => {
    const { run, repo } = call('POST', '/api/spools', { material: 'PETG', colorName: 'Negro', colorHex: '#000000', netGrams: 1000, price: 24000 });
    const { status, body } = await read(await run());
    expect(status).toBe(201);
    expect(body.spool).toMatchObject({ id: 2, material: 'PETG', remainingGrams: 1000, lowStockGrams: 150 });
    expect(await repo.get(2)).toMatchObject({ colorName: 'Negro' });
  });

  it('returns field errors and stores nothing when data is invalid', async () => {
    const { run, repo } = call('POST', '/api/spools', { material: 'PLA', colorName: 'Rojo', colorHex: '#ff0000', netGrams: 1000, remainingGrams: 1200, price: 20000 });
    const { status, body } = await read(await run());
    expect(status).toBe(422);
    expect(body).toEqual({ error: 'Revisá los datos de la bobina.', fields: { remainingGrams: 'No puede superar el peso neto de la bobina.' } });
    expect(await repo.list()).toEqual([base]);
  });

  it('rejects a body that is not JSON', async () => {
    const { run, repo } = call('POST', '/api/spools', '{');
    const { status, body } = await read(await run());
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'El cuerpo tiene que ser JSON.' });
    expect(await repo.list()).toEqual([base]);
  });

  it('rejects other methods', async () => {
    const { run } = call('PATCH', '/api/spools');
    const { status, body } = await read(await run());
    expect(status).toBe(405);
    expect(body).toEqual({ error: 'Método no permitido.' });
  });
});

describe('PUT /api/spools/:id', () => {
  it('changes the fields sent, keeps the rest and stores it', async () => {
    const { run, repo } = call('PUT', '/api/spools/1', { remainingGrams: 120, note: 'Pedir otra' });
    const { status, body } = await read(await run());
    expect(status).toBe(200);
    expect(body.spool).toMatchObject({ ...base, remainingGrams: 120, note: 'Pedir otra', updatedAt: expect.any(String) });
    expect(await repo.get(1)).toMatchObject({ remainingGrams: 120, note: 'Pedir otra', netGrams: 1000, price: 21000 });
  });

  it('writes only the fields sent, so grams a print job took after the read are kept', async () => {
    const repo = memorySpoolRepository([base]);
    const written: unknown[] = [];
    const racing: SpoolRepository = {
      ...repo,
      // A job takes 60 g right after the route reads the spool.
      get: async (id) => { const s = await repo.get(id); await repo.update(id, { remainingGrams: 760 }); return s; },
      update: async (id, changes) => { written.push(changes); return repo.update(id, changes); },
    };
    const url = new URL('https://app.test/api/spools/1');
    const res = await handleSpools(new Request(url, { method: 'PUT', body: JSON.stringify({ colorHex: '#FAFAFA', lowStockGrams: 200 }) }), url, racing);
    const { status, body } = await read(res);
    expect(status).toBe(200);
    expect(written).toEqual([{ colorHex: '#fafafa', lowStockGrams: 200 }]);
    expect(body.spool).toMatchObject({ colorHex: '#fafafa', lowStockGrams: 200, remainingGrams: 760 });
    expect(await repo.get(1)).toMatchObject({ ...base, colorHex: '#fafafa', lowStockGrams: 200, remainingGrams: 760, updatedAt: expect.any(String) });
  });

  it('still fills a spool to its net weight when remaining grams are sent empty', async () => {
    const { run, repo } = call('PUT', '/api/spools/1', { remainingGrams: '' });
    const { status } = await read(await run());
    expect(status).toBe(200);
    expect((await repo.get(1))?.remainingGrams).toBe(1000);
  });

  it('rejects remaining grams below 0 without changing the spool', async () => {
    const { run, repo } = call('PUT', '/api/spools/1', { remainingGrams: -5 });
    const { status, body } = await read(await run());
    expect(status).toBe(422);
    expect(body).toEqual({ error: 'Revisá los datos de la bobina.', fields: { remainingGrams: 'No puede ser menor que 0 g.' } });
    expect(await repo.get(1)).toEqual(base);
  });

  it('rejects a net weight below the remaining grams without changing the spool', async () => {
    const { run, repo } = call('PUT', '/api/spools/1', { netGrams: 500 });
    const { status, body } = await read(await run());
    expect(status).toBe(422);
    expect(body).toEqual({ error: 'Revisá los datos de la bobina.', fields: { remainingGrams: 'No puede superar el peso neto de la bobina.' } });
    expect(await repo.get(1)).toEqual(base);
  });

  it('rejects a body that is not a JSON object without changing the spool', async () => {
    const { run, repo } = call('PUT', '/api/spools/1', '"hola"');
    const { status, body } = await read(await run());
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'El cuerpo tiene que ser JSON.' });
    expect(await repo.get(1)).toEqual(base);
  });

  it('answers 404 for a spool that does not exist', async () => {
    const { run } = call('PUT', '/api/spools/42', { note: 'x' });
    const { status, body } = await read(await run());
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'No existe la bobina 42.' });
  });

  it('rejects other methods', async () => {
    const { run } = call('GET', '/api/spools/1');
    const { status, body } = await read(await run());
    expect(status).toBe(405);
    expect(body).toEqual({ error: 'Método no permitido.' });
  });
});

it('leaves non-spool paths to the caller', async () => {
  expect(await call('GET', '/api/printers').run()).toBeNull();
  expect(await call('GET', '/api/spools/x1').run()).toBeNull();
});
