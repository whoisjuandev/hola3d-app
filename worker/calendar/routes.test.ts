import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../../shared/calendar-events';
import type { Client } from '../../shared/clients';
import type { Order } from '../../shared/orders';
import { NO_JOB_COST } from '../../shared/print-jobs';
import type { Printer } from '../../shared/printers';
import { memoryTables, type StoredPrintJob, type StoredProject, type StoredServiceTask } from '../memory';
import { memoryOrderRepository } from '../orders/repository';
import { memoryPrintJobRepository } from '../print-jobs/repository';
import { memoryProjectRepository } from '../projects/repository';
import { memoryServiceRepository } from '../service/repository';
import { memoryCalendarEventRepository, type CalendarEventRepository } from './repository';
import { handleCalendar } from './routes';

const stamp = '2026-11-01T00:00:00.000Z';
const TODAY = '2026-11-25';
const cafe: Client = { id: 3, name: 'Café Nube', phone: '', instagram: '', email: '', note: '', createdAt: stamp, updatedAt: stamp };
const school: Client = { ...cafe, id: 5, name: 'Escuela N.º 12' };

const order = (overrides: Partial<Order>): Order => ({
  id: '0142', item: 'Llaveros con logo × 12', client: 'Café Nube', clientId: 3, quoteId: null, projectId: null, project: null, channel: 'Instagram',
  stage: 'imprimiendo', dueDate: '2026-11-23', dueTime: null, price: 36000, deposit: null, paid: false, material: '', note: '',
  createdAt: stamp, updatedAt: stamp, deliveredAt: null, realCost: null, realProfit: null, ...overrides,
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

const calendarEvent = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: 1, type: 'reunion', title: 'Escuela: ver muestras', date: '2026-11-26', time: '10:30', note: 'Llevar llaveros', done: false,
  createdAt: stamp, updatedAt: stamp, ...overrides,
});
const events = [
  calendarEvent({}),
  calendarEvent({ id: 2, type: 'recordatorio', title: 'Pagar la luz', date: '2026-11-23', time: null, note: '', done: true }),
  calendarEvent({ id: 3, type: 'tarea', title: 'Pedir PETG', date: '2026-11-30', time: null, note: '' }), // after the week
];

function setup(options: { events?: (repo: CalendarEventRepository) => CalendarEventRepository } = {}) {
  const tables = memoryTables([cafe, school], orders, [], {
    printers: [a1],
    projects: [kit],
    serviceTasks: [bed, nozzle],
    printJobs: [plannedJob({}), plannedJob({ id: 7, plannedStart: '2026-11-30T09:00' })],
    calendarEvents: events,
  });
  const eventRepo = memoryCalendarEventRepository(tables);
  const deps = {
    orders: memoryOrderRepository(tables),
    projects: memoryProjectRepository(tables),
    service: memoryServiceRepository(tables),
    jobs: memoryPrintJobRepository(tables),
    events: options.events ? options.events(eventRepo) : eventRepo,
    today: () => TODAY,
  };
  const call = async (method: string, path: string, body?: unknown) => {
    const url = new URL(`https://app.test${path}`);
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const res = await handleCalendar(new Request(url, { method, body: payload, headers: { 'Content-Type': 'application/json' } }), url, deps);
    if (!res) throw new Error('route not handled');
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  /** Every stored event, read through the API: the month around the fixtures. */
  const stored = async () => (await call('GET', '/api/calendar?from=2026-10-26&to=2026-12-06')).body.events;
  return { call, deps, stored, eventRepo };
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
        events: [events[1], events[0]],
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
    expect((body.events as { id: number }[]).map((e) => e.id)).toEqual([3]);
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

const INVALID_EVENT = 'Revisá los datos del evento.';
const created = { createdAt: expect.any(String), updatedAt: expect.any(String) };

describe('POST /api/calendar/events', () => {
  it('creates an event, not done, and the calendar lists it on its day', async () => {
    const { call } = setup();
    const { status, body } = await call('POST', '/api/calendar/events', { type: 'retiro', title: '  Retira Sofía ', date: '2026-11-27', time: '17:00', note: ' Mate ' });
    expect(status).toBe(201);
    expect(body).toEqual({ event: { id: 4, type: 'retiro', title: 'Retira Sofía', date: '2026-11-27', time: '17:00', note: 'Mate', done: false, ...created } });
    const week = (await call('GET', '/api/calendar?from=2026-11-23&to=2026-11-29')).body;
    expect((week.events as { id: number }[]).map((e) => e.id)).toEqual([2, 1, 4]);
  });

  it('creates an untimed event without a note, done when asked', async () => {
    const { call } = setup();
    const { status, body } = await call('POST', '/api/calendar/events', { type: 'tarea', title: 'Pedir filamento', date: '2026-11-28', time: '', done: true });
    expect(status).toBe(201);
    expect(body.event).toEqual({ id: 4, type: 'tarea', title: 'Pedir filamento', date: '2026-11-28', time: null, note: '', done: true, ...created });
  });

  it('rejects invalid data with 422 naming each field, storing nothing', async () => {
    const { call, stored } = setup();
    const before = await stored();
    expect(await call('POST', '/api/calendar/events', { type: 'fiesta', title: '', date: '27/11/2026', time: '7 pm', note: 'x'.repeat(1001), done: 'no' })).toEqual({
      status: 422,
      body: {
        error: INVALID_EVENT,
        fields: {
          type: 'Elegí el tipo: entrega, retiro, reunión, tarea o recordatorio.', title: 'Completá este dato.', date: 'La fecha tiene que ser AAAA-MM-DD.',
          time: 'La hora tiene que ser HH:MM.', note: 'Máximo 1000 caracteres.', done: 'Marcalo como hecho o no hecho: true o false.',
        },
      },
    });
    expect(await call('POST', '/api/calendar/events', { type: 'tarea', title: 'x'.repeat(121), date: '2026-11-28' }))
      .toEqual({ status: 422, body: { error: INVALID_EVENT, fields: { title: 'Máximo 120 caracteres.' } } });
    expect(await stored()).toEqual(before);
  });

  it('rejects a body that is not JSON with 400, storing nothing', async () => {
    const { call, stored } = setup();
    const before = await stored();
    expect(await call('POST', '/api/calendar/events', '{nope')).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    expect(await stored()).toEqual(before);
  });

  it('rejects other methods', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/calendar/events')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });
});

describe('PUT /api/calendar/events/:id', () => {
  it('marks an event done and not done again, keeping the rest', async () => {
    const { call } = setup();
    const done = await call('PUT', '/api/calendar/events/1', { done: true });
    expect(done).toEqual({ status: 200, body: { event: { ...events[0], done: true, updatedAt: expect.any(String) } } });
    expect((done.body.event as CalendarEvent).updatedAt).not.toBe(stamp);
    expect((await call('PUT', '/api/calendar/events/1', { done: false })).body.event).toEqual({ ...events[0], updatedAt: expect.any(String) });
  });

  it('edits the fields sent and clears the time and note with null or empty', async () => {
    const { call, stored } = setup();
    const { status, body } = await call('PUT', '/api/calendar/events/1', { type: 'entrega', title: ' Entregar muestras ', date: '2026-11-27', time: null, note: '' });
    expect(status).toBe(200);
    const edited = { ...events[0], type: 'entrega', title: 'Entregar muestras', date: '2026-11-27', time: null, note: '', updatedAt: expect.any(String) };
    expect(body.event).toEqual(edited);
    expect(await stored()).toEqual([events[1], edited, events[2]]);
  });

  it('writes only the fields the request sent, so another edit made meanwhile stays', async () => {
    const { call } = setup({
      events: (repo) => ({
        ...repo,
        // Another request renames the event between this request's read and its write.
        async update(id, changes) {
          await repo.update(id, { title: 'Renombrado por otro' });
          return repo.update(id, changes);
        },
      }),
    });
    const { body } = await call('PUT', '/api/calendar/events/1', { done: true });
    expect(body.event).toEqual({ ...events[0], title: 'Renombrado por otro', done: true, updatedAt: expect.any(String) });
  });

  it('rejects invalid data with 422, changing nothing', async () => {
    const { call, stored } = setup();
    const before = await stored();
    expect(await call('PUT', '/api/calendar/events/1', { title: ' ', time: '10', type: 'Reunión', done: 1 })).toEqual({
      status: 422,
      body: {
        error: INVALID_EVENT,
        fields: {
          type: 'Elegí el tipo: entrega, retiro, reunión, tarea o recordatorio.', title: 'Completá este dato.', time: 'La hora tiene que ser HH:MM.',
          done: 'Marcalo como hecho o no hecho: true o false.',
        },
      },
    });
    expect(await call('PUT', '/api/calendar/events/1', { date: null })).toEqual({
      status: 422, body: { error: INVALID_EVENT, fields: { date: 'La fecha tiene que ser AAAA-MM-DD.' } },
    });
    expect(await stored()).toEqual(before);
  });

  it('rejects a body that is not a JSON object with 400, changing nothing', async () => {
    const { call, stored } = setup();
    const before = await stored();
    expect(await call('PUT', '/api/calendar/events/1', '[1]')).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    expect(await call('PUT', '/api/calendar/events/1', 'nope')).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    expect(await stored()).toEqual(before);
  });

  it('answers 404 for an event that does not exist, or was deleted before the write', async () => {
    const { call, stored } = setup({
      events: (repo) => ({
        ...repo,
        async update(id, changes) {
          await repo.delete(id);
          return repo.update(id, changes);
        },
      }),
    });
    expect(await call('PUT', '/api/calendar/events/9', { done: true })).toEqual({ status: 404, body: { error: 'No existe el evento 9.' } });
    expect(await call('PUT', '/api/calendar/events/1', { done: true })).toEqual({ status: 404, body: { error: 'No existe el evento 1.' } });
    expect(await stored()).toEqual([events[1], events[2]]);
  });
});

describe('DELETE /api/calendar/events/:id', () => {
  it('deletes the event and answers it; the calendar no longer lists it', async () => {
    const { call, stored } = setup();
    expect(await call('DELETE', '/api/calendar/events/1')).toEqual({ status: 200, body: { event: events[0] } });
    expect(await stored()).toEqual([events[1], events[2]]);
  });

  it('answers 404 for an event that does not exist, deleting nothing', async () => {
    const { call, stored } = setup();
    await call('DELETE', '/api/calendar/events/1');
    const before = await stored();
    expect(await call('DELETE', '/api/calendar/events/1')).toEqual({ status: 404, body: { error: 'No existe el evento 1.' } });
    expect(await stored()).toEqual(before);
  });

  it('gives a new event a new id, never a deleted one', async () => {
    const { call } = setup();
    await call('DELETE', '/api/calendar/events/3');
    expect((await call('POST', '/api/calendar/events', { type: 'tarea', title: 'x', date: '2026-11-28' })).body.event).toMatchObject({ id: 4 });
  });

  it('rejects other methods on an event', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/calendar/events/1')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
    expect(await call('POST', '/api/calendar/events/1', {})).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });

  it('leaves other event paths to the caller', async () => {
    const { deps } = setup();
    for (const path of ['/api/calendar/events/x', '/api/calendar/events/1/done', '/api/calendar/eventos']) {
      const url = new URL(`https://app.test${path}`);
      expect(await handleCalendar(new Request(url, { method: 'PUT' }), url, deps)).toBeNull();
    }
  });
});
