import type { NewOrder, Order, Stage, Channel } from '../../shared/orders';
import { formatOrderNumber } from '../../shared/orders';
import { realProfit, type RealCost } from '../../shared/print-jobs';
import type { MemoryTables, StoredOrder } from '../memory';
import { d1RealCosts, memoryRealCost } from '../print-jobs/repository';

/** What storage needs to create an order: the validated request with its client already resolved to an id. */
export type OrderInput = Omit<NewOrder, 'client' | 'clientId'>;

/** An order as read, before its real cost is added. */
type ReadOrder = Omit<Order, 'realCost' | 'realProfit'>;

/** Port: what the order routes need from storage. */
export interface OrderRepository {
  list(): Promise<Order[]>;
  listByClient(clientId: number): Promise<Order[]>;
  listByQuote(quoteId: number): Promise<Order[]>;
  listByProject(projectId: number): Promise<Order[]>;
  get(id: string): Promise<Order | null>;
  /**
   * `clientId` must be an existing client. With `projectId`, the order goes in that project only while it is a project
   * of that client; otherwise returns null having written nothing.
   */
  create(input: OrderInput, clientId: number, projectId?: number | null): Promise<Order | null>;
  setStage(id: string, stage: Stage): Promise<Order | null>;
  /**
   * Put the order in a project, or take it out of any with null. Only into a project of the order's client; otherwise
   * (or when the order does not exist) returns null having written nothing.
   */
  setProject(id: string, projectId: number | null): Promise<Order | null>;
}

interface OrderRow {
  id: string;
  item: string;
  client: string;
  client_id: number | null;
  client_name: string | null;
  quote_id: number | null;
  project_id: number | null;
  project_name: string | null;
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
  delivered_at: string | null;
}

/** The order with its real cost (from its print jobs) and real profit; both null while it has no printed job. */
function withRealCost(order: ReadOrder, cost: RealCost | null): Order {
  return { ...order, realCost: cost === null ? null : cost.total, realProfit: realProfit(order.price, cost) };
}

function toOrder(row: OrderRow): ReadOrder {
  return {
    id: row.id,
    item: row.item,
    // The name comes from the client; the old text column is only a fallback for an unlinked row.
    client: row.client_name ?? row.client,
    clientId: row.client_id,
    quoteId: row.quote_id,
    projectId: row.project_id,
    project: row.project_id === null ? null : row.project_name,
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
    deliveredAt: row.delivered_at,
  };
}

const SELECT = `SELECT orders.*, clients.name AS client_name, projects.name AS project_name FROM orders
  LEFT JOIN clients ON clients.id = orders.client_id LEFT JOIN projects ON projects.id = orders.project_id`;
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
  db: D1Database, input: OrderInput, clientId: number,
  options: { now: string; quoteId?: number | null; projectId?: number | null; when?: InsertCondition },
): D1PreparedStatement {
  const { now, quoteId = null, projectId = null, when } = options;
  return db
    .prepare(
      `INSERT INTO orders (id, item, client, client_id, quote_id, project_id, channel, stage, due_date, due_time, price, deposit, paid, material, note, created_at, updated_at)
       SELECT printf('%04d', COALESCE((SELECT MAX(CAST(id AS INTEGER)) FROM orders), 0) + 1), ?, (SELECT name FROM clients WHERE id = ?), ?, ?, ?, ?, 'nuevo', ?, ?, ?, ?, 0, ?, ?, ?, ?
       ${when ? `WHERE ${when.sql}` : ''}
       RETURNING id`,
    )
    .bind(
      input.item, clientId, clientId, quoteId, projectId, input.channel, input.dueDate, input.dueTime, input.price, input.deposit, input.material,
      input.note, now, now, ...(when?.params ?? []),
    );
}

/** The condition that a project exists and belongs to the client, as SQL for an insert or update. */
function projectOfClient(projectId: number, clientIdSql: string, params: unknown[] = []): InsertCondition {
  return { sql: `EXISTS (SELECT 1 FROM projects WHERE projects.id = ? AND projects.client_id = ${clientIdSql})`, params: [projectId, ...params] };
}

/** Adapter: D1 storage. Orders sort by due date, undated ones last. */
export function d1OrderRepository(db: D1Database): OrderRepository {
  /** Every order read goes through here, so each one carries its real cost. */
  const read = async (rows: OrderRow[]): Promise<Order[]> => {
    const orders = rows.map(toOrder);
    const costs = await d1RealCosts(db, orders.map((o) => o.id));
    return orders.map((o) => withRealCost(o, costs.get(o.id) ?? null));
  };

  const get = async (id: string) => {
    const row = await db.prepare(`${SELECT} WHERE orders.id = ?`).bind(id).first<OrderRow>();
    return row ? (await read([row]))[0] : null;
  };

  return {
    async list() {
      const { results } = await db.prepare(`${SELECT} ${ORDER_BY}`).all<OrderRow>();
      return read(results);
    },

    async listByClient(clientId) {
      const { results } = await db.prepare(`${SELECT} WHERE orders.client_id = ? ${ORDER_BY}`).bind(clientId).all<OrderRow>();
      return read(results);
    },

    async listByQuote(quoteId) {
      const { results } = await db.prepare(`${SELECT} WHERE orders.quote_id = ? ORDER BY CAST(orders.id AS INTEGER)`).bind(quoteId).all<OrderRow>();
      return read(results);
    },

    async listByProject(projectId) {
      const { results } = await db.prepare(`${SELECT} WHERE orders.project_id = ? ${ORDER_BY}`).bind(projectId).all<OrderRow>();
      return read(results);
    },

    get,

    async create(input, clientId, projectId = null) {
      // The project check is part of the INSERT, so a project whose client changed meanwhile gets no order.
      const when = projectId === null ? undefined : projectOfClient(projectId, '?', [clientId]);
      const row = await insertOrderStatement(db, input, clientId, { now: new Date().toISOString(), projectId, when }).first<{ id: string }>();
      if (!row) {
        if (when) return null;
        throw new Error('Insert returned no row');
      }
      const order = await get(row.id);
      if (!order) throw new Error('Insert returned no row');
      return order;
    },

    async setStage(id, stage) {
      // Delivering stamps the moment (keeping the first one if it was already delivered); any other stage clears it.
      const now = new Date().toISOString();
      const row = await db
        .prepare(
          `UPDATE orders SET stage = ?, updated_at = ?,
             delivered_at = CASE WHEN ? = 'entregado' THEN COALESCE(delivered_at, ?) ELSE NULL END
           WHERE id = ? RETURNING id`,
        )
        .bind(stage, now, stage, now, id)
        .first<{ id: string }>();
      return row ? get(row.id) : null;
    },

    async setProject(id, projectId) {
      // The client check is in the UPDATE itself, so it holds even if the project changed since the caller read it.
      const guard = projectId === null ? { sql: '1', params: [] } : projectOfClient(projectId, 'orders.client_id');
      const row = await db
        .prepare(`UPDATE orders SET project_id = ?, updated_at = ? WHERE id = ? AND ${guard.sql} RETURNING id`)
        .bind(projectId, new Date().toISOString(), id, ...guard.params)
        .first<{ id: string }>();
      return row ? get(row.id) : null;
    },
  };
}

/** The order with its client's and project's current names and its real cost, as the D1 adapter reads it. */
export function memoryReadOrder(tables: MemoryTables, o: StoredOrder): Order {
  const name = o.clientId === null ? undefined : tables.clients.get(o.clientId)?.name;
  const project = o.projectId === null ? null : tables.projects.get(o.projectId)?.name ?? null;
  return withRealCost({ ...o, client: name ?? o.client, project }, memoryRealCost(tables, o.id));
}

/** Insert an order in the in-memory tables, numbered like the D1 adapter. Synchronous, so callers can stay atomic. */
export function memoryInsertOrder(
  tables: MemoryTables, input: OrderInput, clientId: number, quoteId: number | null = null, projectId: number | null = null,
): Order {
  const max = Math.max(0, ...[...tables.orders.keys()].map(Number));
  const now = new Date().toISOString();
  const order: StoredOrder = {
    ...input, id: formatOrderNumber(max + 1), client: '', clientId, quoteId, projectId, stage: 'nuevo', paid: false, createdAt: now, updatedAt: now,
    deliveredAt: null,
  };
  tables.orders.set(order.id, order);
  return memoryReadOrder(tables, order);
}

/** Adapter: in-memory storage for tests. Shares its tables with the in-memory client and quote repositories. */
export function memoryOrderRepository(tables: MemoryTables): OrderRepository {
  const { orders, projects } = tables;
  const read = (o: StoredOrder): Order => memoryReadOrder(tables, o);
  const ofClient = (projectId: number, clientId: number | null) => projects.get(projectId)?.clientId === clientId;
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
    async listByProject(projectId) {
      return [...orders.values()].filter((o) => o.projectId === projectId).map(read);
    },
    async get(id) {
      const order = orders.get(id);
      return order ? read(order) : null;
    },
    async create(input, clientId, projectId = null) {
      if (projectId !== null && !ofClient(projectId, clientId)) return null;
      return memoryInsertOrder(tables, input, clientId, null, projectId);
    },
    async setStage(id, stage) {
      const current = orders.get(id);
      if (!current) return null;
      const now = new Date().toISOString();
      const deliveredAt = stage === 'entregado' ? current.deliveredAt ?? now : null;
      const updated = { ...current, stage, updatedAt: now, deliveredAt };
      orders.set(id, updated);
      return read(updated);
    },
    async setProject(id, projectId) {
      // No await in here, so nothing can run between the check and the write.
      const current = orders.get(id);
      if (!current || (projectId !== null && !ofClient(projectId, current.clientId))) return null;
      const updated = { ...current, projectId, updatedAt: new Date().toISOString() };
      orders.set(id, updated);
      return read(updated);
    },
  };
}
