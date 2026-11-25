// Quotes: a calculation saved for a client, with its price frozen. Shared by the Worker API and the React app.
import type { CalcInput, CalcLineInput, CalcPrinter, CalcResult, CalcSpool, FilamentUseInput } from './calculator';
import { clientNameKey, readPhone, whatsappUrl } from './clients';
import { asBody, isMissing, readText, type Body, type Errors } from './fields';
import { CHANNELS, type Channel, type NewOrder, type ValidationResult } from './orders';
import { readProfitChoice } from './profit';

export const QUOTE_STATUSES = ['borrador', 'enviado', 'aceptado', 'rechazado'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
};

/** How long a new quote is valid by default. */
export const QUOTE_VALID_DAYS = 15;

/** The statuses a new quote may start in. A quick quote is saved as enviado, as it goes to the recipient at once. */
export const NEW_QUOTE_STATUSES = ['borrador', 'enviado'] as const;
export type NewQuoteStatus = (typeof NEW_QUOTE_STATUSES)[number];

export interface Quote {
  id: number;
  number: string; // sequential, shown as "P-0001"
  clientId: number | null; // null for a quick quote until it is accepted
  client: string | null; // the client's name, read through the client record; null without a client
  recipientName: string; // who a quick quote is for, as text; '' for a quote made for a client
  recipientPhone: string; // the recipient's phone for WhatsApp, as written; '' when not given
  title: string;
  status: QuoteStatus;
  validUntil: string | null; // YYYY-MM-DD; null means no deadline, so it never expires
  showBreakdown: boolean; // the print view shows the cost breakdown
  input: CalcInput; // the calculator input as it was saved
  result: CalcResult; // the lines, breakdown and settings as they were priced when saved; never recalculated
  total: number; // whole pesos, result.total
  note: string; // for the client: it shows on the print view and in the WhatsApp message
  createdAt: string;
  updatedAt: string;
}

/**
 * A validated create-quote request. Like an order, it names its client by `clientId` or by `client` (a name); a quick
 * quote names no client and has `recipientName` instead (the recipient fields are '' when there is a client).
 */
export interface NewQuote {
  client: string;
  clientId: number | null;
  recipientName: string;
  recipientPhone: string;
  title: string;
  validUntil: string | null;
  note: string;
  showBreakdown: boolean;
  status: NewQuoteStatus;
  input: CalcInput;
}

export interface QuoteChanges {
  title: string;
  validUntil: string | null;
  note: string;
  status: QuoteStatus;
  recipientName: string;
  recipientPhone: string;
  showBreakdown: boolean;
}

/** What an accepted quote line becomes: the input of a new order, without its client. */
export type QuoteOrderInput = Omit<NewOrder, 'client' | 'clientId'>;

export function isQuoteStatus(value: unknown): value is QuoteStatus {
  return typeof value === 'string' && (QUOTE_STATUSES as readonly string[]).includes(value);
}

export function formatQuoteNumber(n: number): string {
  return `P-${String(n).padStart(4, '0')}`;
}

/** A calendar date `days` after `iso` (YYYY-MM-DD). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function defaultValidUntil(today: string): string {
  return addDays(today, QUOTE_VALID_DAYS);
}

/** "10/12/2026" from "2026-12-10". */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** "$26.200": whole pesos with dots between thousands, the same on every device. */
export function formatPesos(pesos: number): string {
  const sign = pesos < 0 ? '-' : '';
  return `${sign}$${String(Math.abs(Math.round(pesos))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a YYYY-MM-DD string that is a real calendar date. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The validity date, or null when none is given: a quote without one has no deadline. */
function readValidUntil(body: Body, errors: Errors): string | null {
  const raw = body.validUntil;
  if (isMissing(raw)) return null;
  if (!isCalendarDate(raw)) errors.validUntil = 'La fecha tiene que ser AAAA-MM-DD.';
  return typeof raw === 'string' ? raw : null;
}

/** The "Incluir desglose de costos" switch; off when not given. */
function readShowBreakdown(body: Body, errors: Errors): boolean {
  const raw = body.showBreakdown;
  if (raw === undefined || raw === null) return false;
  if (typeof raw !== 'boolean') errors.showBreakdown = 'Elegí si se incluye el desglose de costos.';
  return raw === true;
}

const ONE_LINE = 'Escribilo en una línea, sin caracteres invisibles.';

/** A control character (C0, DEL or C1): a NUL, a line break, a tab, an escape. */
function isControl(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
}

/**
 * Text stored as one line, like a title or a recipient name: as readText, and without control characters. A NUL also
 * matters to the table: SQLite's length() stops at it, so a recipient name of one NUL would pass here as one character
 * and fail the CHECK that asks for a non-empty name. JavaScript's trim removes every space SQLite's trim removes (and
 * more), so a name that is not empty here is not empty there either.
 */
function readOneLine(body: Body, errors: Errors, key: string, max: number, required: boolean): string {
  const value = readText(body, errors, key, max, required);
  if (!errors[key] && [...value].some(isControl)) errors[key] = ONE_LINE;
  return value;
}

const MAX_LINES = 30;
const MAX_FILAMENTS = 10;
const MAX_NAME = 100; // leaves room for " × quantity" in the 120 characters of an order item

function wholeFrom(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

function idOrNull(value: unknown): number | null | undefined {
  if (value == null) return null;
  return wholeFrom(value, 1) ? value : undefined;
}

/** One filament use, or the message of its first problem. */
function readFilament(raw: unknown, piece: string): FilamentUseInput | string {
  const f = asBody(raw);
  const spoolId = idOrNull(f.spoolId);
  if (spoolId === undefined) return `${piece}: elegí una bobina de la lista.`;
  const material = typeof f.material === 'string' ? f.material.trim() : '';
  if (material.length > 80) return `${piece}: el material va hasta 80 caracteres.`;
  const pricePerKg = isMissing(f.pricePerKg) ? 0 : f.pricePerKg;
  if (!wholeFrom(pricePerKg, 0)) return `${piece}: el precio por kg va en pesos, sin centavos.`;
  if (!wholeFrom(f.gramsPerUnit, 0)) return `${piece}: los gramos van en números enteros.`;
  // A stored spool brings its own material and price; only a typed material keeps them.
  return spoolId === null
    ? { spoolId, material, pricePerKg, gramsPerUnit: f.gramsPerUnit }
    : { spoolId, material: '', pricePerKg: 0, gramsPerUnit: f.gramsPerUnit };
}

/** One calculator line, or the message of its first problem. */
function readLine(raw: unknown, index: number): CalcLineInput | string {
  const piece = `Pieza ${index + 1}`;
  const l = asBody(raw);
  const name = typeof l.name === 'string' ? l.name.trim() : '';
  if (!name) return `${piece}: ponele un nombre.`;
  if (name.length > MAX_NAME) return `${piece}: el nombre va hasta ${MAX_NAME} caracteres.`;
  if (!wholeFrom(l.quantity, 1)) return `${piece}: la cantidad tiene que ser un número entero desde 1.`;
  const printerId = idOrNull(l.printerId);
  if (printerId === undefined) return `${piece}: elegí una impresora de la lista.`;
  if (![l.printMinutesPerUnit, l.prepMinutes, l.postMinutes].every((v) => wholeFrom(v, 0))) return `${piece}: los tiempos van en minutos enteros.`;
  if (!wholeFrom(l.packaging, 0)) return `${piece}: el packaging va en pesos, sin centavos.`;
  if (!Array.isArray(l.filaments) || l.filaments.length > MAX_FILAMENTS) return `${piece}: revisá los filamentos.`;
  const filaments: FilamentUseInput[] = [];
  for (const f of l.filaments) {
    const use = readFilament(f, piece);
    if (typeof use === 'string') return use;
    filaments.push(use);
  }
  return {
    name, quantity: l.quantity, printerId,
    printMinutesPerUnit: l.printMinutesPerUnit as number,
    filaments,
    prepMinutes: l.prepMinutes as number,
    postMinutes: l.postMinutes as number,
    packaging: l.packaging,
  };
}

/**
 * The calculator input with only its known fields, or the message of its first problem. The profit choice is optional:
 * without it the price starts from the settings. Quotes and saved calculator profiles read their input with it.
 */
export function readCalcInput(raw: unknown): CalcInput | string {
  const body = asBody(raw);
  const lines = body.lines;
  if (!Array.isArray(lines) || lines.length === 0) return 'Agregá al menos una pieza.';
  if (lines.length > MAX_LINES) return `Máximo ${MAX_LINES} piezas por presupuesto.`;
  const out: CalcLineInput[] = [];
  for (const [i, l] of lines.entries()) {
    const line = readLine(l, i);
    if (typeof line === 'string') return line;
    out.push(line);
  }
  if (body.profit == null) return { lines: out };
  const profit = readProfitChoice(body.profit);
  return typeof profit === 'string' ? profit : { lines: out, profit };
}

/** The client a request names, by `clientId` or by `client` (a name), as for an order. */
function readClientReference(body: Body, errors: Errors): { client: string; clientId: number | null } {
  let clientId: number | null = null;
  if (!isMissing(body.clientId)) {
    if (wholeFrom(body.clientId, 1)) clientId = body.clientId;
    else errors.clientId = 'Elegí un cliente de la lista.';
  }
  // A client picked by id needs no name.
  const client = readText(body, errors, 'client', 80, isMissing(body.clientId));
  return { client: clientId === null ? client : '', clientId };
}

/**
 * Validate a create-quote request. It names a client, or (a quick quote) sends `recipientName` and no client. Only the
 * calculator input is read: the server prices it again, so a total or result sent by the browser is ignored. Error
 * messages are shown to the owners as is.
 */
export function validateNewQuote(input: unknown): ValidationResult<NewQuote> {
  const errors: Errors = {};
  const body = asBody(input);

  const quick = isMissing(body.clientId) && isMissing(body.client) && Object.hasOwn(body, 'recipientName');
  const { client, clientId } = quick ? { client: '', clientId: null } : readClientReference(body, errors);
  const recipientName = quick ? readOneLine(body, errors, 'recipientName', 80, true) : '';
  const recipientPhone = quick ? readPhone(body, errors, 'recipientPhone') : '';
  const title = readOneLine(body, errors, 'title', 120, true);
  const validUntil = readValidUntil(body, errors);
  const note = readText(body, errors, 'note', 1000, false);
  const showBreakdown = readShowBreakdown(body, errors);
  const status = isMissing(body.status) ? 'borrador' : body.status;
  if (!(NEW_QUOTE_STATUSES as readonly unknown[]).includes(status)) errors.status = 'Un presupuesto nuevo empieza como borrador o enviado.';
  const calc = readCalcInput(body.input);
  if (typeof calc === 'string') errors.input = calc;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      client, clientId, recipientName, recipientPhone, title, validUntil, note, showBreakdown, status: status as NewQuoteStatus, input: calc as CalcInput,
    },
  };
}

/** The client a quote without one is accepted for: picked by `clientId`, or a `client` name (matched or created). */
export function validateQuoteClient(input: unknown): ValidationResult<{ client: string; clientId: number | null }> {
  const errors: Errors = {};
  const value = readClientReference(asBody(input), errors);
  if (errors.client === 'Completá este dato.') errors.client = 'Elegí el cliente o escribí uno nuevo: los pedidos se crean a su nombre.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** The first piece whose printer or spool is not in the lists, as a message; null when all are there. */
export function missingReferences(input: CalcInput, printers: Pick<CalcPrinter, 'id'>[], spools: Pick<CalcSpool, 'id'>[]): string | null {
  for (const [i, line] of input.lines.entries()) {
    if (line.printerId !== null && !printers.some((p) => p.id === line.printerId)) return `Pieza ${i + 1}: esa impresora ya no existe.`;
    if (line.filaments.some((f) => f.spoolId !== null && !spools.some((s) => s.id === f.spoolId))) return `Pieza ${i + 1}: esa bobina ya no existe.`;
  }
  return null;
}

/**
 * Validate the editable fields of a quote (the stored values merged with the request). A quote without a client
 * (`needsRecipient`) must keep a recipient name.
 */
export function validateQuoteChanges(input: unknown, needsRecipient: boolean): ValidationResult<QuoteChanges> {
  const errors: Errors = {};
  const body = asBody(input);
  const title = readOneLine(body, errors, 'title', 120, true);
  const validUntil = readValidUntil(body, errors);
  const note = readText(body, errors, 'note', 1000, false);
  const status = body.status;
  if (!isQuoteStatus(status)) errors.status = 'Ese estado no existe.';
  const recipientName = readOneLine(body, errors, 'recipientName', 80, needsRecipient);
  const recipientPhone = readPhone(body, errors, 'recipientPhone');
  const showBreakdown = readShowBreakdown(body, errors);
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { title, validUntil, note, status: status as QuoteStatus, recipientName, recipientPhone, showBreakdown } };
}

const RECIPIENT_KEYS = ['recipientName', 'recipientPhone'] as const;
const CLIENT_HAS_CONTACT = 'Este presupuesto tiene cliente: se usan su nombre y su teléfono.';

/**
 * The recipient fields belong to quotes without a client: an edit of a quote that has one (`hasClient`) may not send
 * them, whatever their value. The errors of the ones `sent`; empty when there are none.
 */
export function recipientFieldErrors(sent: unknown, hasClient: boolean): Errors {
  if (!hasClient) return {};
  const body = asBody(sent);
  return Object.fromEntries(RECIPIENT_KEYS.filter((key) => Object.hasOwn(body, key)).map((key) => [key, CLIENT_HAS_CONTACT]));
}

/**
 * Whether a create request is a retry of the save that stored `quote` under the same submission key: the same recipient
 * (a quick quote) or the same client (by id, or by name as the client picker matches names), and the same calculator
 * input. The other fields (title, note, validity, phone, switch) may have changed in the form since; the quote is
 * answered as it was stored.
 */
export function isSameQuoteSave(
  quote: Pick<Quote, 'clientId' | 'client' | 'recipientName' | 'input'>, sent: NewQuote,
): boolean {
  const quick = sent.clientId === null && sent.client === '';
  const sameParty = quick
    ? quote.recipientName === sent.recipientName
    : quote.recipientName === '' && (sent.clientId !== null
      ? quote.clientId === sent.clientId
      : quote.client !== null && clientNameKey(quote.client) === clientNameKey(sent.client));
  return sameParty && JSON.stringify(quote.input) === JSON.stringify(sent.input);
}

/**
 * Borrador, enviado and rechazado move freely among themselves. Aceptado is reached only by accepting (which
 * creates the orders), and an accepted quote keeps that status. Staying in the same status is always fine.
 */
export function canChangeQuoteStatus(from: QuoteStatus, to: QuoteStatus): boolean {
  if (from === to) return true;
  return from !== 'aceptado' && to !== 'aceptado';
}

/** Only a quote still waiting for an answer can be accepted. */
export function canAcceptQuote(status: QuoteStatus): boolean {
  return status === 'borrador' || status === 'enviado';
}

/** A quote still waiting for an answer (borrador or enviado) whose validity date is before `today`. Never without one. */
export function isQuoteExpired(quote: Pick<Quote, 'status' | 'validUntil'>, today: string): boolean {
  return canAcceptQuote(quote.status) && quote.validUntil !== null && quote.validUntil < today;
}

/** The channel the accepted orders came through; WhatsApp when not given. */
export function validateAcceptQuote(input: unknown): ValidationResult<{ channel: Channel }> {
  const channel = asBody(input).channel;
  if (isMissing(channel)) return { ok: true, value: { channel: 'WhatsApp' } };
  if (typeof channel === 'string' && (CHANNELS as readonly string[]).includes(channel)) return { ok: true, value: { channel: channel as Channel } };
  return { ok: false, errors: { channel: 'Elegí por dónde llegó el pedido.' } };
}

/** "Llavero con logo × 12", or just the name for one unit. */
function itemLabel(line: { name: string; quantity: number }): string {
  return line.quantity === 1 ? line.name : `${line.name} × ${line.quantity}`;
}

/** One new order per frozen line: the piece and quantity as the item, the line's price, the given channel. */
export function ordersFromQuote(quote: Pick<Quote, 'result'>, channel: Channel): QuoteOrderInput[] {
  return quote.result.lines.map((line) => ({
    item: itemLabel(line), channel, price: line.total, dueDate: null, dueTime: null, deposit: null, material: '', note: '',
  }));
}

type MessageQuote = Pick<Quote, 'number' | 'title' | 'client' | 'recipientName' | 'result' | 'total' | 'validUntil' | 'note'>;

/**
 * Who a quote is for and where to write: a quote with a client uses the client's name and phone ('' when the client
 * has none or is not loaded), never the recipient fields; a quick quote without a client uses its recipient's.
 */
export function quoteContact(
  quote: Pick<Quote, 'client' | 'recipientName' | 'recipientPhone'>, client: { phone: string } | null,
): { name: string; phone: string } {
  if (quote.client !== null) return { name: quote.client, phone: client?.phone ?? '' };
  return { name: quote.recipientName, phone: quote.recipientPhone };
}

/** The ready WhatsApp message: the items, the total and the validity date if there is one, then the note if there is one. */
export function quoteWhatsappMessage(quote: MessageQuote): string {
  const items = quote.result.lines.map((line) => {
    const each = line.quantity > 1 ? ` (${formatPesos(line.unitPrice)} c/u)` : '';
    return `• ${itemLabel(line)}: ${formatPesos(line.total)}${each}`;
  });
  const text = [
    `¡Hola, ${quote.client ?? quote.recipientName}! Te paso el presupuesto de Hola3D.`,
    '',
    `*${quote.number} · ${quote.title}*`,
    ...items,
    '',
    `*Total: ${formatPesos(quote.total)}*`,
    ...(quote.validUntil === null ? [] : [`Válido hasta el ${formatDay(quote.validUntil)}.`]),
  ].join('\n');
  return quote.note ? `${text}\n\n${quote.note}` : text;
}

/** WhatsApp with the message ready: the client's chat when there is a phone, otherwise the contact picker. */
export function quoteWhatsappUrl(quote: MessageQuote, phone: string): string {
  return `${whatsappUrl(phone) ?? 'https://wa.me/'}?text=${encodeURIComponent(quoteWhatsappMessage(quote))}`;
}

/**
 * The calculation as plain text for a client: each piece with its quantity and price, then the total. Nothing about
 * costs, profit or commission. What "Copiar resumen" copies.
 */
export function calculationSummary(result: Pick<CalcResult, 'lines' | 'total'>): string {
  const items = result.lines.map((line, i) => {
    const each = line.quantity > 1 ? ` (${formatPesos(line.unitPrice)} c/u)` : '';
    return `• ${line.name || `Pieza ${i + 1}`} × ${line.quantity}: ${formatPesos(line.total)}${each}`;
  });
  return ['Presupuesto Hola3D', ...items, `Total: ${formatPesos(result.total)}`].join('\n');
}
