import { describe, expect, it } from 'vitest';
import { EVENT_TYPE_LABEL, EVENT_TYPES, compareDayTime, isClockTime, sortEvents, validateCalendarEvent, type CalendarEvent } from './calendar-events';

const stamp = '2026-11-01T00:00:00.000Z';
const INVALID_TYPE = 'Elegí el tipo: entrega, retiro, reunión, tarea o recordatorio.';

describe('event types', () => {
  it('has the five types in order, each with its Spanish label', () => {
    expect(EVENT_TYPES).toEqual(['entrega', 'retiro', 'reunion', 'tarea', 'recordatorio']);
    expect(EVENT_TYPE_LABEL).toEqual({ entrega: 'Entrega', retiro: 'Retiro', reunion: 'Reunión', tarea: 'Tarea', recordatorio: 'Recordatorio' });
  });
});

describe('isClockTime', () => {
  it('takes HH:MM from 00:00 to 23:59 only', () => {
    expect(['00:00', '09:30', '23:59'].map(isClockTime)).toEqual([true, true, true]);
    expect(['24:00', '9:30', '09:60', '09:30:00', '', null, 930].map(isClockTime)).toEqual([false, false, false, false, false, false, false]);
  });
});

describe('validateCalendarEvent', () => {
  it('accepts a full event, trimming the texts', () => {
    expect(validateCalendarEvent({ type: 'reunion', title: '  Escuela: ver muestras ', date: '2026-11-27', time: '10:30', note: ' Llevar llaveros ', done: true }))
      .toEqual({ ok: true, value: { type: 'reunion', title: 'Escuela: ver muestras', date: '2026-11-27', time: '10:30', note: 'Llevar llaveros', done: true } });
  });

  it('leaves the time, the note and the done flag optional', () => {
    const empty = { type: 'tarea', title: 'Pedir filamento', date: '2026-11-27', time: null, note: '', done: false };
    expect(validateCalendarEvent({ type: 'tarea', title: 'Pedir filamento', date: '2026-11-27' })).toEqual({ ok: true, value: empty });
    expect(validateCalendarEvent({ type: 'tarea', title: 'Pedir filamento', date: '2026-11-27', time: '', note: null, done: null }))
      .toEqual({ ok: true, value: empty });
  });

  it('names every wrong field', () => {
    expect(validateCalendarEvent({ type: 'fiesta', title: '   ', date: '2026-02-30', time: '25:00', note: 'x'.repeat(1001), done: 'sí' })).toEqual({
      ok: false,
      errors: {
        type: INVALID_TYPE,
        title: 'Completá este dato.',
        date: 'La fecha tiene que ser AAAA-MM-DD.',
        time: 'La hora tiene que ser HH:MM.',
        note: 'Máximo 1000 caracteres.',
        done: 'Marcalo como hecho o no hecho: true o false.',
      },
    });
    expect(validateCalendarEvent(null)).toEqual({
      ok: false, errors: { type: INVALID_TYPE, title: 'Completá este dato.', date: 'La fecha tiene que ser AAAA-MM-DD.' },
    });
  });

  it('takes a title of 1 to 120 characters and a note of up to 1000', () => {
    const base = { type: 'entrega', date: '2026-11-27' };
    expect(validateCalendarEvent({ ...base, title: 'x' }).ok).toBe(true);
    expect(validateCalendarEvent({ ...base, title: 'x'.repeat(120), note: 'n'.repeat(1000) }).ok).toBe(true);
    expect(validateCalendarEvent({ ...base, title: 'x'.repeat(121) })).toEqual({ ok: false, errors: { title: 'Máximo 120 caracteres.' } });
  });

  it('takes every type', () => {
    for (const type of EVENT_TYPES) expect(validateCalendarEvent({ type, title: 'x', date: '2026-11-27' }).ok).toBe(true);
  });
});

describe('day times', () => {
  it('puts untimed items first, then by time', () => {
    expect([null, '09:00', '08:30', null, '23:59'].sort(compareDayTime)).toEqual([null, null, '08:30', '09:00', '23:59']);
  });

  it('sorts events by date, untimed first, then by time and id', () => {
    const event = (id: number, date: string, time: string | null): CalendarEvent => ({
      id, type: 'tarea', title: `E${id}`, date, time, note: '', done: false, createdAt: stamp, updatedAt: stamp,
    });
    const events = [event(1, '2026-11-26', '09:00'), event(2, '2026-11-25', '18:00'), event(3, '2026-11-26', null), event(4, '2026-11-26', '09:00'), event(5, '2026-11-25', null)];
    expect(sortEvents(events).map((e) => e.id)).toEqual([5, 2, 3, 1, 4]);
    expect(events.map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
  });
});
