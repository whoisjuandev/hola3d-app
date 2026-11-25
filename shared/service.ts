// Machine service: recurring tasks per printer and the service log, shared by the Worker API and the React app.
import { asBody, isMissing, readInteger, readText, type Body, type Errors } from './fields';
import type { ValidationResult } from './orders';
import { isCalendarDate } from './quotes';

/**
 * A recurring task of a printer. It counts from when it was last done: the printer's print minutes and the date
 * at that moment. Logging a service against it moves both to the printer's minutes and the service date.
 */
export interface ServiceTask {
  id: number;
  printerId: number;
  printer: string; // the printer's name, read through the printer
  printerMinutes: number; // the printer's accumulated print minutes now, read through the printer
  name: string;
  intervalHours: number | null; // every so many print hours; null when it only goes by days
  intervalDays: number | null; // every so many days; null when it only goes by hours
  lastDoneMinutes: number; // the printer's print minutes when it was last done
  lastDoneDate: string; // YYYY-MM-DD
  active: boolean; // a deactivated task leaves the plan but keeps its place in the log
  createdAt: string;
  updatedAt: string;
}

/** Where a task stands today. */
export interface ServiceState {
  due: boolean;
  dueByHours: boolean;
  dueByDays: boolean;
  minutesLeft: number | null; // print minutes until the hour interval; 0 or less once due by hours; null without one
  daysLeft: number | null; // days until the day interval; 0 or less once due by days; null without one
  progress: number; // share of the interval used, the larger of the two: 1 is due
}

export type ServiceTaskWithState = ServiceTask & { state: ServiceState };

export interface ServiceLog {
  id: number;
  printerId: number;
  printer: string; // the printer's name, read through the printer
  taskId: number | null; // the task this service completed, if any
  task: string | null; // that task's name
  date: string; // YYYY-MM-DD
  done: string; // what was done
  parts: string; // parts used, free text
  cost: number; // whole pesos
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceTaskFields {
  name: string;
  intervalHours: number | null;
  intervalDays: number | null;
}

export interface NewServiceTask extends ServiceTaskFields {
  printerId: number;
  lastDoneDate: string;
}

export interface NewServiceLog {
  printerId: number;
  date: string;
  done: string;
  parts: string;
  cost: number;
  taskId: number | null;
  note: string;
}

export interface ServiceCost {
  printerId: number;
  printer: string;
  count: number;
  cost: number; // whole pesos
}

/** What a new printer can start with, counted from its print hours when it is adopted. */
export const DEFAULT_SERVICE_PLAN: readonly ServiceTaskFields[] = [
  { name: 'Limpiar boquilla', intervalHours: 100, intervalDays: null },
  { name: 'Lubricar varillas', intervalHours: 200, intervalDays: null },
  { name: 'Revisar correas', intervalHours: 300, intervalDays: null },
];

const NEEDS_INTERVAL = 'Poné cada cuántas horas de impresión, cada cuántos días, o las dos.';
const WRONG_DATE = 'La fecha tiene que ser AAAA-MM-DD.';

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** An optional whole number above 0: missing is null. */
function readInterval(body: Body, errors: Errors, key: string, message: string): number | null {
  if (isMissing(body[key])) return null;
  return readInteger(body, errors, key, 1, message);
}

/** A YYYY-MM-DD date that defaults to `today` when missing. */
function readDate(body: Body, errors: Errors, key: string, today: string): string {
  const raw = body[key];
  if (isMissing(raw)) return today;
  if (!isCalendarDate(raw)) errors[key] = WRONG_DATE;
  return typeof raw === 'string' ? raw : '';
}

function readTaskFields(body: Body, errors: Errors): ServiceTaskFields {
  const name = readText(body, errors, 'name', 80, true);
  const intervalHours = readInterval(body, errors, 'intervalHours', 'Poné cada cuántas horas de impresión: un número entero mayor que 0.');
  const intervalDays = readInterval(body, errors, 'intervalDays', 'Poné cada cuántos días: un número entero mayor que 0.');
  if (isMissing(body.intervalHours) && isMissing(body.intervalDays)) {
    errors.intervalHours = NEEDS_INTERVAL;
    errors.intervalDays = NEEDS_INTERVAL;
  }
  return { name, intervalHours, intervalDays };
}

/** Validate the name and intervals of a task, for an edit. Error messages are shown to the owners as is. */
export function validateServiceTask(input: unknown): ValidationResult<ServiceTaskFields> {
  const errors: Errors = {};
  const fields = readTaskFields(asBody(input), errors);
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: fields };
}

/** Validate a new task. It counts from `lastDoneDate`, today unless given. */
export function validateNewServiceTask(input: unknown, today: string): ValidationResult<NewServiceTask> {
  const errors: Errors = {};
  const body = asBody(input);
  const printerId = body.printerId;
  if (!isPositiveInteger(printerId)) errors.printerId = 'Elegí una impresora.';
  const fields = readTaskFields(body, errors);
  const lastDoneDate = readDate(body, errors, 'lastDoneDate', today);
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { printerId: printerId as number, ...fields, lastDoneDate } };
}

/** Validate a service to log. The date defaults to `today`, the cost to 0; the task is optional. */
export function validateServiceLog(input: unknown, today: string): ValidationResult<NewServiceLog> {
  const errors: Errors = {};
  const body = asBody(input);
  const printerId = body.printerId;
  if (!isPositiveInteger(printerId)) errors.printerId = 'Elegí una impresora.';
  const date = readDate(body, errors, 'date', today);
  const done = readText(body, errors, 'done', 200, true);
  const parts = readText(body, errors, 'parts', 500, false);
  const cost = readInteger(body, errors, 'cost', 0, 'Poné el costo en pesos, sin centavos.', 0);
  const taskId = isMissing(body.taskId) ? null : body.taskId;
  if (taskId !== null && !isPositiveInteger(taskId)) errors.taskId = 'Elegí una tarea de la lista.';
  const note = readText(body, errors, 'note', 1000, false);
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { printerId: printerId as number, date, done, parts, cost: cost as number, taskId: taskId as number | null, note } };
}

/** Why a valid service cannot be logged with the printers and tasks there are, or null when it can. */
export function serviceLogProblems(
  entry: Pick<NewServiceLog, 'printerId' | 'taskId'>,
  printers: { id: number }[],
  tasks: Pick<ServiceTask, 'id' | 'printerId' | 'active'>[],
): Errors | null {
  if (!printers.some((p) => p.id === entry.printerId)) return { printerId: 'Esa impresora no existe.' };
  if (entry.taskId !== null && !tasks.some((t) => t.id === entry.taskId && t.printerId === entry.printerId && t.active)) {
    return { taskId: 'Esa tarea no está en el plan de esta impresora.' };
  }
  return null;
}

/** Calendar days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/**
 * Where a task stands on `today` (YYYY-MM-DD): due when the printer has printed the hour interval since the task was
 * last done, or the day interval has passed since then, whichever comes first. Fewer printer minutes than when it was
 * done (a print job deleted later) or a later date count as nothing done yet.
 */
export function serviceState(
  task: Pick<ServiceTask, 'intervalHours' | 'intervalDays' | 'lastDoneMinutes' | 'lastDoneDate' | 'printerMinutes'>,
  today: string,
): ServiceState {
  const minutesSince = Math.max(0, task.printerMinutes - task.lastDoneMinutes);
  const daysSince = Math.max(0, daysBetween(task.lastDoneDate, today));
  const hourLimit = task.intervalHours === null ? null : task.intervalHours * 60;
  const dueByHours = hourLimit !== null && minutesSince >= hourLimit;
  const dueByDays = task.intervalDays !== null && daysSince >= task.intervalDays;
  const shares = [hourLimit === null ? 0 : minutesSince / hourLimit, task.intervalDays === null ? 0 : daysSince / task.intervalDays];
  return {
    due: dueByHours || dueByDays,
    dueByHours,
    dueByDays,
    minutesLeft: hourLimit === null ? null : hourLimit - minutesSince,
    daysLeft: task.intervalDays === null ? null : task.intervalDays - daysSince,
    progress: Math.max(...shares),
  };
}

/** Due tasks first, the most overdue first, then the rest by how close they are to due. A new array. */
export function sortByDue<T extends { id: number; state: ServiceState }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => Number(b.state.due) - Number(a.state.due) || b.state.progress - a.state.progress || a.id - b.id);
}

/** The cost and count of the services of each printer that has any, by printer name. */
export function serviceCostByPrinter(logs: Pick<ServiceLog, 'printerId' | 'printer' | 'cost'>[]): ServiceCost[] {
  const byPrinter = new Map<number, ServiceCost>();
  for (const log of logs) {
    const total = byPrinter.get(log.printerId) ?? { printerId: log.printerId, printer: log.printer, count: 0, cost: 0 };
    total.count += 1;
    total.cost += log.cost;
    byPrinter.set(log.printerId, total);
  }
  return [...byPrinter.values()].sort((a, b) => a.printer.localeCompare(b.printer, 'es') || a.printerId - b.printerId);
}

/** The workshop's calendar date (Buenos Aires) at `now`, as YYYY-MM-DD. */
export function workshopToday(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
