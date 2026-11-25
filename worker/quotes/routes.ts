import { calculateCost } from '../../shared/calculator';
import { sentFields } from '../../shared/fields';
import { readSubmissionKey } from '../../shared/print-jobs';
import {
  canAcceptQuote, canChangeQuoteStatus, isSameQuoteSave, missingReferences, ordersFromQuote, recipientFieldErrors, validateAcceptQuote,
  validateNewQuote, validateQuoteChanges, validateQuoteClient, type NewQuote, type Quote,
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
      const [client, orders] = await Promise.all([
        quote.clientId === null ? null : deps.clients.get(quote.clientId), deps.orders.listByQuote(id),
      ]);
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

/**
 * The answer to a save whose submission key a quote already carries, so a retried save is not stored twice: the same
 * save (the same recipient or client and the same calculator input) gets that quote back with 200; anything else is
 * 409, so a different save never looks stored. Null when no quote carries the key. Writes nothing either way.
 */
async function savedBefore(submissionKey: string | null, sent: NewQuote, quotes: QuoteRepository): Promise<Response | null> {
  if (submissionKey === null) return null;
  const quote = await quotes.bySubmission(submissionKey);
  if (!quote) return null;
  if (!isSameQuoteSave(quote, sent)) {
    return problem(409, `Esa clave de envío ya se usó para el presupuesto ${quote.number}, con otros datos: revisalo en Presupuestos.`);
  }
  return json({ quote });
}

/**
 * Price the calculator input with what is stored right now and freeze it. A total sent by the browser is ignored. A
 * quick quote names a recipient instead of a client and creates no client. With a `submissionKey`, a key a quote
 * already carries answers that quote (or 409), and only one save per key stores a quote.
 */
async function create(request: Request, deps: QuoteDeps): Promise<Response> {
  const body = await readJson(request);
  if (body === undefined) return problem(400, 'El cuerpo tiene que ser JSON.');
  const result = validateNewQuote(body);
  const key = readSubmissionKey(body);
  if (!result.ok || !key.ok) return invalid({ ...(result.ok ? {} : result.errors), ...(key.ok ? {} : key.errors) });
  // Before anything is read or created: a retry must not resolve (and so create) its client again.
  const saved = await savedBefore(key.value, result.value, deps.quotes);
  if (saved) return saved;
  const { input, client: name, clientId: id, ...rest } = result.value;

  const [printers, spools, settings] = await Promise.all([deps.printers.list(), deps.spools.list(), currentCostSettings(deps.settings)]);
  // Checked before the client is resolved, so a rejected quote never leaves a new client behind.
  const missing = missingReferences(input, printers, spools);
  if (missing) return invalid({ input: missing });

  let clientId: number | null = null;
  let created = false;
  if (id !== null || name !== '') {
    const client = await resolveClient({ client: name, clientId: id }, deps.clients);
    if ('errors' in client) return invalid(client.errors);
    ({ id: clientId, created } = client);
  }

  const { updatedAt: _updatedAt, ...costs } = settings;
  const draft = { ...rest, clientId, input, result: calculateCost(input, printers, spools, costs) };
  if (key.value === null) return json({ quote: await deps.quotes.create(draft) }, 201);

  const quote = await deps.quotes.createWithKey(draft, key.value);
  if (quote) return json({ quote }, 201);
  // Another try of this save stored its quote between the check above and the insert, which wrote nothing. A client
  // this request created for it goes again (the other try made or picked its own).
  if (created && clientId !== null) await deps.clients.removeIfUnused(clientId);
  return (await savedBefore(key.value, result.value, deps.quotes)) ?? problem(409, 'Esa clave de envío ya se usó: revisá en Presupuestos.');
}

/**
 * Change the title, validity, note, status, recipient or breakdown switch; only the fields sent are written. The client,
 * lines, breakdown and total never change here. The recipient fields belong to quotes without a client: a quote that
 * has one answers 422 on them.
 */
async function update(request: Request, id: number, quotes: QuoteRepository): Promise<Response> {
  const body = await readJson(request);
  if (!isJsonObject(body)) return problem(400, 'El cuerpo tiene que ser JSON.');
  const current = await quotes.get(id);
  if (!current) return notFound(id);
  // The request is checked merged with the stored values, so a quote without a client keeps a recipient name.
  const { title, validUntil, note, status, recipientName, recipientPhone, showBreakdown } = { ...current, ...body };
  const result = validateQuoteChanges({ title, validUntil, note, status, recipientName, recipientPhone, showBreakdown }, current.clientId === null);
  const recipientErrors = recipientFieldErrors(body, current.clientId !== null);
  if (!result.ok || Object.keys(recipientErrors).length) return invalid({ ...(result.ok ? {} : result.errors), ...recipientErrors });
  const next = sentFields(result.value, body);
  if (next.status === 'aceptado' && current.status !== 'aceptado') {
    return invalid({ status: 'Para aceptarlo usá «Aceptar»: así se crean los pedidos.' });
  }
  const conflict = () => problem(409, `El presupuesto ${current.number} ya fue aceptado: no cambia de estado.`);
  if (next.status !== undefined && !canChangeQuoteStatus(current.status, next.status)) return conflict();
  const quote = await quotes.update(id, next);
  if (quote) return json({ quote });
  // Null here means an accept landed after the read above: it may have given the quote a client, which refuses the
  // recipient fields, or closed its status.
  const now = await quotes.get(id);
  const lateRecipient = recipientFieldErrors(body, now !== null && now.clientId !== null);
  return Object.keys(lateRecipient).length ? invalid(lateRecipient) : conflict();
}

/**
 * Turn every line into an order for the client, at its frozen price, and mark the quote aceptado. Only once. A quote
 * without a client is first given one, picked or named in the body like an order's (a new client gets the recipient's
 * phone), and linked to it in the same write that creates the orders. A new client is made before that write, so when
 * the write is refused it is removed again: a refused accept leaves no client behind.
 */
async function accept(request: Request, id: number, deps: QuoteDeps): Promise<Response> {
  // The body is optional: without one the orders come through WhatsApp.
  const body = (await readJson(request)) ?? {};
  const result = validateAcceptQuote(body);
  const quote = await deps.quotes.get(id);
  if (!quote) return notFound(id);
  if (!result.ok) return invalid(result.errors);
  if (quote.status === 'aceptado') return alreadyAccepted(quote);
  if (!canAcceptQuote(quote.status)) return problem(409, `El presupuesto ${quote.number} está rechazado: no se puede aceptar.`);

  let clientId = quote.clientId;
  let created = false;
  if (clientId === null) {
    const named = validateQuoteClient(body);
    if (!named.ok) return invalid(named.errors);
    const client = await resolveClient(named.value, deps.clients, { phone: quote.recipientPhone });
    if ('errors' in client) return invalid(client.errors);
    ({ id: clientId, created } = client);
  }

  const accepted = await deps.quotes.accept(id, clientId, ordersFromQuote(quote, result.value.channel));
  if (!accepted) {
    // Another accept (or a rejection) landed after the read above; the guarded write wrote nothing. A client this
    // request created for it goes again, unless something refers to it by now: a refused accept leaves no client behind.
    if (created) await deps.clients.removeIfUnused(clientId);
    return problem(409, `El presupuesto ${quote.number} ya no se puede aceptar: recargá la página.`);
  }
  const [saved, orders] = await Promise.all([deps.quotes.get(id), deps.orders.listByQuote(id)]);
  return json({ quote: saved, orders }, 201);
}
