// The calendar: dates, planned print jobs and what falls due in a range of days. Shared by the Worker API and the React app.
// Dates are YYYY-MM-DD and planned starts YYYY-MM-DDTHH:MM, both on the workshop's clock (Buenos Aires, see
// `workshopToday`); no time zone is ever applied to them, so the arithmetic below reads them as UTC on purpose.
import { compareDayTime, sortEvents, type CalendarEvent } from './calendar-events';
import { asBody, readText, type Errors } from './fields';
import { isOrderOverdue, type Order, type Stage, type ValidationResult } from './orders';
import type { PrintJob } from './print-jobs';
import { PRINTER_STATUS_LABEL, type Printer } from './printers';
import { isProjectOverdue, type Project, type ProjectStatus } from './projects';
import { isCalendarDate } from './quotes';
import type { ServiceTask } from './service';

export interface DateRange {
  from: string; // YYYY-MM-DD, included
  to: string; // YYYY-MM-DD, included
}

/** The most days one calendar request can ask for: a quarter, more than the six weeks a month view shows. */
export const MAX_RANGE_DAYS = 92;

/** The longest planned job: a week of printing. */
export const MAX_PLANNED_MINUTES = 7 * 24 * 60;

const DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;
const WRONG_DATE = 'La fecha tiene que ser AAAA-MM-DD.';

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `date` moved by `days` (negative goes back). */
export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * 86_400_000);
}

/** The Monday of the week `date` is in. */
export function weekStart(date: string): string {
  const weekday = new Date(toUtc(date)).getUTCDay(); // 0 is Sunday
  return addDays(date, -((weekday + 6) % 7));
}

/** A real local date and time written YYYY-MM-DDTHH:MM. */
export function isLocalDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_TIME_RE.exec(value);
  return match !== null && isCalendarDate(match[1]);
}

/** Minutes from 1970-01-01T00:00 to `dateTime` on the same clock. Only differences between two of them mean anything. */
export function localMinutes(dateTime: string): number {
  const [date, time] = dateTime.split('T');
  const [h, m] = time.split(':').map(Number);
  return toUtc(date) / 60_000 + h * 60 + m;
}

/** `dateTime` moved by `minutes`, as YYYY-MM-DDTHH:MM. */
export function addMinutes(dateTime: string, minutes: number): string {
  return new Date((localMinutes(dateTime) + minutes) * 60_000).toISOString().slice(0, 16);
}

/** A stretch of printer time: when it starts and how many minutes it lasts. */
export interface Span {
  start: string; // YYYY-MM-DDTHH:MM
  minutes: number;
}

export function spanEnd(span: Span): string {
  return addMinutes(span.start, span.minutes);
}

/** True when the two spans share any minute. Back to back (one ends when the other starts) is not an overlap. */
export function spansOverlap(a: Span, b: Span): boolean {
  const aStart = localMinutes(a.start);
  const bStart = localMinutes(b.start);
  return aStart < bStart + b.minutes && bStart < aStart + a.minutes;
}

/** Validate the `from` and `to` of a calendar request: two dates, `to` not before `from`, at most `MAX_RANGE_DAYS` days. */
export function validateCalendarRange(from: unknown, to: unknown): ValidationResult<DateRange> {
  const errors: Errors = {};
  if (!isCalendarDate(from)) errors.from = WRONG_DATE;
  if (!isCalendarDate(to)) errors.to = WRONG_DATE;
  if (!errors.from && !errors.to) {
    const days = (toUtc(to as string) - toUtc(from as string)) / 86_400_000 + 1;
    if (days < 1) errors.to = 'La fecha final no puede ser anterior a la inicial.';
    else if (days > MAX_RANGE_DAYS) errors.to = `Pedí hasta ${MAX_RANGE_DAYS} días por vez.`;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { from: from as string, to: to as string } };
}

/** True when `date` is one of the days of the range, both edges included. */
export function inRange(date: string, range: DateRange): boolean {
  return range.from <= date && date <= range.to;
}

/** True when the span has any minute inside the range's days: from 00:00 of the first to 24:00 of the last. */
export function spanInRange(span: Span, range: DateRange): boolean {
  return spansOverlap(span, { start: `${range.from}T00:00`, minutes: localMinutes(`${addDays(range.to, 1)}T00:00`) - localMinutes(`${range.from}T00:00`) });
}

/** The day a task becomes due by its day interval, counted from when it was last done. Null for a task without one. */
export function serviceDueDate(task: Pick<ServiceTask, 'intervalDays' | 'lastDoneDate'>): string | null {
  return task.intervalDays === null ? null : addDays(task.lastDoneDate, task.intervalDays);
}

/** A validated plan for a print job: the printer, when it starts and how long it should take. */
export interface PlannedJobInput {
  printerId: number;
  plannedStart: string; // YYYY-MM-DDTHH:MM
  estimatedMinutes: number;
  note: string;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Validate a plan for a print job (for an edit, the stored plan merged with the request). Messages are shown as is. */
export function validatePlannedJob(input: unknown): ValidationResult<PlannedJobInput> {
  const errors: Errors = {};
  const body = asBody(input);
  const { printerId, plannedStart, estimatedMinutes } = body;
  if (!isPositiveInteger(printerId)) errors.printerId = 'Elegí una impresora.';
  if (!isLocalDateTime(plannedStart)) errors.plannedStart = 'Poné el día y la hora de inicio.';
  if (!isPositiveInteger(estimatedMinutes)) errors.estimatedMinutes = 'Poné cuánto va a tardar: más de 0 minutos.';
  else if (estimatedMinutes > MAX_PLANNED_MINUTES) errors.estimatedMinutes = `Hasta ${MAX_PLANNED_MINUTES / 60} h por impresión: dividila en tandas.`;
  const note = readText(body, errors, 'note', 1000, false);
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { printerId: printerId as number, plannedStart: plannedStart as string, estimatedMinutes: estimatedMinutes as number, note } };
}

/** A stored job as the planning rules need it. */
export type PlannedSlot = Pick<PrintJob, 'id' | 'orderId' | 'printerId' | 'status' | 'plannedStart' | 'estimatedMinutes'>;

function isPlanned<J extends PlannedSlot>(job: J): job is J & { plannedStart: string; estimatedMinutes: number } {
  return job.status === 'planeada' && job.plannedStart !== null && job.estimatedMinutes !== null;
}

/** "26/11 09:00". */
function shortDateTime(dateTime: string): string {
  const [date, time] = dateTime.split('T');
  const [, m, d] = date.split('-');
  return `${d}/${m} ${time}`;
}

/** The planned job of the plan's printer that shares time with it, ignoring the job `exceptJobId` (the one being edited). */
export function overlappingJob<J extends PlannedSlot>(
  plan: Pick<PlannedJobInput, 'printerId' | 'plannedStart' | 'estimatedMinutes'>, jobs: J[], exceptJobId?: number,
): (J & { plannedStart: string; estimatedMinutes: number }) | null {
  const span = { start: plan.plannedStart, minutes: plan.estimatedMinutes };
  for (const job of jobs) {
    if (job.id === exceptJobId || job.printerId !== plan.printerId || !isPlanned(job)) continue;
    if (spansOverlap(span, { start: job.plannedStart, minutes: job.estimatedMinutes })) return job;
  }
  return null;
}

/**
 * What stops a valid plan with the stored printers and planned jobs: a printer that does not exist or is not
 * `activa`, or a planned job of that printer sharing time with it. Null when nothing does.
 */
export function planProblems(
  plan: Pick<PlannedJobInput, 'printerId' | 'plannedStart' | 'estimatedMinutes'>,
  printers: Pick<Printer, 'id' | 'name' | 'status'>[],
  jobs: PlannedSlot[],
  exceptJobId?: number,
): Errors | null {
  const printer = printers.find((p) => p.id === plan.printerId);
  if (!printer) return { printerId: 'Esa impresora no existe.' };
  if (printer.status !== 'activa') {
    return { printerId: `${printer.name} está ${PRINTER_STATUS_LABEL[printer.status].toLowerCase()}: planificá en una impresora activa.` };
  }
  const busy = overlappingJob(plan, jobs, exceptJobId);
  if (busy) {
    const from = shortDateTime(busy.plannedStart);
    const to = shortDateTime(addMinutes(busy.plannedStart, busy.estimatedMinutes));
    return { plannedStart: `${printer.name} ya tiene planeada la impresión del pedido #${busy.orderId} del ${from} al ${to}.` };
  }
  return null;
}

export interface CalendarOrder {
  id: string;
  item: string;
  client: string;
  clientId: number | null;
  stage: Stage;
  dueDate: string;
  dueTime: string | null;
  projectId: number | null;
  project: string | null;
  overdue: boolean;
}

export interface CalendarProject {
  id: number;
  name: string;
  client: string;
  clientId: number;
  status: ProjectStatus;
  dueDate: string;
  overdue: boolean;
}

export interface CalendarServiceTask {
  id: number;
  name: string;
  printerId: number;
  printer: string;
  dueDate: string; // the day it becomes due by its day interval
  overdue: boolean; // that day is before today
}

export interface CalendarPlannedJob {
  id: number;
  orderId: string;
  item: string; // the order's
  client: string; // the order's
  printerId: number;
  printer: string;
  start: string; // YYYY-MM-DDTHH:MM
  end: string; // YYYY-MM-DDTHH:MM
  estimatedMinutes: number;
  note: string;
}

export interface CalendarData extends DateRange {
  today: string;
  orders: CalendarOrder[];
  projects: CalendarProject[];
  serviceTasks: CalendarServiceTask[];
  plannedJobs: CalendarPlannedJob[];
  events: CalendarEvent[]; // the hand-made events of the range
}

export interface CalendarSources {
  orders: Order[];
  projects: Project[];
  tasks: Pick<ServiceTask, 'id' | 'name' | 'printerId' | 'printer' | 'intervalDays' | 'lastDoneDate'>[];
  plannedJobs: (PlannedSlot & Pick<PrintJob, 'printer' | 'note'>)[];
  events?: CalendarEvent[];
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * What the calendar shows for the range on `today`: order and project due dates, the service tasks that become due by
 * date, the planned jobs that have any minute inside it, and the hand-made events. Each list is sorted by date.
 */
export function calendarData(range: DateRange, today: string, sources: CalendarSources): CalendarData {
  const orders: CalendarOrder[] = sources.orders
    .filter((o): o is Order & { dueDate: string } => o.dueDate !== null && inRange(o.dueDate, range))
    .map((o) => ({
      id: o.id, item: o.item, client: o.client, clientId: o.clientId, stage: o.stage, dueDate: o.dueDate, dueTime: o.dueTime,
      projectId: o.projectId, project: o.project, overdue: isOrderOverdue(o, today),
    }))
    .sort((a, b) => byText(a.dueDate, b.dueDate) || byText(a.dueTime ?? '99', b.dueTime ?? '99') || byText(a.id, b.id));

  const projects: CalendarProject[] = sources.projects
    .filter((p): p is Project & { dueDate: string } => p.dueDate !== null && inRange(p.dueDate, range))
    .map((p) => ({
      id: p.id, name: p.name, client: p.client, clientId: p.clientId, status: p.status, dueDate: p.dueDate, overdue: isProjectOverdue(p, today),
    }))
    .sort((a, b) => byText(a.dueDate, b.dueDate) || a.name.localeCompare(b.name, 'es') || a.id - b.id);

  const serviceTasks: CalendarServiceTask[] = sources.tasks
    .map((t) => ({ id: t.id, name: t.name, printerId: t.printerId, printer: t.printer, dueDate: serviceDueDate(t) }))
    .filter((t): t is Omit<CalendarServiceTask, 'overdue'> => t.dueDate !== null && inRange(t.dueDate, range))
    .map((t) => ({ ...t, overdue: t.dueDate < today }))
    .sort((a, b) => byText(a.dueDate, b.dueDate) || a.printer.localeCompare(b.printer, 'es') || a.id - b.id);

  const orderById = new Map(sources.orders.map((o) => [o.id, o]));
  const plannedJobs: CalendarPlannedJob[] = sources.plannedJobs
    .filter(isPlanned)
    .filter((j) => spanInRange({ start: j.plannedStart, minutes: j.estimatedMinutes }, range))
    .map((j) => ({
      id: j.id, orderId: j.orderId, item: orderById.get(j.orderId)?.item ?? '', client: orderById.get(j.orderId)?.client ?? '',
      printerId: j.printerId, printer: j.printer, start: j.plannedStart, end: addMinutes(j.plannedStart, j.estimatedMinutes),
      estimatedMinutes: j.estimatedMinutes, note: j.note,
    }))
    .sort((a, b) => byText(a.start, b.start) || a.printer.localeCompare(b.printer, 'es') || a.id - b.id);

  const events = sortEvents((sources.events ?? []).filter((e) => inRange(e.date, range)));

  return { ...range, today, orders, projects, serviceTasks, plannedJobs, events };
}

/** One thing of a day's agenda, with its time on that day (null for the whole day). */
export type AgendaEntry =
  | { kind: 'event'; time: string | null; event: CalendarEvent }
  | { kind: 'order'; time: string | null; order: CalendarOrder }
  | { kind: 'project'; time: null; project: CalendarProject }
  | { kind: 'service'; time: null; task: CalendarServiceTask }
  | { kind: 'job'; time: string; job: CalendarPlannedJob };

const AGENDA_KINDS: AgendaEntry['kind'][] = ['event', 'order', 'project', 'service', 'job'];

/**
 * Everything on `date` in time order, the untimed things first: hand-made events, due orders (at their due time),
 * project due dates, service tasks due, and planned prints with any minute in the day (at their start, or 00:00 for one
 * that started the day before). Things at the same time keep the order of the kinds above, then their lists' order.
 */
export function dayAgenda(
  data: Pick<CalendarData, 'orders' | 'projects' | 'serviceTasks' | 'plannedJobs'> & { events?: CalendarEvent[] }, date: string,
): AgendaEntry[] {
  const nextDay = `${addDays(date, 1)}T00:00`;
  const entries: AgendaEntry[] = [
    ...(data.events ?? []).filter((e) => e.date === date).map((event): AgendaEntry => ({ kind: 'event', time: event.time, event })),
    ...data.orders.filter((o) => o.dueDate === date).map((order): AgendaEntry => ({ kind: 'order', time: order.dueTime, order })),
    ...data.projects.filter((p) => p.dueDate === date).map((project): AgendaEntry => ({ kind: 'project', time: null, project })),
    ...data.serviceTasks.filter((t) => t.dueDate === date).map((task): AgendaEntry => ({ kind: 'service', time: null, task })),
    ...data.plannedJobs
      .filter((j) => j.start < nextDay && j.end > `${date}T00:00`)
      .map((job): AgendaEntry => ({ kind: 'job', time: job.start.startsWith(date) ? job.start.slice(11) : '00:00', job })),
  ];
  // Array sort is stable, so equal times keep the order built above.
  return entries.sort((a, b) => compareDayTime(a.time, b.time) || AGENDA_KINDS.indexOf(a.kind) - AGENDA_KINDS.indexOf(b.kind));
}
