import type { Client } from '../shared/clients';
import type { Order } from '../shared/orders';
import type { Quote } from '../shared/quotes';

/**
 * In-memory tables for the test adapters of modules that read each other's rows, like orders and their
 * clients. Orders and quotes keep their client id; their client name is read from `clients`, as in D1.
 */
export interface MemoryTables {
  clients: Map<number, Client>;
  orders: Map<string, Order>;
  quotes: Map<number, Quote>;
}

export function memoryTables(clients: Client[] = [], orders: Order[] = [], quotes: Quote[] = []): MemoryTables {
  return {
    clients: new Map(clients.map((c) => [c.id, { ...c }])),
    orders: new Map(orders.map((o) => [o.id, { ...o }])),
    quotes: new Map(quotes.map((q) => [q.id, structuredClone(q)])),
  };
}
