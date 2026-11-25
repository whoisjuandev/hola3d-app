// Test helper, not part of the Worker: a real SQLite database (node:sqlite of the installed Node) with every migration
// applied, behind the few D1 calls the adapters make (prepare, bind, all, first, run, batch), so their SQL runs for real.

interface SqliteStatement {
  all(...params: unknown[]): Record<string, unknown>[];
}

/** The raw database, for a test to set up rows and read them back. */
export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

type SqliteModule = { DatabaseSync: new (path: string, options: { enableForeignKeyConstraints: boolean }) => SqliteDatabase };

const migrations = import.meta.glob<string>('../../migrations/*.sql', { query: '?raw', import: 'default', eager: true });

interface Statement {
  query: string;
  params: unknown[];
}

/** A fresh in-memory database with the migrations applied in order, as a D1Database, and the raw database. */
export async function sqliteD1(): Promise<{ db: D1Database; sql: SqliteDatabase }> {
  // Imported by name so the Worker's type check, which has no Node types, does not resolve it.
  const specifier = 'node:sqlite';
  const { DatabaseSync } = (await import(/* @vite-ignore */ specifier)) as SqliteModule;
  const sql = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  for (const name of Object.keys(migrations).sort()) sql.exec(migrations[name]);
  sql.exec('PRAGMA foreign_keys = ON'); // as D1, once the migrations have run

  const rows = (s: Statement) => sql.prepare(s.query).all(...s.params);
  const statement = (query: string, params: unknown[] = []) => ({
    query,
    params,
    bind: (...values: unknown[]) => statement(query, values),
    all: async () => ({ results: rows({ query, params }), success: true, meta: {} }),
    first: async () => rows({ query, params })[0] ?? null,
    run: async () => ({ results: rows({ query, params }), success: true, meta: {} }),
  });
  const db = {
    prepare: (query: string) => statement(query),
    // As D1: the statements run in order in one transaction; an error rolls all of them back.
    batch: async (statements: Statement[]) => {
      sql.exec('BEGIN');
      try {
        const out = statements.map((s) => ({ results: rows(s), success: true, meta: {} }));
        sql.exec('COMMIT');
        return out;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db: db as unknown as D1Database, sql };
}
