import { describe, expect, it } from 'vitest';
import { calculateCost, type CalcInput, type CalcLineInput } from '../../shared/calculator';
import type { Client } from '../../shared/clients';
import type { CostSettings } from '../../shared/cost-settings';
import type { Order } from '../../shared/orders';
import type { Printer } from '../../shared/printers';
import type { Quote } from '../../shared/quotes';
import type { Spool } from '../../shared/spools';
import { memoryClientRepository } from '../clients/repository';
import { memoryTables } from '../memory';
import { memoryOrderRepository } from '../orders/repository';
import { memoryPrinterRepository } from '../printers/repository';
import { memoryCostSettingsRepository } from '../settings/repository';
import { memorySpoolRepository } from '../spools/repository';
import { memoryQuoteRepository } from './repository';
import { handleQuotes } from './routes';

const stamp = '2026-11-01T00:00:00.000Z';
const cafe: Client = { id: 1, name: 'Café Nube', phone: '+54 9 11 5555-0142', instagram: '', email: '', note: '', createdAt: stamp, updatedAt: stamp };
const lucia: Client = { id: 2, name: 'Lucía M.', phone: '', instagram: '', email: '', note: '', createdAt: stamp, updatedAt: stamp };

const existingOrder: Order = {
  id: '0142', item: 'Maceta', client: 'Café Nube', clientId: 1, quoteId: null, channel: 'Instagram', stage: 'imprimiendo',
  dueDate: null, dueTime: null, price: 12000, deposit: null, paid: false, material: '', note: '', createdAt: stamp, updatedAt: stamp,
  realCost: null, realProfit: null,
};

const a1: Printer = {
  id: 1, name: 'La A1', model: '', purchasePrice: 720000, lifetimeHours: 5000, powerWatts: 100, printMinutes: 0, status: 'activa',
  note: '', createdAt: stamp, updatedAt: stamp,
};
const white: Spool = {
  id: 1, material: 'PLA', colorName: 'Blanco', colorHex: '#ffffff', brand: 'Grilon3', netGrams: 1000, remainingGrams: 640, price: 21000,
  lowStockGrams: 150, note: '', createdAt: stamp, updatedAt: stamp,
};
const settings: CostSettings = {
  kwhPrice: 200, labourPerHour: 6000, failurePercent: 10, marginPercent: 50, monthlyFixedCosts: 120000, monthlyPrintHours: 200,
  packagingCost: 800, roundingStep: 100, commissionPercent: 0, updatedAt: stamp,
};

const keychains: CalcLineInput = {
  name: 'Llavero con logo', quantity: 12, printerId: 1, printMinutesPerUnit: 30,
  filaments: [{ spoolId: 1, material: '', pricePerKg: 0, gramsPerUnit: 8 }], prepMinutes: 20, postMinutes: 40, packaging: 1200,
};
const sign: CalcLineInput = {
  name: 'Cartel', quantity: 1, printerId: null, printMinutesPerUnit: 0,
  filaments: [{ spoolId: null, material: 'PETG negro', pricePerKg: 30000, gramsPerUnit: 100 }], prepMinutes: 0, postMinutes: 0, packaging: 0,
};
const input: CalcInput = { lines: [keychains, sign] };
const { updatedAt: _updatedAt, ...costs } = settings;
const priced = calculateCost(input, [a1], [white], costs);

function stored(overrides: Partial<Quote>): Quote {
  return {
    id: 1, number: 'P-0001', clientId: 1, client: 'Café Nube', title: 'Llaveros y cartel', status: 'enviado', validUntil: '2026-12-10',
    input, result: priced, total: priced.total, note: '', createdAt: stamp, updatedAt: stamp, ...overrides,
  };
}
const sent = stored({});
const rejected = stored({ id: 2, number: 'P-0002', clientId: 2, client: 'Lucía M.', title: 'Macetas', status: 'rechazado' });

function setup() {
  const tables = memoryTables([cafe, lucia], [existingOrder], [sent, rejected]);
  const deps = {
    quotes: memoryQuoteRepository(tables),
    orders: memoryOrderRepository(tables),
    clients: memoryClientRepository(tables),
    printers: memoryPrinterRepository([a1]),
    spools: memorySpoolRepository([white]),
    settings: memoryCostSettingsRepository(settings),
  };
  const call = async (method: string, path: string, body?: unknown) => {
    const url = new URL(`https://app.test${path}`);
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const res = await handleQuotes(new Request(url, { method, body: payload, headers: { 'Content-Type': 'application/json' } }), url, deps);
    if (!res) throw new Error('route not handled');
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  return { ...deps, call, url: (path: string) => new URL(`https://app.test${path}`) };
}

const newQuote = { clientId: 2, title: 'Llaveros para Lucía', validUntil: '2026-12-10', note: 'Seña del 50 %.', input };

describe('GET /api/quotes', () => {
  it('lists quotes, newest number first, with the client name', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/quotes')).toEqual({ status: 200, body: { quotes: [rejected, sent] } });
  });

  it('lists only the quotes of one client', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/quotes?clientId=1')).toEqual({ status: 200, body: { quotes: [sent] } });
  });

  it('reads the client name through the client', async () => {
    const { call, clients } = setup();
    await clients.update(1, { ...cafe, name: 'Café Nube Palermo' });
    const { body } = await call('GET', '/api/quotes?clientId=1');
    expect((body.quotes as Quote[])[0].client).toBe('Café Nube Palermo');
  });

  it('rejects a client filter that is not an id', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/quotes?clientId=cafe')).toEqual({
      status: 422, body: { error: 'Revisá el filtro.', fields: { clientId: 'Elegí un cliente de la lista.' } },
    });
  });
});

describe('GET /api/quotes/:id', () => {
  it('returns the quote, its client and the orders made from it', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/quotes/1')).toEqual({ status: 200, body: { quote: sent, client: cafe, orders: [] } });
  });

  it('answers 404 for a quote that does not exist', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/quotes/99')).toEqual({ status: 404, body: { error: 'No existe el presupuesto 99.' } });
  });
});

describe('POST /api/quotes', () => {
  it('prices the input on the server with the stored printers, spools and settings, and saves it as borrador', async () => {
    const { call, quotes } = setup();
    const { status, body } = await call('POST', '/api/quotes', newQuote);
    expect(status).toBe(201);
    expect(body.quote).toEqual({
      id: 3, number: 'P-0003', clientId: 2, client: 'Lucía M.', title: 'Llaveros para Lucía', status: 'borrador', validUntil: '2026-12-10',
      input, result: priced, total: 26200, note: 'Seña del 50 %.', createdAt: expect.any(String), updatedAt: expect.any(String),
    });
    expect(await quotes.get(3)).toEqual(body.quote);
  });

  it('never trusts a total or result sent by the browser', async () => {
    const { call, quotes } = setup();
    const { status } = await call('POST', '/api/quotes', { ...newQuote, total: 1, result: { ...priced, total: 1 } });
    expect(status).toBe(201);
    expect(await quotes.get(3)).toMatchObject({ total: 26200, result: priced });
  });

  it('takes a client name like the order form: a matching client, or a new one', async () => {
    const { call, clients } = setup();
    const { clientId: _id, ...byName } = newQuote;
    expect((await call('POST', '/api/quotes', { ...byName, client: ' cafe NUBE ' })).body.quote).toMatchObject({ clientId: 1, client: 'Café Nube' });
    expect((await call('POST', '/api/quotes', { ...byName, client: 'Bruno A.' })).body.quote).toMatchObject({ clientId: 3, client: 'Bruno A.' });
    expect((await clients.list()).map((c) => c.name)).toEqual(['Café Nube', 'Lucía M.', 'Bruno A.']);
  });

  it('returns field errors and stores nothing when data is invalid', async () => {
    const { call, quotes, clients } = setup();
    const { clientId: _id, ...byName } = newQuote;
    const res = await call('POST', '/api/quotes', { ...byName, client: 'Cliente nuevo', title: '', validUntil: 'mañana', input: { lines: [{ ...sign, name: '' }] } });
    expect(res).toEqual({
      status: 422,
      body: {
        error: 'Revisá los datos del presupuesto.',
        fields: { title: 'Completá este dato.', validUntil: 'La fecha tiene que ser AAAA-MM-DD.', input: 'Pieza 1: ponele un nombre.' },
      },
    });
    expect(await quotes.list()).toEqual([rejected, sent]);
    expect(await clients.list()).toEqual([cafe, lucia]);
  });

  it('answers 422 on clientId for an unknown client and stores nothing', async () => {
    const { call, quotes, clients } = setup();
    expect(await call('POST', '/api/quotes', { ...newQuote, clientId: 99 })).toEqual({
      status: 422, body: { error: 'Revisá los datos del presupuesto.', fields: { clientId: 'Ese cliente no existe.' } },
    });
    expect(await quotes.list()).toEqual([rejected, sent]);
    expect(await clients.list()).toEqual([cafe, lucia]);
  });

  it('answers 422 for a printer or spool that is not stored, before creating a new client', async () => {
    const { call, quotes, clients } = setup();
    const { clientId: _id, ...byName } = newQuote;
    expect(await call('POST', '/api/quotes', { ...byName, client: 'Bruno A.', input: { lines: [sign, { ...keychains, printerId: 7 }] } })).toEqual({
      status: 422, body: { error: 'Revisá los datos del presupuesto.', fields: { input: 'Pieza 2: esa impresora ya no existe.' } },
    });
    expect(await quotes.list()).toEqual([rejected, sent]);
    expect(await clients.list()).toEqual([cafe, lucia]);
  });

  it('rejects a body that is not JSON, storing nothing', async () => {
    const { call, quotes } = setup();
    expect(await call('POST', '/api/quotes', 'no es json')).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    expect(await quotes.list()).toEqual([rejected, sent]);
  });
});

describe('a saved quote is frozen', () => {
  it('reads the same lines, breakdown and total after settings, spools and printers change', async () => {
    const { call, settings: settingsRepo, spools, printers } = setup();
    const saved = (await call('POST', '/api/quotes', newQuote)).body.quote as Quote;

    await settingsRepo.save({ ...settings, marginPercent: 200, kwhPrice: 900, roundingStep: 1000 });
    await spools.update(1, { ...white, price: 60000 });
    await printers.update(1, { ...a1, name: 'La A1 nueva', purchasePrice: 2000000 });
    const now = calculateCost(input, await printers.list(), await spools.list(), (await settingsRepo.get())!);
    expect(now.total).not.toBe(26200);

    const { status, body } = await call('GET', '/api/quotes/3');
    expect(status).toBe(200);
    expect(body.quote).toEqual(saved);
    expect((body.quote as Quote).result.breakdown).toEqual(priced.breakdown);
    expect((body.quote as Quote).total).toBe(26200);
    expect((body.quote as Quote).result.lines[0].printerName).toBe('La A1');
  });
});

describe('PUT /api/quotes/:id', () => {
  it('changes the title, validity and note sent, keeps the rest and stores it', async () => {
    const { call, quotes } = setup();
    const { status, body } = await call('PUT', '/api/quotes/1', { title: 'Llaveros', validUntil: '2026-12-20', note: 'Retira en el local.' });
    expect(status).toBe(200);
    expect(body.quote).toEqual({ ...sent, title: 'Llaveros', validUntil: '2026-12-20', note: 'Retira en el local.', updatedAt: expect.any(String) });
    expect(await quotes.get(1)).toEqual(body.quote);
  });

  it('ignores lines, result and total: what was priced stays frozen', async () => {
    const { call, quotes } = setup();
    const { status } = await call('PUT', '/api/quotes/1', { total: 1, result: { total: 1 }, input: { lines: [] }, clientId: 2 });
    expect(status).toBe(200);
    expect(await quotes.get(1)).toMatchObject({ total: 26200, result: priced, input, clientId: 1 });
  });

  it('moves the status between borrador, enviado and rechazado', async () => {
    const { call, quotes } = setup();
    for (const status of ['rechazado', 'borrador', 'enviado'] as const) {
      expect((await call('PUT', '/api/quotes/1', { status })).body.quote).toMatchObject({ status });
      expect((await quotes.get(1))?.status).toBe(status);
    }
    expect((await call('PUT', '/api/quotes/2', { status: 'enviado' })).body.quote).toMatchObject({ status: 'enviado' });
  });

  it('returns field errors and changes nothing when data is invalid', async () => {
    const { call, quotes } = setup();
    expect(await call('PUT', '/api/quotes/1', { title: ' ', validUntil: '2026-13-01', status: 'perdido' })).toEqual({
      status: 422,
      body: {
        error: 'Revisá los datos del presupuesto.',
        fields: { title: 'Completá este dato.', validUntil: 'La fecha tiene que ser AAAA-MM-DD.', status: 'Ese estado no existe.' },
      },
    });
    expect(await quotes.get(1)).toEqual(sent);
  });

  it('does not accept by a status change, changing nothing', async () => {
    const { call, quotes, orders } = setup();
    expect(await call('PUT', '/api/quotes/1', { status: 'aceptado', title: 'Otro' })).toEqual({
      status: 422,
      body: { error: 'Revisá los datos del presupuesto.', fields: { status: 'Para aceptarlo usá «Aceptar»: así se crean los pedidos.' } },
    });
    expect(await quotes.get(1)).toEqual(sent);
    expect(await orders.list()).toEqual([existingOrder]);
  });

  it('answers 409 when an accepted quote would change status, changing nothing', async () => {
    const { call, quotes } = setup();
    await call('POST', '/api/quotes/1/accept', {});
    const accepted = await quotes.get(1);
    expect(await call('PUT', '/api/quotes/1', { status: 'borrador' })).toEqual({
      status: 409, body: { error: 'El presupuesto P-0001 ya fue aceptado: no cambia de estado.' },
    });
    expect(await quotes.get(1)).toEqual(accepted);
    expect((await call('PUT', '/api/quotes/1', { note: 'Pagó la seña.' })).body.quote).toMatchObject({ status: 'aceptado', note: 'Pagó la seña.' });
  });

  it('rejects a body that is not a JSON object, changing nothing', async () => {
    const { call, quotes } = setup();
    for (const payload of ['no es json', '[1]']) {
      expect(await call('PUT', '/api/quotes/1', payload)).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    }
    expect(await quotes.get(1)).toEqual(sent);
  });

  it('answers 404 for a quote that does not exist', async () => {
    const { call } = setup();
    expect(await call('PUT', '/api/quotes/99', { title: 'x' })).toEqual({ status: 404, body: { error: 'No existe el presupuesto 99.' } });
  });
});

describe('POST /api/quotes/:id/accept', () => {
  it('creates one order per line for the client, in nuevo, with the frozen prices, and marks the quote aceptado', async () => {
    const { call, quotes, orders } = setup();
    const { status, body } = await call('POST', '/api/quotes/1/accept', { channel: 'Instagram' });
    expect(status).toBe(201);
    const made = [
      { id: '0143', item: 'Llavero con logo × 12', price: 21200 },
      { id: '0144', item: 'Cartel', price: 5000 },
    ].map((o) => ({
      ...o, client: 'Café Nube', clientId: 1, quoteId: 1, channel: 'Instagram', stage: 'nuevo', dueDate: null, dueTime: null,
      deposit: null, paid: false, material: '', note: '', createdAt: expect.any(String), updatedAt: expect.any(String),
      realCost: null, realProfit: null,
    }));
    expect(body).toEqual({ quote: { ...sent, status: 'aceptado', updatedAt: expect.any(String) }, orders: made });
    expect(await orders.list()).toEqual([existingOrder, ...made]);
    expect((await quotes.get(1))?.status).toBe('aceptado');
    expect((await call('GET', '/api/quotes/1')).body.orders).toEqual(made);
  });

  it('takes WhatsApp as the channel when none is sent', async () => {
    const { call } = setup();
    const { status, body } = await call('POST', '/api/quotes/1/accept');
    expect(status).toBe(201);
    expect((body.orders as Order[]).map((o) => o.channel)).toEqual(['WhatsApp', 'WhatsApp']);
  });

  it('accepts a quote only once: the second time answers 409 and creates nothing', async () => {
    const { call, quotes, orders } = setup();
    await call('POST', '/api/quotes/1/accept', {});
    const before = { quote: await quotes.get(1), orders: await orders.list() };
    expect(await call('POST', '/api/quotes/1/accept', {})).toEqual({ status: 409, body: { error: 'El presupuesto P-0001 ya fue aceptado.' } });
    expect({ quote: await quotes.get(1), orders: await orders.list() }).toEqual(before);
    expect(before.orders).toHaveLength(3);
  });

  it('does not accept a rejected quote: 409 and nothing created', async () => {
    const { call, quotes, orders } = setup();
    expect(await call('POST', '/api/quotes/2/accept', {})).toEqual({
      status: 409, body: { error: 'El presupuesto P-0002 está rechazado: no se puede aceptar.' },
    });
    expect(await quotes.get(2)).toEqual(rejected);
    expect(await orders.list()).toEqual([existingOrder]);
  });

  it('rejects an unknown channel, changing nothing', async () => {
    const { call, quotes, orders } = setup();
    expect(await call('POST', '/api/quotes/1/accept', { channel: 'Paloma' })).toEqual({
      status: 422, body: { error: 'Revisá los datos del presupuesto.', fields: { channel: 'Elegí por dónde llegó el pedido.' } },
    });
    expect(await quotes.get(1)).toEqual(sent);
    expect(await orders.list()).toEqual([existingOrder]);
  });

  it('answers 404 for a quote that does not exist, creating nothing', async () => {
    const { call, orders } = setup();
    expect(await call('POST', '/api/quotes/99/accept', {})).toEqual({ status: 404, body: { error: 'No existe el presupuesto 99.' } });
    expect(await orders.list()).toEqual([existingOrder]);
  });
});

it('rejects other methods', async () => {
  const { call } = setup();
  for (const [method, path] of [['DELETE', '/api/quotes'], ['POST', '/api/quotes/1'], ['GET', '/api/quotes/1/accept'], ['PUT', '/api/quotes/1/accept']]) {
    expect(await call(method, path)).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  }
});

it('leaves other paths to the caller', async () => {
  const deps = setup();
  for (const path of ['/api/quote', '/api/quotes/abc', '/api/quotes/1/reject', '/api/orders']) {
    const url = deps.url(path);
    expect(await handleQuotes(new Request(url), url, deps)).toBeNull();
  }
});
