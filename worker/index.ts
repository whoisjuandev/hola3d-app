import { problem } from './http';
import { handleOrders } from './orders/routes';
import { d1OrderRepository } from './orders/repository';
import { handlePrinters } from './printers/routes';
import { d1PrinterRepository } from './printers/repository';
import { handleSpools } from './spools/routes';
import { d1SpoolRepository } from './spools/repository';

type Handler = (request: Request, url: URL, env: Env) => Promise<Response | null>;

/** Each module answers its own paths and returns null for the rest, so they are tried in turn. */
const HANDLERS: Handler[] = [
  (request, url, env) => handleOrders(request, url, d1OrderRepository(env.DB)),
  (request, url, env) => handlePrinters(request, url, d1PrinterRepository(env.DB)),
  (request, url, env) => handleSpools(request, url, d1SpoolRepository(env.DB)),
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
