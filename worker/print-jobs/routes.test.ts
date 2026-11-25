import { describe, expect, it } from 'vitest';
import type { Client } from '../../shared/clients';
import type { CostSettings } from '../../shared/cost-settings';
import type { Order } from '../../shared/orders';
import type { PrintJob } from '../../shared/print-jobs';
import type { Printer } from '../../shared/printers';
import type { Spool } from '../../shared/spools';
import { memoryTables, type StoredPrintJob } from '../memory';
import { memoryOrderRepository } from '../orders/repository';
import { memoryPrinterRepository } from '../printers/repository';
import { memoryCostSettingsRepository } from '../settings/repository';
import { memorySpoolRepository, type SpoolRepository } from '../spools/repository';
import { memoryPrintJobRepository, type PrintJobRepository } from './repository';
import { handlePrintJobs } from './routes';

const stamp = '2026-11-01T00:00:00.000Z';
const cafe: Client = { id: 1, name: 'Café Nube', phone: '', instagram: '', email: '', note: '', createdAt: stamp, updatedAt: stamp };
const keychains: Order = {
  id: '0142', item: 'Llaveros con logo × 12', client: 'Café Nube', clientId: 1, quoteId: null, projectId: null, project: null, channel: 'Instagram', stage: 'imprimiendo',
  dueDate: null, dueTime: null, price: 36000, deposit: null, paid: false, material: '', note: '', createdAt: stamp, updatedAt: stamp,
  deliveredAt: null, realCost: null, realProfit: null,
};
const pot: Order = { ...keychains, id: '0143', item: 'Maceta', price: 12000 };

const a1: Printer = {
  id: 1, name: 'La A1', model: '', purchasePrice: 720000, lifetimeHours: 5000, powerWatts: 100, printMinutes: 7200, status: 'activa',
  note: '', createdAt: stamp, updatedAt: stamp,
};
const white: Spool = {
  id: 1, material: 'PLA', colorName: 'Blanco', colorHex: '#ffffff', brand: 'Grilon3', netGrams: 1000, remainingGrams: 640, price: 21000,
  lowStockGrams: 150, note: '', createdAt: stamp, updatedAt: stamp,
};
const yellow: Spool = { ...white, id: 2, colorName: 'Amarillo', colorHex: '#ffc42e', brand: '', remainingGrams: 30 };
// kWh $200, fixed costs $600 per print hour, labour $6000 per hour; packaging and failures do not enter a job's cost.
const settings: CostSettings = {
  kwhPrice: 200, labourPerHour: 6000, failurePercent: 10, marginPercent: 50, monthlyFixedCosts: 120000, monthlyPrintHours: 200,
  packagingCost: 800, roundingStep: 100, commissionPercent: 0, updatedAt: stamp,
};

// Already logged: 2 h on La A1 with 36 g of white, 30 min of labour and $500 of packaging, when white cost $20000. Its stored
// cost: material 720 (not the 756 white would cost now), energy 40, wear 288, fixed 1200, labour 3000, extra 500 = 5748.
const loggedCost = { material: 720, energy: 40, machineWear: 288, fixedCosts: 1200, labour: 3000, extra: 500 };
const logged: StoredPrintJob = {
  id: 1, orderId: '0142', printerId: 1, status: 'terminada', result: 'ok', plannedStart: null, estimatedMinutes: null, actualMinutes: 120,
  labourMinutes: 30, extraCost: 500, cost: loggedCost, note: 'Primera tanda', filaments: [{ spoolId: 1, grams: 36 }], createdAt: stamp, updatedAt: stamp,
};
const loggedView: PrintJob = {
  ...logged, printer: 'La A1', filaments: [{ spoolId: 1, spool: 'PLA Blanco · Grilon3', colorHex: '#ffffff', grams: 36 }],
};

function setup(options: { spools?: (repo: SpoolRepository) => SpoolRepository; jobs?: (repo: PrintJobRepository) => PrintJobRepository } = {}) {
  const tables = memoryTables([cafe], [keychains, pot], [], { printers: [a1], spools: [white, yellow], printJobs: [logged] });
  const printers = memoryPrinterRepository(tables);
  const spoolRepo = memorySpoolRepository(tables);
  const jobRepo = memoryPrintJobRepository(tables);
  const deps = {
    jobs: options.jobs ? options.jobs(jobRepo) : jobRepo,
    orders: memoryOrderRepository(tables),
    printers,
    spools: options.spools ? options.spools(spoolRepo) : spoolRepo,
    settings: memoryCostSettingsRepository(settings),
  };
  const call = async (method: string, path: string, body?: unknown) => {
    const url = new URL(`https://app.test${path}`);
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const res = await handlePrintJobs(new Request(url, { method, body: payload, headers: { 'Content-Type': 'application/json' } }), url, deps);
    if (!res) throw new Error('route not handled');
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  /** What a log or a delete may change, read through the API ports. */
  const snapshot = async () => ({
    printMinutes: (await printers.get(1))?.printMinutes,
    grams: (await spoolRepo.list()).map((s) => [s.id, s.remainingGrams]),
    jobs: (await call('GET', '/api/orders/0142/jobs')).body.jobs,
    otherJobs: (await call('GET', '/api/orders/0143/jobs')).body.jobs,
  });
  return { ...deps, spoolRepo, call, snapshot };
}

const newJob = { printerId: 1, actualMinutes: 90, result: 'ok', note: 'Segunda tanda', filaments: [{ spoolId: 1, grams: 30 }, { spoolId: 2, grams: 30 }] };

describe('GET /api/orders/:id/jobs', () => {
  it('lists the jobs of an order with printer and spool names, and the real cost', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/orders/0142/jobs')).toEqual({
      status: 200,
      body: {
        jobs: [loggedView],
        cost: { ...loggedCost, total: 5748, minutes: 120, grams: 36, jobs: 1, failedJobs: 0 },
      },
    });
  });

  it('works the cost out from the jobs it answers, read once', async () => {
    // The rows as one read saw them (here with a different extra cost than stored): the totals must add up these rows.
    let reads = 0;
    const { call } = setup({
      jobs: (repo) => ({
        ...repo,
        listByOrder: async (orderId) => {
          reads += 1;
          return (await repo.listByOrder(orderId)).map((j) => ({ ...j, cost: { ...j.cost, extra: 1500 } }));
        },
      }),
    });
    const cost = { ...loggedCost, extra: 1500 };
    expect(await call('GET', '/api/orders/0142/jobs')).toEqual({
      status: 200,
      body: { jobs: [{ ...loggedView, cost }], cost: { ...cost, total: 6748, minutes: 120, grams: 36, jobs: 1, failedJobs: 0 } },
    });
    expect(reads).toBe(1);
  });

  it('answers an empty list and no cost for an order without jobs', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/orders/0143/jobs')).toEqual({ status: 200, body: { jobs: [], cost: null } });
  });

  it('answers 404 for an order that does not exist', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/orders/0999/jobs')).toEqual({ status: 404, body: { error: 'No existe el pedido #0999.' } });
  });
});

describe('POST /api/orders/:id/jobs', () => {
  it('logs the job, adds the minutes to the printer and takes the grams off each spool', async () => {
    const { call, snapshot } = setup();
    const { status, body } = await call('POST', '/api/orders/0142/jobs', newJob);
    expect(status).toBe(201);
    const job: PrintJob = {
      id: 2, orderId: '0142', printerId: 1, printer: 'La A1', status: 'terminada', result: 'ok', plannedStart: null, estimatedMinutes: null,
      actualMinutes: 90, labourMinutes: 0, extraCost: 0, note: 'Segunda tanda',
      cost: { material: 1260, energy: 30, machineWear: 216, fixedCosts: 900, labour: 0, extra: 0 },
      filaments: [
        { spoolId: 1, spool: 'PLA Blanco · Grilon3', colorHex: '#ffffff', grams: 30 },
        { spoolId: 2, spool: 'PLA Amarillo', colorHex: '#ffc42e', grams: 30 },
      ],
      createdAt: expect.any(String) as unknown as string, updatedAt: expect.any(String) as unknown as string,
    };
    // Job 2: material 60 g × 21 = 1260, energy 0.1 × 1.5 × 200 = 30, wear 1.5 × 144 = 216, fixed 1.5 × 600 = 900 → 2406.
    expect(body).toEqual({ job, order: { ...keychains, realCost: 5748 + 2406, realProfit: 36000 - 8154 } });
    expect(await snapshot()).toEqual({
      printMinutes: 7290, grams: [[1, 610], [2, 0]], jobs: [loggedView, job], otherJobs: [],
    });
  });

  it('marks a failed job fallida and still counts its minutes, grams and cost', async () => {
    const { call, snapshot } = setup();
    const { status, body } = await call('POST', '/api/orders/0143/jobs', { ...newJob, result: 'fallida', filaments: [{ spoolId: 1, grams: 20 }] });
    expect(status).toBe(201);
    expect(body.job).toMatchObject({ orderId: '0143', status: 'fallida', result: 'fallida', actualMinutes: 90 });
    // material 420 + energy 30 + wear 216 + fixed 900 = 1566
    expect(body.order).toMatchObject({ id: '0143', realCost: 1566, realProfit: 12000 - 1566 });
    expect(await snapshot()).toMatchObject({ printMinutes: 7290, grams: [[1, 620], [2, 30]] });
  });

  it('stores labour minutes, the extra cost and the six cost terms with the job', async () => {
    const { call } = setup();
    const { status, body } = await call('POST', '/api/orders/0143/jobs', { ...newJob, labourMinutes: 45, extraCost: 900 });
    expect(status).toBe(201);
    // Labour 45 min × $6000/h = 4500; extra 900. Material 1260, energy 30, wear 216, fixed 900 as above. Total 7806.
    const cost = { material: 1260, energy: 30, machineWear: 216, fixedCosts: 900, labour: 4500, extra: 900 };
    expect(body.job).toMatchObject({ labourMinutes: 45, extraCost: 900, cost });
    expect(body.order).toMatchObject({ id: '0143', realCost: 7806, realProfit: 12000 - 7806 });
    expect((await call('GET', '/api/orders/0143/jobs')).body).toMatchObject({
      jobs: [{ labourMinutes: 45, extraCost: 900, cost }], cost: { ...cost, total: 7806, jobs: 1, failedJobs: 0 },
    });
  });

  it('keeps a job\'s cost after the spool price, the printer price and the settings change', async () => {
    const { call, orders, printers, spoolRepo, settings: settingsRepo } = setup();
    expect((await call('POST', '/api/orders/0143/jobs', { ...newJob, labourMinutes: 45, extraCost: 900 })).status).toBe(201);
    const before = { jobs: await call('GET', '/api/orders/0143/jobs'), order: await orders.get('0143'), other: await call('GET', '/api/orders/0142/jobs') };
    await spoolRepo.update(1, { price: 42000 });
    await spoolRepo.update(2, { price: 30000, netGrams: 500 });
    await printers.update(1, { purchasePrice: 1500000, lifetimeHours: 1000, powerWatts: 300 });
    const { updatedAt: _at, ...costs } = settings;
    await settingsRepo.save({ ...costs, kwhPrice: 900, labourPerHour: 20000, monthlyFixedCosts: 500000, monthlyPrintHours: 50 });
    expect({ jobs: await call('GET', '/api/orders/0143/jobs'), order: await orders.get('0143'), other: await call('GET', '/api/orders/0142/jobs') })
      .toEqual(before);
    expect(before.order).toMatchObject({ realCost: 7806 });
  });

  it('rejects labour minutes that are not whole minutes from 0 and changes nothing', async () => {
    await expectRejected({ ...newJob, labourMinutes: -10 }, { labourMinutes: 'Poné los minutos de mano de obra: un número entero desde 0.' });
    await expectRejected({ ...newJob, labourMinutes: 12.5 }, { labourMinutes: 'Poné los minutos de mano de obra: un número entero desde 0.' });
  });

  it('rejects an extra cost that is not whole pesos from 0 and changes nothing', async () => {
    await expectRejected({ ...newJob, extraCost: -900 }, { extraCost: 'Poné el costo extra en pesos, sin centavos.' });
    await expectRejected({ ...newJob, extraCost: '900' }, { extraCost: 'Poné el costo extra en pesos, sin centavos.' });
  });

  async function expectRejected(body: unknown, fields: Record<string, string>) {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('POST', '/api/orders/0142/jobs', body)).toEqual({ status: 422, body: { error: 'Revisá los datos de la impresión.', fields } });
    expect(await snapshot()).toEqual(before);
  }

  it('rejects a spool without enough grams and changes nothing', async () => {
    await expectRejected(
      { ...newJob, filaments: [{ spoolId: 1, grams: 30 }, { spoolId: 2, grams: 31 }] },
      { filaments: 'A PLA Amarillo le quedan 30 g y cargaste 31 g.' },
    );
  });

  it('rejects a printer that does not exist and changes nothing', async () => {
    await expectRejected({ ...newJob, printerId: 9 }, { printerId: 'Esa impresora no existe.' });
  });

  it('rejects a spool that does not exist and changes nothing', async () => {
    await expectRejected({ ...newJob, filaments: [{ spoolId: 1, grams: 30 }, { spoolId: 7, grams: 5 }] }, { filaments: 'La bobina 7 no existe.' });
  });

  it('rejects minutes that are not above 0 and changes nothing', async () => {
    await expectRejected({ ...newJob, actualMinutes: 0 }, { actualMinutes: 'Poné cuánto tardó: más de 0 minutos.' });
  });

  it('rejects the same spool twice and changes nothing', async () => {
    await expectRejected(
      { ...newJob, filaments: [{ spoolId: 1, grams: 10 }, { spoolId: 1, grams: 10 }] },
      { filaments: 'Cada bobina va una sola vez: sumá sus gramos en una fila.' },
    );
  });

  it('changes nothing when the grams ran out after the check, as when two logs race', async () => {
    // The route's read still sees 640 g, as if another log landed right after it: the atomic write must refuse on its own.
    let staleReads = 0;
    const stale = (repo: SpoolRepository): SpoolRepository => ({
      ...repo,
      list: async () => {
        const all = await repo.list();
        return staleReads-- > 0 ? all.map((s) => (s.id === 1 ? { ...s, remainingGrams: 640 } : s)) : all;
      },
    });
    const { call, snapshot } = setup({ spools: stale });
    expect((await call('POST', '/api/orders/0143/jobs', { ...newJob, filaments: [{ spoolId: 1, grams: 620 }] })).status).toBe(201);
    const before = await snapshot();
    expect(before.grams).toEqual([[1, 20], [2, 30]]);
    staleReads = 1;
    expect(await call('POST', '/api/orders/0142/jobs', { ...newJob, filaments: [{ spoolId: 1, grams: 30 }] })).toEqual({
      status: 422, body: { error: 'Revisá los datos de la impresión.', fields: { filaments: 'A PLA Blanco · Grilon3 le quedan 20 g y cargaste 30 g.' } },
    });
    expect(await snapshot()).toEqual(before);
  });

  const key = '0b6c5f4e-9a51-4c1e-8f43-2f1d3c4b5a69';

  it('stores a retried log once: the same key answers the job already logged with 200 and changes nothing', async () => {
    const { call, snapshot } = setup();
    const first = await call('POST', '/api/orders/0142/jobs', { ...newJob, submissionKey: key });
    expect(first.status).toBe(201);
    const after = await snapshot();
    // The first try took the last 30 g of yellow: without the key a second one would be refused for grams.
    expect(await call('POST', '/api/orders/0142/jobs', { ...newJob, submissionKey: key })).toEqual({ status: 200, body: first.body });
    expect(await snapshot()).toEqual(after);
    expect(after.jobs).toHaveLength(2);
  });

  it('answers the job another try stored with the same key between this one\'s check and its write, changing nothing more', async () => {
    let landOther = true;
    const { call, snapshot } = setup({
      jobs: (repo) => ({
        ...repo,
        log: async (orderId, job, cost, submissionKey) => {
          if (landOther) { landOther = false; await repo.log(orderId, job, cost, submissionKey); }
          return repo.log(orderId, job, cost, submissionKey);
        },
      }),
    });
    const { status, body } = await call('POST', '/api/orders/0142/jobs', { ...newJob, filaments: [{ spoolId: 1, grams: 30 }], submissionKey: key });
    expect(status).toBe(200);
    expect(body.job).toMatchObject({ id: 2, orderId: '0142', actualMinutes: 90 });
    expect(await snapshot()).toMatchObject({ printMinutes: 7290, grams: [[1, 610], [2, 30]] });
    expect((await snapshot()).jobs).toHaveLength(2);
  });

  it('answers 409 for a key a job of another order carries, and changes nothing', async () => {
    const { call, snapshot } = setup();
    expect((await call('POST', '/api/orders/0143/jobs', { ...newJob, filaments: [{ spoolId: 1, grams: 10 }], submissionKey: key })).status).toBe(201);
    const before = await snapshot();
    expect(await call('POST', '/api/orders/0142/jobs', { ...newJob, submissionKey: key })).toEqual({
      status: 409, body: { error: 'Esa clave de envío ya se usó para una impresión de otro pedido.' },
    });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects a key that is not 8 to 64 letters, digits or dashes and changes nothing', async () => {
    await expectRejected({ ...newJob, submissionKey: 'no' }, { submissionKey: 'La clave de envío tiene que tener de 8 a 64 letras, números o guiones.' });
  });

  it('logs the same body twice without a key, as two jobs', async () => {
    const { call, snapshot } = setup();
    const body = { ...newJob, filaments: [{ spoolId: 1, grams: 30 }] };
    expect((await call('POST', '/api/orders/0142/jobs', body)).status).toBe(201);
    expect((await call('POST', '/api/orders/0142/jobs', body)).status).toBe(201);
    expect(await snapshot()).toMatchObject({ printMinutes: 7380, grams: [[1, 580], [2, 30]] });
    expect((await snapshot()).jobs).toHaveLength(3);
  });

  it('takes a spool down to exactly 0 g', async () => {
    const { call, snapshot } = setup();
    expect((await call('POST', '/api/orders/0142/jobs', { ...newJob, filaments: [{ spoolId: 2, grams: 30 }] })).status).toBe(201);
    expect((await snapshot()).grams).toEqual([[1, 640], [2, 0]]);
  });

  it('answers 404 for an order that does not exist and changes nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('POST', '/api/orders/0999/jobs', newJob)).toEqual({ status: 404, body: { error: 'No existe el pedido #0999.' } });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects a body that is not JSON and changes nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('POST', '/api/orders/0142/jobs', 'no es json')).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    expect(await snapshot()).toEqual(before);
  });
});

describe('DELETE /api/orders/:id/jobs/:jobId', () => {
  it('deletes the job and gives its minutes and grams back', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    const logged2 = await call('POST', '/api/orders/0142/jobs', newJob);
    expect(logged2.status).toBe(201);
    const { status, body } = await call('DELETE', '/api/orders/0142/jobs/2');
    expect(status).toBe(200);
    expect(body).toEqual({ order: { ...keychains, realCost: 5748, realProfit: 36000 - 5748 } });
    expect(await snapshot()).toEqual(before);
  });

  it('deletes the last job of an order, leaving it without a real cost', async () => {
    const { call, snapshot } = setup();
    const { status, body } = await call('DELETE', '/api/orders/0142/jobs/1');
    expect(status).toBe(200);
    expect(body).toEqual({ order: keychains });
    expect(await snapshot()).toEqual({ printMinutes: 7080, grams: [[1, 676], [2, 30]], jobs: [], otherJobs: [] });
  });

  it('answers 404 for a job of another order and changes nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('DELETE', '/api/orders/0143/jobs/1')).toEqual({ status: 404, body: { error: 'El pedido #0143 no tiene la impresión 1.' } });
    expect(await snapshot()).toEqual(before);
  });

  it('never gives a deleted job\'s id to a new one, so a retried delete cannot delete its replacement', async () => {
    const { call, snapshot } = setup();
    expect((await call('DELETE', '/api/orders/0142/jobs/1')).status).toBe(200); // the only job
    const { status, body } = await call('POST', '/api/orders/0142/jobs', newJob);
    expect(status).toBe(201);
    expect(body.job).toMatchObject({ id: 2 });
    const after = await snapshot();
    expect(await call('DELETE', '/api/orders/0142/jobs/1')).toEqual({ status: 404, body: { error: 'El pedido #0142 no tiene la impresión 1.' } });
    expect(await snapshot()).toEqual(after);
  });

  it('answers 404 the second time, giving nothing back twice', async () => {
    const { call, snapshot } = setup();
    expect((await call('DELETE', '/api/orders/0142/jobs/1')).status).toBe(200);
    const after = await snapshot();
    expect(await call('DELETE', '/api/orders/0142/jobs/1')).toEqual({ status: 404, body: { error: 'El pedido #0142 no tiene la impresión 1.' } });
    expect(await snapshot()).toEqual(after);
  });
});

it('rejects other methods', async () => {
  const { call } = setup();
  expect(await call('PUT', '/api/orders/0142/jobs')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  expect(await call('GET', '/api/orders/0142/jobs/1')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
});

it('leaves other paths to the caller', async () => {
  const url = new URL('https://app.test/api/orders/0142/stage');
  const { jobs, orders, printers, spools, settings } = setup();
  expect(await handlePrintJobs(new Request(url, { method: 'PUT' }), url, { jobs, orders, printers, spools, settings })).toBeNull();
  const list = new URL('https://app.test/api/orders');
  expect(await handlePrintJobs(new Request(list), list, { jobs, orders, printers, spools, settings })).toBeNull();
});
