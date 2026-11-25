import { describe, expect, it } from 'vitest';
import { dashboardData, type DashboardSources } from './dashboard';
import type { Order } from './orders';
import type { Quote } from './quotes';
import type { ServiceTask } from './service';
import type { Spool } from './spools';

const TODAY = '2026-11-25';
const stamp = '2026-11-01T00:00:00.000Z';

const order = (overrides: Partial<Order>): Order => ({
  id: '0142', item: 'Llaveros con logo × 12', client: 'Café Nube', clientId: 3, quoteId: null, projectId: null, project: null, channel: 'Instagram',
  stage: 'imprimiendo', dueDate: null, dueTime: null, price: 36000, deposit: null, paid: false, material: '', note: '',
  createdAt: stamp, updatedAt: stamp, deliveredAt: null, realCost: null, realProfit: null, ...overrides,
});

const spool = (overrides: Partial<Spool>): Spool => ({
  id: 1, material: 'PLA', colorName: 'Blanco', colorHex: '#ffffff', brand: 'Grilon3', netGrams: 1000, remainingGrams: 640, price: 21000,
  lowStockGrams: 150, note: '', createdAt: stamp, updatedAt: stamp, ...overrides,
});

const task = (overrides: Partial<ServiceTask>): ServiceTask => ({
  id: 1, printerId: 1, printer: 'La A1', printerMinutes: 74100, name: 'Limpiar boquilla', intervalHours: 100, intervalDays: null,
  lastDoneMinutes: 68400, lastDoneDate: '2026-11-10', active: true, createdAt: stamp, updatedAt: stamp, ...overrides,
});

const quote = (overrides: Partial<Quote>): Quote => ({
  id: 2, number: 'P-0002', clientId: 8, client: 'Bruno A.', title: 'Casco de cosplay', status: 'enviado', validUntil: '2026-12-06',
  input: { lines: [] }, result: {} as Quote['result'], total: 124900, note: '', createdAt: stamp, updatedAt: stamp, ...overrides,
});

const sources = (overrides: Partial<DashboardSources>): DashboardSources => ({ orders: [], spools: [], tasks: [], quotes: [], ...overrides });

const brief = (o: Order, daysLate: number) => ({
  id: o.id, item: o.item, client: o.client, clientId: o.clientId, project: o.project, stage: o.stage, dueDate: o.dueDate, dueTime: o.dueTime,
  price: o.price, daysLate,
});

describe('dashboardData: orders due today', () => {
  it('lists the orders due today that are not delivered, by time with untimed ones last', async () => {
    const noTime = order({ id: '0145', dueDate: TODAY });
    const at10 = order({ id: '0150', dueDate: TODAY, dueTime: '10:00' });
    const at09 = order({ id: '0151', dueDate: TODAY, dueTime: '09:00', stage: 'listo' });
    const delivered = order({ id: '0152', dueDate: TODAY, stage: 'entregado', deliveredAt: '2026-11-25T12:00:00.000Z' });
    const tomorrow = order({ id: '0153', dueDate: '2026-11-26' });
    const undated = order({ id: '0154' });
    const data = dashboardData(sources({ orders: [noTime, at10, delivered, tomorrow, undated, at09] }), TODAY);
    expect(data.today).toBe(TODAY);
    expect(data.dueToday).toEqual({ count: 3, items: [brief(at09, 0), brief(at10, 0), brief(noTime, 0)] });
  });
});

describe('dashboardData: overdue orders', () => {
  it('lists the orders not delivered whose due date is before today, oldest first, with the days late', async () => {
    const dueToday = order({ id: '0145', dueDate: TODAY });
    const late2 = order({ id: '0142', dueDate: '2026-11-23' });
    const late5 = order({ id: '0143', dueDate: '2026-11-20', dueTime: '10:00', stage: 'listo' });
    const late4 = order({ id: '0141', dueDate: '2026-11-21' });
    const deliveredLate = order({ id: '0140', dueDate: '2026-11-17', stage: 'entregado', deliveredAt: '2026-11-17T12:00:00.000Z' });
    const data = dashboardData(sources({ orders: [dueToday, late2, late5, deliveredLate, late4] }), TODAY);
    expect(data.overdue).toEqual({ count: 3, items: [brief(late5, 5), brief(late4, 4), brief(late2, 2)] });
    // An order due today is due, not late; a delivered order is in neither list.
    expect(data.dueToday.items.map((o) => o.id)).toEqual(['0145']);
  });
});

describe('dashboardData: low spools', () => {
  it('lists the spools at or below their threshold, the lowest share remaining first', async () => {
    const atThreshold = spool({ id: 3, colorName: 'Lavanda', remainingGrams: 150, lowStockGrams: 150 }); // 15 %
    const above = spool({ id: 4, colorName: 'Celeste', remainingGrams: 151, lowStockGrams: 150 });
    const small = spool({ id: 6, colorName: 'Dorado silk', netGrams: 500, remainingGrams: 90, lowStockGrams: 100 }); // 18 %
    const empty = spool({ id: 9, colorName: 'Rojo', remainingGrams: 0 });
    const data = dashboardData(sources({ spools: [atThreshold, above, small, empty] }), TODAY);
    const item = (s: Spool) => ({
      id: s.id, material: s.material, colorName: s.colorName, colorHex: s.colorHex, brand: s.brand, remainingGrams: s.remainingGrams,
      netGrams: s.netGrams, lowStockGrams: s.lowStockGrams, share: s.remainingGrams / s.netGrams,
    });
    expect(data.lowSpools).toEqual({ count: 3, items: [item(empty), item(atThreshold), item(small)] });
  });
});

describe('dashboardData: service tasks due', () => {
  it('lists only the active tasks that are due, the most overdue first, with their state', async () => {
    const nearlyDue = task({ id: 1 }); // 95 h of 100
    const dueByHours = task({ id: 2, name: 'Lubricar varillas', intervalHours: 200, lastDoneMinutes: 61200, lastDoneDate: '2026-09-15' }); // 215 h of 200
    const dueByDays = task({ id: 4, name: 'Limpiar la cama PEI', intervalHours: null, intervalDays: 30, lastDoneDate: '2026-10-20' }); // 36 days of 30
    const inactive = task({ id: 8, name: 'Vieja', intervalHours: 10, active: false });
    const data = dashboardData(sources({ tasks: [nearlyDue, dueByHours, dueByDays, inactive] }), TODAY);
    expect(data.serviceDue.count).toBe(2);
    expect(data.serviceDue.items.map((t) => t.id)).toEqual([4, 2]);
    expect(data.serviceDue.items[0]).toEqual({
      id: 4, name: 'Limpiar la cama PEI', printerId: 1, printer: 'La A1',
      state: { due: true, dueByHours: false, dueByDays: true, minutesLeft: null, daysLeft: -6, progress: 36 / 30 },
    });
    expect(data.serviceDue.items[1].state).toMatchObject({ due: true, dueByHours: true, minutesLeft: -900 });
  });
});

describe('dashboardData: quotes waiting for an answer', () => {
  it('lists the sent quotes by validity date, flagging the ones past it', async () => {
    const valid = quote({ id: 2 });
    const lastDay = quote({ id: 4, number: 'P-0004', validUntil: TODAY });
    const expired = quote({ id: 5, number: 'P-0005', validUntil: '2026-11-24' });
    const draft = quote({ id: 3, status: 'borrador' });
    const accepted = quote({ id: 1, status: 'aceptado' });
    const rejected = quote({ id: 6, status: 'rechazado' });
    const data = dashboardData(sources({ quotes: [valid, lastDay, draft, accepted, expired, rejected] }), TODAY);
    const item = (q: Quote, isExpired: boolean) => ({
      id: q.id, number: q.number, clientId: q.clientId, client: q.client, title: q.title, total: q.total, validUntil: q.validUntil, expired: isExpired,
    });
    expect(data.quotesWaiting).toEqual({ count: 3, items: [item(expired, true), item(lastDay, false), item(valid, false)] });
  });
});

describe('dashboardData: this month', () => {
  it('adds the prices of the orders delivered this month and the real profit of those with a real cost', async () => {
    const withCost = order({ id: '0140', price: 18000, stage: 'entregado', deliveredAt: '2026-11-17T12:00:00.000Z', realCost: 16650, realProfit: 1350 });
    const noCost = order({ id: '0147', price: 9000, stage: 'entregado', deliveredAt: '2026-11-03T15:00:00.000Z' });
    const lastMonth = order({ id: '0130', price: 50000, stage: 'entregado', deliveredAt: '2026-10-31T12:00:00.000Z', realCost: 1000, realProfit: 49000 });
    const notDelivered = order({ id: '0142', price: 36000, realCost: 7228, realProfit: 28772 });
    const data = dashboardData(sources({ orders: [withCost, noCost, lastMonth, notDelivered] }), TODAY);
    expect(data.month).toEqual({ month: '2026-11', revenue: 27000, deliveredCount: 2, realProfit: 1350, withoutRealCost: 1 });
  });

  it('reads the delivery on the workshop clock, so a delivery late on the last evening of a month counts in that month', async () => {
    // 2026-12-01T02:30Z is 30 November, 23:30 in Buenos Aires; 03:00Z is 1 December, 00:00.
    const lastEvening = order({ id: '0160', price: 10000, stage: 'entregado', deliveredAt: '2026-12-01T02:30:00.000Z', realCost: 4000, realProfit: 6000 });
    const firstMinute = order({ id: '0161', price: 7000, stage: 'entregado', deliveredAt: '2026-12-01T03:00:00.000Z', realCost: 2000, realProfit: 5000 });
    expect(dashboardData(sources({ orders: [lastEvening, firstMinute] }), '2026-11-30').month)
      .toEqual({ month: '2026-11', revenue: 10000, deliveredCount: 1, realProfit: 6000, withoutRealCost: 0 });
    expect(dashboardData(sources({ orders: [lastEvening, firstMinute] }), '2026-12-01').month)
      .toEqual({ month: '2026-12', revenue: 7000, deliveredCount: 1, realProfit: 5000, withoutRealCost: 0 });
  });

  it('is all zero in a month with nothing delivered', async () => {
    expect(dashboardData(sources({}), TODAY).month).toEqual({ month: '2026-11', revenue: 0, deliveredCount: 0, realProfit: 0, withoutRealCost: 0 });
  });
});

describe('dashboardData: list size', () => {
  it('keeps the first items of each list up to the limit, with the full count next to them', async () => {
    const late = Array.from({ length: 7 }, (_, i) => order({ id: `01${50 + i}`, dueDate: `2026-11-${String(10 + i).padStart(2, '0')}` }));
    const low = Array.from({ length: 4 }, (_, i) => spool({ id: i + 1, remainingGrams: 10 * (i + 1) }));
    const data = dashboardData(sources({ orders: late, spools: low }), TODAY, 3);
    expect(data.overdue.count).toBe(7);
    expect(data.overdue.items.map((o) => o.id)).toEqual(['0150', '0151', '0152']);
    expect(data.lowSpools.count).toBe(4);
    expect(data.lowSpools.items.map((s) => s.id)).toEqual([1, 2, 3]);
  });
});
