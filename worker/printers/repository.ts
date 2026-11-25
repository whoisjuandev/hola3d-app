import type { Printer, PrinterInput, PrinterStatus } from '../../shared/printers';
import type { MemoryTables } from '../memory';

/** Port: what the printer routes need from storage. */
export interface PrinterRepository {
  list(): Promise<Printer[]>;
  get(id: number): Promise<Printer | null>;
  create(input: PrinterInput): Promise<Printer>;
  /** Writes only the fields in `changes`, so it never overwrites minutes a print job added meanwhile. */
  update(id: number, changes: Partial<PrinterInput>): Promise<Printer | null>;
}

export interface PrinterRow {
  id: number;
  name: string;
  model: string;
  purchase_price: number;
  lifetime_hours: number;
  power_watts: number;
  print_minutes: number;
  status: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export function toPrinter(row: PrinterRow): Printer {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    purchasePrice: row.purchase_price,
    lifetimeHours: row.lifetime_hours,
    powerWatts: row.power_watts,
    printMinutes: row.print_minutes,
    status: row.status as PrinterStatus,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS: Record<keyof PrinterInput, string> = {
  name: 'name', model: 'model', purchasePrice: 'purchase_price', lifetimeHours: 'lifetime_hours', powerWatts: 'power_watts',
  printMinutes: 'print_minutes', status: 'status', note: 'note',
};

/** The statement that inserts a printer and returns its row. Other modules batch it with their own writes. */
export function insertPrinterStatement(db: D1Database, input: PrinterInput, now: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO printers (name, model, purchase_price, lifetime_hours, power_watts, print_minutes, status, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .bind(input.name, input.model, input.purchasePrice, input.lifetimeHours, input.powerWatts, input.printMinutes, input.status, input.note, now, now);
}

/** Adapter: D1 storage. Printers sort by name. */
export function d1PrinterRepository(db: D1Database): PrinterRepository {
  return {
    async list() {
      const { results } = await db.prepare('SELECT * FROM printers ORDER BY name COLLATE NOCASE, id').all<PrinterRow>();
      return results.map(toPrinter);
    },

    async get(id) {
      const row = await db.prepare('SELECT * FROM printers WHERE id = ?').bind(id).first<PrinterRow>();
      return row ? toPrinter(row) : null;
    },

    async create(input) {
      const row = await insertPrinterStatement(db, input, new Date().toISOString()).first<PrinterRow>();
      if (!row) throw new Error('Insert returned no row');
      return toPrinter(row);
    },

    async update(id, changes) {
      const keys = (Object.keys(changes) as (keyof PrinterInput)[]).filter((k) => k in COLUMNS);
      const row = await db
        .prepare(`UPDATE printers SET ${keys.map((k) => `${COLUMNS[k]} = ?, `).join('')}updated_at = ? WHERE id = ? RETURNING *`)
        .bind(...keys.map((k) => changes[k]), new Date().toISOString(), id)
        .first<PrinterRow>();
      return row ? toPrinter(row) : null;
    },
  };
}

/** Adapter: in-memory storage for tests. With tables, it shares them with the in-memory print job repository. */
export function memoryPrinterRepository(source: Printer[] | MemoryTables = []): PrinterRepository {
  const printers = Array.isArray(source) ? new Map(source.map((p) => [p.id, { ...p }])) : source.printers;
  return {
    async list() {
      return [...printers.values()];
    },
    async get(id) {
      return printers.get(id) ?? null;
    },
    async create(input) {
      const id = Math.max(0, ...printers.keys()) + 1;
      const now = new Date().toISOString();
      const printer: Printer = { ...input, id, createdAt: now, updatedAt: now };
      printers.set(id, printer);
      return printer;
    },
    async update(id, changes) {
      const current = printers.get(id);
      if (!current) return null;
      const updated: Printer = { ...current, ...changes, updatedAt: new Date().toISOString() };
      printers.set(id, updated);
      return updated;
    },
  };
}
