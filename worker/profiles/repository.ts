import { profileNameKey, type CalcProfile, type CalcProfileFields } from '../../shared/calc-profiles';
import type { CalcInput } from '../../shared/calculator';

/** What a write answers when another profile already has the name (ignoring case). Nothing was written. */
export const DUPLICATE = 'duplicate';

/** Port: what the profile routes need from storage. */
export interface CalcProfileRepository {
  /** By name, ignoring case, then by id. */
  list(): Promise<CalcProfile[]>;
  get(id: number): Promise<CalcProfile | null>;
  /** The uniqueness of the name is decided in the same statement as the insert. */
  create(fields: CalcProfileFields): Promise<CalcProfile | typeof DUPLICATE>;
  /** Write only the fields in `changes`, in one statement. Null, writing nothing, when there is no such profile. */
  update(id: number, changes: Partial<CalcProfileFields>): Promise<CalcProfile | typeof DUPLICATE | null>;
  /** Delete the profile and answer it as it was. Null when there is no such profile. */
  delete(id: number): Promise<CalcProfile | null>;
}

interface ProfileRow {
  id: number;
  name: string;
  input_json: string;
  created_at: string;
  updated_at: string;
}

function toProfile(row: ProfileRow): CalcProfile {
  return { id: row.id, name: row.name, input: JSON.parse(row.input_json) as CalcInput, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** Adapter: D1 storage. The name column compares without case (NOCASE), in the unique index and in the guards. */
export function d1CalcProfileRepository(db: D1Database): CalcProfileRepository {
  const get = async (id: number) => {
    const row = await db.prepare('SELECT * FROM calc_profiles WHERE id = ?').bind(id).first<ProfileRow>();
    return row ? toProfile(row) : null;
  };

  return {
    async list() {
      const { results } = await db.prepare('SELECT * FROM calc_profiles ORDER BY name, id').all<ProfileRow>();
      return results.map(toProfile);
    },

    get,

    async create(fields) {
      const now = new Date().toISOString();
      const row = await db
        .prepare(
          `INSERT INTO calc_profiles (name, input_json, created_at, updated_at)
           SELECT ?1, ?2, ?3, ?3 WHERE NOT EXISTS (SELECT 1 FROM calc_profiles WHERE name = ?1)
           RETURNING *`,
        )
        .bind(fields.name, JSON.stringify(fields.input), now)
        .first<ProfileRow>();
      return row ? toProfile(row) : DUPLICATE;
    },

    async update(id, changes) {
      const sets: string[] = [];
      const values: unknown[] = [];
      if (changes.name !== undefined) { sets.push('name = ?'); values.push(changes.name); }
      if (changes.input !== undefined) { sets.push('input_json = ?'); values.push(JSON.stringify(changes.input)); }
      // A new name is checked against the other profiles in the same statement that writes it.
      const guard = changes.name === undefined ? '' : ' AND NOT EXISTS (SELECT 1 FROM calc_profiles WHERE name = ? AND id != ?)';
      const guardValues = changes.name === undefined ? [] : [changes.name, id];
      const row = await db
        .prepare(`UPDATE calc_profiles SET ${sets.map((s) => `${s}, `).join('')}updated_at = ? WHERE id = ?${guard} RETURNING *`)
        .bind(...values, new Date().toISOString(), id, ...guardValues)
        .first<ProfileRow>();
      if (row) return toProfile(row);
      // Nothing was written: either there is no such profile, or the name belongs to another one.
      return changes.name !== undefined && (await get(id)) ? DUPLICATE : null;
    },

    async delete(id) {
      const row = await db.prepare('DELETE FROM calc_profiles WHERE id = ? RETURNING *').bind(id).first<ProfileRow>();
      return row ? toProfile(row) : null;
    },
  };
}

/** Adapter: in-memory storage for tests. Copies in and out, like the JSON column. */
export function memoryCalcProfileRepository(seed: CalcProfile[] = []): CalcProfileRepository {
  const profiles = new Map(seed.map((p) => [p.id, structuredClone(p)]));
  let last = Math.max(0, ...seed.map((p) => p.id));
  const copy = (p: CalcProfile): CalcProfile => structuredClone(p);
  const taken = (name: string, except?: number) =>
    [...profiles.values()].some((p) => p.id !== except && profileNameKey(p.name) === profileNameKey(name));

  return {
    async list() {
      return [...profiles.values()]
        .sort((a, b) => (profileNameKey(a.name) < profileNameKey(b.name) ? -1 : profileNameKey(a.name) > profileNameKey(b.name) ? 1 : a.id - b.id))
        .map(copy);
    },
    async get(id) {
      const profile = profiles.get(id);
      return profile ? copy(profile) : null;
    },
    async create(fields) {
      if (taken(fields.name)) return DUPLICATE;
      const now = new Date().toISOString();
      last += 1;
      const profile: CalcProfile = { id: last, ...structuredClone(fields), createdAt: now, updatedAt: now };
      profiles.set(profile.id, profile);
      return copy(profile);
    },
    async update(id, changes) {
      const current = profiles.get(id);
      if (!current) return null;
      if (changes.name !== undefined && taken(changes.name, id)) return DUPLICATE;
      const updated: CalcProfile = { ...current, ...structuredClone(changes), updatedAt: new Date().toISOString() };
      profiles.set(id, updated);
      return copy(updated);
    },
    async delete(id) {
      const current = profiles.get(id);
      if (!current) return null;
      profiles.delete(id);
      return copy(current);
    },
  };
}
