import type { Spool, SpoolInput } from '../../shared/spools';

/** Port: what the spool routes need from storage. */
export interface SpoolRepository {
  list(): Promise<Spool[]>;
  get(id: number): Promise<Spool | null>;
  create(input: SpoolInput): Promise<Spool>;
  update(id: number, input: SpoolInput): Promise<Spool | null>;
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

    async update(id, input) {
      const row = await db
        .prepare(
          `UPDATE spools SET material = ?, color_name = ?, color_hex = ?, brand = ?, net_grams = ?, remaining_grams = ?, price = ?, low_stock_grams = ?, note = ?, updated_at = ?
           WHERE id = ?
           RETURNING *`,
        )
        .bind(input.material, input.colorName, input.colorHex, input.brand, input.netGrams, input.remainingGrams, input.price, input.lowStockGrams, input.note, new Date().toISOString(), id)
        .first<SpoolRow>();
      return row ? toSpool(row) : null;
    },
  };
}

/** Adapter: in-memory storage for tests. */
export function memorySpoolRepository(seed: Spool[] = []): SpoolRepository {
  const spools = new Map(seed.map((s) => [s.id, { ...s }]));
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
    async update(id, input) {
      const current = spools.get(id);
      if (!current) return null;
      const updated: Spool = { ...current, ...input, updatedAt: new Date().toISOString() };
      spools.set(id, updated);
      return updated;
    },
  };
}
