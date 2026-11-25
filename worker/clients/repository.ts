import type { Client, ClientInput } from '../../shared/clients';
import type { MemoryTables } from '../memory';

/** Port: what the client and order routes need from client storage. */
export interface ClientRepository {
  list(): Promise<Client[]>;
  get(id: number): Promise<Client | null>;
  create(input: ClientInput): Promise<Client>;
  update(id: number, input: ClientInput): Promise<Client | null>;
}

interface ClientRow {
  id: number;
  name: string;
  phone: string;
  instagram: string;
  email: string;
  note: string;
  created_at: string;
  updated_at: string;
}

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    instagram: row.instagram,
    email: row.email,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Adapter: D1 storage. Clients sort by name. */
export function d1ClientRepository(db: D1Database): ClientRepository {
  return {
    async list() {
      const { results } = await db.prepare('SELECT * FROM clients ORDER BY name COLLATE NOCASE, id').all<ClientRow>();
      return results.map(toClient);
    },

    async get(id) {
      const row = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first<ClientRow>();
      return row ? toClient(row) : null;
    },

    async create(input) {
      const now = new Date().toISOString();
      const row = await db
        .prepare(
          `INSERT INTO clients (name, phone, instagram, email, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           RETURNING *`,
        )
        .bind(input.name, input.phone, input.instagram, input.email, input.note, now, now)
        .first<ClientRow>();
      if (!row) throw new Error('Insert returned no row');
      return toClient(row);
    },

    async update(id, input) {
      const row = await db
        .prepare(
          `UPDATE clients SET name = ?, phone = ?, instagram = ?, email = ?, note = ?, updated_at = ?
           WHERE id = ?
           RETURNING *`,
        )
        .bind(input.name, input.phone, input.instagram, input.email, input.note, new Date().toISOString(), id)
        .first<ClientRow>();
      return row ? toClient(row) : null;
    },
  };
}

/** Adapter: in-memory storage for tests. Shares its tables with the in-memory order repository. */
export function memoryClientRepository(tables: MemoryTables): ClientRepository {
  const { clients } = tables;
  return {
    async list() {
      return [...clients.values()];
    },
    async get(id) {
      return clients.get(id) ?? null;
    },
    async create(input) {
      const id = Math.max(0, ...clients.keys()) + 1;
      const now = new Date().toISOString();
      const client: Client = { ...input, id, createdAt: now, updatedAt: now };
      clients.set(id, client);
      return client;
    },
    async update(id, input) {
      const current = clients.get(id);
      if (!current) return null;
      const updated: Client = { ...current, ...input, updatedAt: new Date().toISOString() };
      clients.set(id, updated);
      return updated;
    },
  };
}
