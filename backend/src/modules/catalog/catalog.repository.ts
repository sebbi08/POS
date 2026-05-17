import { v4 as uuid } from "uuid";
import { getPool } from "../../db";
import { initTables } from "../../db";
import { ItemGroup, Item, ItemGroupRow, ItemRow } from "./catalog.types";

function groupFromRow(row: ItemGroupRow): ItemGroup {
  return { id: row.id, name: row.name, vatRate: Number(row.vat_rate) };
}

function itemFromRow(row: ItemRow): Item {
  return { id: row.id, name: row.name, groupId: row.group_id, price: Number(row.price) };
}

export async function listGroups(): Promise<ItemGroup[]> {
  await initTables();
  const result = await getPool().query<ItemGroupRow>(
    `SELECT * FROM item_groups ORDER BY name`
  );
  return result.rows.map(groupFromRow);
}

export async function createGroup(name: string, vatRate: number): Promise<string> {
  await initTables();
  const id = uuid();
  await getPool().query(
    `INSERT INTO item_groups (id, name, vat_rate) VALUES ($1, $2, $3)`,
    [id, name, vatRate]
  );
  return id;
}

export async function updateGroup(id: string, name: string, vatRate: number): Promise<void> {
  await initTables();
  await getPool().query(
    `UPDATE item_groups SET name = $2, vat_rate = $3, updated_at = NOW() WHERE id = $1`,
    [id, name, vatRate]
  );
}

export async function deleteGroup(id: string): Promise<void> {
  await initTables();
  await getPool().query(`DELETE FROM item_groups WHERE id = $1`, [id]);
}

export async function listItems(): Promise<Item[]> {
  await initTables();
  const result = await getPool().query<ItemRow>(
    `SELECT * FROM items ORDER BY name`
  );
  return result.rows.map(itemFromRow);
}

export async function createItem(name: string, groupId: string, price: number): Promise<string> {
  await initTables();
  const id = uuid();
  await getPool().query(
    `INSERT INTO items (id, name, group_id, price) VALUES ($1, $2, $3, $4)`,
    [id, name, groupId, price]
  );
  return id;
}

export async function updateItem(id: string, name: string, groupId: string, price: number): Promise<void> {
  await initTables();
  await getPool().query(
    `UPDATE items SET name = $2, group_id = $3, price = $4, updated_at = NOW() WHERE id = $1`,
    [id, name, groupId, price]
  );
}

export async function deleteItem(id: string): Promise<void> {
  await initTables();
  await getPool().query(`DELETE FROM items WHERE id = $1`, [id]);
}

export async function getGroup(id: string): Promise<ItemGroup | null> {
  await initTables();
  const result = await getPool().query<ItemGroupRow>(
    `SELECT * FROM item_groups WHERE id = $1`, [id]
  );
  if (result.rows.length === 0) return null;
  return groupFromRow(result.rows[0]);
}

export async function getItem(id: string): Promise<Item | null> {
  await initTables();
  const result = await getPool().query<ItemRow>(
    `SELECT * FROM items WHERE id = $1`, [id]
  );
  if (result.rows.length === 0) return null;
  return itemFromRow(result.rows[0]);
}
