import type { DateRange } from '../../shared/calendar';
import { sortEvents, type CalendarEvent, type CalendarEventFields, type EventType } from '../../shared/calendar-events';
import type { MemoryTables } from '../memory';

/** Port: what the calendar routes need to store hand-made events. */
export interface CalendarEventRepository {
  /** The events whose date is in the range, by date, the untimed ones of a day first, then by time and id. */
  list(range: DateRange): Promise<CalendarEvent[]>;
  get(id: number): Promise<CalendarEvent | null>;
  create(fields: CalendarEventFields): Promise<CalendarEvent>;
  /** Write only the fields in `changes`, in one statement. Null, writing nothing, when there is no such event. */
  update(id: number, changes: Partial<CalendarEventFields>): Promise<CalendarEvent | null>;
  /** Delete the event and answer it as it was. Null when there is no such event. */
  delete(id: number): Promise<CalendarEvent | null>;
}

interface EventRow {
  id: number;
  type: EventType;
  title: string;
  event_date: string;
  event_time: string | null;
  note: string;
  done: number;
  created_at: string;
  updated_at: string;
}

function toEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    date: row.event_date,
    time: row.event_time,
    note: row.note,
    done: row.done === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS: Record<keyof CalendarEventFields, string> = {
  type: 'type', title: 'title', date: 'event_date', time: 'event_time', note: 'note', done: 'done',
};

/** A field's value as its column stores it. */
function toColumn<K extends keyof CalendarEventFields>(key: K, value: CalendarEventFields[K]): unknown {
  return key === 'done' ? (value ? 1 : 0) : value;
}

/** Adapter: D1 storage. */
export function d1CalendarEventRepository(db: D1Database): CalendarEventRepository {
  return {
    async list(range) {
      // An untimed event's NULL time sorts before any time, as the calendar shows them.
      const { results } = await db
        .prepare('SELECT * FROM calendar_events WHERE event_date BETWEEN ? AND ? ORDER BY event_date, event_time, id')
        .bind(range.from, range.to)
        .all<EventRow>();
      return results.map(toEvent);
    },

    async get(id) {
      const row = await db.prepare('SELECT * FROM calendar_events WHERE id = ?').bind(id).first<EventRow>();
      return row ? toEvent(row) : null;
    },

    async create(fields) {
      const now = new Date().toISOString();
      const row = await db
        .prepare(
          `INSERT INTO calendar_events (type, title, event_date, event_time, note, done, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING *`,
        )
        .bind(fields.type, fields.title, fields.date, fields.time, fields.note, fields.done ? 1 : 0, now, now)
        .first<EventRow>();
      if (!row) throw new Error('Insert returned no row');
      return toEvent(row);
    },

    async update(id, changes) {
      // One statement writes the sent columns only, so an edit of other fields made meanwhile stays.
      const keys = (Object.keys(changes) as (keyof CalendarEventFields)[]).filter((k) => k in COLUMNS);
      const row = await db
        .prepare(`UPDATE calendar_events SET ${keys.map((k) => `${COLUMNS[k]} = ?, `).join('')}updated_at = ? WHERE id = ? RETURNING *`)
        .bind(...keys.map((k) => toColumn(k, changes[k] as CalendarEventFields[typeof k])), new Date().toISOString(), id)
        .first<EventRow>();
      return row ? toEvent(row) : null;
    },

    async delete(id) {
      const row = await db.prepare('DELETE FROM calendar_events WHERE id = ? RETURNING *').bind(id).first<EventRow>();
      return row ? toEvent(row) : null;
    },
  };
}

/** Adapter: in-memory storage for tests. */
export function memoryCalendarEventRepository(tables: MemoryTables): CalendarEventRepository {
  const { calendarEvents, calendarEventSeq } = tables;
  const copy = (event: CalendarEvent): CalendarEvent => ({ ...event });
  return {
    async list(range) {
      return sortEvents([...calendarEvents.values()].filter((e) => range.from <= e.date && e.date <= range.to)).map(copy);
    },
    async get(id) {
      const event = calendarEvents.get(id);
      return event ? copy(event) : null;
    },
    async create(fields) {
      const now = new Date().toISOString();
      calendarEventSeq.last += 1;
      const event: CalendarEvent = { id: calendarEventSeq.last, ...fields, createdAt: now, updatedAt: now };
      calendarEvents.set(event.id, event);
      return copy(event);
    },
    async update(id, changes) {
      const current = calendarEvents.get(id);
      if (!current) return null;
      const updated: CalendarEvent = { ...current, ...changes, updatedAt: new Date().toISOString() };
      calendarEvents.set(id, updated);
      return copy(updated);
    },
    async delete(id) {
      const current = calendarEvents.get(id);
      if (!current) return null;
      calendarEvents.delete(id);
      return copy(current);
    },
  };
}
