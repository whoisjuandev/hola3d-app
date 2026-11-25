import { workshopToday } from '../shared/service';
import { handleCalendar } from './calendar/routes';
import { handleClients } from './clients/routes';
import { handleDashboard } from './dashboard/routes';
import { d1ClientRepository } from './clients/repository';
import { problem } from './http';
import { handleOrders } from './orders/routes';
import { d1OrderRepository } from './orders/repository';
import { d1PrintJobRepository } from './print-jobs/repository';
import { handlePrintJobs } from './print-jobs/routes';
import { handlePrinters } from './printers/routes';
import { d1PrinterRepository } from './printers/repository';
import { d1ProjectRepository } from './projects/repository';
import { handleProjects } from './projects/routes';
import { d1QuoteRepository } from './quotes/repository';
import { handleQuotes } from './quotes/routes';
import { d1ServiceRepository } from './service/repository';
import { handleService } from './service/routes';
import { handleCostSettings } from './settings/routes';
import { d1CostSettingsRepository } from './settings/repository';
import { handleSpools } from './spools/routes';
import { d1SpoolRepository } from './spools/repository';

/** The workshop's date when the request is handled. */
const today = () => workshopToday(new Date());

type Handler = (request: Request, url: URL, env: Env) => Promise<Response | null>;

/** Each module answers its own paths and returns null for the rest, so they are tried in turn. */
const HANDLERS: Handler[] = [
  (request, url, env) => handleOrders(request, url, d1OrderRepository(env.DB), d1ClientRepository(env.DB), d1ProjectRepository(env.DB)),
  (request, url, env) => handlePrintJobs(request, url, {
    jobs: d1PrintJobRepository(env.DB),
    orders: d1OrderRepository(env.DB),
    printers: d1PrinterRepository(env.DB),
    spools: d1SpoolRepository(env.DB),
    settings: d1CostSettingsRepository(env.DB),
  }),
  (request, url, env) => handleClients(request, url, d1ClientRepository(env.DB), d1OrderRepository(env.DB)),
  (request, url, env) => handleProjects(request, url, {
    projects: d1ProjectRepository(env.DB),
    orders: d1OrderRepository(env.DB),
    clients: d1ClientRepository(env.DB),
  }),
  (request, url, env) => handlePrinters(request, url, d1PrinterRepository(env.DB), { service: d1ServiceRepository(env.DB), today }),
  (request, url, env) => handleService(request, url, { service: d1ServiceRepository(env.DB), printers: d1PrinterRepository(env.DB), today }),
  (request, url, env) => handleCalendar(request, url, {
    orders: d1OrderRepository(env.DB),
    projects: d1ProjectRepository(env.DB),
    service: d1ServiceRepository(env.DB),
    jobs: d1PrintJobRepository(env.DB),
    today,
  }),
  (request, url, env) => handleDashboard(request, url, {
    orders: d1OrderRepository(env.DB),
    spools: d1SpoolRepository(env.DB),
    service: d1ServiceRepository(env.DB),
    quotes: d1QuoteRepository(env.DB),
    today,
  }),
  (request, url, env) => handleSpools(request, url, d1SpoolRepository(env.DB)),
  (request, url, env) => handleCostSettings(request, url, d1CostSettingsRepository(env.DB)),
  (request, url, env) => handleQuotes(request, url, {
    quotes: d1QuoteRepository(env.DB),
    orders: d1OrderRepository(env.DB),
    clients: d1ClientRepository(env.DB),
    printers: d1PrinterRepository(env.DB),
    spools: d1SpoolRepository(env.DB),
    settings: d1CostSettingsRepository(env.DB),
  }),
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return new Response(null, { status: 404 });

    try {
      for (const handle of HANDLERS) {
        const response = await handle(request, url, env);
        if (response) return response;
      }
      return problem(404, 'Esa ruta no existe.');
    } catch (error) {
      console.error(JSON.stringify({ message: 'api_error', path: url.pathname, error: String(error) }));
      return problem(500, 'Algo salió mal. Probá de nuevo en un rato.');
    }
  },
} satisfies ExportedHandler<Env>;
