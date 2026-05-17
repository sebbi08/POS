import { v4 as uuid } from "uuid";
import { getPool } from "../../db";
import { initTables } from "../../db";
import { Terminal, TerminalRow } from "./terminals.types";

function terminalFromRow(row: TerminalRow): Terminal {
  return {
    id: row.id,
    name: row.name,
    groupIds: row.group_ids || [],
    printerVendorId: row.printer_vendor_id ?? undefined,
    printerProductId: row.printer_product_id ?? undefined,
  };
}

export async function listTerminals(): Promise<Terminal[]> {
  await initTables();
  const result = await getPool().query<TerminalRow>(
    `SELECT * FROM terminals ORDER BY name`
  );
  return result.rows.map(terminalFromRow);
}

export async function createTerminal(
  name: string,
  groupIds: string[],
  printerVendorId?: number,
  printerProductId?: number
): Promise<string> {
  await initTables();
  const id = uuid();
  await getPool().query(
    `INSERT INTO terminals (id, name, group_ids, printer_vendor_id, printer_product_id) VALUES ($1, $2, $3, $4, $5)`,
    [id, name, groupIds, printerVendorId ?? null, printerProductId ?? null]
  );
  return id;
}

export async function updateTerminal(
  id: string,
  name: string,
  groupIds: string[],
  printerVendorId?: number,
  printerProductId?: number
): Promise<void> {
  await initTables();
  await getPool().query(
    `UPDATE terminals SET name = $2, group_ids = $3, printer_vendor_id = $4, printer_product_id = $5, updated_at = NOW() WHERE id = $1`,
    [id, name, groupIds, printerVendorId ?? null, printerProductId ?? null]
  );
}

export async function deleteTerminal(id: string): Promise<void> {
  await initTables();
  await getPool().query(`DELETE FROM terminals WHERE id = $1`, [id]);
}

export async function getTerminal(id: string): Promise<Terminal | null> {
  await initTables();
  const result = await getPool().query<TerminalRow>(
    `SELECT * FROM terminals WHERE id = $1`, [id]
  );
  if (result.rows.length === 0) return null;
  return terminalFromRow(result.rows[0]);
}

export async function getTerminalItems(terminalId: string): Promise<{ id: string; name: string; price: number }[]> {
  await initTables();
  const result = await getPool().query<{ id: string; name: string; price: number }>(
    `SELECT i.id, i.name, i.price
     FROM items i
     JOIN terminals t ON i.group_id = ANY(t.group_ids)
     WHERE t.id = $1
     ORDER BY i.name`,
    [terminalId]
  );
  return result.rows;
}
