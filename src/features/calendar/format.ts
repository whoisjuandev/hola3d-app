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

const WEEK_MINUTES = 7 * 24 * 60;

/** Where a job's bar goes in a week row, in % of the row: from its start to its end, cut at the edges of the week. */
export function barPlacement(job: Pick<CalendarPlannedJob, 'start' | 'end'>, anchor: string): { left: number; width: number } {
  const origin = localMinutes(`${weekStart(anchor)}T00:00`);
  const start = Math.max(0, localMinutes(job.start) - origin);
  const end = Math.min(WEEK_MINUTES, localMinutes(job.end) - origin);
  return { left: (start / WEEK_MINUTES) * 100, width: (Math.max(0, end - start) / WEEK_MINUTES) * 100 };
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

/** How long a job's label is allowed to run along its track, in minutes of the week: a bit less than a day. */
export const LABEL_MINUTES = 20 * 60;

/**
 * The track (0, 1, …) of each job in a printer's row, so a label never runs over another job: a job goes on the first
 * track where the jobs before it, with their labels, are done by its start. Jobs of one printer never overlap, so most
 * weeks need one track.
 */
export function packTracks(jobs: Pick<CalendarPlannedJob, 'id' | 'start' | 'end'>[]): Map<number, number> {
  const tracks: number[] = []; // per track, the minute it is free again
  const out = new Map<number, number>();
  for (const job of [...jobs].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id - b.id))) {
    const start = localMinutes(job.start);
    const busyUntil = Math.max(localMinutes(job.end), start + LABEL_MINUTES);
    let track = tracks.findIndex((free) => free <= start);
    if (track === -1) track = tracks.length;
    tracks[track] = busyUntil;
    out.set(job.id, track);
  }
  return out;
}
