// The calendar events D1 adapter's SQL run against a real SQLite database with the migrations applied.
import { describe, expect, it } from 'vitest';
import { sqliteD1 } from '../print-jobs/sqlite-d1';
import { d1CalendarEventRepository } from './repository';

const stamp = '2026-11-01T00:00:00.000Z';

async function setup() {
  const { db, sql } = await sqliteD1();
  sql.exec(`
    INSERT INTO calendar_events (id, type, title, event_date, event_time, note, done, created_at, updated_at) VALUES
      (1, 'reunion', 'Escuela', '2026-11-26', '10:30', 'Muestras', 0, '${stamp}', '${stamp}'),
      (2, 'recordatorio', 'Pagar la luz', '2026-11-26', NULL, '', 1, '${stamp}', '${stamp}'),
      (3, 'tarea', 'Pedir PETG', '2026-11-30', NULL, '', 0, '${stamp}', '${stamp}'),
      (4, 'entrega', 'Llaveros', '2026-11-23', '18:00', '', 0, '${stamp}', '${stamp}');
  `);
  const rows = () => sql.prepare('SELECT id, type, title, event_date, event_time, note, done FROM calendar_events ORDER BY id').all();
  return { repo: d1CalendarEventRepository(db), sql, rows };
}

describe('D1 calendar events', () => {
  it('lists the events of the range by date, untimed first, then by time', async () => {
    const { repo } = await setup();
    expect((await repo.list({ from: '2026-11-23', to: '2026-11-29' })).map((e) => e.id)).toEqual([4, 2, 1]);
    expect(await repo.get(2)).toEqual({
      id: 2, type: 'recordatorio', title: 'Pagar la luz', date: '2026-11-26', time: null, note: '', done: true, createdAt: stamp, updatedAt: stamp,
    });
  });

  it('creates an event and answers it as stored', async () => {
    const { repo } = await setup();
    const event = await repo.create({ type: 'retiro', title: 'Retira Sofía', date: '2026-11-27', time: '17:00', note: 'Mate', done: false });
    expect(event).toEqual({
      id: 5, type: 'retiro', title: 'Retira Sofía', date: '2026-11-27', time: '17:00', note: 'Mate', done: false,
      createdAt: expect.any(String), updatedAt: expect.any(String),
    });
    expect(await repo.get(5)).toEqual(event);
  });

  it('writes only the sent columns, keeping a change another request made to the others', async () => {
    const { repo, sql, rows } = await setup();
    sql.exec(`UPDATE calendar_events SET title = 'Renombrado por otro' WHERE id = 1`);
    expect(await repo.update(1, { done: true, time: null })).toMatchObject({ id: 1, title: 'Renombrado por otro', done: true, time: null, note: 'Muestras' });
    expect(rows()[0]).toEqual({ id: 1, type: 'reunion', title: 'Renombrado por otro', event_date: '2026-11-26', event_time: null, note: 'Muestras', done: 1 });
  });

  it('writes nothing and answers null for an event that does not exist', async () => {
    const { repo, rows } = await setup();
    const before = rows();
    expect(await repo.update(9, { done: true })).toBeNull();
    expect(await repo.delete(9)).toBeNull();
    expect(rows()).toEqual(before);
  });

  it('deletes an event and answers it as it was', async () => {
    const { repo, rows } = await setup();
    expect(await repo.delete(3)).toMatchObject({ id: 3, title: 'Pedir PETG' });
    expect(rows().map((r) => r.id)).toEqual([1, 2, 4]);
  });

  it('refuses a row the rules would reject', async () => {
    const { sql } = await setup();
    const insert = (type: string, title: string, done: number) => () =>
      sql.exec(`INSERT INTO calendar_events (type, title, event_date, done, created_at, updated_at) VALUES ('${type}', '${title}', '2026-11-26', ${done}, '${stamp}', '${stamp}')`);
    expect(insert('fiesta', 'x', 0)).toThrow();
    expect(insert('tarea', '', 0)).toThrow();
    expect(insert('tarea', 'x'.repeat(121), 0)).toThrow();
    expect(insert('tarea', 'x', 2)).toThrow();
  });
});
