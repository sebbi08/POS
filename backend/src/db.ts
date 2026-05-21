import { Pool, types } from "pg";
import { config } from "./config.js";

let pool: Pool;

// Parse PostgreSQL NUMERIC columns as JavaScript numbers
types.setTypeParser(1700, parseFloat);

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config.pg.connectionString });
  }
  return pool;
}

let tablesInitialized = false;

export async function initTables(): Promise<void> {
  if (tablesInitialized) return;
  const dbLog = (msg: string) =>
    console.log(`[backend:db] ${msg}  (${new Date().toISOString()})`);
  const t0 = Date.now();
  const client = await getPool().connect();
  dbLog(`Connected to PostgreSQL in ${Date.now() - t0}ms`);
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS item_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        vat_rate NUMERIC NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        group_id TEXT NOT NULL REFERENCES item_groups(id) ON DELETE CASCADE,
        price NUMERIC NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS terminals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        group_ids TEXT[] NOT NULL DEFAULT '{}',
        printer_vendor_id INTEGER,
        printer_product_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS company_settings (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        name TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        vat_id TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    tablesInitialized = true;
    console.log(
      `[backend:db]  Tables created/verified in ${Date.now() - t0}ms`,
    );
  } finally {
    client.release();
  }
}
