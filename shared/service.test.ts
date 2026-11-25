import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SERVICE_PLAN, daysBetween, serviceCostByPrinter, serviceLogProblems, serviceState, sortByDue, validateNewServiceTask, validateServiceLog,
  validateServiceTask, workshopToday, type ServiceLog, type ServiceTask,
} from './service';

const stamp = '2026-11-01T00:00:00.000Z';

function task(overrides: Partial<ServiceTask> = {}): ServiceTask {
  return {
    id: 1, printerId: 1, printer: 'La A1', printerMinutes: 6000, name: 'Limpiar boquilla', intervalHours: 100, intervalDays: null,
    lastDoneMinutes: 6000, lastDoneDate: '2026-11-01', active: true, createdAt: stamp, updatedAt: stamp, ...overrides,
  };
}

describe('serviceState', () => {
  it('is due by hours once the printer has printed the hour interval since the task was last done', () => {
    expect(serviceState(task({ printerMinutes: 6000 + 100 * 60 - 1 }), '2026-11-01')).toEqual({
      due: false, dueByHours: false, dueByDays: false, minutesLeft: 1, daysLeft: null, progress: 5999 / 6000,
    });
    expect(serviceState(task({ printerMinutes: 6000 + 100 * 60 }), '2026-11-01')).toEqual({
      due: true, dueByHours: true, dueByDays: false, minutesLeft: 0, daysLeft: null, progress: 1,
    });
    expect(serviceState(task({ printerMinutes: 6000 + 115 * 60 }), '2026-11-01')).toMatchObject({ due: true, minutesLeft: -900, progress: 1.15 });
  });

  it('is due by days once the day interval has passed since the date it was last done', () => {
    const monthly = task({ intervalHours: null, intervalDays: 30, lastDoneDate: '2026-10-26' });
    expect(serviceState(monthly, '2026-11-24')).toEqual({
      due: false, dueByHours: false, dueByDays: false, minutesLeft: null, daysLeft: 1, progress: 29 / 30,
    });
    expect(serviceState(monthly, '2026-11-25')).toEqual({
      due: true, dueByHours: false, dueByDays: true, minutesLeft: null, daysLeft: 0, progress: 1,
    });
    expect(serviceState(monthly, '2026-12-10')).toMatchObject({ due: true, daysLeft: -15, progress: 1.5 });
  });

  it('with both intervals, is due by whichever comes first', () => {
    const both = task({ intervalHours: 200, intervalDays: 90, lastDoneMinutes: 1000, lastDoneDate: '2026-08-01' });
    // 210 h printed, 20 days passed: due by hours.
    expect(serviceState({ ...both, printerMinutes: 1000 + 210 * 60 }, '2026-08-21')).toEqual({
      due: true, dueByHours: true, dueByDays: false, minutesLeft: -600, daysLeft: 70, progress: 1.05,
    });
    // 50 h printed, 116 days passed: due by days.
    expect(serviceState({ ...both, printerMinutes: 1000 + 50 * 60 }, '2026-11-25')).toEqual({
      due: true, dueByHours: false, dueByDays: true, minutesLeft: 9000, daysLeft: -26, progress: 116 / 90,
    });
    // Neither yet: how much is left of each, and the progress of the closer one.
    expect(serviceState({ ...both, printerMinutes: 1000 + 150 * 60 }, '2026-09-30')).toEqual({
      due: false, dueByHours: false, dueByDays: false, minutesLeft: 3000, daysLeft: 30, progress: 0.75,
    });
  });

  it('counts nothing as done when the printer has fewer minutes or the date is later than today', () => {
    // A deleted print job can take minutes off the printer after the service.
    expect(serviceState(task({ printerMinutes: 5000 }), '2026-11-01')).toMatchObject({ due: false, minutesLeft: 6000, progress: 0 });
    expect(serviceState(task({ intervalHours: null, intervalDays: 30, lastDoneDate: '2026-11-03' }), '2026-11-01'))
      .toMatchObject({ due: false, daysLeft: 30, progress: 0 });
  });
});

describe('daysBetween', () => {
  it('counts calendar days across months and leap years', () => {
    expect(daysBetween('2026-11-01', '2026-11-01')).toBe(0);
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
    expect(daysBetween('2028-02-27', '2028-03-01')).toBe(3);
    expect(daysBetween('2026-11-25', '2026-11-20')).toBe(-5);
  });
});

describe('sortByDue', () => {
  it('puts due tasks first, most overdue first, then the rest by how close they are to due', () => {
    const today = '2026-11-25';
    const withState = (t: ServiceTask) => ({ ...t, state: serviceState(t, today) });
    const far = withState(task({ id: 1, printerMinutes: 6000 + 10 * 60 })); // 10 %
    const close = withState(task({ id: 2, printerMinutes: 6000 + 95 * 60 })); // 95 %
    const dueByDays = withState(task({ id: 3, intervalHours: null, intervalDays: 30, lastDoneDate: '2026-10-26' })); // 100 %
    const overdue = withState(task({ id: 4, printerMinutes: 6000 + 130 * 60 })); // 130 %
    const tieA = withState(task({ id: 5, printerMinutes: 6000 + 50 * 60 })); // 50 %
    const tieB = withState(task({ id: 6, printerMinutes: 6000 + 50 * 60 })); // 50 %
    const input = [far, tieB, close, dueByDays, tieA, overdue];
    expect(sortByDue(input).map((t) => t.id)).toEqual([4, 3, 2, 5, 6, 1]);
    expect(input.map((t) => t.id)).toEqual([1, 6, 2, 3, 5, 4]);
  });
});

describe('validateNewServiceTask', () => {
  const today = '2026-11-25';

  it('accepts a task with an hour interval, a day interval or both, and trims the name', () => {
    expect(validateNewServiceTask({ printerId: 2, name: ' Revisar correas ', intervalHours: 300, intervalDays: 90, lastDoneDate: '2026-11-20' }, today))
      .toEqual({ ok: true, value: { printerId: 2, name: 'Revisar correas', intervalHours: 300, intervalDays: 90, lastDoneDate: '2026-11-20' } });
    expect(validateNewServiceTask({ printerId: 2, name: 'Limpiar cama', intervalDays: 30 }, today))
      .toEqual({ ok: true, value: { printerId: 2, name: 'Limpiar cama', intervalHours: null, intervalDays: 30, lastDoneDate: today } });
    expect(validateNewServiceTask({ printerId: 2, name: 'Limpiar boquilla', intervalHours: 100, intervalDays: null, lastDoneDate: '' }, today))
      .toEqual({ ok: true, value: { printerId: 2, name: 'Limpiar boquilla', intervalHours: 100, intervalDays: null, lastDoneDate: today } });
  });

  it('needs at least one of the two intervals', () => {
    const message = 'Poné cada cuántas horas de impresión, cada cuántos días, o las dos.';
    expect(validateNewServiceTask({ printerId: 2, name: 'Revisar correas' }, today))
      .toEqual({ ok: false, errors: { intervalHours: message, intervalDays: message } });
    expect(validateNewServiceTask({ printerId: 2, name: 'Revisar correas', intervalHours: '', intervalDays: null }, today))
      .toEqual({ ok: false, errors: { intervalHours: message, intervalDays: message } });
  });

  it('reports a message for every wrong field', () => {
    expect(validateNewServiceTask({ printerId: 0, name: '', intervalHours: 0, intervalDays: 2.5, lastDoneDate: '2026-02-30' }, today)).toEqual({
      ok: false,
      errors: {
        printerId: 'Elegí una impresora.',
        name: 'Completá este dato.',
        intervalHours: 'Poné cada cuántas horas de impresión: un número entero mayor que 0.',
        intervalDays: 'Poné cada cuántos días: un número entero mayor que 0.',
        lastDoneDate: 'La fecha tiene que ser AAAA-MM-DD.',
      },
    });
    expect(validateNewServiceTask({ printerId: '1', name: 'x'.repeat(81), intervalHours: '100' }, today)).toEqual({
      ok: false,
      errors: {
        printerId: 'Elegí una impresora.',
        name: 'Máximo 80 caracteres.',
        intervalHours: 'Poné cada cuántas horas de impresión: un número entero mayor que 0.',
      },
    });
  });
});

describe('validateServiceTask', () => {
  it('validates the editable fields of a task', () => {
    expect(validateServiceTask({ name: 'Lubricar varillas', intervalHours: 200, intervalDays: null, printerId: 9 }))
      .toEqual({ ok: true, value: { name: 'Lubricar varillas', intervalHours: 200, intervalDays: null } });
    expect(validateServiceTask({ name: 'Lubricar varillas', intervalHours: null, intervalDays: null })).toEqual({
      ok: false,
      errors: {
        intervalHours: 'Poné cada cuántas horas de impresión, cada cuántos días, o las dos.',
        intervalDays: 'Poné cada cuántas horas de impresión, cada cuántos días, o las dos.',
      },
    });
  });
});

describe('validateServiceLog', () => {
  const today = '2026-11-25';

  it('accepts a complete service and trims its text', () => {
    expect(validateServiceLog({ printerId: 1, date: '2026-11-20', done: ' Cambio de boquilla ', parts: 'Boquilla 0,4 mm', cost: 6500, taskId: 3, note: 'Estaba tapada.' }, today))
      .toEqual({ ok: true, value: { printerId: 1, date: '2026-11-20', done: 'Cambio de boquilla', parts: 'Boquilla 0,4 mm', cost: 6500, taskId: 3, note: 'Estaba tapada.' } });
  });

  it('defaults the date to today, the cost to 0, no task, and empty parts and note', () => {
    expect(validateServiceLog({ printerId: 1, done: 'Limpieza general' }, today))
      .toEqual({ ok: true, value: { printerId: 1, date: today, done: 'Limpieza general', parts: '', cost: 0, taskId: null, note: '' } });
    expect(validateServiceLog({ printerId: 1, done: 'Limpieza general', taskId: null, cost: '' }, today))
      .toEqual({ ok: true, value: { printerId: 1, date: today, done: 'Limpieza general', parts: '', cost: 0, taskId: null, note: '' } });
  });

  it('reports a message for every wrong field', () => {
    expect(validateServiceLog({ printerId: -1, date: '25/11/2026', done: '', parts: 'x'.repeat(501), cost: 100.5, taskId: 'boquilla', note: 'x'.repeat(1001) }, today)).toEqual({
      ok: false,
      errors: {
        printerId: 'Elegí una impresora.',
        date: 'La fecha tiene que ser AAAA-MM-DD.',
        done: 'Completá este dato.',
        parts: 'Máximo 500 caracteres.',
        cost: 'Poné el costo en pesos, sin centavos.',
        taskId: 'Elegí una tarea de la lista.',
        note: 'Máximo 1000 caracteres.',
      },
    });
    expect(validateServiceLog({ printerId: 1, done: 'x'.repeat(201), cost: -1 }, today))
      .toEqual({ ok: false, errors: { done: 'Máximo 200 caracteres.', cost: 'Poné el costo en pesos, sin centavos.' } });
  });
});

describe('serviceLogProblems', () => {
  const printers = [{ id: 1 }, { id: 2 }];
  const tasks = [{ id: 3, printerId: 1, active: true }, { id: 4, printerId: 2, active: true }, { id: 5, printerId: 1, active: false }];

  it('accepts an existing printer, with no task or one of its active tasks', () => {
    expect(serviceLogProblems({ printerId: 1, taskId: null }, printers, tasks)).toBeNull();
    expect(serviceLogProblems({ printerId: 1, taskId: 3 }, printers, tasks)).toBeNull();
  });

  it('rejects a printer that does not exist', () => {
    expect(serviceLogProblems({ printerId: 9, taskId: null }, printers, tasks)).toEqual({ printerId: 'Esa impresora no existe.' });
  });

  it('rejects a task of another printer, a deactivated task and a task that does not exist', () => {
    const message = { taskId: 'Esa tarea no está en el plan de esta impresora.' };
    expect(serviceLogProblems({ printerId: 1, taskId: 4 }, printers, tasks)).toEqual(message);
    expect(serviceLogProblems({ printerId: 1, taskId: 5 }, printers, tasks)).toEqual(message);
    expect(serviceLogProblems({ printerId: 1, taskId: 99 }, printers, tasks)).toEqual(message);
  });
});

describe('serviceCostByPrinter', () => {
  it('adds up the cost and count of the services of each printer, by printer name', () => {
    const log = (id: number, printerId: number, printer: string, cost: number): ServiceLog => ({
      id, printerId, printer, taskId: null, task: null, date: '2026-11-01', done: 'Algo', parts: '', cost, note: '', createdAt: stamp, updatedAt: stamp,
    });
    expect(serviceCostByPrinter([log(1, 2, 'La Ender', 6500), log(2, 1, 'La A1', 1500), log(3, 2, 'La Ender', 4800), log(4, 1, 'La A1', 0)])).toEqual([
      { printerId: 1, printer: 'La A1', count: 2, cost: 1500 },
      { printerId: 2, printer: 'La Ender', count: 2, cost: 11300 },
    ]);
    expect(serviceCostByPrinter([])).toEqual([]);
  });
});

describe('default service plan', () => {
  it('cleans the nozzle every 100 h, lubricates the rods every 200 h and checks the belts every 300 h', () => {
    expect(DEFAULT_SERVICE_PLAN).toEqual([
      { name: 'Limpiar boquilla', intervalHours: 100, intervalDays: null },
      { name: 'Lubricar varillas', intervalHours: 200, intervalDays: null },
      { name: 'Revisar correas', intervalHours: 300, intervalDays: null },
    ]);
  });
});

describe('workshopToday', () => {
  it('is the calendar date in Buenos Aires', () => {
    expect(workshopToday(new Date('2026-11-26T02:59:00Z'))).toBe('2026-11-25');
    expect(workshopToday(new Date('2026-11-26T03:00:00Z'))).toBe('2026-11-26');
  });
});
