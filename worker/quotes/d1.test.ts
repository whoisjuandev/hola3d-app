// The quotes table rebuild of migration 0015 and the quote D1 adapter's SQL, run against a real SQLite database.
import { describe, expect, it } from 'vitest';
import type { CalcInput, CalcResult } from '../../shared/calculator';
import { sqliteD1, migrationSql } from '../print-jobs/sqlite-d1';
import { d1QuoteRepository, type QuoteDraft } from './repository';

const stamp = '2026-11-01T00:00:00.000Z';
const input: CalcInput = { lines: [] };
const result = { lines: [{ name: 'Llavero', quantity: 2, total: 3000 }], total: 3000 } as unknown as CalcResult;

/** Two clients, three quotes (ids 1, 2 and 5, numbers 1 to 3) and orders linked to two of them, as before 0015. */
const ROWS_BEFORE_0015 = `
  INSERT INTO clients (id, name, phone, created_at, updated_at) VALUES
    (1, 'Café Nube', '+54 9 11 5555-0142', '${stamp}', '${stamp}'),
    (2, 'Lucía M.', '', '${stamp}', '${stamp}');
  INSERT INTO quotes (id, number, client_id, title, status, valid_until, input_json, result_json, total, note, created_at, updated_at) VALUES
    (1, 1, 1, 'Llaveros', 'aceptado', '2026-11-24', '${JSON.stringify(input)}', '${JSON.stringify(result)}', 3000, 'Seña 50 %', '${stamp}', '${stamp}'),
    (2, 2, 2, 'Macetas', 'enviado', '2026-12-06', '{"lines":[]}', '{"lines":[],"total":0}', 0, '', '${stamp}', '${stamp}'),
    (5, 3, 1, 'Cartel', 'borrador', '2026-12-09', '{"lines":[]}', '{"lines":[],"total":0}', 0, '', '${stamp}', '${stamp}');
  INSERT INTO orders (id, item, client, client_id, quote_id, channel, stage, price, created_at, updated_at) VALUES
    ('0001', 'Llaveros × 12', 'Café Nube', 1, 1, 'Instagram', 'nuevo', 3000, '${stamp}', '${stamp}'),
    ('0002', 'Maceta', 'Lucía M.', 2, NULL, 'WhatsApp', 'nuevo', 1000, '${stamp}', '${stamp}'),
    ('0003', 'Cartel', 'Café Nube', 1, 5, 'WhatsApp', 'listo', 2000, '${stamp}', '${stamp}');
`;

describe('migration 0015 (quotes without a client)', () => {
  it('rebuilds the quotes table keeping every quote, its id and number, and the orders that point to it', async () => {
    const { db, sql } = await sqliteD1({ before: '0015' });
    sql.exec(ROWS_BEFORE_0015);
    // A quote saved and then deleted (as the dev seed does) leaves the id sequence above the highest id.
    sql.exec(`INSERT INTO quotes (id, number, client_id, title, valid_until, input_json, result_json, total, created_at, updated_at)
      VALUES (7, 4, 1, 'Borrado', '2026-12-01', '{}', '{}', 0, '${stamp}', '${stamp}'); DELETE FROM quotes WHERE id = 7;`);
    const quotesBefore = sql.prepare('SELECT * FROM quotes ORDER BY id').all();
    const ordersBefore = sql.prepare('SELECT * FROM orders ORDER BY id').all();

    // As D1 applies a migration: one transaction, with foreign keys on.
    sql.exec('BEGIN');
    sql.exec(migrationSql('0015'));
    sql.exec('COMMIT');

    expect(sql.prepare('SELECT * FROM quotes ORDER BY id').all()).toEqual(
      quotesBefore.map((q) => ({ ...q, recipient_name: '', recipient_phone: '', show_breakdown: 0 })),
    );
    expect(sql.prepare('SELECT * FROM orders ORDER BY id').all()).toEqual(ordersBefore);
    expect(sql.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(sql.prepare('PRAGMA foreign_key_list(orders)').all().map((fk) => fk.table)).toContain('quotes');
    expect(sql.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'quotes' AND sql IS NOT NULL").all())
      .toEqual([{ name: 'quotes_client' }]);

    // The sequences go on: the next quote is number 4, and its id comes after every id ever given, as before.
    const repo = d1QuoteRepository(db);
    const next = await repo.create({
      clientId: null, recipientName: 'Juan', recipientPhone: '', title: 'Imán', validUntil: null, note: '', showBreakdown: false,
      status: 'enviado', input, result,
    });
    expect(next).toMatchObject({ id: 8, number: 'P-0004' });
    expect((await repo.list()).map((q) => q.number)).toEqual(['P-0004', 'P-0003', 'P-0002', 'P-0001']);
  });

  it('requires in SQL a client or a recipient name, and lets the validity be empty', async () => {
    const { sql } = await sqliteD1();
    sql.exec(ROWS_BEFORE_0015.split('INSERT INTO orders')[0]);
    const insert = (number: number, client: string, recipient: string, validUntil: string) => sql.exec(
      `INSERT INTO quotes (number, client_id, recipient_name, title, valid_until, input_json, result_json, total, created_at, updated_at)
       VALUES (${number}, ${client}, '${recipient}', 'x', ${validUntil}, '{}', '{}', 0, '${stamp}', '${stamp}')`,
    );
    expect(() => insert(10, 'NULL', '', 'NULL')).toThrow();
    expect(() => insert(10, 'NULL', '  ', 'NULL')).toThrow();
    expect(() => insert(10, 'NULL', 'Juan', 'NULL')).not.toThrow();
    expect(() => insert(11, '1', '', "'2026-12-10'")).not.toThrow();
    expect(() => sql.exec(`UPDATE quotes SET show_breakdown = 2 WHERE number = 10`)).toThrow();
  });
});

const quick: QuoteDraft = {
  clientId: null, recipientName: 'Juan Pérez', recipientPhone: '+54 9 11 5555-0199', title: 'Llaveros', validUntil: null, note: 'Entrega en 5 días.',
  showBreakdown: true, status: 'enviado', input, result,
};
const order = { item: 'Llavero × 2', channel: 'WhatsApp' as const, price: 3000, dueDate: null, dueTime: null, deposit: null, material: '', note: '' };

async function setup() {
  const { db, sql } = await sqliteD1();
  sql.exec(ROWS_BEFORE_0015);
  const repo = d1QuoteRepository(db);
  const rows = () => ({
    quotes: sql.prepare('SELECT * FROM quotes ORDER BY id').all(),
    orders: sql.prepare('SELECT id, client_id, quote_id, price FROM orders ORDER BY id').all(),
  });
  return { repo, sql, rows };
}

describe('D1 quotes without a client', () => {
  it('saves a quick quote with its recipient, no client and no validity, and reads it back', async () => {
    const { repo } = await setup();
    const saved = await repo.create(quick);
    expect(saved).toEqual({
      id: 6, number: 'P-0004', clientId: null, client: null, recipientName: 'Juan Pérez', recipientPhone: '+54 9 11 5555-0199', title: 'Llaveros',
      status: 'enviado', validUntil: null, showBreakdown: true, input, result, total: 3000, note: 'Entrega en 5 días.',
      createdAt: expect.any(String), updatedAt: expect.any(String),
    });
    expect(await repo.get(6)).toEqual(saved);
    expect(await repo.list({ clientId: 1 })).toHaveLength(2);
  });

  it('reads a quote with a client with an empty recipient and the breakdown off', async () => {
    const { repo } = await setup();
    expect(await repo.get(2)).toMatchObject({ clientId: 2, client: 'Lucía M.', recipientName: '', recipientPhone: '', showBreakdown: false, validUntil: '2026-12-06' });
  });

  it('accepting links the client and creates the orders in one write, only once', async () => {
    const { repo, rows } = await setup();
    await repo.create(quick);
    expect(await repo.accept(6, 2, [order])).toBe(true);
    expect(await repo.get(6)).toMatchObject({ clientId: 2, client: 'Lucía M.', status: 'aceptado', recipientName: 'Juan Pérez' });
    const after = rows();
    expect(after.orders.filter((o) => o.quote_id === 6)).toEqual([{ id: '0004', client_id: 2, quote_id: 6, price: 3000 }]);

    // A second accept, for another client, writes nothing: the quote keeps its first client.
    expect(await repo.accept(6, 1, [order])).toBe(false);
    expect(rows()).toEqual(after);
  });

  it('accepting a quote with a client keeps that client', async () => {
    const { repo } = await setup();
    expect(await repo.accept(2, 2, [order])).toBe(true);
    expect(await repo.get(2)).toMatchObject({ clientId: 2, status: 'aceptado' });
  });

  it('an edit writes only the sent columns, keeping a change another request made to the others', async () => {
    const { repo, sql } = await setup();
    await repo.create(quick);
    sql.exec(`UPDATE quotes SET note = 'Cambiado por otro', status = 'rechazado' WHERE id = 6`);
    expect(await repo.update(6, { recipientName: 'Juan P.', showBreakdown: false, validUntil: '2026-12-31' })).toMatchObject({
      recipientName: 'Juan P.', showBreakdown: false, validUntil: '2026-12-31', note: 'Cambiado por otro', status: 'rechazado', title: 'Llaveros',
      recipientPhone: '+54 9 11 5555-0199',
    });
    expect(await repo.update(6, { validUntil: null, recipientPhone: '' })).toMatchObject({ validUntil: null, recipientPhone: '' });
  });

  it('an edit that sends a status does not undo an accept that landed first, and writes nothing', async () => {
    const { repo, rows } = await setup();
    await repo.accept(2, 2, [order]);
    const before = rows();
    expect(await repo.update(2, { status: 'enviado', title: 'Otro' })).toBeNull();
    expect(rows()).toEqual(before);
    expect(await repo.update(2, { note: 'Pagó la seña.' })).toMatchObject({ status: 'aceptado', note: 'Pagó la seña.' });
  });
});
