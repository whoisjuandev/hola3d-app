// The D1 adapter's SQL run against a real SQLite database with the migrations applied (see sqlite-d1.ts).
import { describe, expect, it } from 'vitest';
import type { NewPrintJob } from '../../shared/print-jobs';
import { d1PrintJobRepository } from './repository';
import { sqliteD1 } from './sqlite-d1';

const stamp = '2026-11-01T00:00:00.000Z';
const cost = { material: 630, energy: 30, machineWear: 216, fixedCosts: 900, labour: 0, extra: 0 };
const printed = (printerId: number, spoolId = 1): NewPrintJob => ({
  printerId, actualMinutes: 90, result: 'ok', labourMinutes: 0, extraCost: 0, note: 'Salió', filaments: [{ spoolId, grams: 30 }],
});
const key = '0b6c5f4e-9a51-4c1e-8f43-2f1d3c4b5a69';

// Order 0143; La A1 (1) and La P1S (3); white (1) with 640 g and yellow (2) with 30 g. Job 2 was planned on La A1 and
// moved to La P1S, and carries a grams row of yellow (as a hand-edited database could).
async function setup() {
  const { db, sql } = await sqliteD1();
  sql.exec(`
    INSERT INTO clients (id, name, created_at, updated_at) VALUES (1, 'Café Nube', '${stamp}', '${stamp}');
    INSERT INTO orders (id, item, client, client_id, channel, price, created_at, updated_at) VALUES ('0143', 'Maceta', 'Café Nube', 1, 'Instagram', 12000, '${stamp}', '${stamp}');
    INSERT INTO printers (id, name, purchase_price, lifetime_hours, power_watts, print_minutes, created_at, updated_at) VALUES
      (1, 'La A1', 720000, 5000, 100, 7200, '${stamp}', '${stamp}'), (3, 'La P1S', 720000, 5000, 100, 600, '${stamp}', '${stamp}');
    INSERT INTO spools (id, material, color_name, color_hex, net_grams, remaining_grams, price, created_at, updated_at) VALUES
      (1, 'PLA', 'Blanco', '#ffffff', 1000, 640, 21000, '${stamp}', '${stamp}'), (2, 'PLA', 'Amarillo', '#ffc42e', 1000, 30, 21000, '${stamp}', '${stamp}');
    INSERT INTO print_jobs (id, order_id, printer_id, status, planned_start, estimated_minutes, note, created_at, updated_at) VALUES
      (2, '0143', 3, 'planeada', '2026-11-26T09:00', 480, 'Maceta grande', '${stamp}', '${stamp}');
    INSERT INTO print_job_filaments (job_id, spool_id, grams) VALUES (2, 2, 5);
  `);
  const all = (query: string) => sql.prepare(query).all();
  const snapshot = () => ({
    jobs: all('SELECT id, printer_id, status, actual_minutes, result, submission_key, cost_material FROM print_jobs ORDER BY id'),
    grams: all('SELECT job_id, spool_id, grams FROM print_job_filaments ORDER BY id'),
    printers: all('SELECT id, print_minutes FROM printers ORDER BY id'),
    spools: all('SELECT id, remaining_grams FROM spools ORDER BY id'),
  });
  return { repo: d1PrintJobRepository(db), sql, snapshot };
}

describe('D1 finish', () => {
  it('writes nothing for a stale planned printer, then applies everything once on the printer the job is on', async () => {
    const { repo, snapshot } = await setup();
    const before = snapshot();
    expect(await repo.finish('0143', 2, 1, printed(1), cost)).toBeNull();
    expect(snapshot()).toEqual(before);

    expect(await repo.finish('0143', 2, 3, printed(3), cost)).toMatchObject({ id: 2, printerId: 3, status: 'terminada', actualMinutes: 90 });
    expect(snapshot()).toEqual({
      jobs: [{ id: 2, printer_id: 3, status: 'terminada', actual_minutes: 90, result: 'ok', submission_key: null, cost_material: 630 }],
      grams: [{ job_id: 2, spool_id: 2, grams: 5 }, { job_id: 2, spool_id: 1, grams: 30 }],
      printers: [{ id: 1, print_minutes: 7200 }, { id: 3, print_minutes: 690 }],
      spools: [{ id: 1, remaining_grams: 610 }, { id: 2, remaining_grams: 30 }],
    });
  });

  it('stores its submission key, and refuses a key another job carries', async () => {
    const { repo, sql, snapshot } = await setup();
    expect(await repo.log('0143', printed(1), cost, key)).not.toBeNull();
    const before = snapshot();
    expect(await repo.finish('0143', 2, 3, printed(3), cost, key)).toBeNull();
    expect(snapshot()).toEqual(before);
    expect(await repo.finish('0143', 2, 3, printed(3), cost, 'otra-clave-1234')).not.toBeNull();
    expect(sql.prepare('SELECT submission_key FROM print_jobs WHERE id = 2').all()).toEqual([{ submission_key: 'otra-clave-1234' }]);
  });
});

describe('D1 log with a submission key', () => {
  it('logs once with a key, moving the counters, and finds the job by it', async () => {
    const { repo, snapshot } = await setup();
    const job = await repo.log('0143', printed(1), cost, key);
    expect(job).toMatchObject({ id: 3, orderId: '0143', status: 'terminada' });
    expect(snapshot()).toMatchObject({
      grams: [{ job_id: 2, spool_id: 2, grams: 5 }, { job_id: 3, spool_id: 1, grams: 30 }],
      printers: [{ id: 1, print_minutes: 7290 }, { id: 3, print_minutes: 600 }],
      spools: [{ id: 1, remaining_grams: 610 }, { id: 2, remaining_grams: 30 }],
    });
    expect(await repo.bySubmission(key)).toEqual(job);
  });

  it('writes nothing for a key a job carries, whether that job is the newest or not', async () => {
    const { repo, snapshot } = await setup();
    expect(await repo.log('0143', printed(1), cost, key)).not.toBeNull();
    let before = snapshot();
    expect(await repo.log('0143', printed(1), cost, key)).toBeNull(); // the newest job carries it
    expect(snapshot()).toEqual(before);
    expect(await repo.log('0143', printed(3), cost)).not.toBeNull();
    before = snapshot();
    expect(await repo.log('0143', printed(1), cost, key)).toBeNull(); // an older job carries it
    expect(snapshot()).toEqual(before);
  });

  it('logs the same job twice without a key', async () => {
    const { repo, snapshot } = await setup();
    expect(await repo.log('0143', printed(1), cost)).not.toBeNull();
    expect(await repo.log('0143', printed(1), cost)).not.toBeNull();
    expect(snapshot()).toMatchObject({ printers: [{ id: 1, print_minutes: 7380 }, { id: 3, print_minutes: 600 }], spools: [{ id: 1, remaining_grams: 580 }, { id: 2, remaining_grams: 30 }] });
  });
});

describe('print_jobs result', () => {
  it('refuses a finished row without a result, on insert and on update', async () => {
    const { sql, snapshot } = await setup();
    const before = snapshot();
    for (const status of ['terminada', 'fallida']) {
      expect(() => sql.exec(`INSERT INTO print_jobs (order_id, printer_id, status, actual_minutes, created_at, updated_at)
        VALUES ('0143', 1, '${status}', 90, '${stamp}', '${stamp}')`)).toThrow(/finished print job needs a result/);
      expect(() => sql.exec(`UPDATE print_jobs SET status = '${status}', actual_minutes = 90 WHERE id = 2`)).toThrow(/finished print job needs a result/);
    }
    expect(snapshot()).toEqual(before);
  });
});
