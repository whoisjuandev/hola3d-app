import type { Client } from '../shared/clients';
import type { Order } from '../shared/orders';

/**
 * In-memory tables for the test adapters of modules that read each other's rows, like orders and their
 * clients. Orders keep their client id; their client name is read from `clients`, as in D1.
 */
export interface MemoryTables {
  clients: Map<number, Client>;
  orders: Map<string, Order>;
}

export function memoryTables(clients: Client[] = [], orders: Order[] = []): MemoryTables {
  return {
    clients: new Map(clients.map((c) => [c.id, { ...c }])),
    orders: new Map(orders.map((o) => [o.id, { ...o }])),
  };
}
