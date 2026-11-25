import { describe, expect, it } from 'vitest';
import {
  addDays, addMinutes, calendarData, isLocalDateTime, localMinutes, planProblems, serviceDueDate, spanEnd, spanInRange, spansOverlap,
  validateCalendarRange, validatePlannedJob, weekStart, type PlannedSlot,
} from './calendar';
import type { Order } from './orders';
import type { Printer } from './printers';
import type { Project } from './projects';
import type { ServiceTask } from './service';

const stamp = '2026-11-01T00:00:00.000Z';

describe('dates', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-11-25', 1)).toBe('2026-11-26');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-11-25', 0)).toBe('2026-11-25');
  });

  it('starts a week on Monday', () => {
    expect(weekStart('2026-11-25')).toBe('2026-11-23'); // Wednesday
    expect(weekStart('2026-11-23')).toBe('2026-11-23'); // Monday
    expect(weekStart('2026-11-29')).toBe('2026-11-23'); // Sunday
    expect(weekStart('2026-12-01')).toBe('2026-11-30');
  });

  it('reads a local date and time as YYYY-MM-DDTHH:MM, and only a real one', () => {
    expect(isLocalDateTime('2026-11-25T14:00')).toBe(true);
    expect(isLocalDateTime('2026-11-25T00:00')).toBe(true);
    expect(isLocalDateTime('2026-11-25T23:59')).toBe(true);
    expect(isLocalDateTime('2026-11-25T24:00')).toBe(false);
    expect(isLocalDateTime('2026-11-25T14:60')).toBe(false);
    expect(isLocalDateTime('2026-02-30T10:00')).toBe(false);
    expect(isLocalDateTime('2026-11-25 14:00')).toBe(false);
    expect(isLocalDateTime('2026-11-25T14:00:00')).toBe(false);
    expect(isLocalDateTime('2026-11-25')).toBe(false);
    expect(isLocalDateTime(202611251400)).toBe(false);
  });

  it('adds minutes to a local date and time, across midnight', () => {
    expect(addMinutes('2026-11-25T14:00', 160)).toBe('2026-11-25T16:40');
    expect(addMinutes('2026-11-25T22:30', 180)).toBe('2026-11-26T01:30');
    expect(addMinutes('2026-11-30T23:00', 60)).toBe('2026-12-01T00:00');
    expect(localMinutes('2026-11-25T01:30') - localMinutes('2026-11-25T00:00')).toBe(90);
    expect(spanEnd({ start: '2026-11-25T08:00', minutes: 300 })).toBe('2026-11-25T13:00');
  });
});

describe('spansOverlap', () => {
  const morning = { start: '2026-11-25T08:00', minutes: 300 }; // 08:00 to 13:00

  it('is true when one job starts before the other ends', () => {
    expect(spansOverlap(morning, { start: '2026-11-25T12:59', minutes: 60 })).toBe(true);
    expect(spansOverlap(morning, { start: '2026-11-25T07:00', minutes: 61 })).toBe(true);
    expect(spansOverlap(morning, { start: '2026-11-25T09:00', minutes: 30 })).toBe(true); // inside
    expect(spansOverlap(morning, { start: '2026-11-25T06:00', minutes: 600 })).toBe(true); // around
    expect(spansOverlap(morning, morning)).toBe(true);
  });

  it('is false for jobs back to back or apart', () => {
    expect(spansOverlap(morning, { start: '2026-11-25T13:00', minutes: 60 })).toBe(false);
    expect(spansOverlap(morning, { start: '2026-11-25T07:00', minutes: 60 })).toBe(false);
    expect(spansOverlap(morning, { start: '2026-11-26T08:00', minutes: 300 })).toBe(false);
  });

  it('counts a job that runs past midnight into the next day', () => {
    const overnight = { start: '2026-11-25T22:00', minutes: 600 }; // to 08:00 next day
    expect(spansOverlap(overnight, { start: '2026-11-26T07:30', minutes: 60 })).toBe(true);
    expect(spansOverlap(overnight, { start: '2026-11-26T08:00', minutes: 60 })).toBe(false);
  });
});

describe('validateCalendarRange', () => {
  it('takes two dates, both edges included', () => {
    expect(validateCalendarRange('2026-11-23', '2026-11-29')).toEqual({ ok: true, value: { from: '2026-11-23', to: '2026-11-29' } });
    expect(validateCalendarRange('2026-11-25', '2026-11-25')).toEqual({ ok: true, value: { from: '2026-11-25', to: '2026-11-25' } });
  });

  it('accepts up to 92 days and refuses more', () => {
    expect(validateCalendarRange('2026-11-01', '2027-01-31')).toEqual({ ok: true, value: { from: '2026-11-01', to: '2027-01-31' } });
    expect(validateCalendarRange('2026-11-01', '2027-02-01')).toEqual({ ok: false, errors: { to: 'Pedí hasta 92 días por vez.' } });
  });

  it('refuses missing or wrong dates and an end before the start', () => {
    expect(validateCalendarRange(null, '2026-11-29')).toEqual({ ok: false, errors: { from: 'La fecha tiene que ser AAAA-MM-DD.' } });
    expect(validateCalendarRange('2026-11-23', '2026-02-30')).toEqual({ ok: false, errors: { to: 'La fecha tiene que ser AAAA-MM-DD.' } });
    expect(validateCalendarRange('2026-11-29', '2026-11-23')).toEqual({ ok: false, errors: { to: 'La fecha final no puede ser anterior a la inicial.' } });
  });
});

describe('spanInRange', () => {
  const week = { from: '2026-11-23', to: '2026-11-29' };

  it('takes a job that starts or ends inside the range, edges included', () => {
    expect(spanInRange({ start: '2026-11-23T00:00', minutes: 60 }, week)).toBe(true);
    expect(spanInRange({ start: '2026-11-29T23:59', minutes: 60 }, week)).toBe(true);
    expect(spanInRange({ start: '2026-11-22T23:00', minutes: 61 }, week)).toBe(true); // ends 00:01 on the first day
  });

  it('leaves out a job that ends when the range starts or starts after it ends', () => {
    expect(spanInRange({ start: '2026-11-22T23:00', minutes: 60 }, week)).toBe(false); // ends 00:00 on the first day
    expect(spanInRange({ start: '2026-11-30T00:00', minutes: 60 }, week)).toBe(false);
  });
});

describe('serviceDueDate', () => {
  it('is the day the day interval runs out since the task was last done', () => {
    expect(serviceDueDate({ intervalDays: 30, lastDoneDate: '2026-10-20' })).toBe('2026-11-19');
    expect(serviceDueDate({ intervalDays: 90, lastDoneDate: '2026-08-01' })).toBe('2026-10-30');
  });

  it('is null for a task that only goes by hours', () => {
    expect(serviceDueDate({ intervalDays: null, lastDoneDate: '2026-10-20' })).toBeNull();
  });
});

describe('validatePlannedJob', () => {
  const valid = { printerId: 1, plannedStart: '2026-11-25T14:00', estimatedMinutes: 160, note: ' Segunda tanda ' };

  it('takes a printer, a start and a duration in minutes, and an optional note', () => {
    expect(validatePlannedJob(valid)).toEqual({ ok: true, value: { ...valid, note: 'Segunda tanda' } });
    expect(validatePlannedJob({ ...valid, note: undefined })).toEqual({ ok: true, value: { ...valid, note: '' } });
  });

  it('refuses each wrong field with its message', () => {
    expect(validatePlannedJob({ printerId: 'La A1', plannedStart: '2026-11-25', estimatedMinutes: 0, note: 'x'.repeat(1001) })).toEqual({
      ok: false,
      errors: {
        printerId: 'Elegí una impresora.',
        plannedStart: 'Poné el día y la hora de inicio.',
        estimatedMinutes: 'Poné cuánto va a tardar: más de 0 minutos.',
        note: 'Máximo 1000 caracteres.',
      },
    });
    expect(validatePlannedJob({ ...valid, estimatedMinutes: 12.5 }))
      .toEqual({ ok: false, errors: { estimatedMinutes: 'Poné cuánto va a tardar: más de 0 minutos.' } });
  });

  it('takes up to a week of printing and refuses more', () => {
    expect(validatePlannedJob({ ...valid, estimatedMinutes: 10080 }).ok).toBe(true);
    expect(validatePlannedJob({ ...valid, estimatedMinutes: 10081 }))
      .toEqual({ ok: false, errors: { estimatedMinutes: 'Hasta 168 h por impresión: dividila en tandas.' } });
  });
});

describe('planProblems', () => {
  const printer = (overrides: Partial<Printer>): Pick<Printer, 'id' | 'name' | 'status'> => ({ id: 1, name: 'La A1', status: 'activa', ...overrides });
  const printers = [printer({}), printer({ id: 2, name: 'La Ender', status: 'en_servicio' }), printer({ id: 3, name: 'La vieja', status: 'fuera_de_uso' })];
  const slot = (overrides: Partial<PlannedSlot>): PlannedSlot => ({
    id: 7, orderId: '0144', printerId: 1, status: 'planeada', plannedStart: '2026-11-26T09:00', estimatedMinutes: 480, ...overrides,
  });
  const plan = { printerId: 1, plannedStart: '2026-11-26T17:00', estimatedMinutes: 120 };

  it('is null for an active printer that is free over the whole span', () => {
    expect(planProblems(plan, printers, [slot({})])).toBeNull();
    expect(planProblems({ ...plan, plannedStart: '2026-11-26T07:00' }, printers, [slot({})])).toBeNull(); // ends 09:00
  });

  it('refuses a printer that does not exist', () => {
    expect(planProblems({ ...plan, printerId: 9 }, printers, [])).toEqual({ printerId: 'Esa impresora no existe.' });
  });

  it('refuses a printer that is not active', () => {
    expect(planProblems({ ...plan, printerId: 2 }, printers, [])).toEqual({ printerId: 'La Ender está en servicio: planificá en una impresora activa.' });
    expect(planProblems({ ...plan, printerId: 3 }, printers, [])).toEqual({ printerId: 'La vieja está fuera de uso: planificá en una impresora activa.' });
  });

  it('refuses a span that overlaps a planned job of the same printer', () => {
    expect(planProblems({ ...plan, plannedStart: '2026-11-26T16:59' }, printers, [slot({})])).toEqual({
      plannedStart: 'La A1 ya tiene planeada la impresión del pedido #0144 del 26/11 09:00 al 26/11 17:00.',
    });
  });

  it('ignores other printers, finished jobs and the job being edited', () => {
    const busy = { ...plan, plannedStart: '2026-11-26T10:00' };
    expect(planProblems(busy, printers, [slot({ printerId: 2 })])).toBeNull();
    expect(planProblems(busy, printers, [slot({ status: 'terminada' })])).toBeNull();
    expect(planProblems(busy, printers, [slot({})], 7)).toBeNull();
    expect(planProblems(busy, printers, [slot({})], 8)).not.toBeNull();
  });
});

describe('calendarData', () => {
  const range = { from: '2026-11-23', to: '2026-11-29' };
  const today = '2026-11-25';
  const order = (overrides: Partial<Order>): Order => ({
    id: '0142', item: 'Llaveros', client: 'Café Nube', clientId: 3, quoteId: null, projectId: null, project: null, channel: 'Instagram',
    stage: 'imprimiendo', dueDate: '2026-11-23', dueTime: null, price: 36000, deposit: null, paid: false, material: '', note: '',
    createdAt: stamp, updatedAt: stamp, deliveredAt: null, realCost: null, realProfit: null, ...overrides,
  });
  const project = (overrides: Partial<Project>): Project => ({
    id: 1, name: 'Kit robótica', clientId: 5, client: 'Escuela N.º 12', status: 'activo', dueDate: '2026-11-24', note: '', createdAt: stamp,
    updatedAt: stamp, ...overrides,
  });
  const task = (overrides: Partial<ServiceTask>): ServiceTask => ({
    id: 4, printerId: 1, printer: 'La A1', printerMinutes: 0, name: 'Limpiar la cama', intervalHours: null, intervalDays: 30,
    lastDoneMinutes: 0, lastDoneDate: '2026-10-27', active: true, createdAt: stamp, updatedAt: stamp, ...overrides,
  });
  const job = (overrides: Partial<PlannedSlot & { printer: string; note: string }>) => ({
    id: 6, orderId: '0144', printerId: 1, printer: 'La A1', status: 'planeada' as const, plannedStart: '2026-11-26T09:00', estimatedMinutes: 480,
    note: '', ...overrides,
  });

  it('lists the order due dates inside the range with stage, client, project and an overdue flag', () => {
    const orders = [
      order({ id: '0141', dueDate: '2026-11-22' }),
      order({ id: '0142' }),
      order({ id: '0143', stage: 'entregado', dueDate: '2026-11-24' }),
      order({ id: '0144', dueDate: '2026-11-25', projectId: 1, project: 'Kit robótica', dueTime: '10:00' }),
      order({ id: '0145', dueDate: '2026-11-29' }),
      order({ id: '0146', dueDate: '2026-11-30' }),
      order({ id: '0147', dueDate: null }),
    ];
    const data = calendarData(range, today, { orders, projects: [], tasks: [], plannedJobs: [] });
    expect(data.orders.map((o) => [o.id, o.dueDate, o.overdue])).toEqual([
      ['0142', '2026-11-23', true], ['0143', '2026-11-24', false], ['0144', '2026-11-25', false], ['0145', '2026-11-29', false],
    ]);
    expect(data.orders[2]).toEqual({
      id: '0144', item: 'Llaveros', client: 'Café Nube', clientId: 3, stage: 'imprimiendo', dueDate: '2026-11-25', dueTime: '10:00',
      projectId: 1, project: 'Kit robótica', overdue: false,
    });
  });

  it('lists the project due dates inside the range, an active one past its date as overdue', () => {
    const projects = [project({}), project({ id: 2, status: 'terminado', dueDate: '2026-11-23' }), project({ id: 3, dueDate: null }), project({ id: 4, dueDate: '2026-12-05' })];
    const data = calendarData(range, today, { orders: [], projects, tasks: [], plannedJobs: [] });
    expect(data.projects).toEqual([
      { id: 2, name: 'Kit robótica', client: 'Escuela N.º 12', clientId: 5, status: 'terminado', dueDate: '2026-11-23', overdue: false },
      { id: 1, name: 'Kit robótica', client: 'Escuela N.º 12', clientId: 5, status: 'activo', dueDate: '2026-11-24', overdue: true },
    ]);
  });

  it('lists the service tasks that become due by date inside the range', () => {
    const tasks = [
      task({}), // 30 days from 2026-10-27: 2026-11-26
      task({ id: 5, intervalDays: 30, lastDoneDate: '2026-10-23' }), // 2026-11-22: before the range
      task({ id: 6, intervalDays: 7, lastDoneDate: '2026-11-22', printerId: 2, printer: 'La Ender' }), // 2026-11-29: last day
      task({ id: 7, intervalDays: null, intervalHours: 100 }), // by hours only
      task({ id: 8, intervalDays: 30, lastDoneDate: '2026-10-24' }), // 2026-11-23: first day, before today
    ];
    const data = calendarData(range, today, { orders: [], projects: [], tasks, plannedJobs: [] });
    expect(data.serviceTasks).toEqual([
      { id: 8, name: 'Limpiar la cama', printerId: 1, printer: 'La A1', dueDate: '2026-11-23', overdue: true },
      { id: 4, name: 'Limpiar la cama', printerId: 1, printer: 'La A1', dueDate: '2026-11-26', overdue: false },
      { id: 6, name: 'Limpiar la cama', printerId: 2, printer: 'La Ender', dueDate: '2026-11-29', overdue: false },
    ]);
  });

  it('lists the planned jobs that touch the range, with printer, order, start and end', () => {
    const orders = [order({ id: '0144', item: 'Piezas de robótica', client: 'Escuela N.º 12', dueDate: null })];
    const plannedJobs = [
      job({}),
      job({ id: 7, plannedStart: '2026-11-22T20:00', estimatedMinutes: 300 }), // into the first day
      job({ id: 8, plannedStart: '2026-11-30T09:00' }), // after
      job({ id: 9, status: 'terminada' }),
    ];
    const data = calendarData(range, today, { orders, projects: [], tasks: [], plannedJobs });
    expect(data.plannedJobs).toEqual([
      {
        id: 7, orderId: '0144', item: 'Piezas de robótica', client: 'Escuela N.º 12', printerId: 1, printer: 'La A1',
        start: '2026-11-22T20:00', end: '2026-11-23T01:00', estimatedMinutes: 300, note: '',
      },
      {
        id: 6, orderId: '0144', item: 'Piezas de robótica', client: 'Escuela N.º 12', printerId: 1, printer: 'La A1',
        start: '2026-11-26T09:00', end: '2026-11-26T17:00', estimatedMinutes: 480, note: '',
      },
    ]);
    expect(data).toMatchObject({ from: '2026-11-23', to: '2026-11-29', today: '2026-11-25' });
  });
});
