import { describe, expect, it } from 'vitest';
import type { Printer } from '../../shared/printers';
import { memoryPrinterRepository, type PrinterRepository } from './repository';
import { handlePrinters } from './routes';

const base: Printer = {
  id: 1, name: 'La A1', model: 'Bambu Lab A1', purchasePrice: 650000, lifetimeHours: 5000, powerWatts: 95,
  printMinutes: 7200, status: 'activa', note: '', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};

function call(method: string, path: string, body?: unknown) {
  const repo = memoryPrinterRepository([base]);
  const url = new URL(`https://app.test${path}`);
  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  const request = new Request(url, { method, body: payload, headers: { 'Content-Type': 'application/json' } });
  return { repo, run: () => handlePrinters(request, url, repo) };
}

async function read(res: Response | null) {
  if (!res) throw new Error('route not handled');
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('GET /api/printers', () => {
  it('lists printers', async () => {
    const { run } = call('GET', '/api/printers');
    const { status, body } = await read(await run());
    expect(status).toBe(200);
    expect(body).toEqual({ printers: [base] });
  });
});

describe('POST /api/printers', () => {
  it('creates a printer with the next id and stores it', async () => {
    const { run, repo } = call('POST', '/api/printers', { name: 'La Ender', purchasePrice: 380000, lifetimeHours: 4000, powerWatts: 110 });
    const { status, body } = await read(await run());
    expect(status).toBe(201);
    expect(body.printer).toMatchObject({ id: 2, name: 'La Ender', model: '', printMinutes: 0, status: 'activa' });
    expect(await repo.get(2)).toMatchObject({ name: 'La Ender' });
  });

  it('returns field errors and stores nothing when data is invalid', async () => {
    const { run, repo } = call('POST', '/api/printers', { name: '', lifetimeHours: 0 });
    const { status, body } = await read(await run());
    expect(status).toBe(422);
    expect(body.error).toBe('Revisá los datos de la impresora.');
    expect(Object.keys(body.fields as object).sort()).toEqual(['lifetimeHours', 'name', 'powerWatts', 'purchasePrice']);
    expect(await repo.list()).toEqual([base]);
  });

  it('rejects a body that is not JSON', async () => {
    const { run, repo } = call('POST', '/api/printers', 'no es json');
    const { status, body } = await read(await run());
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'El cuerpo tiene que ser JSON.' });
    expect(await repo.list()).toEqual([base]);
  });

  it('rejects other methods', async () => {
    const { run } = call('DELETE', '/api/printers');
    const { status, body } = await read(await run());
    expect(status).toBe(405);
    expect(body).toEqual({ error: 'Método no permitido.' });
  });
});

describe('PUT /api/printers/:id', () => {
  it('changes the fields sent, keeps the rest and stores it', async () => {
    const { run, repo } = call('PUT', '/api/printers/1', { status: 'en_servicio', note: 'Boquilla tapada' });
    const { status, body } = await read(await run());
    expect(status).toBe(200);
    expect(body.printer).toMatchObject({ ...base, status: 'en_servicio', note: 'Boquilla tapada', updatedAt: expect.any(String) });
    expect(await repo.get(1)).toMatchObject({ status: 'en_servicio', note: 'Boquilla tapada', printMinutes: 7200, purchasePrice: 650000 });
  });

  it('writes only the fields sent, so minutes a print job added after the read are kept', async () => {
    const repo = memoryPrinterRepository([base]);
    const written: unknown[] = [];
    const racing: PrinterRepository = {
      ...repo,
      // A job logs 90 minutes right after the route reads the printer.
      get: async (id) => { const p = await repo.get(id); await repo.update(id, { printMinutes: 7290 }); return p; },
      update: async (id, changes) => { written.push(changes); return repo.update(id, changes); },
    };
    const url = new URL('https://app.test/api/printers/1');
    const res = await handlePrinters(new Request(url, { method: 'PUT', body: JSON.stringify({ note: ' Boquilla nueva ', id: 5 }) }), url, racing);
    const { status, body } = await read(res);
    expect(status).toBe(200);
    expect(written).toEqual([{ note: 'Boquilla nueva' }]);
    expect(body.printer).toMatchObject({ note: 'Boquilla nueva', printMinutes: 7290 });
    expect(await repo.get(1)).toMatchObject({ ...base, note: 'Boquilla nueva', printMinutes: 7290, updatedAt: expect.any(String) });
  });

  it('can set the accumulated print minutes', async () => {
    const { run, repo } = call('PUT', '/api/printers/1', { printMinutes: 7290 });
    const { status } = await read(await run());
    expect(status).toBe(200);
    expect((await repo.get(1))?.printMinutes).toBe(7290);
  });

  it('rejects invalid data without changing the printer', async () => {
    const { run, repo } = call('PUT', '/api/printers/1', { name: 'Nueva', lifetimeHours: 0 });
    const { status, body } = await read(await run());
    expect(status).toBe(422);
    expect(body).toEqual({ error: 'Revisá los datos de la impresora.', fields: { lifetimeHours: 'Poné las horas de vida útil: un número entero mayor que 0.' } });
    expect(await repo.get(1)).toEqual(base);
  });

  it('rejects a body that is not a JSON object without changing the printer', async () => {
    const { run, repo } = call('PUT', '/api/printers/1', '[1]');
    const { status, body } = await read(await run());
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'El cuerpo tiene que ser JSON.' });
    expect(await repo.get(1)).toEqual(base);
  });

  it('answers 404 for a printer that does not exist', async () => {
    const { run } = call('PUT', '/api/printers/99', { name: 'Otra' });
    const { status, body } = await read(await run());
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'No existe la impresora 99.' });
  });

  it('rejects other methods', async () => {
    const { run } = call('DELETE', '/api/printers/1');
    const { status, body } = await read(await run());
    expect(status).toBe(405);
    expect(body).toEqual({ error: 'Método no permitido.' });
  });
});

it('leaves non-printer paths to the caller', async () => {
  expect(await call('GET', '/api/orders').run()).toBeNull();
  expect(await call('GET', '/api/printers/abc').run()).toBeNull();
});
