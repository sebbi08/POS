import { randomBytes, timingSafeEqual } from "node:crypto";
import { v4 as uuid } from "uuid";
import { getPool, initTables } from "../../db.js";
import { Terminal, TerminalRow } from "./terminals.types.js";

function terminalFromRow(row: TerminalRow): Terminal {
  return {
    id: row.id,
    name: row.name,
    groupIds: row.group_ids || [],
    printPickupReceipts: row.print_pickup_receipts,
  };
}

export async function listTerminals(): Promise<Terminal[]> {
  await initTables();
  const result = await getPool().query<TerminalRow>(
    `SELECT * FROM terminals ORDER BY name`,
  );
  return result.rows.map(terminalFromRow);
}

export async function createTerminal(
  name: string,
  groupIds: string[],
  printPickupReceipts = true,
): Promise<string> {
  await initTables();
  const id = uuid();
  await getPool().query(
    `INSERT INTO terminals (id, name, group_ids, print_pickup_receipts) VALUES ($1, $2, $3, $4)`,
    [id, name, groupIds, printPickupReceipts],
  );
  return id;
}

export async function updateTerminal(
  id: string,
  name: string,
  groupIds: string[],
  printPickupReceipts?: boolean,
): Promise<void> {
  await initTables();
  await getPool().query(
    `UPDATE terminals SET name = $2, group_ids = $3, print_pickup_receipts = COALESCE($4, print_pickup_receipts), updated_at = NOW() WHERE id = $1`,
    [id, name, groupIds, printPickupReceipts ?? null],
  );
}

export async function deleteTerminal(id: string): Promise<void> {
  await initTables();
  await getPool().query(`DELETE FROM terminals WHERE id = $1`, [id]);
}

export async function getTerminal(id: string): Promise<Terminal | null> {
  await initTables();
  const result = await getPool().query<TerminalRow>(
    `SELECT * FROM terminals WHERE id = $1`,
    [id],
  );
  if (result.rows.length === 0) return null;
  return terminalFromRow(result.rows[0]);
}

export async function generateTerminalKey(id: string): Promise<string> {
  await initTables();
  const key = randomBytes(24).toString("base64url");
  await getPool().query(
    `UPDATE terminals SET api_key = $2, updated_at = NOW() WHERE id = $1`,
    [id, key],
  );
  return key;
}

export async function getTerminalKey(id: string): Promise<string | null> {
  await initTables();
  const result = await getPool().query<{ api_key: string | null }>(
    `SELECT api_key FROM terminals WHERE id = $1`,
    [id],
  );
  return result.rows[0]?.api_key ?? null;
}

export async function findTerminalByKey(
  id: string,
  key: string,
): Promise<Terminal | null> {
  await initTables();
  const result = await getPool().query<TerminalRow>(
    `SELECT * FROM terminals WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row?.api_key) return null;
  const stored = Buffer.from(row.api_key);
  const given = Buffer.from(key);
  if (stored.length !== given.length || !timingSafeEqual(stored, given)) {
    return null;
  }
  return terminalFromRow(row);
}
