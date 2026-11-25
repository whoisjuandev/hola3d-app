import { dashboardData } from '../../shared/dashboard';
import { json, problem } from '../http';
import type { OrderRepository } from '../orders/repository';
import type { QuoteRepository } from '../quotes/repository';
import type { ServiceRepository } from '../service/repository';
import type { SpoolRepository } from '../spools/repository';

export interface DashboardDeps {
  orders: OrderRepository;
  spools: SpoolRepository;
  service: ServiceRepository;
  quotes: QuoteRepository;
  /** The workshop's date, YYYY-MM-DD. */
  today: () => string;
}

/** Handle GET /api/dashboard: the home screen. Reads the other modules' ports and stores nothing. Null for any other path. */
export async function handleDashboard(request: Request, url: URL, deps: DashboardDeps): Promise<Response | null> {
  if (url.pathname !== '/api/dashboard') return null;
  if (request.method !== 'GET') return problem(405, 'Método no permitido.');
  const [orders, spools, tasks, quotes] = await Promise.all([
    deps.orders.list(), deps.spools.list(), deps.service.listTasks(), deps.quotes.list(),
  ]);
  return json(dashboardData({ orders, spools, tasks, quotes }, deps.today()));
}
