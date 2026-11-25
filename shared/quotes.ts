// Quotes: a calculation saved for a client, with its price frozen. Shared by the Worker API and the React app.
import type { CalcInput, CalcLineInput, CalcPrinter, CalcResult, CalcSpool, FilamentUseInput } from './calculator';
import { whatsappUrl } from './clients';
import { asBody, isMissing, readText, type Body, type Errors } from './fields';
import { CHANNELS, type Channel, type NewOrder, type ValidationResult } from './orders';

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

export interface Quote {
  id: number;
  number: string; // sequential, shown as "P-0001"
  clientId: number;
  client: string; // the client's name, read through the client record
  title: string;
  status: QuoteStatus;
  validUntil: string; // YYYY-MM-DD
  input: CalcInput; // the calculator input as it was saved
  result: CalcResult; // the lines, breakdown and settings as they were priced when saved; never recalculated
  total: number; // whole pesos, result.total
  note: string; // for the client: it shows on the print view and in the WhatsApp message
  createdAt: string;
  updatedAt: string;
}

/** A validated create-quote request. Like an order, it names its client by `clientId` or by `client` (a name). */
export interface NewQuote {
  client: string;
  clientId: number | null;
  title: string;
  validUntil: string;
  note: string;
  input: CalcInput;
}

export interface QuoteChanges {
  title: string;
  validUntil: string;
  note: string;
  status: QuoteStatus;
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
function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function readValidUntil(body: Body, errors: Errors): string {
  const raw = body.validUntil;
  if (isMissing(raw)) errors.validUntil = 'Poné hasta qué fecha vale el presupuesto.';
  else if (!isCalendarDate(raw)) errors.validUntil = 'La fecha tiene que ser AAAA-MM-DD.';
  return typeof raw === 'string' ? raw : '';
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

/** The calculator input with only its known fields, or the message of its first problem. */
function readCalcInput(raw: unknown): CalcInput | string {
  const lines = asBody(raw).lines;
  if (!Array.isArray(lines) || lines.length === 0) return 'Agregá al menos una pieza.';
  if (lines.length > MAX_LINES) return `Máximo ${MAX_LINES} piezas por presupuesto.`;
  const out: CalcLineInput[] = [];
  for (const [i, l] of lines.entries()) {
    const line = readLine(l, i);
    if (typeof line === 'string') return line;
    out.push(line);
  }
  return { lines: out };
}

/**
 * Validate a create-quote request. Only the calculator input is read: the server prices it again, so a total
 * or result sent by the browser is ignored. Error messages are shown to the owners as is.
 */
export function validateNewQuote(input: unknown): ValidationResult<NewQuote> {
  const errors: Errors = {};
  const body = asBody(input);

  let clientId: number | null = null;
  if (!isMissing(body.clientId)) {
    if (wholeFrom(body.clientId, 1)) clientId = body.clientId;
    else errors.clientId = 'Elegí un cliente de la lista.';
  }
  // A client picked by id needs no name.
  const client = readText(body, errors, 'client', 80, isMissing(body.clientId));
  const title = readText(body, errors, 'title', 120, true);
  const validUntil = readValidUntil(body, errors);
  const note = readText(body, errors, 'note', 1000, false);
  const calc = readCalcInput(body.input);
  if (typeof calc === 'string') errors.input = calc;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { client: clientId === null ? client : '', clientId, title, validUntil, note, input: calc as CalcInput } };
}

/** The first piece whose printer or spool is not in the lists, as a message; null when all are there. */
export function missingReferences(input: CalcInput, printers: Pick<CalcPrinter, 'id'>[], spools: Pick<CalcSpool, 'id'>[]): string | null {
  for (const [i, line] of input.lines.entries()) {
    if (line.printerId !== null && !printers.some((p) => p.id === line.printerId)) return `Pieza ${i + 1}: esa impresora ya no existe.`;
    if (line.filaments.some((f) => f.spoolId !== null && !spools.some((s) => s.id === f.spoolId))) return `Pieza ${i + 1}: esa bobina ya no existe.`;
  }
  return null;
}

/** Validate the editable fields of a quote (the stored values merged with the request). */
export function validateQuoteChanges(input: unknown): ValidationResult<QuoteChanges> {
  const errors: Errors = {};
  const body = asBody(input);
  const title = readText(body, errors, 'title', 120, true);
  const validUntil = readValidUntil(body, errors);
  const note = readText(body, errors, 'note', 1000, false);
  const status = body.status;
  if (!isQuoteStatus(status)) errors.status = 'Ese estado no existe.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { title, validUntil, note, status: status as QuoteStatus } };
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

/** A quote still waiting for an answer (borrador or enviado) whose validity date is before `today`. */
export function isQuoteExpired(quote: Pick<Quote, 'status' | 'validUntil'>, today: string): boolean {
  return canAcceptQuote(quote.status) && quote.validUntil < today;
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

type MessageQuote = Pick<Quote, 'number' | 'title' | 'client' | 'result' | 'total' | 'validUntil' | 'note'>;

/** The ready WhatsApp message: the items, the total and the validity date, then the note if there is one. */
export function quoteWhatsappMessage(quote: MessageQuote): string {
  const items = quote.result.lines.map((line) => {
    const each = line.quantity > 1 ? ` (${formatPesos(line.unitPrice)} c/u)` : '';
    return `• ${itemLabel(line)}: ${formatPesos(line.total)}${each}`;
  });
  const text = [
    `¡Hola, ${quote.client}! Te paso el presupuesto de Hola3D.`,
    '',
    `*${quote.number} · ${quote.title}*`,
    ...items,
    '',
    `*Total: ${formatPesos(quote.total)}*`,
    `Válido hasta el ${formatDay(quote.validUntil)}.`,
  ].join('\n');
  return quote.note ? `${text}\n\n${quote.note}` : text;
}

/** WhatsApp with the message ready: the client's chat when there is a phone, otherwise the contact picker. */
export function quoteWhatsappUrl(quote: MessageQuote, phone: string): string {
  return `${whatsappUrl(phone) ?? 'https://wa.me/'}?text=${encodeURIComponent(quoteWhatsappMessage(quote))}`;
}
