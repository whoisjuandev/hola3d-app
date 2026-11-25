import type { NewOrder, Order, Stage, Channel } from '../../shared/orders';
import { formatOrderNumber } from '../../shared/orders';
import type { MemoryTables } from '../memory';

/** What storage needs to create an order: the validated request with its client already resolved to an id. */
export type OrderInput = Omit<NewOrder, 'client' | 'clientId'>;

/** Port: what the order routes need from storage. */
export interface OrderRepository {
  list(): Promise<Order[]>;
  listByClient(clientId: number): Promise<Order[]>;
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

    get,

    async create(input, clientId) {
      const now = new Date().toISOString();
      // The number is derived inside the INSERT so two creates cannot read the same max. The old `client`
      // text column is NOT NULL, so it gets the client's current name.
      const row = await db
        .prepare(
          `INSERT INTO orders (id, item, client, client_id, channel, stage, due_date, due_time, price, deposit, paid, material, note, created_at, updated_at)
           VALUES (printf('%04d', COALESCE((SELECT MAX(CAST(id AS INTEGER)) FROM orders), 0) + 1), ?, (SELECT name FROM clients WHERE id = ?), ?, ?, 'nuevo', ?, ?, ?, ?, 0, ?, ?, ?, ?)
           RETURNING id`,
        )
        .bind(input.item, clientId, clientId, input.channel, input.dueDate, input.dueTime, input.price, input.deposit, input.material, input.note, now, now)
        .first<{ id: string }>();
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

/** Adapter: in-memory storage for tests. Shares its tables with the in-memory client repository. */
export function memoryOrderRepository(tables: MemoryTables): OrderRepository {
  const { orders, clients } = tables;
  const read = (o: Order): Order => {
    const name = o.clientId === null ? undefined : clients.get(o.clientId)?.name;
    return name === undefined ? o : { ...o, client: name };
  };
  return {
    async list() {
      return [...orders.values()].map(read);
    },
    async listByClient(clientId) {
      return [...orders.values()].filter((o) => o.clientId === clientId).map(read);
    },
    async get(id) {
      const order = orders.get(id);
      return order ? read(order) : null;
    },
    async create(input, clientId) {
      const max = Math.max(0, ...[...orders.keys()].map(Number));
      const now = new Date().toISOString();
      const order: Order = {
        ...input, id: formatOrderNumber(max + 1), client: '', clientId, stage: 'nuevo', paid: false, createdAt: now, updatedAt: now,
      };
      orders.set(order.id, order);
      return read(order);
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
