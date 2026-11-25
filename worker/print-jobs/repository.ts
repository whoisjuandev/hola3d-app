import { spoolLabel } from '../../shared/calculator';
import { addMinutes, overlappingJob, type PlannedJobInput } from '../../shared/calendar';
import {
  NO_JOB_COST, realCost, statusForResult, type CostedJob, type JobCost, type NewPrintJob, type PrintJob, type PrintJobStatus, type PrintResult, type RealCost,
} from '../../shared/print-jobs';
import type { MemoryTables, StoredPrintJob } from '../memory';

/** Port: what the print job routes need from storage. */
export interface PrintJobRepository {
  /** The order's jobs, oldest first, with printer and spool names read through them. */
  listByOrder(orderId: string): Promise<PrintJob[]>;
  /** The order's real cost from the stored costs of its printed jobs, or null while it has none. */
  costOf(orderId: string): Promise<RealCost | null>;
  /**
   * In one atomic write: store the finished job with its cost and its grams per spool, add its minutes to the
   * printer and take its grams off each spool. Only while the order, the printer and every spool exist and every
   * spool has enough grams left; otherwise returns null having written nothing. Each spool appears once in
   * `job.filaments`. `cost` is the job's cost worked out by the caller with the prices and settings of now.
   */
  log(orderId: string, job: NewPrintJob, cost: JobCost): Promise<PrintJob | null>;
  /**
   * In one atomic write: delete a printed job of the order, take its minutes off the printer and give its grams back
   * to each spool (never below 0 minutes or above a spool's net weight). False when the order has no such job.
   */
  remove(orderId: string, jobId: number): Promise<boolean>;
  /** One job of any order, or null. */
  get(jobId: number): Promise<PrintJob | null>;
  /** Every planned job, by start. */
  listPlanned(): Promise<PrintJob[]>;
  /**
   * Store a planned job for the order. It changes no counter and has no cost. Only while the order exists, the printer
   * exists and is `activa`, and no planned job of that printer shares time with it; otherwise returns null having
   * written nothing.
   */
  plan(orderId: string, plan: PlannedJobInput): Promise<PrintJob | null>;
  /**
   * In one statement, write only the fields in `changes` to a planned job of the order; the others keep the value the
   * row has when the statement runs. Under the same conditions as `plan`, checked in that statement on the printer and
   * span the job will have after the write (its own old span aside). Null otherwise, having written nothing.
   */
  updatePlan(orderId: string, jobId: number, changes: Partial<PlannedJobInput>): Promise<PrintJob | null>;
  /**
   * Delete a job of the order only while it is planned. It took nothing, so nothing is given back. False when there is
   * no such job or it has been finished.
   */
  removePlanned(orderId: string, jobId: number): Promise<boolean>;
  /**
   * In one atomic write, as `log` does for a new job: turn a planned job of the order into a finished one with its
   * cost, store its grams per spool, add its minutes to the printer (`job.printerId`, which may differ from the planned
   * one) and take its grams off each spool. Only while the job is still planned on `plannedPrinterId` (the printer the
   * caller read) and the order, the printer and every spool exist and every spool has enough grams left; otherwise
   * returns null having written nothing. The plan (start and estimate) stays with the job.
   */
  finish(orderId: string, jobId: number, plannedPrinterId: number, job: NewPrintJob, cost: JobCost): Promise<PrintJob | null>;
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
  labour_minutes: number;
  extra_cost: number;
  cost_material: number;
  cost_energy: number;
  cost_machine_wear: number;
  cost_fixed: number;
  cost_labour: number;
  cost_extra: number;
  note: string;
  created_at: string;
  updated_at: string;
}

type CostColumns = Pick<PrintJobRow, 'cost_material' | 'cost_energy' | 'cost_machine_wear' | 'cost_fixed' | 'cost_labour' | 'cost_extra'>;

function toJobCost(row: CostColumns): JobCost {
  return {
    material: row.cost_material,
    energy: row.cost_energy,
    machineWear: row.cost_machine_wear,
    fixedCosts: row.cost_fixed,
    labour: row.cost_labour,
    extra: row.cost_extra,
  };
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
    labourMinutes: row.labour_minutes,
    extraCost: row.extra_cost,
    cost: toJobCost(row),
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

/**
 * The condition that no planned job of the printer, other than `exceptId`, shares a minute with the span from `start` to
 * `end` (both YYYY-MM-DDTHH:MM on the same clock, so they compare as text). As `spansOverlap` in shared/calendar.ts.
 */
function freeSpan(printerId: number, start: string, end: string, exceptId: number): { sql: string; params: unknown[] } {
  return {
    sql: `NOT EXISTS (SELECT 1 FROM print_jobs other WHERE other.printer_id = ? AND other.status = 'planeada' AND other.id != ?
      AND other.planned_start < ? AND strftime('%Y-%m-%dT%H:%M', other.planned_start, '+' || other.estimated_minutes || ' minutes') > ?)`,
    params: [printerId, exceptId, end, start],
  };
}

const ACTIVE_PRINTER = "EXISTS (SELECT 1 FROM printers WHERE id = ? AND status = 'activa')";

const PLAN_COLUMNS = { printerId: 'printer_id', plannedStart: 'planned_start', estimatedMinutes: 'estimated_minutes', note: 'note' } as const;
const PLAN_KEYS = Object.keys(PLAN_COLUMNS) as (keyof PlannedJobInput)[];

interface CostRow extends CostColumns {
  order_id: string;
  status: string;
  actual_minutes: number | null;
  grams: number;
}

/**
 * The real cost of each of these orders that has printed jobs: the costs its jobs stored when they were logged, added
 * up. Reads no prices or settings.
 */
export async function d1RealCosts(db: D1Database, orderIds: string[]): Promise<Map<string, RealCost>> {
  if (orderIds.length === 0) return new Map();
  const { results } = await db
    .prepare(
      `SELECT print_jobs.order_id, print_jobs.status, print_jobs.actual_minutes, print_jobs.cost_material, print_jobs.cost_energy,
         print_jobs.cost_machine_wear, print_jobs.cost_fixed, print_jobs.cost_labour, print_jobs.cost_extra,
         (SELECT COALESCE(SUM(f.grams), 0) FROM print_job_filaments f WHERE f.job_id = print_jobs.id) AS grams
       FROM print_jobs
       WHERE ${PRINTED} AND print_jobs.order_id IN (SELECT value FROM json_each(?))
       ORDER BY print_jobs.id`,
    )
    .bind(JSON.stringify(orderIds))
    .all<CostRow>();
  const byOrder = new Map<string, CostedJob[]>();
  for (const row of results) {
    const jobs = byOrder.get(row.order_id) ?? [];
    byOrder.set(row.order_id, jobs);
    jobs.push({ status: row.status as PrintJobStatus, actualMinutes: row.actual_minutes, cost: toJobCost(row), filaments: [{ grams: row.grams }] });
  }
  const out = new Map<string, RealCost>();
  for (const [orderId, jobs] of byOrder) {
    const cost = realCost(jobs);
    if (cost) out.set(orderId, cost);
  }
  return out;
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
  const getJob = async (jobId: number) => (await read('print_jobs.id = ?', jobId))[0] ?? null;

  return {
    listByOrder(orderId) {
      return read('print_jobs.order_id = ?', orderId);
    },

    async costOf(orderId) {
      return (await d1RealCosts(db, [orderId])).get(orderId) ?? null;
    },

    async log(orderId, job, cost) {
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
            `INSERT INTO print_jobs (order_id, printer_id, status, actual_minutes, result, labour_minutes, extra_cost,
               cost_material, cost_energy, cost_machine_wear, cost_fixed, cost_labour, cost_extra, note, created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}
             RETURNING id`,
          )
          .bind(
            orderId, job.printerId, statusForResult(job.result), job.actualMinutes, job.result, job.labourMinutes, job.extraCost,
            cost.material, cost.energy, cost.machineWear, cost.fixedCosts, cost.labour, cost.extra, job.note, now, now, ...guardParams,
          ),
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

    get: getJob,

    async listPlanned() {
      const jobs = await read('print_jobs.status = ?', 'planeada');
      return jobs.sort((a, b) => (a.plannedStart ?? '').localeCompare(b.plannedStart ?? '') || a.id - b.id);
    },

    async plan(orderId, plan) {
      const now = new Date().toISOString();
      const free = freeSpan(plan.printerId, plan.plannedStart, addMinutes(plan.plannedStart, plan.estimatedMinutes), 0);
      // One statement: the checks and the insert cannot be split by another write.
      const row = await db
        .prepare(
          `INSERT INTO print_jobs (order_id, printer_id, status, planned_start, estimated_minutes, note, created_at, updated_at)
           SELECT ?, ?, 'planeada', ?, ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?) AND ${ACTIVE_PRINTER} AND ${free.sql}
           RETURNING id`,
        )
        .bind(orderId, plan.printerId, plan.plannedStart, plan.estimatedMinutes, plan.note, now, now, orderId, plan.printerId, ...free.params)
        .first<{ id: number }>();
      return row ? getJob(row.id) : null;
    },

    async updatePlan(orderId, jobId, changes) {
      const sent = PLAN_KEYS.filter((k) => changes[k] !== undefined);
      // The values the row will have after the write: the sent one, or (bound as NULL) the row's own at that moment.
      const printer = changes.printerId ?? null;
      const start = changes.plannedStart ?? null;
      const minutes = changes.estimatedMinutes ?? null;
      const after = {
        printer: 'COALESCE(?, print_jobs.printer_id)',
        start: 'COALESCE(?, print_jobs.planned_start)',
        end: "strftime('%Y-%m-%dT%H:%M', COALESCE(?, print_jobs.planned_start), '+' || COALESCE(?, print_jobs.estimated_minutes) || ' minutes')",
      };
      // One statement: the checks read the row as it is when it runs, so no other write can slip between them and the write.
      // As `freeSpan`, with the job's span after the write.
      const row = await db
        .prepare(
          `UPDATE print_jobs SET ${sent.map((k) => `${PLAN_COLUMNS[k]} = ?, `).join('')}updated_at = ?
           WHERE id = ? AND order_id = ? AND status = 'planeada'
             AND EXISTS (SELECT 1 FROM printers WHERE id = ${after.printer} AND status = 'activa')
             AND NOT EXISTS (SELECT 1 FROM print_jobs other WHERE other.printer_id = ${after.printer} AND other.status = 'planeada'
               AND other.id != print_jobs.id AND other.planned_start < ${after.end}
               AND strftime('%Y-%m-%dT%H:%M', other.planned_start, '+' || other.estimated_minutes || ' minutes') > ${after.start})
           RETURNING id`,
        )
        .bind(...sent.map((k) => changes[k]), new Date().toISOString(), jobId, orderId, printer, printer, start, minutes, start)
        .first<{ id: number }>();
      return row ? getJob(row.id) : null;
    },

    async removePlanned(orderId, jobId) {
      const row = await db
        .prepare("DELETE FROM print_jobs WHERE id = ? AND order_id = ? AND status = 'planeada' RETURNING id")
        .bind(jobId, orderId)
        .first<{ id: number }>();
      return row !== null;
    },

    async finish(orderId, jobId, plannedPrinterId, job, cost) {
      const now = new Date().toISOString();
      // A value made for this request only: the job carries it once this batch's first statement has applied.
      const token = crypto.randomUUID();
      // First statement: the job becomes finished with its frozen cost and the token, only while it is still a planned
      // job of this order on the printer the caller read, and under the guard of `log` (order, printer and spools exist,
      // each spool has enough grams). Every later statement runs only while the job carries this token, so if the first
      // one did not apply, none does. D1 runs a batch as one transaction: everything is written or nothing.
      const guard = [
        'EXISTS (SELECT 1 FROM orders WHERE id = ?)',
        'EXISTS (SELECT 1 FROM printers WHERE id = ?)',
        ...job.filaments.map(() => 'EXISTS (SELECT 1 FROM spools WHERE id = ? AND remaining_grams >= ?)'),
      ].join(' AND ');
      const guardParams = [orderId, job.printerId, ...job.filaments.flatMap((f) => [f.spoolId, f.grams])];
      const finished = 'EXISTS (SELECT 1 FROM print_jobs WHERE id = ? AND finish_token = ?)';

      const results = await db.batch<{ id: number }>([
        db
          .prepare(
            `UPDATE print_jobs SET printer_id = ?, status = ?, actual_minutes = ?, result = ?, labour_minutes = ?, extra_cost = ?,
               cost_material = ?, cost_energy = ?, cost_machine_wear = ?, cost_fixed = ?, cost_labour = ?, cost_extra = ?, note = ?,
               finish_token = ?, updated_at = ?
             WHERE id = ? AND order_id = ? AND status = 'planeada' AND printer_id = ? AND ${guard}
             RETURNING id`,
          )
          .bind(
            job.printerId, statusForResult(job.result), job.actualMinutes, job.result, job.labourMinutes, job.extraCost,
            cost.material, cost.energy, cost.machineWear, cost.fixedCosts, cost.labour, cost.extra, job.note, token, now,
            jobId, orderId, plannedPrinterId, ...guardParams,
          ),
        ...job.filaments.map((f) =>
          db.prepare(`INSERT INTO print_job_filaments (job_id, spool_id, grams) SELECT ?, ?, ? WHERE ${finished}`).bind(jobId, f.spoolId, f.grams, jobId, token),
        ),
        db
          .prepare(`UPDATE printers SET print_minutes = print_minutes + ?, updated_at = ? WHERE id = ? AND ${finished}`)
          .bind(job.actualMinutes, now, job.printerId, jobId, token),
        db
          .prepare(
            `UPDATE spools SET remaining_grams = remaining_grams - CASE id ${job.filaments.map(() => 'WHEN ? THEN ?').join(' ')} END, updated_at = ?
             WHERE id IN (${job.filaments.map(() => '?').join(', ')}) AND ${finished}`,
          )
          .bind(...job.filaments.flatMap((f) => [f.spoolId, f.grams]), now, ...job.filaments.map((f) => f.spoolId), jobId, token),
      ]);
      if (results[0]?.results[0]?.id === undefined) return null;
      return getJob(jobId);
    },
  };
}

function memoryJobs(tables: MemoryTables, orderId: string): StoredPrintJob[] {
  return [...tables.printJobs.values()].filter((j) => j.orderId === orderId).sort((a, b) => a.id - b.id);
}

/** The order's real cost from the in-memory tables, as `d1RealCosts` adds it up. */
export function memoryRealCost(tables: MemoryTables, orderId: string): RealCost | null {
  return realCost(memoryJobs(tables, orderId));
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
    async log(orderId, job, cost) {
      // No await in here, so nothing can run between the checks and the writes.
      const printer = printers.get(job.printerId);
      const enough = job.filaments.every((f) => (spools.get(f.spoolId)?.remainingGrams ?? -1) >= f.grams);
      if (!tables.orders.has(orderId) || !printer || !enough) return null;
      const now = new Date().toISOString();
      const stored: StoredPrintJob = {
        id: Math.max(0, ...printJobs.keys()) + 1, orderId, printerId: job.printerId, status: statusForResult(job.result), result: job.result,
        plannedStart: null, estimatedMinutes: null, actualMinutes: job.actualMinutes, labourMinutes: job.labourMinutes, extraCost: job.extraCost,
        cost: { ...cost }, note: job.note,
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
    async get(jobId) {
      const job = printJobs.get(jobId);
      return job ? view(job) : null;
    },
    async listPlanned() {
      return [...printJobs.values()]
        .filter((j) => j.status === 'planeada')
        .sort((a, b) => (a.plannedStart ?? '').localeCompare(b.plannedStart ?? '') || a.id - b.id)
        .map(view);
    },
    async plan(orderId, plan) {
      // No await in here, so nothing can run between the checks and the write.
      if (!tables.orders.has(orderId) || printers.get(plan.printerId)?.status !== 'activa') return null;
      if (overlappingJob(plan, [...printJobs.values()])) return null;
      const now = new Date().toISOString();
      const stored: StoredPrintJob = {
        id: Math.max(0, ...printJobs.keys()) + 1, orderId, printerId: plan.printerId, status: 'planeada', result: null,
        plannedStart: plan.plannedStart, estimatedMinutes: plan.estimatedMinutes, actualMinutes: null, labourMinutes: 0, extraCost: 0,
        cost: { ...NO_JOB_COST }, note: plan.note, filaments: [], createdAt: now, updatedAt: now,
      };
      printJobs.set(stored.id, stored);
      return view(stored);
    },
    async updatePlan(orderId, jobId, changes) {
      // No await in here, so the checks see the row the write changes, as the single D1 statement does.
      const current = printJobs.get(jobId);
      if (!current || current.orderId !== orderId || current.status !== 'planeada') return null;
      const sent = Object.fromEntries(PLAN_KEYS.filter((k) => changes[k] !== undefined).map((k) => [k, changes[k]])) as Partial<PlannedJobInput>;
      const after = { ...current, ...sent };
      const span = { printerId: after.printerId, plannedStart: after.plannedStart ?? '', estimatedMinutes: after.estimatedMinutes ?? 0 };
      if (printers.get(after.printerId)?.status !== 'activa' || overlappingJob(span, [...printJobs.values()], jobId)) return null;
      const updated: StoredPrintJob = { ...after, updatedAt: new Date().toISOString() };
      printJobs.set(jobId, updated);
      return view(updated);
    },
    async removePlanned(orderId, jobId) {
      const job = printJobs.get(jobId);
      if (!job || job.orderId !== orderId || job.status !== 'planeada') return false;
      printJobs.delete(jobId);
      return true;
    },
    async finish(orderId, jobId, plannedPrinterId, job, cost) {
      // No await in here, so nothing can run between the checks and the writes.
      const current = printJobs.get(jobId);
      const printer = printers.get(job.printerId);
      const enough = job.filaments.every((f) => (spools.get(f.spoolId)?.remainingGrams ?? -1) >= f.grams);
      const stillPlanned = current?.orderId === orderId && current.status === 'planeada' && current.printerId === plannedPrinterId;
      if (!current || !stillPlanned || !tables.orders.has(orderId) || !printer || !enough) return null;
      const now = new Date().toISOString();
      const finished: StoredPrintJob = {
        ...current, printerId: job.printerId, status: statusForResult(job.result), result: job.result, actualMinutes: job.actualMinutes,
        labourMinutes: job.labourMinutes, extraCost: job.extraCost, cost: { ...cost }, note: job.note,
        filaments: job.filaments.map((f) => ({ ...f })), updatedAt: now,
      };
      printJobs.set(jobId, finished);
      printers.set(printer.id, { ...printer, printMinutes: printer.printMinutes + job.actualMinutes, updatedAt: now });
      for (const f of job.filaments) {
        const spool = spools.get(f.spoolId);
        if (spool) spools.set(spool.id, { ...spool, remainingGrams: spool.remainingGrams - f.grams, updatedAt: now });
      }
      return view(finished);
    },
  };
}
