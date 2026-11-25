import type { Spool, SpoolInput } from '../../shared/spools';
import type { MemoryTables } from '../memory';

/** Port: what the spool routes need from storage. */
export interface SpoolRepository {
  list(): Promise<Spool[]>;
  get(id: number): Promise<Spool | null>;
  create(input: SpoolInput): Promise<Spool>;
  /**
   * Writes only the fields in `changes`, so it never overwrites grams a print job took meanwhile. In the same statement it
   * checks that the remaining grams the row will have are at most its net weight then (the sent values, the row's own
   * for the rest). Null when there is no such spool or that check fails, having written nothing.
   */
  update(id: number, changes: Partial<SpoolInput>): Promise<Spool | null>;
}

interface SpoolRow {
  id: number;
  material: string;
  color_name: string;
  color_hex: string;
  brand: string;
  net_grams: number;
  remaining_grams: number;
  price: number;
  low_stock_grams: number;
  note: string;
  created_at: string;
  updated_at: string;
}

function toSpool(row: SpoolRow): Spool {
  return {
    id: row.id,
    material: row.material,
    colorName: row.color_name,
    colorHex: row.color_hex,
    brand: row.brand,
    netGrams: row.net_grams,
    remainingGrams: row.remaining_grams,
    price: row.price,
    lowStockGrams: row.low_stock_grams,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS: Record<keyof SpoolInput, string> = {
  material: 'material', colorName: 'color_name', colorHex: 'color_hex', brand: 'brand', netGrams: 'net_grams',
  remainingGrams: 'remaining_grams', price: 'price', lowStockGrams: 'low_stock_grams', note: 'note',
};

/** Adapter: D1 storage. Spools sort by material, then colour. */
export function d1SpoolRepository(db: D1Database): SpoolRepository {
  return {
    async list() {
      const { results } = await db.prepare('SELECT * FROM spools ORDER BY material COLLATE NOCASE, color_name COLLATE NOCASE, id').all<SpoolRow>();
      return results.map(toSpool);
    },

    async get(id) {
      const row = await db.prepare('SELECT * FROM spools WHERE id = ?').bind(id).first<SpoolRow>();
      return row ? toSpool(row) : null;
    },

    async create(input) {
      const now = new Date().toISOString();
      const row = await db
        .prepare(
          `INSERT INTO spools (material, color_name, color_hex, brand, net_grams, remaining_grams, price, low_stock_grams, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING *`,
        )
        .bind(input.material, input.colorName, input.colorHex, input.brand, input.netGrams, input.remainingGrams, input.price, input.lowStockGrams, input.note, now, now)
        .first<SpoolRow>();
      if (!row) throw new Error('Insert returned no row');
      return toSpool(row);
    },

    async update(id, changes) {
      const keys = (Object.keys(changes) as (keyof SpoolInput)[]).filter((k) => k in COLUMNS);
      // The pair after the write, read from the row as the statement runs: a sent value, or (bound as NULL) the row's own.
      const row = await db
        .prepare(
          `UPDATE spools SET ${keys.map((k) => `${COLUMNS[k]} = ?, `).join('')}updated_at = ?
           WHERE id = ? AND COALESCE(?, remaining_grams) <= COALESCE(?, net_grams) RETURNING *`,
        )
        .bind(...keys.map((k) => changes[k]), new Date().toISOString(), id, changes.remainingGrams ?? null, changes.netGrams ?? null)
        .first<SpoolRow>();
      return row ? toSpool(row) : null;
    },
  };
}

/** Adapter: in-memory storage for tests. With tables, it shares them with the in-memory print job repository. */
export function memorySpoolRepository(source: Spool[] | MemoryTables = []): SpoolRepository {
  const spools = Array.isArray(source) ? new Map(source.map((s) => [s.id, { ...s }])) : source.spools;
  return {
    async list() {
      return [...spools.values()];
    },
    async get(id) {
      return spools.get(id) ?? null;
    },
    async create(input) {
      const id = Math.max(0, ...spools.keys()) + 1;
      const now = new Date().toISOString();
      const spool: Spool = { ...input, id, createdAt: now, updatedAt: now };
      spools.set(id, spool);
      return spool;
    },
    async update(id, changes) {
      const current = spools.get(id);
      if (!current) return null;
      const updated: Spool = { ...current, ...changes, updatedAt: new Date().toISOString() };
      // No await in here, so the check sees the row the write changes, as the single D1 statement does.
      if (updated.remainingGrams > updated.netGrams) return null;
      spools.set(id, updated);
      return updated;
    },
  };
}
