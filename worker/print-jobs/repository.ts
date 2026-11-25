import { spoolLabel } from '../../shared/calculator';
import { DEFAULT_COST_SETTINGS, type CostSettingsInput } from '../../shared/cost-settings';
import {
  realCost, statusForResult, type NewPrintJob, type PrintJob, type PrintJobStatus, type PrintResult, type RealCost, type RealCostJob,
} from '../../shared/print-jobs';
import type { MemoryTables, StoredPrintJob } from '../memory';

/** Port: what the print job routes need from storage. */
export interface PrintJobRepository {
  /** The order's jobs, oldest first, with printer and spool names read through them. */
  listByOrder(orderId: string): Promise<PrintJob[]>;
  /** The order's real cost from its printed jobs, or null while it has none. */
  costOf(orderId: string): Promise<RealCost | null>;
  /**
   * In one atomic write: store the finished job and its grams per spool, add its minutes to the printer and take
   * its grams off each spool. Only while the order, the printer and every spool exist and every spool has enough
   * grams left; otherwise returns null having written nothing. Each spool appears once in `job.filaments`.
   */
  log(orderId: string, job: NewPrintJob): Promise<PrintJob | null>;
  /**
   * In one atomic write: delete a printed job of the order, take its minutes off the printer and give its grams back
   * to each spool (never below 0 minutes or above a spool's net weight). False when the order has no such job.
   */
  remove(orderId: string, jobId: number): Promise<boolean>;
}

interface PrintJobRow {
  id: number;
  order_id: string;
  printer_id: number;
  printer_name: string;
  status: string;
  planned_start: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  result: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

interface FilamentRow {
  job_id: number;
  spool_id: number;
  grams: number;
  material: string;
  color_name: string;
  color_hex: string;
  brand: string;
}

function toPrintJob(row: PrintJobRow, filaments: FilamentRow[]): PrintJob {
  return {
    id: row.id,
    orderId: row.order_id,
    printerId: row.printer_id,
    printer: row.printer_name,
    status: row.status as PrintJobStatus,
    result: row.result as PrintResult | null,
    plannedStart: row.planned_start,
    estimatedMinutes: row.estimated_minutes,
    actualMinutes: row.actual_minutes,
    note: row.note,
    filaments: filaments
      .filter((f) => f.job_id === row.id)
      .map((f) => ({
        spoolId: f.spool_id,
        spool: spoolLabel({ material: f.material, colorName: f.color_name, brand: f.brand }),
        colorHex: f.color_hex,
        grams: f.grams,
      })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const JOBS = 'SELECT print_jobs.*, printers.name AS printer_name FROM print_jobs JOIN printers ON printers.id = print_jobs.printer_id';
const FILAMENTS = `SELECT f.job_id, f.spool_id, f.grams, s.material, s.color_name, s.color_hex, s.brand
  FROM print_job_filaments f JOIN spools s ON s.id = f.spool_id JOIN print_jobs ON print_jobs.id = f.job_id`;
const PRINTED = "print_jobs.status IN ('terminada', 'fallida')";

interface CostRow {
  job_id: number;
  order_id: string;
  status: string;
  actual_minutes: number | null;
  power_watts: number;
  purchase_price: number;
  lifetime_hours: number;
  grams: number | null;
  spool_price: number | null;
  net_grams: number | null;
}

/** Group cost rows (one per job and spool) by order, and work out each order's real cost. */
function costsFromRows(rows: CostRow[], settings: CostSettingsInput): Map<string, RealCost> {
  const byOrder = new Map<string, Map<number, RealCostJob>>();
  for (const row of rows) {
    const jobs = byOrder.get(row.order_id) ?? new Map<number, RealCostJob>();
    byOrder.set(row.order_id, jobs);
    const job = jobs.get(row.job_id) ?? {
      status: row.status as PrintJobStatus,
      actualMinutes: row.actual_minutes,
      printer: { powerWatts: row.power_watts, purchasePrice: row.purchase_price, lifetimeHours: row.lifetime_hours },
      filaments: [],
    };
    jobs.set(row.job_id, job);
    if (row.grams !== null && row.spool_price !== null && row.net_grams !== null) {
      job.filaments.push({ grams: row.grams, spool: { price: row.spool_price, netGrams: row.net_grams } });
    }
  }
  const out = new Map<string, RealCost>();
  for (const [orderId, jobs] of byOrder) {
    const cost = realCost([...jobs.values()], settings);
    if (cost) out.set(orderId, cost);
  }
  return out;
}

/**
 * The real cost of each of these orders that has printed jobs, with the stored cost settings (or the defaults while
 * they were never saved). Prices come from the printers and spools as they are now.
 */
export async function d1RealCosts(db: D1Database, orderIds: string[]): Promise<Map<string, RealCost>> {
  if (orderIds.length === 0) return new Map();
  const { results } = await db
    .prepare(
      `SELECT print_jobs.id AS job_id, print_jobs.order_id, print_jobs.status, print_jobs.actual_minutes,
         printers.power_watts, printers.purchase_price, printers.lifetime_hours, f.grams, spools.price AS spool_price, spools.net_grams
       FROM print_jobs
       JOIN printers ON printers.id = print_jobs.printer_id
       LEFT JOIN print_job_filaments f ON f.job_id = print_jobs.id
       LEFT JOIN spools ON spools.id = f.spool_id
       WHERE ${PRINTED} AND print_jobs.order_id IN (SELECT value FROM json_each(?))
       ORDER BY print_jobs.id, f.id`,
    )
    .bind(JSON.stringify(orderIds))
    .all<CostRow>();
  if (results.length === 0) return new Map();
  const row = await db
    .prepare('SELECT kwh_price, monthly_fixed_costs, monthly_print_hours FROM cost_settings WHERE id = 1')
    .first<{ kwh_price: number; monthly_fixed_costs: number; monthly_print_hours: number }>();
  const settings = row
    ? { ...DEFAULT_COST_SETTINGS, kwhPrice: row.kwh_price, monthlyFixedCosts: row.monthly_fixed_costs, monthlyPrintHours: row.monthly_print_hours }
    : DEFAULT_COST_SETTINGS;
  return costsFromRows(results, settings);
}

/** Adapter: D1 storage. */
export function d1PrintJobRepository(db: D1Database): PrintJobRepository {
  const read = async (where: string, param: unknown): Promise<PrintJob[]> => {
    const [jobs, filaments] = await Promise.all([
      db.prepare(`${JOBS} WHERE ${where} ORDER BY print_jobs.id`).bind(param).all<PrintJobRow>(),
      db.prepare(`${FILAMENTS} WHERE ${where} ORDER BY f.id`).bind(param).all<FilamentRow>(),
    ]);
    return jobs.results.map((row) => toPrintJob(row, filaments.results));
  };

  return {
    listByOrder(orderId) {
      return read('print_jobs.order_id = ?', orderId);
    },

    async costOf(orderId) {
      return (await d1RealCosts(db, [orderId])).get(orderId) ?? null;
    },

    async log(orderId, job) {
      const now = new Date().toISOString();
      // Every statement repeats the same guard: the order, printer and spools exist and each spool has enough grams.
      // Nothing in the batch changes what the guard reads until the last statement, which takes the grams off all the
      // spools at once; the guard there is not correlated to the row, so SQLite evaluates it once, before any row
      // changes. D1 runs a batch as one transaction, so either everything is written or nothing is.
      const guard = [
        'EXISTS (SELECT 1 FROM orders WHERE id = ?)',
        'EXISTS (SELECT 1 FROM printers WHERE id = ?)',
        ...job.filaments.map(() => 'EXISTS (SELECT 1 FROM spools WHERE id = ? AND remaining_grams >= ?)'),
      ].join(' AND ');
      const guardParams = [orderId, job.printerId, ...job.filaments.flatMap((f) => [f.spoolId, f.grams])];

      const results = await db.batch<{ id: number }>([
        db
          .prepare(
            `INSERT INTO print_jobs (order_id, printer_id, status, actual_minutes, result, note, created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}
             RETURNING id`,
          )
          .bind(orderId, job.printerId, statusForResult(job.result), job.actualMinutes, job.result, job.note, now, now, ...guardParams),
        // AUTOINCREMENT ids only grow, so inside this transaction the highest id is the job just inserted.
        ...job.filaments.map((f) =>
          db
            .prepare(`INSERT INTO print_job_filaments (job_id, spool_id, grams) SELECT (SELECT MAX(id) FROM print_jobs), ?, ? WHERE ${guard}`)
            .bind(f.spoolId, f.grams, ...guardParams),
        ),
        db
          .prepare(`UPDATE printers SET print_minutes = print_minutes + ?, updated_at = ? WHERE id = ? AND ${guard}`)
          .bind(job.actualMinutes, now, job.printerId, ...guardParams),
        db
          .prepare(
            `UPDATE spools SET remaining_grams = remaining_grams - CASE id ${job.filaments.map(() => 'WHEN ? THEN ?').join(' ')} END, updated_at = ?
             WHERE id IN (${job.filaments.map(() => '?').join(', ')}) AND ${guard}`,
          )
          .bind(...job.filaments.flatMap((f) => [f.spoolId, f.grams]), now, ...job.filaments.map((f) => f.spoolId), ...guardParams),
      ]);
      const id = results[0]?.results[0]?.id;
      if (id === undefined) return null;
      return (await read('print_jobs.id = ?', id))[0] ?? null;
    },

    async remove(orderId, jobId) {
      const now = new Date().toISOString();
      const job = `SELECT %s FROM print_jobs WHERE id = ?1 AND order_id = ?2 AND ${PRINTED}`;
      const results = await db.batch([
        db
          .prepare(
            `UPDATE printers SET print_minutes = MAX(0, print_minutes - (${job.replace('%s', 'actual_minutes')})), updated_at = ?3
             WHERE id = (${job.replace('%s', 'printer_id')})`,
          )
          .bind(jobId, orderId, now),
        db
          .prepare(
            `UPDATE spools SET remaining_grams = MIN(net_grams, remaining_grams + (SELECT grams FROM print_job_filaments WHERE job_id = ?1 AND spool_id = spools.id)),
               updated_at = ?3
             WHERE id IN (SELECT spool_id FROM print_job_filaments WHERE job_id = (${job.replace('%s', 'id')}))`,
          )
          .bind(jobId, orderId, now),
        db.prepare(`DELETE FROM print_job_filaments WHERE job_id = (${job.replace('%s', 'id')})`).bind(jobId, orderId),
        db.prepare(`DELETE FROM print_jobs WHERE id = ?1 AND order_id = ?2 AND ${PRINTED} RETURNING id`).bind(jobId, orderId),
      ]);
      return (results.at(-1)?.results.length ?? 0) === 1;
    },
  };
}

function memoryJobs(tables: MemoryTables, orderId: string): StoredPrintJob[] {
  return [...tables.printJobs.values()].filter((j) => j.orderId === orderId).sort((a, b) => a.id - b.id);
}

/** The order's real cost from the in-memory tables, as `d1RealCosts` works it out. */
export function memoryRealCost(tables: MemoryTables, orderId: string): RealCost | null {
  const jobs: RealCostJob[] = [];
  for (const job of memoryJobs(tables, orderId)) {
    const printer = tables.printers.get(job.printerId);
    if (!printer) continue;
    const filaments = job.filaments.flatMap((f) => {
      const spool = tables.spools.get(f.spoolId);
      return spool ? [{ grams: f.grams, spool }] : [];
    });
    jobs.push({ status: job.status, actualMinutes: job.actualMinutes, printer, filaments });
  }
  return realCost(jobs, tables.settings ?? DEFAULT_COST_SETTINGS);
}

/** Adapter: in-memory storage for tests. Shares its tables with the in-memory order, printer and spool repositories. */
export function memoryPrintJobRepository(tables: MemoryTables): PrintJobRepository {
  const { printJobs, printers, spools } = tables;
  const view = (job: StoredPrintJob): PrintJob => ({
    ...structuredClone(job),
    printer: printers.get(job.printerId)?.name ?? '',
    filaments: job.filaments.map((f) => {
      const spool = spools.get(f.spoolId);
      return { spoolId: f.spoolId, spool: spool ? spoolLabel(spool) : '', colorHex: spool?.colorHex ?? '', grams: f.grams };
    }),
  });

  return {
    async listByOrder(orderId) {
      return memoryJobs(tables, orderId).map(view);
    },
    async costOf(orderId) {
      return memoryRealCost(tables, orderId);
    },
    async log(orderId, job) {
      // No await in here, so nothing can run between the checks and the writes.
      const printer = printers.get(job.printerId);
      const enough = job.filaments.every((f) => (spools.get(f.spoolId)?.remainingGrams ?? -1) >= f.grams);
      if (!tables.orders.has(orderId) || !printer || !enough) return null;
      const now = new Date().toISOString();
      const stored: StoredPrintJob = {
        id: Math.max(0, ...printJobs.keys()) + 1, orderId, printerId: job.printerId, status: statusForResult(job.result), result: job.result,
        plannedStart: null, estimatedMinutes: null, actualMinutes: job.actualMinutes, note: job.note,
        filaments: job.filaments.map((f) => ({ ...f })), createdAt: now, updatedAt: now,
      };
      printJobs.set(stored.id, stored);
      printers.set(printer.id, { ...printer, printMinutes: printer.printMinutes + job.actualMinutes, updatedAt: now });
      for (const f of job.filaments) {
        const spool = spools.get(f.spoolId);
        if (spool) spools.set(spool.id, { ...spool, remainingGrams: spool.remainingGrams - f.grams, updatedAt: now });
      }
      return view(stored);
    },
    async remove(orderId, jobId) {
      const job = printJobs.get(jobId);
      if (!job || job.orderId !== orderId || job.status === 'planeada') return false;
      const now = new Date().toISOString();
      const printer = printers.get(job.printerId);
      if (printer) printers.set(printer.id, { ...printer, printMinutes: Math.max(0, printer.printMinutes - (job.actualMinutes ?? 0)), updatedAt: now });
      for (const f of job.filaments) {
        const spool = spools.get(f.spoolId);
        if (spool) spools.set(spool.id, { ...spool, remainingGrams: Math.min(spool.netGrams, spool.remainingGrams + f.grams), updatedAt: now });
      }
      printJobs.delete(jobId);
      return true;
    },
  };
}
