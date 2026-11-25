import { calendarData, validateCalendarRange } from '../../shared/calendar';
import { validateCalendarEvent } from '../../shared/calendar-events';
import { sentFields } from '../../shared/fields';
import { isJsonObject, json, problem, readJson } from '../http';
import type { OrderRepository } from '../orders/repository';
import type { PrintJobRepository } from '../print-jobs/repository';
import type { ProjectRepository } from '../projects/repository';
import type { ServiceRepository } from '../service/repository';
import type { CalendarEventRepository } from './repository';

export interface CalendarDeps {
  orders: OrderRepository;
  projects: ProjectRepository;
  service: ServiceRepository;
  jobs: PrintJobRepository;
  events: CalendarEventRepository;
  /** The workshop's date, YYYY-MM-DD. */
  today: () => string;
}

const CALENDAR_PATH = '/api/calendar';
const EVENTS_PATH = '/api/calendar/events';
const EVENT_PATH = /^\/api\/calendar\/events\/(\d+)$/;
const INVALID_EVENT = 'Revisá los datos del evento.';

const notAllowed = () => problem(405, 'Método no permitido.');
const notJson = () => problem(400, 'El cuerpo tiene que ser JSON.');
const eventNotFound = (id: number) => problem(404, `No existe el evento ${id}.`);

/**
 * Handle GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD and the hand-made events under /api/calendar/events. Returns
 * null for any other path.
 */
export async function handleCalendar(request: Request, url: URL, deps: CalendarDeps): Promise<Response | null> {
  if (url.pathname === CALENDAR_PATH) {
    if (request.method !== 'GET') return notAllowed();
    const range = validateCalendarRange(url.searchParams.get('from'), url.searchParams.get('to'));
    if (!range.ok) return json({ error: 'Revisá las fechas del calendario.', fields: range.errors }, 422);
    const [orders, projects, tasks, plannedJobs, events] = await Promise.all([
      deps.orders.list(), deps.projects.list(), deps.service.listTasks(), deps.jobs.listPlanned(), deps.events.list(range.value),
    ]);
    return json(calendarData(range.value, deps.today(), { orders, projects, tasks, plannedJobs, events }));
  }

  if (url.pathname === EVENTS_PATH) {
    if (request.method !== 'POST') return notAllowed();
    const body = await readJson(request);
    if (body === undefined) return notJson();
    const result = validateCalendarEvent(body);
    if (!result.ok) return json({ error: INVALID_EVENT, fields: result.errors }, 422);
    return json({ event: await deps.events.create(result.value) }, 201);
  }

  const eventMatch = EVENT_PATH.exec(url.pathname);
  if (eventMatch) {
    const id = Number(eventMatch[1]);
    if (request.method === 'PUT') {
      const body = await readJson(request);
      if (!isJsonObject(body)) return notJson();
      const current = await deps.events.get(id);
      if (!current) return eventNotFound(id);
      // Fields left out of the body keep their stored value, and only the sent ones are written.
      const result = validateCalendarEvent({ ...current, ...body });
      if (!result.ok) return json({ error: INVALID_EVENT, fields: result.errors }, 422);
      const event = await deps.events.update(id, sentFields(result.value, body));
      return event ? json({ event }) : eventNotFound(id);
    }
    if (request.method === 'DELETE') {
      const event = await deps.events.delete(id);
      return event ? json({ event }) : eventNotFound(id);
    }
    return notAllowed();
  }

  return null;
}
