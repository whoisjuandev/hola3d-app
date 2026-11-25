// Dates, titles and layout of the Calendario screen. The rules for what falls in a range are in shared/calendar.ts.
import {
  addDays, dayAgenda, localMinutes, weekStart, type AgendaEntry, type CalendarData, type CalendarOrder, type CalendarPlannedJob, type CalendarProject,
  type CalendarServiceTask, type DateRange,
} from '../../../shared/calendar';
import { EVENT_TYPE_LABEL, type CalendarEvent, type EventType } from '../../../shared/calendar-events';
import { isCalendarDate } from '../../../shared/quotes';

export type CalendarView = 'mes' | 'semana';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
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

/** "Miércoles 25 de noviembre". */
export function longDayTitle(date: string): string {
  const [, m, d] = parts(date);
  return `${DAY_NAMES[weekdayIndex(date)]} ${d} de ${MONTHS[m - 1]}`;
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

export type ItemKind = 'order' | 'project' | 'service' | 'job' | 'event';

export const KIND_LABEL: Record<ItemKind, string> = { order: 'Entrega', project: 'Proyecto', service: 'Servicio', job: 'Impresión', event: 'Evento' };

export interface DayItem {
  key: string;
  kind: ItemKind;
  label: string;
  detail: string;
  overdue: boolean;
  to: string | null; // where clicking it leads; null for a hand-made event, which is changed where it is shown
  /** A hand-made event's type, done flag and record. */
  eventType?: EventType;
  done?: boolean;
  event?: CalendarEvent;
}

const orderItem = (o: CalendarOrder): DayItem => ({
  key: `order-${o.id}`, kind: 'order', label: `#${o.id} ${o.item}`, detail: o.dueTime ? `${o.client} · ${o.dueTime}` : o.client,
  overdue: o.overdue, to: `/pedidos?pedido=${o.id}`,
});
const projectItem = (p: CalendarProject): DayItem => ({
  key: `project-${p.id}`, kind: 'project', label: p.name, detail: p.client, overdue: p.overdue, to: `/proyectos/${p.id}`,
});
const serviceItem = (t: CalendarServiceTask): DayItem => ({
  key: `service-${t.id}`, kind: 'service', label: t.name, detail: t.printer, overdue: t.overdue, to: `/taller?impresora=${t.printerId}`,
});
const jobItem = (j: CalendarPlannedJob): DayItem => ({
  key: `job-${j.id}`, kind: 'job', label: `#${j.orderId} ${j.item}`, detail: `${j.printer} · ${timeRange(j)}`, overdue: false, to: `/pedidos?pedido=${j.orderId}`,
});
const eventItem = (e: CalendarEvent): DayItem => ({
  key: `event-${e.id}`, kind: 'event', label: e.title, detail: e.time ? `${EVENT_TYPE_LABEL[e.type]} · ${e.time}` : EVENT_TYPE_LABEL[e.type],
  overdue: false, to: null, eventType: e.type, done: e.done, event: e,
});

export function itemClass(item: DayItem): string {
  return [
    'cal-item', `cal-item--${item.kind}`, item.eventType && `cal-ev--${item.eventType}`, item.done && 'cal-item--done', item.overdue && 'cal-item--late',
  ].filter(Boolean).join(' ');
}

/** The dot of an item on a phone's month cell: its kind's colour, its event type's, or red when late. */
export function dotClass(item: DayItem): string {
  if (item.overdue) return 'cal-dot cal-dot--late';
  return item.eventType ? `cal-dot cal-dot--event cal-ev--${item.eventType}` : `cal-dot cal-dot--${item.kind}`;
}

/** "Entrega", "Proyecto", … and an event's own type ("Reunión"). */
export function kindLabel(item: DayItem): string {
  return item.eventType ? EVENT_TYPE_LABEL[item.eventType] : KIND_LABEL[item.kind];
}

/** A planned job touches the day when any minute of it falls inside it. */
function jobOnDay(job: CalendarPlannedJob, date: string): boolean {
  return job.start < `${addDays(date, 1)}T00:00` && job.end > `${date}T00:00`;
}

/**
 * What falls on `date`, by type: due orders, projects and service tasks, hand-made events, then planned jobs (unless
 * `withJobs` is false).
 */
export function dayItems(data: CalendarData, date: string, withJobs = true): DayItem[] {
  return [
    ...data.orders.filter((o) => o.dueDate === date).map(orderItem),
    ...data.projects.filter((p) => p.dueDate === date).map(projectItem),
    ...data.serviceTasks.filter((t) => t.dueDate === date).map(serviceItem),
    ...data.events.filter((e) => e.date === date).map(eventItem),
    ...(withJobs ? data.plannedJobs.filter((job) => jobOnDay(job, date)).map(jobItem) : []),
  ];
}

function agendaItem(entry: AgendaEntry): DayItem {
  switch (entry.kind) {
    case 'event': return eventItem(entry.event);
    case 'order': return orderItem(entry.order);
    case 'project': return projectItem(entry.project);
    case 'service': return serviceItem(entry.task);
    case 'job': return jobItem(entry.job);
  }
}

/** The day panel: everything on `date` in time order, the untimed things first, each with its time on that day. */
export function panelItems(data: CalendarData, date: string): (DayItem & { time: string | null })[] {
  return dayAgenda(data, date).map((entry) => ({ ...agendaItem(entry), time: entry.time }));
}

/** The event form's values: a new event on `date` starts as a task without time. */
export function eventDraft(event: CalendarEvent | null, date: string): Record<string, string> {
  if (!event) return { type: 'tarea', title: '', date, time: '', note: '' };
  return { type: event.type, title: event.title, date: event.date, time: event.time ?? '', note: event.note };
}

/** The body of an event request from the form values given (all of them, or only the changed ones): an empty time is none. */
export function eventBody(values: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, key === 'time' && value === '' ? null : value]));
}
