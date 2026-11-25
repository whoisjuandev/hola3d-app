import type { Printer, PrinterInput } from '../../shared/printers';
import {
  DEFAULT_SERVICE_PLAN, type NewServiceLog, type NewServiceTask, type ServiceLog, type ServiceTask, type ServiceTaskFields,
} from '../../shared/service';
import type { MemoryTables, StoredServiceLog, StoredServiceTask } from '../memory';
import { insertPrinterStatement, memoryPrinterRepository, toPrinter, type PrinterRow } from '../printers/repository';

export interface ServiceFilter {
  printerId?: number;
}

/** Port: what the service routes need from storage. Tasks and log entries carry their printer's name, read through it. */
export interface ServiceRepository {
  /** Active tasks, by id, with the printer's minutes of now. */
  listTasks(filter?: ServiceFilter): Promise<ServiceTask[]>;
  /** A task, active or not. */
  getTask(id: number): Promise<ServiceTask | null>;
  /** Store a task counting from the printer's minutes of now. Null, writing nothing, when the printer does not exist. */
  createTask(task: NewServiceTask): Promise<ServiceTask | null>;
  /** Write only the fields in `changes` of an active task. Null when there is no such active task. */
  updateTask(id: number, changes: Partial<ServiceTaskFields>): Promise<ServiceTask | null>;
  /** Take an active task out of the plan; its log entries keep it. Null when there is no such active task. */
  deactivateTask(id: number): Promise<ServiceTask | null>;
  /**
   * In one write: add the default plan to a printer, counted from its minutes of now and `today`. Only while the
   * printer exists and has no active task; otherwise returns an empty list having written nothing.
   */
  adoptPlan(printerId: number, today: string): Promise<ServiceTask[]>;
  /** In one atomic write: store a new printer and the default plan counted from its minutes and `today`. */
  createPrinterWithPlan(input: PrinterInput, today: string): Promise<{ printer: Printer; tasks: ServiceTask[] }>;
  /** Log entries, newest service date first. */
  listLogs(filter?: ServiceFilter): Promise<ServiceLog[]>;
  /**
   * In one atomic write: store the entry and, when it names a task, reset that task's counters to the printer's minutes
   * at that moment and the service date. Only while the printer exists and the task is an active task of that printer;
   * otherwise returns null having written nothing.
   */
  log(entry: NewServiceLog): Promise<{ log: ServiceLog; task: ServiceTask | null } | null>;
}

interface TaskRow {
  id: number;
  printer_id: number;
  printer_name: string;
  printer_minutes: number;
  name: string;
  interval_hours: number | null;
  interval_days: number | null;
  last_done_minutes: number;
  last_done_date: string;
  active: number;
  created_at: string;
  updated_at: string;
}

function toTask(row: TaskRow): ServiceTask {
  return {
    id: row.id,
    printerId: row.printer_id,
    printer: row.printer_name,
    printerMinutes: row.printer_minutes,
    name: row.name,
    intervalHours: row.interval_hours,
    intervalDays: row.interval_days,
    lastDoneMinutes: row.last_done_minutes,
    lastDoneDate: row.last_done_date,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface LogRow {
  id: number;
  printer_id: number;
  printer_name: string;
  task_id: number | null;
  task_name: string | null;
  service_date: string;
  done: string;
  parts: string;
  cost: number;
  note: string;
  created_at: string;
  updated_at: string;
}

function toLog(row: LogRow): ServiceLog {
  return {
    id: row.id,
    printerId: row.printer_id,
    printer: row.printer_name,
    taskId: row.task_id,
    task: row.task_name,
    date: row.service_date,
    done: row.done,
    parts: row.parts,
    cost: row.cost,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TASKS = `SELECT t.*, p.name AS printer_name, p.print_minutes AS printer_minutes
  FROM service_tasks t JOIN printers p ON p.id = t.printer_id`;
const LOGS = `SELECT l.*, p.name AS printer_name, t.name AS task_name
  FROM service_logs l JOIN printers p ON p.id = l.printer_id LEFT JOIN service_tasks t ON t.id = l.task_id`;

const TASK_COLUMNS: Record<keyof ServiceTaskFields, string> = { name: 'name', intervalHours: 'interval_hours', intervalDays: 'interval_days' };

/**
 * The statement that adds the default plan to the printer `printerSql` names, counted from its minutes of now, only
 * while it has no active task. SQLite runs the SELECT to the end before inserting, because it reads the table it
 * inserts into, so the plan's own rows never stop the rest of it.
 */
function planStatement(db: D1Database, printerSql: string, printerParams: unknown[], today: string, now: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO service_tasks (printer_id, name, interval_hours, interval_days, last_done_minutes, last_done_date, active, created_at, updated_at)
       SELECT p.id, json_extract(plan.value, '$.name'), json_extract(plan.value, '$.intervalHours'), json_extract(plan.value, '$.intervalDays'),
         p.print_minutes, ?, 1, ?, ?
       FROM printers p, json_each(?) plan
       WHERE p.id = ${printerSql} AND NOT EXISTS (SELECT 1 FROM service_tasks WHERE printer_id = p.id AND active = 1)
       ORDER BY plan.key
       RETURNING id`,
    )
    .bind(today, now, now, JSON.stringify(DEFAULT_SERVICE_PLAN), ...printerParams);
}

/** Adapter: D1 storage. */
export function d1ServiceRepository(db: D1Database): ServiceRepository {
  const tasksById = async (ids: number[]): Promise<ServiceTask[]> => {
    if (ids.length === 0) return [];
    const { results } = await db
      .prepare(`${TASKS} WHERE t.id IN (SELECT value FROM json_each(?)) ORDER BY t.id`)
      .bind(JSON.stringify(ids))
      .all<TaskRow>();
    return results.map(toTask);
  };
  const getTask = async (id: number) => (await tasksById([id]))[0] ?? null;
  const idsOf = (result: D1Result<{ id: number }> | undefined) => (result?.results ?? []).map((r) => r.id);

  return {
    async listTasks(filter = {}) {
      const byPrinter = filter.printerId !== undefined;
      const { results } = await db
        .prepare(`${TASKS} WHERE t.active = 1${byPrinter ? ' AND t.printer_id = ?' : ''} ORDER BY t.id`)
        .bind(...(byPrinter ? [filter.printerId] : []))
        .all<TaskRow>();
      return results.map(toTask);
    },

    getTask,

    async createTask(task) {
      const now = new Date().toISOString();
      // The task counts from the printer's minutes as they are in the same statement.
      const row = await db
        .prepare(
          `INSERT INTO service_tasks (printer_id, name, interval_hours, interval_days, last_done_minutes, last_done_date, active, created_at, updated_at)
           SELECT id, ?, ?, ?, print_minutes, ?, 1, ?, ? FROM printers WHERE id = ?
           RETURNING id`,
        )
        .bind(task.name, task.intervalHours, task.intervalDays, task.lastDoneDate, now, now, task.printerId)
        .first<{ id: number }>();
      return row ? getTask(row.id) : null;
    },

    async updateTask(id, changes) {
      const keys = (Object.keys(changes) as (keyof ServiceTaskFields)[]).filter((k) => k in TASK_COLUMNS);
      const row = await db
        .prepare(`UPDATE service_tasks SET ${keys.map((k) => `${TASK_COLUMNS[k]} = ?, `).join('')}updated_at = ? WHERE id = ? AND active = 1 RETURNING id`)
        .bind(...keys.map((k) => changes[k]), new Date().toISOString(), id)
        .first<{ id: number }>();
      return row ? getTask(row.id) : null;
    },

    async deactivateTask(id) {
      const row = await db
        .prepare('UPDATE service_tasks SET active = 0, updated_at = ? WHERE id = ? AND active = 1 RETURNING id')
        .bind(new Date().toISOString(), id)
        .first<{ id: number }>();
      return row ? getTask(row.id) : null;
    },

    async adoptPlan(printerId, today) {
      const { results } = await planStatement(db, '?', [printerId], today, new Date().toISOString()).all<{ id: number }>();
      return tasksById(results.map((r) => r.id));
    },

    async createPrinterWithPlan(input, today) {
      const now = new Date().toISOString();
      // AUTOINCREMENT ids only grow, so inside this batch the highest printer id is the printer just inserted. D1 runs a
      // batch as one transaction: either the printer and its plan are written, or nothing.
      const [printerResult, planResult] = await db.batch<{ id: number }>([
        insertPrinterStatement(db, input, now),
        planStatement(db, '(SELECT MAX(id) FROM printers)', [], today, now),
      ]);
      const row = printerResult?.results[0] as unknown as PrinterRow | undefined;
      if (!row) throw new Error('Insert returned no row');
      return { printer: toPrinter(row), tasks: await tasksById(idsOf(planResult)) };
    },

    async listLogs(filter = {}) {
      const byPrinter = filter.printerId !== undefined;
      const { results } = await db
        .prepare(`${LOGS}${byPrinter ? ' WHERE l.printer_id = ?' : ''} ORDER BY l.service_date DESC, l.id DESC`)
        .bind(...(byPrinter ? [filter.printerId] : []))
        .all<LogRow>();
      return results.map(toLog);
    },

    async log(entry) {
      const now = new Date().toISOString();
      // Both statements repeat the same guard, and the insert does not change what it reads. The reset reads the
      // printer's minutes in the same statement, so a print job logged meanwhile is counted. D1 runs a batch as one
      // transaction: either the entry and the reset are written, or nothing.
      const guard = entry.taskId === null
        ? { sql: 'EXISTS (SELECT 1 FROM printers WHERE id = ?)', params: [entry.printerId] }
        : { sql: 'EXISTS (SELECT 1 FROM service_tasks WHERE id = ? AND printer_id = ? AND active = 1)', params: [entry.taskId, entry.printerId] };
      const statements = [
        db
          .prepare(
            `INSERT INTO service_logs (printer_id, task_id, service_date, done, parts, cost, note, created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}
             RETURNING id`,
          )
          .bind(entry.printerId, entry.taskId, entry.date, entry.done, entry.parts, entry.cost, entry.note, now, now, ...guard.params),
      ];
      if (entry.taskId !== null) {
        statements.push(
          db
            .prepare(
              `UPDATE service_tasks
               SET last_done_minutes = (SELECT print_minutes FROM printers WHERE id = service_tasks.printer_id), last_done_date = ?, updated_at = ?
               WHERE id = ? AND printer_id = ? AND active = 1`,
            )
            .bind(entry.date, now, entry.taskId, entry.printerId),
        );
      }
      const [inserted] = await db.batch<{ id: number }>(statements);
      const id = idsOf(inserted)[0];
      if (id === undefined) return null;
      const row = await db.prepare(`${LOGS} WHERE l.id = ?`).bind(id).first<LogRow>();
      if (!row) return null;
      return { log: toLog(row), task: entry.taskId === null ? null : await getTask(entry.taskId) };
    },
  };
}

/** Adapter: in-memory storage for tests. Shares its tables with the in-memory printer repository. */
export function memoryServiceRepository(tables: MemoryTables): ServiceRepository {
  const { printers, serviceTasks, serviceLogs } = tables;
  const viewTask = (task: StoredServiceTask): ServiceTask => {
    const printer = printers.get(task.printerId);
    return { ...task, printer: printer?.name ?? '', printerMinutes: printer?.printMinutes ?? 0 };
  };
  const viewLog = (log: StoredServiceLog): ServiceLog => ({
    ...log,
    printer: printers.get(log.printerId)?.name ?? '',
    task: log.taskId === null ? null : (serviceTasks.get(log.taskId)?.name ?? null),
  });
  const activeTask = (id: number) => {
    const task = serviceTasks.get(id);
    return task?.active ? task : null;
  };
  const nextId = (map: Map<number, unknown>) => Math.max(0, ...map.keys()) + 1;
  const byPrinter = <T extends { printerId: number }>(rows: T[], filter: ServiceFilter) =>
    filter.printerId === undefined ? rows : rows.filter((r) => r.printerId === filter.printerId);
  // No await between the checks and the writes, so nothing can run in between.
  const addPlan = (printerId: number, today: string): ServiceTask[] => {
    const printer = printers.get(printerId);
    if (!printer || [...serviceTasks.values()].some((t) => t.printerId === printerId && t.active)) return [];
    const now = new Date().toISOString();
    return DEFAULT_SERVICE_PLAN.map((fields) => {
      const task: StoredServiceTask = {
        id: nextId(serviceTasks), printerId, ...fields, lastDoneMinutes: printer.printMinutes, lastDoneDate: today, active: true, createdAt: now, updatedAt: now,
      };
      serviceTasks.set(task.id, task);
      return viewTask(task);
    });
  };

  return {
    async listTasks(filter = {}) {
      return byPrinter([...serviceTasks.values()].filter((t) => t.active), filter).sort((a, b) => a.id - b.id).map(viewTask);
    },
    async getTask(id) {
      const task = serviceTasks.get(id);
      return task ? viewTask(task) : null;
    },
    async createTask(input) {
      const printer = printers.get(input.printerId);
      if (!printer) return null;
      const now = new Date().toISOString();
      const task: StoredServiceTask = {
        id: nextId(serviceTasks), printerId: input.printerId, name: input.name, intervalHours: input.intervalHours, intervalDays: input.intervalDays,
        lastDoneMinutes: printer.printMinutes, lastDoneDate: input.lastDoneDate, active: true, createdAt: now, updatedAt: now,
      };
      serviceTasks.set(task.id, task);
      return viewTask(task);
    },
    async updateTask(id, changes) {
      const current = activeTask(id);
      if (!current) return null;
      const updated: StoredServiceTask = { ...current, ...changes, updatedAt: new Date().toISOString() };
      serviceTasks.set(id, updated);
      return viewTask(updated);
    },
    async deactivateTask(id) {
      const current = activeTask(id);
      if (!current) return null;
      const updated: StoredServiceTask = { ...current, active: false, updatedAt: new Date().toISOString() };
      serviceTasks.set(id, updated);
      return viewTask(updated);
    },
    async adoptPlan(printerId, today) {
      return addPlan(printerId, today);
    },
    async createPrinterWithPlan(input, today) {
      const printer = await memoryPrinterRepository(tables).create(input);
      return { printer, tasks: addPlan(printer.id, today) };
    },
    async listLogs(filter = {}) {
      return byPrinter([...serviceLogs.values()], filter)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
        .map(viewLog);
    },
    async log(entry) {
      const printer = printers.get(entry.printerId);
      const task = entry.taskId === null ? null : activeTask(entry.taskId);
      if (!printer || (entry.taskId !== null && task?.printerId !== entry.printerId)) return null;
      const now = new Date().toISOString();
      const stored: StoredServiceLog = { id: nextId(serviceLogs), ...entry, createdAt: now, updatedAt: now };
      serviceLogs.set(stored.id, stored);
      if (!task) return { log: viewLog(stored), task: null };
      const reset: StoredServiceTask = { ...task, lastDoneMinutes: printer.printMinutes, lastDoneDate: entry.date, updatedAt: now };
      serviceTasks.set(task.id, reset);
      return { log: viewLog(stored), task: viewTask(reset) };
    },
  };
}
