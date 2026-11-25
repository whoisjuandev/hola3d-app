// The calculator profiles D1 adapter's SQL run against a real SQLite database with the migrations applied.
import { describe, expect, it } from 'vitest';
import type { CalcInput } from '../../shared/calculator';
import { sqliteD1 } from '../print-jobs/sqlite-d1';
import { d1CalcProfileRepository } from './repository';

const stamp = '2026-11-01T00:00:00.000Z';
const input: CalcInput = {
  lines: [{ name: 'Llavero', quantity: 12, printerId: 1, printMinutesPerUnit: 30, filaments: [{ spoolId: 1, material: '', pricePerKg: 0, gramsPerUnit: 8 }], prepMinutes: 20, postMinutes: 40, packaging: 1200 }],
  profit: { mode: 'multiplicador', value: 3 },
};
const other: CalcInput = { lines: [{ ...input.lines[0], name: 'Cartel', quantity: 1 }] };

async function setup() {
  const { db, sql } = await sqliteD1();
  sql.exec(`
    INSERT INTO calc_profiles (id, name, input_json, created_at, updated_at) VALUES
      (1, 'Llaveros por mayor', '${JSON.stringify(input)}', '${stamp}', '${stamp}'),
      (2, 'carteles', '${JSON.stringify(other)}', '${stamp}', '${stamp}');
  `);
  const rows = () => sql.prepare('SELECT id, name, input_json FROM calc_profiles ORDER BY id').all();
  return { repo: d1CalcProfileRepository(db), sql, rows };
}

describe('D1 calculator profiles', () => {
  it('lists by name ignoring case and reads the input back', async () => {
    const { repo } = await setup();
    expect(await repo.list()).toEqual([
      { id: 2, name: 'carteles', input: other, createdAt: stamp, updatedAt: stamp },
      { id: 1, name: 'Llaveros por mayor', input, createdAt: stamp, updatedAt: stamp },
    ]);
  });

  it('creates a profile, and writes nothing for a name taken in another case', async () => {
    const { repo, rows } = await setup();
    expect(await repo.create({ name: 'Soportes', input: other })).toEqual({
      id: 3, name: 'Soportes', input: other, createdAt: expect.any(String), updatedAt: expect.any(String),
    });
    const before = rows();
    expect(await repo.create({ name: 'CARTELES', input })).toBe('duplicate');
    expect(rows()).toEqual(before);
  });

  it('writes only the sent columns, keeping a change another request made to the others', async () => {
    const { repo, sql, rows } = await setup();
    sql.exec(`UPDATE calc_profiles SET name = 'Renombrado por otro' WHERE id = 1`);
    expect(await repo.update(1, { input: other })).toMatchObject({ id: 1, name: 'Renombrado por otro', input: other });
    expect(await repo.update(1, { name: 'LLAVEROS' })).toMatchObject({ id: 1, name: 'LLAVEROS', input: other });
    expect(rows()[0]).toEqual({ id: 1, name: 'LLAVEROS', input_json: JSON.stringify(other) });
  });

  it('renames to its own name in another case, and writes nothing for the name of another profile', async () => {
    const { repo, rows } = await setup();
    expect(await repo.update(1, { name: 'LLAVEROS POR MAYOR' })).toMatchObject({ id: 1, name: 'LLAVEROS POR MAYOR' });
    const before = rows();
    expect(await repo.update(1, { name: 'Carteles', input: other })).toBe('duplicate');
    expect(rows()).toEqual(before);
  });

  it('writes nothing and answers null for a profile that does not exist', async () => {
    const { repo, rows } = await setup();
    const before = rows();
    expect(await repo.update(9, { name: 'Otro' })).toBeNull();
    expect(await repo.update(9, { input })).toBeNull();
    expect(await repo.delete(9)).toBeNull();
    expect(rows()).toEqual(before);
  });

  it('deletes a profile and answers it as it was', async () => {
    const { repo, rows } = await setup();
    expect(await repo.delete(2)).toMatchObject({ id: 2, name: 'carteles' });
    expect(rows().map((r) => r.id)).toEqual([1]);
  });

  it('keeps names unique without case and between 1 and 60 characters in SQL too', async () => {
    const { sql } = await setup();
    expect(() => sql.exec(`INSERT INTO calc_profiles (name, input_json, created_at, updated_at) VALUES ('CARTELES', '{}', '${stamp}', '${stamp}')`)).toThrow();
    expect(() => sql.exec(`INSERT INTO calc_profiles (name, input_json, created_at, updated_at) VALUES ('', '{}', '${stamp}', '${stamp}')`)).toThrow();
    expect(() => sql.exec(`INSERT INTO calc_profiles (name, input_json, created_at, updated_at) VALUES ('${'x'.repeat(61)}', '{}', '${stamp}', '${stamp}')`)).toThrow();
  });
});
