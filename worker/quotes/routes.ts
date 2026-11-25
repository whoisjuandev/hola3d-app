import { calculateCost } from '../../shared/calculator';
import {
  canAcceptQuote, canChangeQuoteStatus, missingReferences, ordersFromQuote, validateAcceptQuote, validateNewQuote, validateQuoteChanges,
  type Quote,
} from '../../shared/quotes';
import type { ClientRepository } from '../clients/repository';
import { resolveClient } from '../clients/resolve';
import { isJsonObject, json, problem, readJson } from '../http';
import type { OrderRepository } from '../orders/repository';
import type { PrinterRepository } from '../printers/repository';
import type { CostSettingsRepository } from '../settings/repository';
import { currentCostSettings } from '../settings/routes';
import type { SpoolRepository } from '../spools/repository';
import type { QuoteRepository } from './repository';

export interface QuoteDeps {
  quotes: QuoteRepository;
  orders: OrderRepository;
  clients: ClientRepository;
  printers: PrinterRepository;
  spools: SpoolRepository;
  settings: CostSettingsRepository;
}

const ITEM_PATH = /^\/api\/quotes\/(\d+)$/;
const ACCEPT_PATH = /^\/api\/quotes\/(\d+)\/accept$/;
const INVALID = 'Revisá los datos del presupuesto.';

const notFound = (id: number) => problem(404, `No existe el presupuesto ${id}.`);
const invalid = (fields: Record<string, string>) => json({ error: INVALID, fields }, 422);
const alreadyAccepted = (quote: Quote) => problem(409, `El presupuesto ${quote.number} ya fue aceptado.`);

/** Handle /api/quotes requests. Returns null when the path is not a quote route. */
export async function handleQuotes(request: Request, url: URL, deps: QuoteDeps): Promise<Response | null> {
  const { quotes } = deps;

  if (url.pathname === '/api/quotes') {
    if (request.method === 'GET') {
      const raw = url.searchParams.get('clientId');
      if (raw === null) return json({ quotes: await quotes.list() });
      if (!/^\d+$/.test(raw)) return json({ error: 'Revisá el filtro.', fields: { clientId: 'Elegí un cliente de la lista.' } }, 422);
      return json({ quotes: await quotes.list({ clientId: Number(raw) }) });
    }
    if (request.method === 'POST') return create(request, deps);
    return problem(405, 'Método no permitido.');
  }

  const itemMatch = ITEM_PATH.exec(url.pathname);
  if (itemMatch) {
    const id = Number(itemMatch[1]);
    if (request.method === 'GET') {
      const quote = await quotes.get(id);
      if (!quote) return notFound(id);
      const [client, orders] = await Promise.all([deps.clients.get(quote.clientId), deps.orders.listByQuote(id)]);
      return json({ quote, client, orders });
    }
    if (request.method === 'PUT') return update(request, id, quotes);
    return problem(405, 'Método no permitido.');
  }

  const acceptMatch = ACCEPT_PATH.exec(url.pathname);
  if (acceptMatch) {
    if (request.method !== 'POST') return problem(405, 'Método no permitido.');
    return accept(request, Number(acceptMatch[1]), deps);
  }

  return null;
}

/** Price the calculator input with what is stored right now and freeze it. A total sent by the browser is ignored. */
async function create(request: Request, deps: QuoteDeps): Promise<Response> {
  const body = await readJson(request);
  if (body === undefined) return problem(400, 'El cuerpo tiene que ser JSON.');
  const result = validateNewQuote(body);
  if (!result.ok) return invalid(result.errors);
  const { input, client: _name, clientId: _id, ...rest } = result.value;

  const [printers, spools, settings] = await Promise.all([deps.printers.list(), deps.spools.list(), currentCostSettings(deps.settings)]);
  // Checked before the client is resolved, so a rejected quote never leaves a new client behind.
  const missing = missingReferences(input, printers, spools);
  if (missing) return invalid({ input: missing });

  const client = await resolveClient(result.value, deps.clients);
  if ('errors' in client) return invalid(client.errors);

  const { updatedAt: _updatedAt, ...costs } = settings;
  const priced = calculateCost(input, printers, spools, costs);
  return json({ quote: await deps.quotes.create({ ...rest, clientId: client.id, input, result: priced }) }, 201);
}

/** Change the title, validity, note or status. The lines, breakdown and total never change. */
async function update(request: Request, id: number, quotes: QuoteRepository): Promise<Response> {
  const body = await readJson(request);
  if (!isJsonObject(body)) return problem(400, 'El cuerpo tiene que ser JSON.');
  const current = await quotes.get(id);
  if (!current) return notFound(id);
  // Fields left out of the body keep their stored value; only these four can change.
  const { title, validUntil, note, status } = { ...current, ...body };
  const result = validateQuoteChanges({ title, validUntil, note, status });
  if (!result.ok) return invalid(result.errors);
  const next = result.value;
  if (next.status === 'aceptado' && current.status !== 'aceptado') {
    return invalid({ status: 'Para aceptarlo usá «Aceptar»: así se crean los pedidos.' });
  }
  const conflict = () => problem(409, `El presupuesto ${current.number} ya fue aceptado: no cambia de estado.`);
  if (!canChangeQuoteStatus(current.status, next.status)) return conflict();
  const quote = await quotes.update(id, next);
  // Null here means an accept landed after the read above.
  return quote ? json({ quote }) : conflict();
}

/** Turn every line into an order for the client, at its frozen price, and mark the quote aceptado. Only once. */
async function accept(request: Request, id: number, deps: QuoteDeps): Promise<Response> {
  // The body is optional: without one the orders come through WhatsApp.
  const result = validateAcceptQuote((await readJson(request)) ?? {});
  const quote = await deps.quotes.get(id);
  if (!quote) return notFound(id);
  if (!result.ok) return invalid(result.errors);
  if (quote.status === 'aceptado') return alreadyAccepted(quote);
  if (!canAcceptQuote(quote.status)) return problem(409, `El presupuesto ${quote.number} está rechazado: no se puede aceptar.`);

  const accepted = await deps.quotes.accept(id, quote.clientId, ordersFromQuote(quote, result.value.channel));
  // False here means another accept (or a rejection) landed after the read above; nothing was written.
  if (!accepted) return problem(409, `El presupuesto ${quote.number} ya no se puede aceptar: recargá la página.`);
  const [saved, orders] = await Promise.all([deps.quotes.get(id), deps.orders.listByQuote(id)]);
  return json({ quote: saved, orders }, 201);
}
