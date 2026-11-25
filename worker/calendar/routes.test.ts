import { describe, expect, it } from 'vitest';
import type { Client } from '../../shared/clients';
import type { Order } from '../../shared/orders';
import { NO_JOB_COST } from '../../shared/print-jobs';
import type { Printer } from '../../shared/printers';
import { memoryTables, type StoredPrintJob, type StoredProject, type StoredServiceTask } from '../memory';
import { memoryOrderRepository } from '../orders/repository';
import { memoryPrintJobRepository } from '../print-jobs/repository';
import { memoryProjectRepository } from '../projects/repository';
import { memoryServiceRepository } from '../service/repository';
import { handleCalendar } from './routes';

const stamp = '2026-11-01T00:00:00.000Z';
const TODAY = '2026-11-25';
const cafe: Client = { id: 3, name: 'Café Nube', phone: '', instagram: '', email: '', note: '', createdAt: stamp, updatedAt: stamp };
const school: Client = { ...cafe, id: 5, name: 'Escuela N.º 12' };

const order = (overrides: Partial<Order>): Order => ({
  id: '0142', item: 'Llaveros con logo × 12', client: 'Café Nube', clientId: 3, quoteId: null, projectId: null, project: null, channel: 'Instagram',
  stage: 'imprimiendo', dueDate: '2026-11-23', dueTime: null, price: 36000, deposit: null, paid: false, material: '', note: '',
  createdAt: stamp, updatedAt: stamp, realCost: null, realProfit: null, ...overrides,
});
const orders = [
  order({}),
  order({ id: '0144', item: 'Piezas de robótica × 30', client: 'Escuela N.º 12', clientId: 5, dueDate: '2026-11-27', projectId: 1, project: 'Kit robótica' }),
  order({ id: '0141', dueDate: '2026-11-21' }), // before the week
];
const kit: StoredProject = { id: 1, name: 'Kit robótica', clientId: 5, status: 'activo', dueDate: '2026-11-29', note: '', createdAt: stamp, updatedAt: stamp };
const a1: Printer = {
  id: 1, name: 'La A1', model: '', purchasePrice: 720000, lifetimeHours: 5000, powerWatts: 95, printMinutes: 74100, status: 'activa',
  note: '', createdAt: stamp, updatedAt: stamp,
};
const bed: StoredServiceTask = {
  id: 4, printerId: 1, name: 'Limpiar la cama PEI', intervalHours: null, intervalDays: 30, lastDoneMinutes: 70800, lastDoneDate: '2026-10-27',
  active: true, createdAt: stamp, updatedAt: stamp,
};
const nozzle: StoredServiceTask = { ...bed, id: 1, name: 'Limpiar boquilla', intervalHours: 100, intervalDays: null };
const plannedJob = (overrides: Partial<StoredPrintJob>): StoredPrintJob => ({
  id: 6, orderId: '0144', printerId: 1, status: 'planeada', result: null, plannedStart: '2026-11-26T09:00', estimatedMinutes: 480, actualMinutes: null,
  labourMinutes: 0, extraCost: 0, cost: NO_JOB_COST, note: 'Primera mitad', filaments: [], createdAt: stamp, updatedAt: stamp, ...overrides,
});

function setup() {
  const tables = memoryTables([cafe, school], orders, [], {
    printers: [a1],
    projects: [kit],
    serviceTasks: [bed, nozzle],
    printJobs: [plannedJob({}), plannedJob({ id: 7, plannedStart: '2026-11-30T09:00' })],
  });
  const deps = {
    orders: memoryOrderRepository(tables),
    projects: memoryProjectRepository(tables),
    service: memoryServiceRepository(tables),
    jobs: memoryPrintJobRepository(tables),
    today: () => TODAY,
  };
  const call = async (method: string, path: string) => {
    const url = new URL(`https://app.test${path}`);
    const res = await handleCalendar(new Request(url, { method }), url, deps);
    if (!res) throw new Error('route not handled');
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  return { call, deps };
}

describe('GET /api/calendar', () => {
  it('answers the due orders, projects, service tasks by date and planned jobs of the range', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/calendar?from=2026-11-23&to=2026-11-29')).toEqual({
      status: 200,
      body: {
        from: '2026-11-23', to: '2026-11-29', today: TODAY,
        orders: [
          {
            id: '0142', item: 'Llaveros con logo × 12', client: 'Café Nube', clientId: 3, stage: 'imprimiendo', dueDate: '2026-11-23', dueTime: null,
            projectId: null, project: null, overdue: true,
          },
          {
            id: '0144', item: 'Piezas de robótica × 30', client: 'Escuela N.º 12', clientId: 5, stage: 'imprimiendo', dueDate: '2026-11-27', dueTime: null,
            projectId: 1, project: 'Kit robótica', overdue: false,
          },
        ],
        projects: [{ id: 1, name: 'Kit robótica', client: 'Escuela N.º 12', clientId: 5, status: 'activo', dueDate: '2026-11-29', overdue: false }],
        serviceTasks: [{ id: 4, name: 'Limpiar la cama PEI', printerId: 1, printer: 'La A1', dueDate: '2026-11-26', overdue: false }],
        plannedJobs: [
          {
            id: 6, orderId: '0144', item: 'Piezas de robótica × 30', client: 'Escuela N.º 12', printerId: 1, printer: 'La A1',
            start: '2026-11-26T09:00', end: '2026-11-26T17:00', estimatedMinutes: 480, note: 'Primera mitad',
          },
        ],
      },
    });
  });

  it('includes both edge days', async () => {
    const { call } = setup();
    const { body } = await call('GET', '/api/calendar?from=2026-11-27&to=2026-11-30');
    expect((body.orders as { id: string }[]).map((o) => o.id)).toEqual(['0144']);
    expect((body.plannedJobs as { id: number }[]).map((j) => j.id)).toEqual([7]);
    expect(body.projects).toHaveLength(1);
    expect(body.serviceTasks).toEqual([]);
  });

  it('rejects a missing, wrong or too long range with 422', async () => {
    const { call } = setup();
    const invalid = (fields: Record<string, string>) => ({ status: 422, body: { error: 'Revisá las fechas del calendario.', fields } });
    expect(await call('GET', '/api/calendar')).toEqual(invalid({ from: 'La fecha tiene que ser AAAA-MM-DD.', to: 'La fecha tiene que ser AAAA-MM-DD.' }));
    expect(await call('GET', '/api/calendar?from=2026-11-29&to=2026-11-23')).toEqual(invalid({ to: 'La fecha final no puede ser anterior a la inicial.' }));
    expect(await call('GET', '/api/calendar?from=2026-01-01&to=2026-12-31')).toEqual(invalid({ to: 'Pedí hasta 92 días por vez.' }));
  });

  it('rejects other methods', async () => {
    const { call } = setup();
    expect(await call('POST', '/api/calendar?from=2026-11-23&to=2026-11-29')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });

  it('leaves other paths to the caller', async () => {
    const { deps } = setup();
    const url = new URL('https://app.test/api/calendario');
    expect(await handleCalendar(new Request(url), url, deps)).toBeNull();
  });
});
