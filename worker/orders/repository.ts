import type { NewOrder, Order, Stage, Channel } from '../../shared/orders';
import { formatOrderNumber } from '../../shared/orders';

/** Port: what the order routes need from storage. */
export interface OrderRepository {
  list(): Promise<Order[]>;
  get(id: string): Promise<Order | null>;
  create(input: NewOrder): Promise<Order>;
  setStage(id: string, stage: Stage): Promise<Order | null>;
}

interface OrderRow {
  id: string;
  item: string;
  client: string;
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
    client: row.client,
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

/** Adapter: D1 storage. Orders sort by due date, undated ones last. */
export function d1OrderRepository(db: D1Database): OrderRepository {
  const get = async (id: string) => {
    const row = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
    return row ? toOrder(row) : null;
  };

  return {
    async list() {
      const { results } = await db
        .prepare('SELECT * FROM orders ORDER BY due_date IS NULL, due_date, due_time, CAST(id AS INTEGER)')
        .all<OrderRow>();
      return results.map(toOrder);
    },

    get,

    async create(input) {
      const now = new Date().toISOString();
      // The number is derived inside the INSERT so two creates cannot read the same max.
      const row = await db
        .prepare(
          `INSERT INTO orders (id, item, client, channel, stage, due_date, due_time, price, deposit, paid, material, note, created_at, updated_at)
           VALUES (printf('%04d', COALESCE((SELECT MAX(CAST(id AS INTEGER)) FROM orders), 0) + 1), ?, ?, ?, 'nuevo', ?, ?, ?, ?, 0, ?, ?, ?, ?)
           RETURNING *`,
        )
        .bind(input.item, input.client, input.channel, input.dueDate, input.dueTime, input.price, input.deposit, input.material, input.note, now, now)
        .first<OrderRow>();
      if (!row) throw new Error('Insert returned no row');
      return toOrder(row);
    },

    async setStage(id, stage) {
      const row = await db
        .prepare('UPDATE orders SET stage = ?, updated_at = ? WHERE id = ? RETURNING *')
        .bind(stage, new Date().toISOString(), id)
        .first<OrderRow>();
      return row ? toOrder(row) : null;
    },
  };
}

/** Adapter: in-memory storage for tests. */
export function memoryOrderRepository(seed: Order[] = []): OrderRepository {
  const orders = new Map(seed.map((o) => [o.id, { ...o }]));
  return {
    async list() {
      return [...orders.values()];
    },
    async get(id) {
      return orders.get(id) ?? null;
    },
    async create(input) {
      const max = Math.max(0, ...[...orders.keys()].map(Number));
      const now = new Date().toISOString();
      const order: Order = { ...input, id: formatOrderNumber(max + 1), stage: 'nuevo', paid: false, createdAt: now, updatedAt: now };
      orders.set(order.id, order);
      return order;
    },
    async setStage(id, stage) {
      const current = orders.get(id);
      if (!current) return null;
      const updated = { ...current, stage, updatedAt: new Date().toISOString() };
      orders.set(id, updated);
      return updated;
    },
  };
}
