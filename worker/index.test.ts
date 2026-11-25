import { describe, expect, it } from 'vitest';
import { DEFAULT_COST_SETTINGS } from '../shared/cost-settings';
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
    expect(await get('/api/clients')).toEqual({ status: 200, body: { clients: [] } });
    expect(await get('/api/settings/costs')).toEqual({ status: 200, body: { settings: { ...DEFAULT_COST_SETTINGS, updatedAt: null } } });
  });

  it('sends quote paths to the quotes module', async () => {
    expect(await get('/api/quotes')).toEqual({ status: 200, body: { quotes: [] } });
    expect(await get('/api/quotes/1')).toEqual({ status: 404, body: { error: 'No existe el presupuesto 1.' } });
  });

  it('sends print job paths to the print jobs module', async () => {
    expect(await get('/api/orders/0142/jobs')).toEqual({ status: 404, body: { error: 'No existe el pedido #0142.' } });
  });

  it('sends service paths, and the service plan of a printer, to the service module', async () => {
    expect(await get('/api/service/tasks')).toEqual({ status: 200, body: { tasks: [] } });
    expect(await get('/api/service/logs')).toEqual({ status: 200, body: { logs: [], totals: [] } });
    expect(await get('/api/printers/1/service-plan')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });

  it('sends project paths, and the project of an order, to the projects module', async () => {
    expect(await get('/api/projects')).toEqual({ status: 200, body: { projects: [] } });
    expect(await get('/api/projects/1')).toEqual({ status: 404, body: { error: 'No existe el proyecto 1.' } });
    expect(await get('/api/orders/0142/project')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });

  it('sends the dashboard path to the dashboard module', async () => {
    const empty = { count: 0, items: [] };
    const { status, body } = await get('/api/dashboard');
    expect(status).toBe(200);
    expect(body).toEqual({
      today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown as string,
      dueToday: empty, overdue: empty, lowSpools: empty, serviceDue: empty, quotesWaiting: empty,
      month: { month: expect.stringMatching(/^\d{4}-\d{2}$/) as unknown as string, revenue: 0, deliveredCount: 0, realProfit: 0, withoutRealCost: 0 },
    });
  });

  it('sends calendar paths to the calendar module, and planned job paths to the print jobs module', async () => {
    const { status, body } = await get('/api/calendar?from=2026-11-23&to=2026-11-29');
    expect(status).toBe(200);
    expect(body).toEqual({
      from: '2026-11-23', to: '2026-11-29', today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown as string,
      orders: [], projects: [], serviceTasks: [], plannedJobs: [], events: [],
    });
    expect(await get('/api/calendar/events')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
    expect(await get('/api/calendar/events/1')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
    expect(await get('/api/orders/0142/jobs/plan')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
    expect(await get('/api/orders/0142/jobs/3/finish')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });

  it('answers 404 when no module owns the path', async () => {
    expect(await get('/api/nada')).toEqual({ status: 404, body: { error: 'Esa ruta no existe.' } });
  });
});
