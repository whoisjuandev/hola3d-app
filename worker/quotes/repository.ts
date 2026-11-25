import type { CalcInput, CalcResult } from '../../shared/calculator';
import { canAcceptQuote, canChangeQuoteStatus, formatQuoteNumber } from '../../shared/quotes';
import type { Quote, QuoteChanges, QuoteOrderInput, QuoteStatus } from '../../shared/quotes';
import type { MemoryTables } from '../memory';
import { insertOrderStatement, memoryInsertOrder } from '../orders/repository';

/** What storage needs to save a quote: the client resolved to an id and the result priced by the server. */
export interface QuoteDraft {
  clientId: number;
  title: string;
  validUntil: string;
  note: string;
  input: CalcInput;
  result: CalcResult;
}

/** Port: what the quote routes need from storage. */
export interface QuoteRepository {
  list(filter?: { clientId?: number }): Promise<Quote[]>;
  get(id: number): Promise<Quote | null>;
  /** Saves a new borrador with the next number. The input and result are stored as they are, never recalculated. */
  create(draft: QuoteDraft): Promise<Quote>;
  /** Null when the quote does not exist or its status may not change to `changes.status` any more. */
  update(id: number, changes: QuoteChanges): Promise<Quote | null>;
  /**
   * In one atomic write: create the orders for the client, linked to the quote, and mark the quote aceptado.
   * Only while the quote is borrador or enviado; otherwise returns false having written nothing.
   */
  accept(id: number, clientId: number, orders: QuoteOrderInput[]): Promise<boolean>;
}

interface QuoteRow {
  id: number;
  number: number;
  client_id: number;
  client_name: string | null;
  title: string;
  status: string;
  valid_until: string;
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
    client: row.client_name ?? '',
    title: row.title,
    status: row.status as QuoteStatus,
    validUntil: row.valid_until,
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
          `INSERT INTO quotes (number, client_id, title, status, valid_until, input_json, result_json, total, note, created_at, updated_at)
           VALUES (COALESCE((SELECT MAX(number) FROM quotes), 0) + 1, ?, ?, 'borrador', ?, ?, ?, ?, ?, ?, ?)
           RETURNING id`,
        )
        .bind(draft.clientId, draft.title, draft.validUntil, JSON.stringify(draft.input), JSON.stringify(draft.result), draft.result.total, draft.note, now, now)
        .first<{ id: number }>();
      const quote = row && (await get(row.id));
      if (!quote) throw new Error('Insert returned no row');
      return quote;
    },

    async update(id, changes) {
      // The status guard repeats canChangeQuoteStatus in SQL, so an accept that lands first is not undone.
      const row = await db
        .prepare(
          `UPDATE quotes SET title = ?1, valid_until = ?2, note = ?3, status = ?4, updated_at = ?5
           WHERE id = ?6 AND (status = ?4 OR (status != 'aceptado' AND ?4 != 'aceptado'))
           RETURNING id`,
        )
        .bind(changes.title, changes.validUntil, changes.note, changes.status, new Date().toISOString(), id)
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
        db.prepare(`UPDATE quotes SET status = 'aceptado', updated_at = ? WHERE id = ? AND ${OPEN} RETURNING id`).bind(now, id),
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
  const read = (q: Quote): Quote => ({ ...structuredClone(q), client: clients.get(q.clientId)?.name ?? '' });

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
        id, number: formatQuoteNumber(number), clientId: draft.clientId, client: '', title: draft.title, status: 'borrador',
        validUntil: draft.validUntil, input: structuredClone(draft.input), result: structuredClone(draft.result), total: draft.result.total,
        note: draft.note, createdAt: now, updatedAt: now,
      };
      quotes.set(id, quote);
      return read(quote);
    },
    async update(id, changes) {
      const current = quotes.get(id);
      if (!current || !canChangeQuoteStatus(current.status, changes.status)) return null;
      const updated: Quote = { ...current, ...changes, updatedAt: new Date().toISOString() };
      quotes.set(id, updated);
      return read(updated);
    },
    async accept(id, clientId, orders) {
      // No await in here, so nothing can run between the check and the writes.
      const current = quotes.get(id);
      if (!current || !canAcceptQuote(current.status)) return false;
      for (const order of orders) memoryInsertOrder(tables, order, clientId, id);
      quotes.set(id, { ...current, status: 'aceptado', updatedAt: new Date().toISOString() });
      return true;
    },
  };
}
