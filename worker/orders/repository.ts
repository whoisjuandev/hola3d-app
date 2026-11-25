import type { NewOrder, Order, Stage, Channel } from '../../shared/orders';
import { formatOrderNumber } from '../../shared/orders';
import type { MemoryTables } from '../memory';

/** What storage needs to create an order: the validated request with its client already resolved to an id. */
export type OrderInput = Omit<NewOrder, 'client' | 'clientId'>;

/** Port: what the order routes need from storage. */
export interface OrderRepository {
  list(): Promise<Order[]>;
  listByClient(clientId: number): Promise<Order[]>;
  listByQuote(quoteId: number): Promise<Order[]>;
  get(id: string): Promise<Order | null>;
  /** `clientId` must be an existing client. */
  create(input: OrderInput, clientId: number): Promise<Order>;
  setStage(id: string, stage: Stage): Promise<Order | null>;
}

interface OrderRow {
  id: string;
  item: string;
  client: string;
  client_id: number | null;
  client_name: string | null;
  quote_id: number | null;
  channel: string;
  stage: string;
  due_date: string | null;
  due_time: string | null;
  price: number;
  deposit: number | null;
  paid: number;
  material: string;
  note: string;
  created_at: string;
  updated_at: string;
}

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    item: row.item,
    // The name comes from the client; the old text column is only a fallback for an unlinked row.
    client: row.client_name ?? row.client,
    clientId: row.client_id,
    quoteId: row.quote_id,
    channel: row.channel as Channel,
    stage: row.stage as Stage,
    dueDate: row.due_date,
    dueTime: row.due_time,
    price: row.price,
    deposit: row.deposit,
    paid: row.paid === 1,
    material: row.material,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = 'SELECT orders.*, clients.name AS client_name FROM orders LEFT JOIN clients ON clients.id = orders.client_id';
const ORDER_BY = 'ORDER BY orders.due_date IS NULL, orders.due_date, orders.due_time, CAST(orders.id AS INTEGER)';

/** A condition an insert must meet, as SQL with its parameters. */
export interface InsertCondition {
  sql: string;
  params: unknown[];
}

/**
 * The INSERT of one order in stage `nuevo`, ready to run or to put in a batch. The number is derived inside the
 * statement so two inserts cannot read the same max, also one after another in a batch. The old `client` text
 * column is NOT NULL, so it gets the client's current name. With `when`, nothing is inserted unless it holds.
 */
export function insertOrderStatement(
  db: D1Database, input: OrderInput, clientId: number, options: { now: string; quoteId?: number | null; when?: InsertCondition },
): D1PreparedStatement {
  const { now, quoteId = null, when } = options;
  return db
    .prepare(
      `INSERT INTO orders (id, item, client, client_id, quote_id, channel, stage, due_date, due_time, price, deposit, paid, material, note, created_at, updated_at)
       SELECT printf('%04d', COALESCE((SELECT MAX(CAST(id AS INTEGER)) FROM orders), 0) + 1), ?, (SELECT name FROM clients WHERE id = ?), ?, ?, ?, 'nuevo', ?, ?, ?, ?, 0, ?, ?, ?, ?
       ${when ? `WHERE ${when.sql}` : ''}
       RETURNING id`,
    )
    .bind(
      input.item, clientId, clientId, quoteId, input.channel, input.dueDate, input.dueTime, input.price, input.deposit, input.material, input.note,
      now, now, ...(when?.params ?? []),
    );
}

/** Adapter: D1 storage. Orders sort by due date, undated ones last. */
export function d1OrderRepository(db: D1Database): OrderRepository {
  const get = async (id: string) => {
    const row = await db.prepare(`${SELECT} WHERE orders.id = ?`).bind(id).first<OrderRow>();
    return row ? toOrder(row) : null;
  };

  return {
    async list() {
      const { results } = await db.prepare(`${SELECT} ${ORDER_BY}`).all<OrderRow>();
      return results.map(toOrder);
    },

    async listByClient(clientId) {
      const { results } = await db.prepare(`${SELECT} WHERE orders.client_id = ? ${ORDER_BY}`).bind(clientId).all<OrderRow>();
      return results.map(toOrder);
    },

    async listByQuote(quoteId) {
      const { results } = await db.prepare(`${SELECT} WHERE orders.quote_id = ? ORDER BY CAST(orders.id AS INTEGER)`).bind(quoteId).all<OrderRow>();
      return results.map(toOrder);
    },

    get,

    async create(input, clientId) {
      const row = await insertOrderStatement(db, input, clientId, { now: new Date().toISOString() }).first<{ id: string }>();
      const order = row && (await get(row.id));
      if (!order) throw new Error('Insert returned no row');
      return order;
    },

    async setStage(id, stage) {
      const row = await db
        .prepare('UPDATE orders SET stage = ?, updated_at = ? WHERE id = ? RETURNING id')
        .bind(stage, new Date().toISOString(), id)
        .first<{ id: string }>();
      return row ? get(row.id) : null;
    },
  };
}

/** The order with its client's current name, as the D1 adapter reads it. */
export function memoryReadOrder(tables: MemoryTables, o: Order): Order {
  const name = o.clientId === null ? undefined : tables.clients.get(o.clientId)?.name;
  return name === undefined ? o : { ...o, client: name };
}

/** Insert an order in the in-memory tables, numbered like the D1 adapter. Synchronous, so callers can stay atomic. */
export function memoryInsertOrder(tables: MemoryTables, input: OrderInput, clientId: number, quoteId: number | null = null): Order {
  const max = Math.max(0, ...[...tables.orders.keys()].map(Number));
  const now = new Date().toISOString();
  const order: Order = {
    ...input, id: formatOrderNumber(max + 1), client: '', clientId, quoteId, stage: 'nuevo', paid: false, createdAt: now, updatedAt: now,
  };
  tables.orders.set(order.id, order);
  return memoryReadOrder(tables, order);
}

/** Adapter: in-memory storage for tests. Shares its tables with the in-memory client and quote repositories. */
export function memoryOrderRepository(tables: MemoryTables): OrderRepository {
  const { orders } = tables;
  const read = (o: Order): Order => memoryReadOrder(tables, o);
  return {
    async list() {
      return [...orders.values()].map(read);
    },
    async listByClient(clientId) {
      return [...orders.values()].filter((o) => o.clientId === clientId).map(read);
    },
    async listByQuote(quoteId) {
      return [...orders.values()].filter((o) => o.quoteId === quoteId).map(read);
    },
    async get(id) {
      const order = orders.get(id);
      return order ? read(order) : null;
    },
    async create(input, clientId) {
      return memoryInsertOrder(tables, input, clientId);
    },
    async setStage(id, stage) {
      const current = orders.get(id);
      if (!current) return null;
      const updated = { ...current, stage, updatedAt: new Date().toISOString() };
      orders.set(id, updated);
      return read(updated);
    },
  };
}
