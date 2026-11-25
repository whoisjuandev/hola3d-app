// Dates, titles and layout of the Calendario screen. The rules for what falls in a range are in shared/calendar.ts.
import { addDays, localMinutes, weekStart, type CalendarData, type CalendarPlannedJob, type DateRange } from '../../../shared/calendar';
import { isCalendarDate } from '../../../shared/quotes';

export type CalendarView = 'mes' | 'semana';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** Monday first, as the weeks are laid out. */
export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
}

/** 0 for Monday to 6 for Sunday. */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** The 42 days a month view shows: six weeks from the Monday on or before the first of `anchor`'s month. */
export function monthGrid(anchor: string): string[] {
  const start = weekStart(`${anchor.slice(0, 7)}-01`);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** The seven days of `anchor`'s week, Monday to Sunday. */
export function weekDays(anchor: string): string[] {
  const start = weekStart(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** The days a view of `anchor` asks the API for. */
export function viewRange(view: CalendarView, anchor: string): DateRange {
  const days = view === 'mes' ? monthGrid(anchor) : weekDays(anchor);
  return { from: days[0], to: days[days.length - 1] };
}

/** One month (to its first day) or one week back (`step` −1) or forth (+1). */
export function shiftAnchor(view: CalendarView, anchor: string, step: number): string {
  if (view === 'semana') return addDays(anchor, 7 * step);
  const [y, m] = parts(anchor);
  const month = new Date(Date.UTC(y, m - 1 + step, 1));
  return month.toISOString().slice(0, 10);
}

/** `?vista=mes|semana&dia=YYYY-MM-DD`; the week of today when missing or wrong. */
export function readView(params: URLSearchParams, today: string): { view: CalendarView; anchor: string } {
  const view = params.get('vista') === 'mes' ? 'mes' : 'semana';
  const day = params.get('dia');
  return { view, anchor: isCalendarDate(day) ? day : today };
}

/** "Noviembre 2026". */
export function monthTitle(date: string): string {
  const [y, m] = parts(date);
  const name = MONTHS[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${y}`;
}

/** "23 – 29 nov 2026", "30 nov – 6 dic 2026", "28 dic 2026 – 3 ene 2027". */
export function weekTitle(anchor: string): string {
  const days = weekDays(anchor);
  const [y1, m1, d1] = parts(days[0]);
  const [y2, m2, d2] = parts(days[6]);
  if (y1 !== y2) return `${d1} ${SHORT_MONTHS[m1 - 1]} ${y1} – ${d2} ${SHORT_MONTHS[m2 - 1]} ${y2}`;
  if (m1 !== m2) return `${d1} ${SHORT_MONTHS[m1 - 1]} – ${d2} ${SHORT_MONTHS[m2 - 1]} ${y2}`;
  return `${d1} – ${d2} ${SHORT_MONTHS[m2 - 1]} ${y2}`;
}

/** "Mié 25 nov". */
export function dayTitle(date: string): string {
  const [, m, d] = parts(date);
  return `${WEEKDAYS[weekdayIndex(date)]} ${d} ${SHORT_MONTHS[m - 1]}`;
}

/** "09:00 – 17:00", or "22:00 – vie 06:00" when it ends on another day. */
export function timeRange(job: Pick<CalendarPlannedJob, 'start' | 'end'>): string {
  const [startDay, startTime] = job.start.split('T');
  const [endDay, endTime] = job.end.split('T');
  if (startDay === endDay) return `${startTime} – ${endTime}`;
  return `${startTime} – ${WEEKDAYS[weekdayIndex(endDay)].toLowerCase()} ${endTime}`;
}

/** The hours a week's printer lanes show, on every day alike: from `from`:00 to `to`:00 (`to` up to 24). */
export interface LaneHours {
  from: number;
  to: number;
}

/** The part of a job inside `date`, in minutes from that day's 00:00 (0 to 1440); null when it has none. */
function partOnDay(job: Pick<CalendarPlannedJob, 'start' | 'end'>, date: string): { start: number; end: number } | null {
  const dayStart = localMinutes(`${date}T00:00`);
  const start = Math.max(localMinutes(job.start), dayStart) - dayStart;
  const end = Math.min(localMinutes(job.end), dayStart + 24 * 60) - dayStart;
  return end > start ? { start, end } : null;
}

/**
 * The hours the week's lanes show: from the earliest start to the latest end of the jobs' parts on the week's days,
 * rounded out to whole hours, and at least 08:00 to 20:00. A job past midnight counts as its part on each day.
 */
export function laneHours(jobs: Pick<CalendarPlannedJob, 'start' | 'end'>[], days: string[]): LaneHours {
  let from = 8 * 60;
  let to = 20 * 60;
  for (const day of days) {
    for (const job of jobs) {
      const part = partOnDay(job, day);
      if (!part) continue;
      from = Math.min(from, part.start);
      to = Math.max(to, part.end);
    }
  }
  return { from: Math.floor(from / 60), to: Math.ceil(to / 60) };
}

export interface DayBar<J> {
  job: J;
  left: number; // % of the day's column
  width: number; // % of the day's column
  track: number; // 0, 1, …: the row of the lane it goes on
  fromBefore: boolean; // it started on an earlier day
  goesOn: boolean; // it ends on a later day
}

/**
 * A printer's jobs on `date`, each placed in that day's column by its part of the day, in % of the lane hours. Each job
 * of the day goes on its own track, in start order, so its label (as wide as the column) never covers another's.
 */
export function dayBars<J extends Pick<CalendarPlannedJob, 'id' | 'start' | 'end'>>(jobs: J[], date: string, hours: LaneHours): DayBar<J>[] {
  const span = (hours.to - hours.from) * 60;
  return jobs
    .map((job) => ({ job, part: partOnDay(job, date) }))
    .filter((x): x is { job: J; part: { start: number; end: number } } => x.part !== null)
    .sort((a, b) => a.part.start - b.part.start || a.job.id - b.job.id)
    .map(({ job, part }, track) => ({
      job,
      left: ((part.start - hours.from * 60) / span) * 100,
      width: ((part.end - part.start) / span) * 100,
      track,
      fromBefore: job.start < `${date}T00:00`,
      goesOn: job.end > `${addDays(date, 1)}T00:00`,
    }));
}

/** The hour labels over a day's column: every fourth hour of a lane of up to 12 hours, every sixth of a longer one. */
export function hourMarks(hours: LaneHours): { text: string; left: number }[] {
  const span = hours.to - hours.from;
  const step = span <= 12 ? 4 : 6;
  const marks: { text: string; left: number }[] = [];
  for (let hour = hours.from; hour < hours.to; hour += step) {
    marks.push({ text: String(hour).padStart(2, '0'), left: ((hour - hours.from) / span) * 100 });
  }
  return marks;
}

export type ItemKind = 'order' | 'project' | 'service' | 'job';

export const KIND_LABEL: Record<ItemKind, string> = { order: 'Entrega', project: 'Proyecto', service: 'Servicio', job: 'Impresión' };

export interface DayItem {
  key: string;
  kind: ItemKind;
  label: string;
  detail: string;
  overdue: boolean;
  to: string; // where clicking it leads
}

/** A planned job touches the day when any minute of it falls inside it. */
function jobOnDay(job: CalendarPlannedJob, date: string): boolean {
  return job.start < `${addDays(date, 1)}T00:00` && job.end > `${date}T00:00`;
}

/** What falls on `date`, by type: due orders, projects and service tasks, then planned jobs (unless `withJobs` is false). */
export function dayItems(data: CalendarData, date: string, withJobs = true): DayItem[] {
  const items: DayItem[] = [
    ...data.orders.filter((o) => o.dueDate === date).map((o): DayItem => ({
      key: `order-${o.id}`, kind: 'order', label: `#${o.id} ${o.item}`, detail: o.dueTime ? `${o.client} · ${o.dueTime}` : o.client,
      overdue: o.overdue, to: `/pedidos?pedido=${o.id}`,
    })),
    ...data.projects.filter((p) => p.dueDate === date).map((p): DayItem => ({
      key: `project-${p.id}`, kind: 'project', label: p.name, detail: p.client, overdue: p.overdue, to: `/proyectos/${p.id}`,
    })),
    ...data.serviceTasks.filter((t) => t.dueDate === date).map((t): DayItem => ({
      key: `service-${t.id}`, kind: 'service', label: t.name, detail: t.printer, overdue: t.overdue, to: `/taller?impresora=${t.printerId}`,
    })),
  ];
  if (withJobs) {
    for (const j of data.plannedJobs.filter((job) => jobOnDay(job, date))) {
      items.push({
        key: `job-${j.id}`, kind: 'job', label: `#${j.orderId} ${j.item}`, detail: `${j.printer} · ${timeRange(j)}`, overdue: false, to: `/pedidos?pedido=${j.orderId}`,
      });
    }
  }
  return items;
}
