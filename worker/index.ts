import { problem } from './http';
import { handleOrders } from './orders/routes';
import { d1OrderRepository } from './orders/repository';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return new Response(null, { status: 404 });

    try {
      const response = await handleOrders(request, url, d1OrderRepository(env.DB));
      return response ?? problem(404, 'Esa ruta no existe.');
    } catch (error) {
      console.error(JSON.stringify({ message: 'api_error', path: url.pathname, error: String(error) }));
      return problem(500, 'Algo salió mal. Probá de nuevo en un rato.');
    }
  },
} satisfies ExportedHandler<Env>;
