import { calendarData, validateCalendarRange } from '../../shared/calendar';
import { json, problem } from '../http';
import type { OrderRepository } from '../orders/repository';
import type { PrintJobRepository } from '../print-jobs/repository';
import type { ProjectRepository } from '../projects/repository';
import type { ServiceRepository } from '../service/repository';

export interface CalendarDeps {
  orders: OrderRepository;
  projects: ProjectRepository;
  service: ServiceRepository;
  jobs: PrintJobRepository;
  /** The workshop's date, YYYY-MM-DD. */
  today: () => string;
}

/** Handle GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD. Returns null for any other path. */
export async function handleCalendar(request: Request, url: URL, deps: CalendarDeps): Promise<Response | null> {
  if (url.pathname !== '/api/calendar') return null;
  if (request.method !== 'GET') return problem(405, 'Método no permitido.');
  const range = validateCalendarRange(url.searchParams.get('from'), url.searchParams.get('to'));
  if (!range.ok) return json({ error: 'Revisá las fechas del calendario.', fields: range.errors }, 422);
  const [orders, projects, tasks, plannedJobs] = await Promise.all([
    deps.orders.list(), deps.projects.list(), deps.service.listTasks(), deps.jobs.listPlanned(),
  ]);
  return json(calendarData(range.value, deps.today(), { orders, projects, tasks, plannedJobs }));
}
