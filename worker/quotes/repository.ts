import type { CalcInput, CalcResult } from '../../shared/calculator';
import { canAcceptQuote, canChangeQuoteStatus, formatQuoteNumber } from '../../shared/quotes';
import type { NewQuoteStatus, Quote, QuoteChanges, QuoteOrderInput, QuoteStatus } from '../../shared/quotes';
import type { MemoryTables } from '../memory';
import { insertOrderStatement, memoryInsertOrder } from '../orders/repository';

/**
 * What storage needs to save a quote: the client resolved to an id (null for a quick quote, which has a recipient name
 * instead) and the result priced by the server.
 */
export interface QuoteDraft {
  clientId: number | null;
  recipientName: string;
  recipientPhone: string;
  title: string;
  validUntil: string | null;
  note: string;
  showBreakdown: boolean;
  status: NewQuoteStatus;
  input: CalcInput;
  result: CalcResult;
}

/** Port: what the quote routes need from storage. */
export interface QuoteRepository {
  list(filter?: { clientId?: number }): Promise<Quote[]>;
  get(id: number): Promise<Quote | null>;
  /** Saves a new quote with the next number. The input and result are stored as they are, never recalculated. */
  create(draft: QuoteDraft): Promise<Quote>;
  /**
   * Writes only the fields in `changes`. Null when the quote does not exist or, when a status is sent, its status may
   * not change to it any more.
   */
  update(id: number, changes: Partial<QuoteChanges>): Promise<Quote | null>;
  /**
   * In one atomic write: create the orders for the client, linked to the quote, and mark the quote aceptado; a quote
   * without a client is linked to `clientId` in the same write. Only while the quote is borrador or enviado; otherwise
   * returns false having written nothing.
   */
  accept(id: number, clientId: number, orders: QuoteOrderInput[]): Promise<boolean>;
}

interface QuoteRow {
  id: number;
  number: number;
  client_id: number | null;
  client_name: string | null;
  recipient_name: string;
  recipient_phone: string;
  title: string;
  status: string;
  valid_until: string | null;
  show_breakdown: number;
  input_json: string;
  result_json: string;
  total: number;
  note: string;
  created_at: string;
  updated_at: string;
}

function toQuote(row: QuoteRow): Quote {
  return {
    id: row.id,
    number: formatQuoteNumber(row.number),
    clientId: row.client_id,
    client: row.client_id === null ? null : row.client_name ?? '',
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    title: row.title,
    status: row.status as QuoteStatus,
    validUntil: row.valid_until,
    showBreakdown: row.show_breakdown === 1,
    input: JSON.parse(row.input_json) as CalcInput,
    result: JSON.parse(row.result_json) as CalcResult,
    total: row.total,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = 'SELECT quotes.*, clients.name AS client_name FROM quotes LEFT JOIN clients ON clients.id = quotes.client_id';
const OPEN = "status IN ('borrador', 'enviado')";

/** The column of each editable field, and how its value is stored. */
const COLUMNS: { [K in keyof QuoteChanges]: [string, (value: QuoteChanges[K]) => unknown] } = {
  title: ['title', (v) => v],
  validUntil: ['valid_until', (v) => v],
  note: ['note', (v) => v],
  status: ['status', (v) => v],
  recipientName: ['recipient_name', (v) => v],
  recipientPhone: ['recipient_phone', (v) => v],
  showBreakdown: ['show_breakdown', (v) => (v ? 1 : 0)],
};

/** Adapter: D1 storage. Quotes list newest number first. */
export function d1QuoteRepository(db: D1Database): QuoteRepository {
  const get = async (id: number) => {
    const row = await db.prepare(`${SELECT} WHERE quotes.id = ?`).bind(id).first<QuoteRow>();
    return row ? toQuote(row) : null;
  };

  return {
    async list(filter = {}) {
      const statement = filter.clientId === undefined
        ? db.prepare(`${SELECT} ORDER BY quotes.number DESC`)
        : db.prepare(`${SELECT} WHERE quotes.client_id = ? ORDER BY quotes.number DESC`).bind(filter.clientId);
      const { results } = await statement.all<QuoteRow>();
      return results.map(toQuote);
    },

    get,

    async create(draft) {
      const now = new Date().toISOString();
      // The number is derived inside the INSERT so two saves cannot read the same max.
      const row = await db
        .prepare(
          `INSERT INTO quotes (number, client_id, recipient_name, recipient_phone, title, status, valid_until, show_breakdown, input_json, result_json,
             total, note, created_at, updated_at)
           VALUES (COALESCE((SELECT MAX(number) FROM quotes), 0) + 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id`,
        )
        .bind(
          draft.clientId, draft.recipientName, draft.recipientPhone, draft.title, draft.status, draft.validUntil, draft.showBreakdown ? 1 : 0,
          JSON.stringify(draft.input), JSON.stringify(draft.result), draft.result.total, draft.note, now, now,
        )
        .first<{ id: number }>();
      const quote = row && (await get(row.id));
      if (!quote) throw new Error('Insert returned no row');
      return quote;
    },

    async update(id, changes) {
      // Only the sent columns are written, so a change another request made to the others stays.
      const sent = (Object.keys(changes) as (keyof QuoteChanges)[]).filter((key) => changes[key] !== undefined);
      const set = sent.map((key) => `${COLUMNS[key][0]} = ?`);
      const values = sent.map((key) => (COLUMNS[key][1] as (v: unknown) => unknown)(changes[key]));
      // When a status is sent, the guard repeats canChangeQuoteStatus in SQL, so an accept that lands first is not undone.
      const guard = changes.status === undefined ? '' : ` AND (status = ? OR (status != 'aceptado' AND ? != 'aceptado'))`;
      const row = await db
        .prepare(`UPDATE quotes SET ${[...set, 'updated_at = ?'].join(', ')} WHERE id = ?${guard} RETURNING id`)
        .bind(...values, new Date().toISOString(), id, ...(changes.status === undefined ? [] : [changes.status, changes.status]))
        .first<{ id: number }>();
      return row ? get(row.id) : null;
    },

    async accept(id, clientId, orders) {
      const now = new Date().toISOString();
      // Every statement checks that the quote is still open, and the last one closes it; D1 runs a batch as one
      // transaction, so either all the orders and the status change are written, or none of them.
      const open = { sql: `EXISTS (SELECT 1 FROM quotes WHERE id = ? AND ${OPEN})`, params: [id] };
      const results = await db.batch([
        ...orders.map((o) => insertOrderStatement(db, o, clientId, { now, quoteId: id, when: open })),
        // A quote without a client takes the one its orders were made for; a quote with one keeps it.
        db.prepare(`UPDATE quotes SET status = 'aceptado', client_id = COALESCE(client_id, ?), updated_at = ? WHERE id = ? AND ${OPEN} RETURNING id`)
          .bind(clientId, now, id),
      ]);
      return (results.at(-1)?.results.length ?? 0) === 1;
    },
  };
}

function sequence(quote: Pick<Quote, 'number'>): number {
  return Number(quote.number.replace(/\D/g, ''));
}

/** Adapter: in-memory storage for tests. Shares its tables with the in-memory client and order repositories. */
export function memoryQuoteRepository(tables: MemoryTables): QuoteRepository {
  const { quotes, clients } = tables;
  // Copies in and out, like JSON columns: changing a returned quote never changes the stored one.
  const read = (q: Quote): Quote => ({ ...structuredClone(q), client: q.clientId === null ? null : clients.get(q.clientId)?.name ?? '' });

  return {
    async list(filter = {}) {
      return [...quotes.values()]
        .filter((q) => filter.clientId === undefined || q.clientId === filter.clientId)
        .sort((a, b) => sequence(b) - sequence(a))
        .map(read);
    },
    async get(id) {
      const quote = quotes.get(id);
      return quote ? read(quote) : null;
    },
    async create(draft) {
      const id = Math.max(0, ...quotes.keys()) + 1;
      const number = Math.max(0, ...[...quotes.values()].map(sequence)) + 1;
      const now = new Date().toISOString();
      const quote: Quote = {
        id, number: formatQuoteNumber(number), clientId: draft.clientId, client: null, recipientName: draft.recipientName,
        recipientPhone: draft.recipientPhone, title: draft.title, status: draft.status, validUntil: draft.validUntil, showBreakdown: draft.showBreakdown,
        input: structuredClone(draft.input), result: structuredClone(draft.result), total: draft.result.total, note: draft.note, createdAt: now,
        updatedAt: now,
      };
      quotes.set(id, quote);
      return read(quote);
    },
    async update(id, changes) {
      const current = quotes.get(id);
      if (!current || (changes.status !== undefined && !canChangeQuoteStatus(current.status, changes.status))) return null;
      const sent = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
      const updated: Quote = { ...current, ...sent, updatedAt: new Date().toISOString() };
      quotes.set(id, updated);
      return read(updated);
    },
    async accept(id, clientId, orders) {
      // No await in here, so nothing can run between the check and the writes.
      const current = quotes.get(id);
      if (!current || !canAcceptQuote(current.status)) return false;
      for (const order of orders) memoryInsertOrder(tables, order, clientId, id);
      quotes.set(id, { ...current, clientId: current.clientId ?? clientId, status: 'aceptado', updatedAt: new Date().toISOString() });
      return true;
    },
  };
}
