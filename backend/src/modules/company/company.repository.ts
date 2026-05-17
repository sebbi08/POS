import { getPool } from "../../db";
import { initTables } from "../../db";
import { CompanySettings } from "./company.types";

export async function getCompanySettings(): Promise<CompanySettings> {
  await initTables();
  const result = await getPool().query<{
    name: string; address: string; city: string; vat_id: string;
  }>(`SELECT name, address, city, vat_id FROM company_settings WHERE id = 1`);

  if (result.rows.length === 0) {
    return { name: "", address: "", city: "", vatId: "" };
  }

  const row = result.rows[0];
  return { name: row.name, address: row.address, city: row.city, vatId: row.vat_id };
}

export async function updateCompanySettings(
  name: string,
  address: string,
  city: string,
  vatId: string
): Promise<void> {
  await initTables();
  await getPool().query(
    `INSERT INTO company_settings (id, name, address, city, vat_id)
     VALUES (1, $1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET name = $1, address = $2, city = $3, vat_id = $4, updated_at = NOW()`,
    [name, address, city, vatId]
  );
}
