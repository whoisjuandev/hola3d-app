import { describe, expect, it } from 'vitest';
import type { CalendarData } from '../../../shared/calendar';
import {
  barPlacement, dayItems, packTracks, dayTitle, monthGrid, monthTitle, readView, shiftAnchor, timeRange, viewRange, weekDays, weekTitle,
} from './format';
import { planDraft, planRequest } from './plan-form';

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

describe('barPlacement', () => {
  it('places a job by its start and length in the week, as a share of the seven days', () => {
    const monday = barPlacement({ start: '2026-11-23T00:00', end: '2026-11-24T00:00' }, '2026-11-23');
    expect(monday.left).toBe(0);
    expect(monday.width).toBeCloseTo(100 / 7);
    const thursday = barPlacement({ start: '2026-11-26T12:00', end: '2026-11-26T18:00' }, '2026-11-23');
    expect(thursday.left).toBeCloseTo((3.5 / 7) * 100);
    expect(thursday.width).toBeCloseTo((0.25 / 7) * 100);
  });

  it('cuts a job at the edges of the week', () => {
    const fromSunday = barPlacement({ start: '2026-11-22T12:00', end: '2026-11-23T12:00' }, '2026-11-23');
    expect(fromSunday.left).toBe(0);
    expect(fromSunday.width).toBeCloseTo((0.5 / 7) * 100);
    const sunday = barPlacement({ start: '2026-11-29T12:00', end: '2026-11-30T12:00' }, '2026-11-23');
    expect(sunday.left + sunday.width).toBeCloseTo(100);
  });
});

describe('packTracks', () => {
  const job = (id: number, start: string, end: string) => ({ id, start, end });

  it('puts jobs on one track when each label has room before the next job starts', () => {
    const jobs = [job(1, '2026-11-23T09:00', '2026-11-23T12:00'), job(2, '2026-11-24T09:00', '2026-11-24T10:00'), job(3, '2026-11-26T08:00', '2026-11-27T08:00')];
    expect(packTracks(jobs)).toEqual(new Map([[1, 0], [2, 0], [3, 0]]));
  });

  it('moves a job down a track when the label of an earlier one would cover it, and back up when there is room', () => {
    const jobs = [
      job(1, '2026-11-26T09:00', '2026-11-26T17:00'),
      job(2, '2026-11-26T18:00', '2026-11-26T23:00'), // the label of job 1 runs into it
      job(3, '2026-11-27T10:00', '2026-11-27T11:30'), // job 1's label is done; job 2's is not
      job(4, '2026-11-29T10:00', '2026-11-29T11:00'),
    ];
    expect(packTracks(jobs)).toEqual(new Map([[1, 0], [2, 1], [3, 0], [4, 0]]));
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
});
