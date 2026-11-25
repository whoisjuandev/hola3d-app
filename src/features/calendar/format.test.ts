import { describe, expect, it } from 'vitest';
import type { CalendarData } from '../../../shared/calendar';
import {
  dayBars, dayItems, dayTitle, hourMarks, laneHours, monthGrid, monthTitle, readView, shiftAnchor, timeRange, viewRange, weekDays, weekTitle,
} from './format';
import { planChanges, planDraft, planRequest } from './plan-form';

describe('ranges', () => {
  it('lays a month out as six weeks from the Monday on or before the first', () => {
    const grid = monthGrid('2026-11-25');
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-10-26');
    expect(grid[41]).toBe('2026-12-06');
    expect(viewRange('mes', '2026-11-25')).toEqual({ from: '2026-10-26', to: '2026-12-06' });
  });

  it('takes the week from Monday to Sunday', () => {
    expect(weekDays('2026-11-25')).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
    expect(viewRange('semana', '2026-11-29')).toEqual({ from: '2026-11-23', to: '2026-11-29' });
  });

  it('moves a month or a week back and forth', () => {
    expect(shiftAnchor('mes', '2026-11-25', 1)).toBe('2026-12-01');
    expect(shiftAnchor('mes', '2026-01-31', -1)).toBe('2025-12-01');
    expect(shiftAnchor('semana', '2026-11-25', 1)).toBe('2026-12-02');
    expect(shiftAnchor('semana', '2026-11-25', -1)).toBe('2026-11-18');
  });

  it('reads the view and day from the address, falling back to the week of today', () => {
    expect(readView(new URLSearchParams('vista=mes&dia=2026-12-10'), '2026-11-25')).toEqual({ view: 'mes', anchor: '2026-12-10' });
    expect(readView(new URLSearchParams('dia=2026-02-30'), '2026-11-25')).toEqual({ view: 'semana', anchor: '2026-11-25' });
  });
});

describe('titles', () => {
  it('names months, weeks and days in Spanish', () => {
    expect(monthTitle('2026-11-25')).toBe('Noviembre 2026');
    expect(weekTitle('2026-11-25')).toBe('23 – 29 nov 2026');
    expect(weekTitle('2026-12-02')).toBe('30 nov – 6 dic 2026');
    expect(weekTitle('2026-12-30')).toBe('28 dic 2026 – 3 ene 2027');
    expect(dayTitle('2026-11-25')).toBe('Mié 25 nov');
  });

  it('says when a job runs, with the day it ends when that is another one', () => {
    expect(timeRange({ start: '2026-11-26T09:00', end: '2026-11-26T17:00' })).toBe('09:00 – 17:00');
    expect(timeRange({ start: '2026-11-26T22:00', end: '2026-11-27T06:00' })).toBe('22:00 – vie 06:00');
  });
});

describe('laneHours', () => {
  const week = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
  const job = (start: string, end: string) => ({ start, end });

  it('shows 08:00 to 20:00 when the week\'s jobs fit in it, or has none', () => {
    expect(laneHours([], week)).toEqual({ from: 8, to: 20 });
    expect(laneHours([job('2026-11-26T09:00', '2026-11-26T17:00')], week)).toEqual({ from: 8, to: 20 });
  });

  it('reaches out to the earliest start and the latest end of the week, rounded out to whole hours', () => {
    expect(laneHours([job('2026-11-24T06:30', '2026-11-24T07:15'), job('2026-11-26T18:00', '2026-11-26T22:10')], week)).toEqual({ from: 6, to: 23 });
  });

  it('takes a job that runs past midnight as the part on each day, so it reaches both ends', () => {
    expect(laneHours([job('2026-11-26T22:00', '2026-11-27T06:00')], week)).toEqual({ from: 0, to: 24 });
  });

  it('counts only the part of a job inside the week', () => {
    expect(laneHours([job('2026-11-22T20:00', '2026-11-23T09:00')], week)).toEqual({ from: 0, to: 20 });
    expect(laneHours([job('2026-11-29T19:00', '2026-11-30T05:00')], week)).toEqual({ from: 8, to: 24 });
  });
});

describe('dayBars', () => {
  const job = (id: number, start: string, end: string) => ({ id, start, end });

  it('places a job in its day by its start and length, as a share of the lane hours', () => {
    const [bar] = dayBars([job(1, '2026-11-26T09:00', '2026-11-26T17:00')], '2026-11-26', { from: 8, to: 20 });
    expect(bar).toMatchObject({ job: { id: 1 }, track: 0, fromBefore: false, goesOn: false });
    expect(bar.left).toBeCloseTo((60 / 720) * 100);
    expect(bar.width).toBeCloseTo((480 / 720) * 100);
  });

  it('cuts a job that runs past midnight into the part of each day', () => {
    const night = job(1, '2026-11-26T22:00', '2026-11-27T06:00');
    const [thursday] = dayBars([night], '2026-11-26', { from: 0, to: 24 });
    expect(thursday).toMatchObject({ fromBefore: false, goesOn: true });
    expect(thursday.left).toBeCloseTo((22 / 24) * 100);
    expect(thursday.width).toBeCloseTo((2 / 24) * 100);
    const [friday] = dayBars([night], '2026-11-27', { from: 0, to: 24 });
    expect(friday).toMatchObject({ left: 0, fromBefore: true, goesOn: false });
    expect(friday.width).toBeCloseTo(25);
    expect(dayBars([night], '2026-11-28', { from: 0, to: 24 })).toEqual([]);
  });

  it('gives each job of a day its own track, in start order, so their labels never cover each other', () => {
    const jobs = [job(2, '2026-11-26T18:00', '2026-11-26T23:00'), job(1, '2026-11-26T09:00', '2026-11-26T17:00'), job(3, '2026-11-27T10:00', '2026-11-27T11:30')];
    expect(dayBars(jobs, '2026-11-26', { from: 8, to: 23 }).map((b) => [b.job.id, b.track])).toEqual([[1, 0], [2, 1]]);
    expect(dayBars(jobs, '2026-11-27', { from: 8, to: 23 }).map((b) => [b.job.id, b.track])).toEqual([[3, 0]]);
  });
});

describe('hourMarks', () => {
  it('labels every fourth hour of a lane of up to 12 hours, and every sixth of a longer one', () => {
    expect(hourMarks({ from: 8, to: 20 })).toEqual([{ text: '08', left: 0 }, { text: '12', left: (4 / 12) * 100 }, { text: '16', left: (8 / 12) * 100 }]);
    expect(hourMarks({ from: 0, to: 24 }).map((m) => m.text)).toEqual(['00', '06', '12', '18']);
  });
});

describe('dayItems', () => {
  const data: CalendarData = {
    from: '2026-11-23', to: '2026-11-29', today: '2026-11-25',
    orders: [{
      id: '0142', item: 'Llaveros', client: 'Café Nube', clientId: 3, stage: 'imprimiendo', dueDate: '2026-11-23', dueTime: null, projectId: null, project: null, overdue: true,
    }],
    projects: [{ id: 1, name: 'Kit robótica', client: 'Escuela', clientId: 5, status: 'activo', dueDate: '2026-11-23', overdue: true }],
    serviceTasks: [{ id: 4, name: 'Limpiar la cama', printerId: 1, printer: 'La A1', dueDate: '2026-11-23', overdue: true }],
    plannedJobs: [{
      id: 6, orderId: '0144', item: 'Piezas', client: 'Escuela', printerId: 1, printer: 'La A1', start: '2026-11-22T20:00', end: '2026-11-23T02:00',
      estimatedMinutes: 360, note: '',
    }],
  };

  it('lists what falls on a day by type, with where each one leads', () => {
    expect(dayItems(data, '2026-11-23')).toEqual([
      { key: 'order-0142', kind: 'order', label: '#0142 Llaveros', detail: 'Café Nube', overdue: true, to: '/pedidos?pedido=0142' },
      { key: 'project-1', kind: 'project', label: 'Kit robótica', detail: 'Escuela', overdue: true, to: '/proyectos/1' },
      { key: 'service-4', kind: 'service', label: 'Limpiar la cama', detail: 'La A1', overdue: true, to: '/taller?impresora=1' },
      { key: 'job-6', kind: 'job', label: '#0144 Piezas', detail: 'La A1 · 20:00 – lun 02:00', overdue: false, to: '/pedidos?pedido=0144' },
    ]);
    expect(dayItems(data, '2026-11-24')).toEqual([]);
  });

  it('leaves planned jobs out when asked, for the week view that draws them per printer', () => {
    expect(dayItems(data, '2026-11-23', false).map((i) => i.kind)).toEqual(['order', 'project', 'service']);
  });
});

describe('plan form', () => {
  it('starts empty for a new plan, with the given date and printer', () => {
    expect(planDraft(null, { orderId: '0142', printerId: '1', date: '2026-11-26' })).toEqual({
      orderId: '0142', printerId: '1', date: '2026-11-26', time: '09:00', hours: '', minutes: '', note: '',
    });
  });

  it('starts from a planned job when editing it', () => {
    const job = { orderId: '0144', printerId: 1, plannedStart: '2026-11-26T09:30', estimatedMinutes: 495, note: 'Mitad' };
    expect(planDraft(job, {})).toEqual({ orderId: '0144', printerId: '1', date: '2026-11-26', time: '09:30', hours: '8', minutes: '15', note: 'Mitad' });
  });

  it('becomes the body of the plan request', () => {
    expect(planRequest({ orderId: '0142', printerId: '1', date: '2026-11-26', time: '09:30', hours: '2', minutes: '40', note: ' x ' })).toEqual({
      printerId: 1, plannedStart: '2026-11-26T09:30', estimatedMinutes: 160, note: ' x ',
    });
    expect(planRequest({ orderId: '', printerId: '', date: '', time: '', hours: '', minutes: '', note: '' })).toEqual({
      printerId: null, plannedStart: null, estimatedMinutes: 0, note: '',
    });
  });

  it('sends only the fields an edit changed, so it does not undo another edit', () => {
    const initial = { orderId: '0144', printerId: '1', date: '2026-11-26', time: '09:30', hours: '8', minutes: '15', note: 'Mitad' };
    expect(planChanges({ ...initial, hours: '9', minutes: '15' }, initial)).toEqual({ estimatedMinutes: 555 });
    expect(planChanges({ ...initial, hours: '7', minutes: '75' }, initial)).toEqual({});
    expect(planChanges({ ...initial, time: '10:00', printerId: '3' }, initial)).toEqual({ printerId: 3, plannedStart: '2026-11-26T10:00' });
    expect(planChanges(initial, initial)).toEqual({});
  });
});
