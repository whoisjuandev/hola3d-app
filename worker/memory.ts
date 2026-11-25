import type { Client } from '../shared/clients';
import type { CostSettings } from '../shared/cost-settings';
import type { Order } from '../shared/orders';
import type { PrintJob } from '../shared/print-jobs';
import type { Printer } from '../shared/printers';
import type { Quote } from '../shared/quotes';
import type { Spool } from '../shared/spools';

/** An order as stored: its real cost is worked out from its print jobs when it is read. */
export type StoredOrder = Omit<Order, 'realCost' | 'realProfit'>;

/** A print job as stored: its printer and spools by id only, their names read when it is read. */
export type StoredPrintJob = Omit<PrintJob, 'printer' | 'filaments'> & { filaments: { spoolId: number; grams: number }[] };

/**
 * In-memory tables for the test adapters of modules that read each other's rows, like orders and their
 * clients. Orders and quotes keep their client id; their client name is read from `clients`, as in D1.
 * Print jobs change printer minutes and spool grams, and orders read their real cost from all of them.
 */
export interface MemoryTables {
  clients: Map<number, Client>;
  orders: Map<string, StoredOrder>;
  quotes: Map<number, Quote>;
  printers: Map<number, Printer>;
  spools: Map<number, Spool>;
  printJobs: Map<number, StoredPrintJob>;
  /** The cost settings real costs are worked out with; null means the defaults, as in D1 before the first save. */
  settings: CostSettings | null;
}

export interface WorkshopSeed {
  printers?: Printer[];
  spools?: Spool[];
  printJobs?: StoredPrintJob[];
  settings?: CostSettings | null;
}

export function memoryTables(clients: Client[] = [], orders: StoredOrder[] = [], quotes: Quote[] = [], workshop: WorkshopSeed = {}): MemoryTables {
  return {
    clients: new Map(clients.map((c) => [c.id, { ...c }])),
    orders: new Map(orders.map((o) => {
      const { realCost: _cost, realProfit: _profit, ...stored } = o as Order;
      return [o.id, stored];
    })),
    quotes: new Map(quotes.map((q) => [q.id, structuredClone(q)])),
    printers: new Map((workshop.printers ?? []).map((p) => [p.id, { ...p }])),
    spools: new Map((workshop.spools ?? []).map((s) => [s.id, { ...s }])),
    printJobs: new Map((workshop.printJobs ?? []).map((j) => [j.id, structuredClone(j)])),
    settings: workshop.settings ?? null,
  };
}
