// Planned print jobs: plan, edit, delete and finish. The log and delete of finished jobs are in routes.test.ts.
import { describe, expect, it } from 'vitest';
import type { Client } from '../../shared/clients';
import type { CostSettings } from '../../shared/cost-settings';
import type { Order } from '../../shared/orders';
import { NO_JOB_COST, type PrintJob } from '../../shared/print-jobs';
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
const ender: Printer = { ...a1, id: 2, name: 'La Ender', printMinutes: 108450, status: 'en_servicio' };
const p1s: Printer = { ...a1, id: 3, name: 'La P1S', printMinutes: 600 };
const white: Spool = {
  id: 1, material: 'PLA', colorName: 'Blanco', colorHex: '#ffffff', brand: 'Grilon3', netGrams: 1000, remainingGrams: 640, price: 21000,
  lowStockGrams: 150, note: '', createdAt: stamp, updatedAt: stamp,
};
const yellow: Spool = { ...white, id: 2, colorName: 'Amarillo', colorHex: '#ffc42e', brand: '', remainingGrams: 30 };
// kWh $200, fixed costs $600 per print hour, labour $6000 per hour.
const settings: CostSettings = {
  kwhPrice: 200, labourPerHour: 6000, failurePercent: 10, marginPercent: 50, monthlyFixedCosts: 120000, monthlyPrintHours: 200,
  packagingCost: 800, roundingStep: 100, commissionPercent: 0, updatedAt: stamp,
};

// Job 1 was logged on 0142 (cost 5748); job 2 is planned for 0143 on La A1, Thursday 26 from 09:00 to 17:00.
const loggedCost = { material: 720, energy: 40, machineWear: 288, fixedCosts: 1200, labour: 3000, extra: 500 };
const logged: StoredPrintJob = {
  id: 1, orderId: '0142', printerId: 1, status: 'terminada', result: 'ok', plannedStart: null, estimatedMinutes: null, actualMinutes: 120,
  labourMinutes: 30, extraCost: 500, cost: loggedCost, note: 'Primera tanda', filaments: [{ spoolId: 1, grams: 36 }], createdAt: stamp, updatedAt: stamp,
};
const planned: StoredPrintJob = {
  id: 2, orderId: '0143', printerId: 1, status: 'planeada', result: null, plannedStart: '2026-11-26T09:00', estimatedMinutes: 480, actualMinutes: null,
  labourMinutes: 0, extraCost: 0, cost: NO_JOB_COST, note: 'Maceta grande', filaments: [], createdAt: stamp, updatedAt: stamp,
};
const plannedView: PrintJob = { ...planned, printer: 'La A1', filaments: [] };

const INVALID = 'Revisá los datos de la impresión.';

function setup(options: {
  spools?: (repo: SpoolRepository) => SpoolRepository;
  jobs?: (repo: PrintJobRepository) => PrintJobRepository;
  printJobs?: StoredPrintJob[];
} = {}) {
  const tables = memoryTables([cafe], [keychains, pot], [], {
    printers: [a1, ender, p1s], spools: [white, yellow], printJobs: options.printJobs ?? [logged, planned],
  });
  const printers = memoryPrinterRepository(tables);
  const spoolRepo = memorySpoolRepository(tables);
  const jobRepo = memoryPrintJobRepository(tables);
  const orders = memoryOrderRepository(tables);
  const deps = {
    jobs: options.jobs ? options.jobs(jobRepo) : jobRepo,
    orders,
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
  /** Everything a plan or a finish may change, read through the API ports. */
  const snapshot = async () => ({
    printMinutes: (await printers.list()).map((p) => [p.id, p.printMinutes]),
    grams: (await spoolRepo.list()).map((s) => [s.id, s.remainingGrams]),
    jobs: (await call('GET', '/api/orders/0142/jobs')).body,
    otherJobs: (await call('GET', '/api/orders/0143/jobs')).body,
    realCosts: (await orders.list()).map((o) => [o.id, o.realCost, o.realProfit]),
  });
  return { call, snapshot, jobRepo };
}

const plan = { printerId: 1, plannedStart: '2026-11-25T14:00', estimatedMinutes: 160, note: 'Segunda tanda' };
const anyStamp = expect.any(String) as unknown as string;

/**
 * Wraps the job repository so that the route's next read of a job answers `view`: as if that request read the job just
 * before another request changed it. Later reads see the stored job.
 */
function staleJob() {
  let next: PrintJob | null = null;
  const wrap = (repo: PrintJobRepository): PrintJobRepository => ({
    ...repo,
    get: async (jobId) => {
      const view = next;
      next = null;
      return view && view.id === jobId ? structuredClone(view) : repo.get(jobId);
    },
  });
  return { wrap, readNext: (view: PrintJob) => { next = view; } };
}

describe('POST /api/orders/:id/jobs/plan', () => {
  it('plans a job on an active printer and changes no counter or cost', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    const { status, body } = await call('POST', '/api/orders/0142/jobs/plan', plan);
    expect(status).toBe(201);
    const job: PrintJob = {
      id: 3, orderId: '0142', printerId: 1, printer: 'La A1', status: 'planeada', result: null, plannedStart: '2026-11-25T14:00', estimatedMinutes: 160,
      actualMinutes: null, labourMinutes: 0, extraCost: 0, cost: NO_JOB_COST, note: 'Segunda tanda', filaments: [], createdAt: anyStamp, updatedAt: anyStamp,
    };
    expect(body).toEqual({ job });
    const after = await snapshot();
    // The printer keeps its minutes, the spools their grams, and the order its real cost: the planned job is listed but counts for nothing.
    expect(after).toEqual({ ...before, jobs: { ...before.jobs, jobs: [...(before.jobs.jobs as PrintJob[]), job] } });
    expect(after.jobs.cost).toMatchObject({ total: 5748, jobs: 1, minutes: 120, grams: 36 });
  });

  it('plans a job right when another one ends, and right before another one starts', async () => {
    const { call } = setup();
    expect((await call('POST', '/api/orders/0142/jobs/plan', { ...plan, plannedStart: '2026-11-26T17:00', estimatedMinutes: 60 })).status).toBe(201);
    expect((await call('POST', '/api/orders/0142/jobs/plan', { ...plan, plannedStart: '2026-11-26T07:00', estimatedMinutes: 120 })).status).toBe(201);
  });

  it('plans the same time on another printer', async () => {
    const { call } = setup();
    expect((await call('POST', '/api/orders/0142/jobs/plan', { ...plan, printerId: 3, plannedStart: '2026-11-26T10:00' })).status).toBe(201);
  });

  async function expectRejected(body: unknown, fields: Record<string, string>, orderId = '0142') {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('POST', `/api/orders/${orderId}/jobs/plan`, body)).toEqual({ status: 422, body: { error: INVALID, fields } });
    expect(await snapshot()).toEqual(before);
  }

  it('rejects a time span that overlaps a planned job of that printer and changes nothing', async () => {
    await expectRejected(
      { ...plan, plannedStart: '2026-11-26T16:00' },
      { plannedStart: 'La A1 ya tiene planeada la impresión del pedido #0143 del 26/11 09:00 al 26/11 17:00.' },
    );
    await expectRejected(
      { ...plan, plannedStart: '2026-11-26T06:00', estimatedMinutes: 181 },
      { plannedStart: 'La A1 ya tiene planeada la impresión del pedido #0143 del 26/11 09:00 al 26/11 17:00.' },
    );
  });

  it('rejects a printer that is not active and changes nothing', async () => {
    await expectRejected({ ...plan, printerId: 2 }, { printerId: 'La Ender está en servicio: planificá en una impresora activa.' });
  });

  it('rejects a printer that does not exist and changes nothing', async () => {
    await expectRejected({ ...plan, printerId: 9 }, { printerId: 'Esa impresora no existe.' });
  });

  it('rejects a missing start or duration and changes nothing', async () => {
    await expectRejected(
      { printerId: 1, plannedStart: '2026-11-25', estimatedMinutes: 0 },
      { plannedStart: 'Poné el día y la hora de inicio.', estimatedMinutes: 'Poné cuánto va a tardar: más de 0 minutos.' },
    );
  });

  it('changes nothing when another plan took the time after the check, as when two plans race', async () => {
    // The route's read misses job 2, as if it were planned right after: the guarded write must refuse on its own.
    let staleReads = 1;
    const stale = (repo: PrintJobRepository): PrintJobRepository => ({
      ...repo,
      listPlanned: async () => (staleReads-- > 0 ? [] : repo.listPlanned()),
    });
    const { call, snapshot } = setup({ jobs: stale });
    const before = await snapshot();
    expect(await call('POST', '/api/orders/0142/jobs/plan', { ...plan, plannedStart: '2026-11-26T10:00' })).toEqual({
      status: 422, body: { error: INVALID, fields: { plannedStart: 'La A1 ya tiene planeada la impresión del pedido #0143 del 26/11 09:00 al 26/11 17:00.' } },
    });
    expect(await snapshot()).toEqual(before);
  });

  it('answers 404 for an order that does not exist and changes nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('POST', '/api/orders/0999/jobs/plan', plan)).toEqual({ status: 404, body: { error: 'No existe el pedido #0999.' } });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects a body that is not JSON and changes nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('POST', '/api/orders/0142/jobs/plan', 'no es json')).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects other methods', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/orders/0142/jobs/plan')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });
});

describe('PUT /api/orders/:id/jobs/:jobId', () => {
  it('moves a planned job to another printer, start and duration', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    const { status, body } = await call('PUT', '/api/orders/0143/jobs/2', { printerId: 3, plannedStart: '2026-11-27T08:30', estimatedMinutes: 300 });
    expect(status).toBe(200);
    const job = { ...plannedView, printerId: 3, printer: 'La P1S', plannedStart: '2026-11-27T08:30', estimatedMinutes: 300, updatedAt: anyStamp };
    expect(body).toEqual({ job });
    expect(await snapshot()).toEqual({ ...before, otherJobs: { jobs: [job], cost: null } });
  });

  it('keeps the fields left out of the body, and may overlap its own old span', async () => {
    const { call } = setup();
    const { status, body } = await call('PUT', '/api/orders/0143/jobs/2', { plannedStart: '2026-11-26T10:00' });
    expect(status).toBe(200);
    expect(body.job).toMatchObject({ printerId: 1, plannedStart: '2026-11-26T10:00', estimatedMinutes: 480, note: 'Maceta grande' });
  });

  async function expectRejected(body: unknown, fields: Record<string, string>) {
    const { call, snapshot } = setup();
    expect((await call('POST', '/api/orders/0142/jobs/plan', plan)).status).toBe(201); // job 3, 25/11 14:00 to 16:40
    const before = await snapshot();
    expect(await call('PUT', '/api/orders/0143/jobs/2', body)).toEqual({ status: 422, body: { error: INVALID, fields } });
    expect(await snapshot()).toEqual(before);
  }

  it('rejects a span that overlaps another planned job and changes nothing', async () => {
    await expectRejected(
      { plannedStart: '2026-11-25T16:00' },
      { plannedStart: 'La A1 ya tiene planeada la impresión del pedido #0142 del 25/11 14:00 al 25/11 16:40.' },
    );
  });

  it('rejects a printer that is not active and changes nothing', async () => {
    await expectRejected({ printerId: 2 }, { printerId: 'La Ender está en servicio: planificá en una impresora activa.' });
  });

  it('rejects a wrong duration and changes nothing', async () => {
    await expectRejected({ estimatedMinutes: -5 }, { estimatedMinutes: 'Poné cuánto va a tardar: más de 0 minutos.' });
  });

  it('writes only the fields it sent: an edit that read the job before a move does not undo the move', async () => {
    const stale = staleJob();
    const { call } = setup({ jobs: stale.wrap });
    expect((await call('PUT', '/api/orders/0143/jobs/2', { printerId: 3 })).status).toBe(200);
    stale.readNext(plannedView); // this edit read the job while it was still on La A1
    const { status, body } = await call('PUT', '/api/orders/0143/jobs/2', { estimatedMinutes: 300 });
    expect(status).toBe(200);
    const job = { ...plannedView, printerId: 3, printer: 'La P1S', estimatedMinutes: 300, updatedAt: anyStamp };
    expect(body).toEqual({ job });
    expect((await call('GET', '/api/orders/0143/jobs')).body).toEqual({ jobs: [job], cost: null });
  });

  it('checks the overlap on the printer and span the job will have after the write, not on an earlier read, and changes nothing', async () => {
    const stale = staleJob();
    const { call, snapshot } = setup({ jobs: stale.wrap });
    expect((await call('POST', '/api/orders/0142/jobs/plan', { ...plan, printerId: 3, plannedStart: '2026-11-26T19:00', estimatedMinutes: 60 })).status).toBe(201);
    expect((await call('PUT', '/api/orders/0143/jobs/2', { printerId: 3 })).status).toBe(200); // 09:00 to 17:00 on La P1S
    const before = await snapshot();
    stale.readNext(plannedView); // on La A1 the longer span would be free; on La P1S it reaches job 3
    expect(await call('PUT', '/api/orders/0143/jobs/2', { estimatedMinutes: 660 })).toEqual({
      status: 422, body: { error: INVALID, fields: { plannedStart: 'La P1S ya tiene planeada la impresión del pedido #0142 del 26/11 19:00 al 26/11 20:00.' } },
    });
    expect(await snapshot()).toEqual(before);
  });

  it('answers 404 for a job of another order, and 409 for a finished job, changing nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('PUT', '/api/orders/0142/jobs/2', { estimatedMinutes: 60 })).toEqual({ status: 404, body: { error: 'El pedido #0142 no tiene la impresión 2.' } });
    expect(await call('PUT', '/api/orders/0142/jobs/1', { estimatedMinutes: 60 })).toEqual({
      status: 409, body: { error: 'La impresión 1 ya se cargó como terminada: su plan no cambia.' },
    });
    expect(await snapshot()).toEqual(before);
  });
});

const finishBody = { printerId: 1, actualMinutes: 90, result: 'ok', note: 'Salió', filaments: [{ spoolId: 1, grams: 30 }, { spoolId: 2, grams: 30 }] };

describe('DELETE /api/orders/:id/jobs/:jobId/plan', () => {
  it('deletes a planned job and gives nothing back, because it took nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    const { status, body } = await call('DELETE', '/api/orders/0143/jobs/2/plan');
    expect(status).toBe(200);
    expect(body).toEqual({ order: pot });
    expect(await snapshot()).toEqual({ ...before, otherJobs: { jobs: [], cost: null } });
    expect(await call('DELETE', '/api/orders/0143/jobs/2/plan')).toEqual({ status: 404, body: { error: 'El pedido #0143 no tiene la impresión 2.' } });
  });

  it('refuses with 409 a job finished meanwhile, keeping it and its counters', async () => {
    const { call, snapshot } = setup();
    expect((await call('POST', '/api/orders/0143/jobs/2/finish', finishBody)).status).toBe(200);
    const after = await snapshot();
    expect(await call('DELETE', '/api/orders/0143/jobs/2/plan')).toEqual({
      status: 409, body: { error: 'La impresión 2 ya se cargó como terminada: no se borró.' },
    });
    expect(await call('DELETE', '/api/orders/0142/jobs/1/plan')).toEqual({
      status: 409, body: { error: 'La impresión 1 ya se cargó como terminada: no se borró.' },
    });
    expect(await snapshot()).toEqual(after);
    expect(after.printMinutes).toEqual([[1, 7290], [2, 108450], [3, 600]]);
  });

  it('answers 404 for a job of another order or an order that does not exist, changing nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('DELETE', '/api/orders/0142/jobs/2/plan')).toEqual({ status: 404, body: { error: 'El pedido #0142 no tiene la impresión 2.' } });
    expect(await call('DELETE', '/api/orders/0999/jobs/2/plan')).toEqual({ status: 404, body: { error: 'No existe el pedido #0999.' } });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects other methods', async () => {
    const { call } = setup();
    expect(await call('POST', '/api/orders/0143/jobs/2/plan')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });
});

describe('DELETE /api/orders/:id/jobs/:jobId on a planned job', () => {
  it('deletes the planned job and changes no counter', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    const { status, body } = await call('DELETE', '/api/orders/0143/jobs/2');
    expect(status).toBe(200);
    expect(body.order).toMatchObject({ id: '0143' });
    const after = await snapshot();
    expect(after.printMinutes).toEqual(before.printMinutes);
    expect(after.grams).toEqual(before.grams);
    expect(after.otherJobs.jobs).toEqual([]);
    expect(await call('DELETE', '/api/orders/0143/jobs/2')).toEqual({ status: 404, body: { error: 'El pedido #0143 no tiene la impresión 2.' } });
  });

  it('answers 409 and keeps the finish when the job is finished between the read and the delete', async () => {
    let landFinish: (() => Promise<unknown>) | null = null;
    const racing = (repo: PrintJobRepository): PrintJobRepository => ({
      ...repo,
      get: async (jobId) => {
        const job = await repo.get(jobId);
        const land = landFinish;
        landFinish = null;
        if (land) await land();
        return job;
      },
    });
    const { call, snapshot } = setup({ jobs: racing });
    landFinish = () => call('POST', '/api/orders/0143/jobs/2/finish', finishBody);
    expect(await call('DELETE', '/api/orders/0143/jobs/2')).toEqual({
      status: 409, body: { error: 'La impresión 2 cambió mientras la borrabas: revisá y probá de nuevo.' },
    });
    // The finish stands: the job is finished and its minutes and grams stay counted.
    expect(await snapshot()).toMatchObject({
      printMinutes: [[1, 7290], [2, 108450], [3, 600]], grams: [[1, 610], [2, 0]],
      otherJobs: { jobs: [{ id: 2, status: 'terminada' }] },
    });
  });
});

describe('POST /api/orders/:id/jobs/:jobId/finish', () => {
  const finish = { printerId: 1, actualMinutes: 90, result: 'ok', note: 'Salió', filaments: [{ spoolId: 1, grams: 30 }, { spoolId: 2, grams: 30 }] };

  it('turns the planned job into a finished one, adds its minutes, takes its grams and freezes its cost, in one write', async () => {
    const { call, snapshot } = setup();
    const { status, body } = await call('POST', '/api/orders/0143/jobs/2/finish', { ...finish, labourMinutes: 45, extraCost: 900 });
    expect(status).toBe(200);
    // Material 60 g × 21 = 1260, energy 0.1 × 1.5 × 200 = 30, wear 1.5 × 144 = 216, fixed 1.5 × 600 = 900, labour 4500, extra 900 = 7806.
    const job: PrintJob = {
      ...plannedView, status: 'terminada', result: 'ok', actualMinutes: 90, labourMinutes: 45, extraCost: 900, note: 'Salió',
      cost: { material: 1260, energy: 30, machineWear: 216, fixedCosts: 900, labour: 4500, extra: 900 },
      filaments: [
        { spoolId: 1, spool: 'PLA Blanco · Grilon3', colorHex: '#ffffff', grams: 30 },
        { spoolId: 2, spool: 'PLA Amarillo', colorHex: '#ffc42e', grams: 30 },
      ],
      updatedAt: anyStamp,
    };
    // The plan stays with the job, estimate next to the real time.
    expect(body).toEqual({ job, order: { ...pot, realCost: 7806, realProfit: 12000 - 7806 } });
    expect(await snapshot()).toMatchObject({
      printMinutes: [[1, 7290], [2, 108450], [3, 600]], grams: [[1, 610], [2, 0]],
      otherJobs: { jobs: [job], cost: { total: 7806, jobs: 1, minutes: 90, grams: 60 } },
    });
  });

  it('counts its minutes and grams once: a second finish answers 409 and changes nothing', async () => {
    const { call, snapshot } = setup();
    expect((await call('POST', '/api/orders/0143/jobs/2/finish', { ...finish, filaments: [{ spoolId: 1, grams: 10 }] })).status).toBe(200);
    const after = await snapshot();
    expect(await call('POST', '/api/orders/0143/jobs/2/finish', { ...finish, filaments: [{ spoolId: 1, grams: 10 }] })).toEqual({
      status: 409, body: { error: 'La impresión 2 ya se cargó como terminada.' },
    });
    expect(await snapshot()).toEqual(after);
    expect(after.printMinutes).toEqual([[1, 7290], [2, 108450], [3, 600]]);
    expect(after.grams).toEqual([[1, 630], [2, 30]]);
  });

  it('takes the planned printer when the body names none, and can finish on another printer', async () => {
    const { printerId: _p, ...noPrinter } = finish;
    const first = setup();
    expect((await first.call('POST', '/api/orders/0143/jobs/2/finish', noPrinter)).body.job).toMatchObject({ printerId: 1, status: 'terminada' });
    const second = setup();
    expect((await second.call('POST', '/api/orders/0143/jobs/2/finish', { ...finish, printerId: 3 })).body.job).toMatchObject({ printerId: 3, printer: 'La P1S' });
    expect((await second.snapshot()).printMinutes).toEqual([[1, 7200], [2, 108450], [3, 690]]);
  });

  it('finishes on the printer the job has now: after a move it charges the new printer or answers 409, never the old one', async () => {
    const { printerId: _p, ...noPrinter } = finish;
    const stale = staleJob();
    const { call, snapshot } = setup({ jobs: stale.wrap });
    expect((await call('PUT', '/api/orders/0143/jobs/2', { printerId: 3 })).status).toBe(200);
    const moved = await snapshot();
    stale.readNext(plannedView); // this finish read the job while it was still on La A1
    expect(await call('POST', '/api/orders/0143/jobs/2/finish', noPrinter)).toEqual({
      status: 409, body: { error: 'La impresión 2 cambió de impresora mientras la terminabas: revisá y probá de nuevo.' },
    });
    expect(await snapshot()).toEqual(moved);
    // Read now, it takes the printer the job has: La P1S.
    expect((await call('POST', '/api/orders/0143/jobs/2/finish', noPrinter)).body.job).toMatchObject({ printerId: 3, printer: 'La P1S', status: 'terminada' });
    expect((await snapshot()).printMinutes).toEqual([[1, 7200], [2, 108450], [3, 690]]);
  });

  it('does not finish a planned job that already has a grams row unless its own write applied', async () => {
    // A planned job carrying a grams row (as a hand-edited database could), moved to La P1S after the route read it.
    const withGrams: StoredPrintJob = { ...planned, filaments: [{ spoolId: 1, grams: 5 }] };
    const stale = staleJob();
    const { call, snapshot } = setup({ jobs: stale.wrap, printJobs: [logged, withGrams] });
    expect((await call('PUT', '/api/orders/0143/jobs/2', { printerId: 3 })).status).toBe(200);
    const before = await snapshot();
    stale.readNext({ ...plannedView, filaments: [{ spoolId: 1, spool: 'PLA Blanco · Grilon3', colorHex: '#ffffff', grams: 5 }] });
    const { printerId: _p, ...noPrinter } = finish;
    expect((await call('POST', '/api/orders/0143/jobs/2/finish', noPrinter)).status).toBe(409);
    expect(await snapshot()).toEqual(before);
    expect((before.otherJobs.jobs as PrintJob[])[0]).toMatchObject({ status: 'planeada', printerId: 3, filaments: [{ spoolId: 1, grams: 5 }] });
  });

  it('still charges a printer the body names over the planned one', async () => {
    const { call, snapshot } = setup();
    expect((await call('POST', '/api/orders/0143/jobs/2/finish', { ...finish, printerId: 2 })).body.job).toMatchObject({ printerId: 2, printer: 'La Ender' });
    expect((await snapshot()).printMinutes).toEqual([[1, 7200], [2, 108540], [3, 600]]);
  });

  it('stores a failed result as fallida and still counts it', async () => {
    const { call } = setup();
    const { body } = await call('POST', '/api/orders/0143/jobs/2/finish', { ...finish, result: 'fallida' });
    expect(body.job).toMatchObject({ status: 'fallida', result: 'fallida' });
    expect(body.order).toMatchObject({ realCost: 2406 });
  });

  async function expectRejected(body: unknown, fields: Record<string, string>) {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('POST', '/api/orders/0143/jobs/2/finish', body)).toEqual({ status: 422, body: { error: INVALID, fields } });
    expect(await snapshot()).toEqual(before);
    expect((before.otherJobs.jobs as PrintJob[])[0]).toEqual(plannedView);
  }

  it('rejects a spool without enough grams, leaving the planned job and the counters unchanged', async () => {
    await expectRejected({ ...finish, filaments: [{ spoolId: 2, grams: 31 }] }, { filaments: 'A PLA Amarillo le quedan 30 g y cargaste 31 g.' });
  });

  it('rejects a printer or spool that does not exist, leaving everything unchanged', async () => {
    await expectRejected({ ...finish, printerId: 9 }, { printerId: 'Esa impresora no existe.' });
    await expectRejected({ ...finish, filaments: [{ spoolId: 7, grams: 5 }] }, { filaments: 'La bobina 7 no existe.' });
  });

  it('rejects the same body errors as logging a job, leaving everything unchanged', async () => {
    await expectRejected({ ...finish, actualMinutes: 0, labourMinutes: -1 }, {
      actualMinutes: 'Poné cuánto tardó: más de 0 minutos.', labourMinutes: 'Poné los minutos de mano de obra: un número entero desde 0.',
    });
  });

  it('changes nothing when the grams ran out after the check, as when a log races it', async () => {
    let staleReads = 0;
    const stale = (repo: SpoolRepository): SpoolRepository => ({
      ...repo,
      list: async () => {
        const all = await repo.list();
        return staleReads-- > 0 ? all.map((s) => (s.id === 1 ? { ...s, remainingGrams: 640 } : s)) : all;
      },
    });
    const { call, snapshot } = setup({ spools: stale });
    expect((await call('POST', '/api/orders/0142/jobs', { ...finish, filaments: [{ spoolId: 1, grams: 620 }] })).status).toBe(201);
    const before = await snapshot();
    staleReads = 1;
    expect(await call('POST', '/api/orders/0143/jobs/2/finish', { ...finish, filaments: [{ spoolId: 1, grams: 30 }] })).toEqual({
      status: 422, body: { error: INVALID, fields: { filaments: 'A PLA Blanco · Grilon3 le quedan 20 g y cargaste 30 g.' } },
    });
    expect(await snapshot()).toEqual(before);
  });

  it('answers 404 for a job of another order or an order that does not exist, changing nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('POST', '/api/orders/0142/jobs/2/finish', finish)).toEqual({ status: 404, body: { error: 'El pedido #0142 no tiene la impresión 2.' } });
    expect(await call('POST', '/api/orders/0999/jobs/2/finish', finish)).toEqual({ status: 404, body: { error: 'No existe el pedido #0999.' } });
    expect(await call('POST', '/api/orders/0143/jobs/2/finish', 'no es json')).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects other methods', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/orders/0143/jobs/2/finish')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });
});
