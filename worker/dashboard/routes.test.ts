import { describe, expect, it } from 'vitest';
import type { Client } from '../../shared/clients';
import { DASHBOARD_LIST_LIMIT } from '../../shared/dashboard';
import type { Order } from '../../shared/orders';
import type { Printer } from '../../shared/printers';
import type { Quote } from '../../shared/quotes';
import type { Spool } from '../../shared/spools';
import { memoryTables, type StoredServiceTask } from '../memory';
import { memoryOrderRepository } from '../orders/repository';
import { memoryQuoteRepository } from '../quotes/repository';
import { memoryServiceRepository } from '../service/repository';
import { memorySpoolRepository } from '../spools/repository';
import { handleDashboard } from './routes';

const stamp = '2026-11-01T00:00:00.000Z';
const TODAY = '2026-11-25';
const cafe: Client = { id: 3, name: 'Café Nube', phone: '', instagram: '', email: '', note: '', createdAt: stamp, updatedAt: stamp };
const bruno: Client = { ...cafe, id: 8, name: 'Bruno A.' };

const order = (overrides: Partial<Order>): Order => ({
  id: '0142', item: 'Llaveros con logo × 12', client: 'Café Nube', clientId: 3, quoteId: null, projectId: null, project: null, channel: 'Instagram',
  stage: 'imprimiendo', dueDate: '2026-11-23', dueTime: null, price: 36000, deposit: null, paid: false, material: '', note: '',
  createdAt: stamp, updatedAt: stamp, deliveredAt: null, realCost: null, realProfit: null, ...overrides,
});
const a1: Printer = {
  id: 1, name: 'La A1', model: '', purchasePrice: 720000, lifetimeHours: 5000, powerWatts: 95, printMinutes: 74100, status: 'activa',
  note: '', createdAt: stamp, updatedAt: stamp,
};
const bed: StoredServiceTask = {
  id: 4, printerId: 1, name: 'Limpiar la cama PEI', intervalHours: null, intervalDays: 30, lastDoneMinutes: 70800, lastDoneDate: '2026-10-20',
  active: true, createdAt: stamp, updatedAt: stamp,
};
const lavender: Spool = {
  id: 3, material: 'PLA', colorName: 'Lavanda', colorHex: '#b9a6e8', brand: 'Printalot', netGrams: 1000, remainingGrams: 120, price: 23500,
  lowStockGrams: 150, note: '', createdAt: stamp, updatedAt: stamp,
};
const helmet: Quote = {
  id: 2, number: 'P-0002', clientId: 8, client: 'Bruno A.', title: 'Casco de cosplay', status: 'enviado', validUntil: '2026-12-06',
  input: { lines: [] }, result: {} as Quote['result'], total: 124900, note: '', createdAt: stamp, updatedAt: stamp,
};

function setup(orders: Order[], spools: Spool[] = [lavender]) {
  const tables = memoryTables([cafe, bruno], orders, [helmet], { printers: [a1], spools, serviceTasks: [bed] });
  const deps = {
    orders: memoryOrderRepository(tables),
    spools: memorySpoolRepository(tables),
    service: memoryServiceRepository(tables),
    quotes: memoryQuoteRepository(tables),
    today: () => TODAY,
  };
  const call = async (method: string, path: string) => {
    const url = new URL(`https://app.test${path}`);
    const res = await handleDashboard(new Request(url, { method }), url, deps);
    if (!res) throw new Error('route not handled');
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  return { call, deps };
}

describe('GET /api/dashboard', () => {
  it('answers what is due today, late, low and waiting, and the month in money', async () => {
    const delivered = order({ id: '0140', item: 'Figura articulada dragón', price: 18000, dueDate: '2026-11-17', stage: 'entregado', deliveredAt: '2026-11-17T12:00:00.000Z' });
    const dueToday = order({ id: '0145', item: 'Soporte de auriculares', price: 14500, dueDate: TODAY, stage: 'nuevo' });
    const { call } = setup([order({}), delivered, dueToday]);
    const brief = (o: Order, daysLate: number) => ({
      id: o.id, item: o.item, client: o.client, clientId: o.clientId, project: o.project, stage: o.stage, dueDate: o.dueDate, dueTime: o.dueTime,
      price: o.price, daysLate,
    });
    expect(await call('GET', '/api/dashboard')).toEqual({
      status: 200,
      body: {
        today: TODAY,
        dueToday: { count: 1, items: [brief(dueToday, 0)] },
        overdue: { count: 1, items: [brief(order({}), 2)] },
        lowSpools: {
          count: 1,
          items: [{ id: 3, material: 'PLA', colorName: 'Lavanda', colorHex: '#b9a6e8', brand: 'Printalot', remainingGrams: 120, netGrams: 1000, lowStockGrams: 150, share: 0.12 }],
        },
        serviceDue: {
          count: 1,
          items: [{
            id: 4, name: 'Limpiar la cama PEI', printerId: 1, printer: 'La A1',
            state: { due: true, dueByHours: false, dueByDays: true, minutesLeft: null, daysLeft: -6, progress: 1.2 },
          }],
        },
        quotesWaiting: {
          count: 1,
          items: [{ id: 2, number: 'P-0002', clientId: 8, client: 'Bruno A.', title: 'Casco de cosplay', total: 124900, validUntil: '2026-12-06', expired: false }],
        },
        month: { month: '2026-11', revenue: 18000, deliveredCount: 1, realProfit: 0, withoutRealCost: 1 },
      },
    });
  });

  it(`caps each list at ${DASHBOARD_LIST_LIMIT} items, with the full count next to them`, async () => {
    const late = Array.from({ length: DASHBOARD_LIST_LIMIT + 3 }, (_, i) => order({ id: `01${50 + i}`, dueDate: `2026-11-${String(10 + i).padStart(2, '0')}` }));
    const { body } = await setup(late).call('GET', '/api/dashboard');
    const overdue = body.overdue as { count: number; items: { id: string }[] };
    expect(overdue.count).toBe(DASHBOARD_LIST_LIMIT + 3);
    expect(overdue.items.map((o) => o.id)).toEqual(late.slice(0, DASHBOARD_LIST_LIMIT).map((o) => o.id));
  });

  it('changes nothing it reads', async () => {
    const { call, deps } = setup([order({})]);
    const before = { orders: await deps.orders.list(), spools: await deps.spools.list(), tasks: await deps.service.listTasks(), quotes: await deps.quotes.list() };
    await call('GET', '/api/dashboard');
    expect({ orders: await deps.orders.list(), spools: await deps.spools.list(), tasks: await deps.service.listTasks(), quotes: await deps.quotes.list() })
      .toEqual(before);
  });

  it('answers 405 to any other method', async () => {
    const { call } = setup([]);
    expect(await call('POST', '/api/dashboard')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });

  it('leaves other paths to the caller', async () => {
    const { deps } = setup([]);
    const url = new URL('https://app.test/api/dashboards');
    expect(await handleDashboard(new Request(url), url, deps)).toBeNull();
  });
});
