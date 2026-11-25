// Hand-made calendar events (a delivery, a pickup, a meeting, a task or a reminder on a day), shared by the Worker API
// and the React app. Dates and times are on the workshop's clock, as everything in the calendar.
import { asBody, isMissing, readText, type Errors } from './fields';
import type { ValidationResult } from './orders';
import { isCalendarDate } from './quotes';

export const EVENT_TYPES = ['entrega', 'retiro', 'reunion', 'tarea', 'recordatorio'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  entrega: 'Entrega', retiro: 'Retiro', reunion: 'Reunión', tarea: 'Tarea', recordatorio: 'Recordatorio',
};

/** The fields the owner sets. */
export interface CalendarEventFields {
  type: EventType;
  title: string; // 1 to 120 characters
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM, or null for the whole day
  note: string; // up to 1000 characters
  done: boolean;
}

export interface CalendarEvent extends CalendarEventFields {
  id: number;
  createdAt: string;
  updatedAt: string;
}

export const MAX_EVENT_TITLE = 120;
export const MAX_EVENT_NOTE = 1000;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A time of day written HH:MM, from 00:00 to 23:59. */
export function isClockTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

/**
 * Validate an event: for a new one the request, for an edit the stored event merged with the request. The time, the
 * note and the done flag are optional (no time, no note, not done). Messages are shown to the owners as is.
 */
export function validateCalendarEvent(input: unknown): ValidationResult<CalendarEventFields> {
  const errors: Errors = {};
  const body = asBody(input);
  const { type, date } = body;
  if (typeof type !== 'string' || !(EVENT_TYPES as readonly string[]).includes(type)) {
    errors.type = 'Elegí el tipo: entrega, retiro, reunión, tarea o recordatorio.';
  }
  const title = readText(body, errors, 'title', MAX_EVENT_TITLE, true);
  if (!isCalendarDate(date)) errors.date = 'La fecha tiene que ser AAAA-MM-DD.';
  const time = isMissing(body.time) ? null : body.time;
  if (time !== null && !isClockTime(time)) errors.time = 'La hora tiene que ser HH:MM.';
  const note = readText(body, errors, 'note', MAX_EVENT_NOTE, false);
  const done = isMissing(body.done) ? false : body.done;
  if (typeof done !== 'boolean') errors.done = 'Marcalo como hecho o no hecho: true o false.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { type: type as EventType, title, date: date as string, time: time as string | null, note, done: done as boolean } };
}

/** Order of two times of one day: untimed (null) first, then the earlier time. */
export function compareDayTime(a: string | null, b: string | null): number {
  const x = a ?? '';
  const y = b ?? '';
  return x < y ? -1 : x > y ? 1 : 0;
}

/** A copy of the events by date, the untimed ones of a day first, then by time and id. */
export function sortEvents<E extends Pick<CalendarEvent, 'id' | 'date' | 'time'>>(events: E[]): E[] {
  return [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || compareDayTime(a.time, b.time) || a.id - b.id);
}
