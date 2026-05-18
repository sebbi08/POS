# Catalog Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSV import/export for catalog items and groups with two-step import (preview diff, then confirm).

**Architecture:** Backend gets a new `catalog.csv.ts` module for CSV parsing/formatting and import logic. Repository gains `getGroupByName` and `exportItems`. Routes add `POST /export` and `POST /import` (multer for file upload). Frontend gets a new `CatalogImportExport` component with download and upload UI, plus a new tab in AdminLayout.

**Tech Stack:** Node.js/TypeScript, Express, PostgreSQL, multer, React 18, Tailwind CSS

---

### Task 1: Install multer dependency

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install multer and types**

```bash
npm install multer
npm install --save-dev @types/multer
```

Run from: `backend/`

Expected: `package.json` updated with `multer` in dependencies and `@types/multer` in devDependencies.

- [ ] **Step 2: Commit**

```bash
cd backend && npm install multer && npm install --save-dev @types/multer
git add backend/package.json backend/package-lock.json
git commit -m "chore: add multer for file upload support"
```

---

### Task 2: Add types for import/export

**Files:**
- Modify: `backend/src/modules/catalog/catalog.types.ts`

- [ ] **Step 1: Add type definitions**

Add these interfaces to the end of `catalog.types.ts`:

```typescript
export interface ExportRow {
  id: string;
  name: string;
  group_name: string;
  group_vat_rate: number;
  price: number;
}

export interface ImportRow {
  id: string;
  name: string;
  groupName: string;
  groupVatRate: string;
  price: string;
}

export interface ImportPreview {
  groupsToCreate: { name: string; vatRate: number }[];
  itemsToCreate: { id: string; name: string; groupName: string; price: number }[];
  itemsToUpdate: { id: string; name: string; groupName: string; price: number; oldName: string; oldPrice: number; oldGroupName: string }[];
  errors: string[];
}

export interface ImportResult extends ImportPreview {
  groupsCreated: number;
  itemsCreated: number;
  itemsUpdated: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/catalog/catalog.types.ts
git commit -m "feat: add import/export type definitions"
```

---

### Task 3: Add repository functions for export and group lookup

**Files:**
- Modify: `backend/src/modules/catalog/catalog.repository.ts`

- [ ] **Step 1: Add `getGroupByName` and `exportItems`**

Add these functions after the existing `getItem` function at line 92:

```typescript
export async function getGroupByName(name: string): Promise<ItemGroup | null> {
  await initTables();
  const result = await getPool().query<ItemGroupRow>(
    `SELECT * FROM item_groups WHERE name = $1`, [name]
  );
  if (result.rows.length === 0) return null;
  return groupFromRow(result.rows[0]);
}

export async function exportItems(groupId?: string): Promise<ExportRow[]> {
  await initTables();
  let query = `
    SELECT i.id, i.name, g.name AS group_name, g.vat_rate AS group_vat_rate, i.price
    FROM items i JOIN item_groups g ON i.group_id = g.id
  `;
  const params: string[] = [];
  if (groupId) {
    query += ` WHERE i.group_id = $1`;
    params.push(groupId);
  }
  query += ` ORDER BY g.name, i.name`;
  const result = await getPool().query(query, params);
  return result.rows.map(r => ({
    id: r.id,
    name: r.name,
    group_name: r.group_name,
    group_vat_rate: Number(r.group_vat_rate),
    price: Number(r.price),
  }));
}
```

- [ ] **Step 2: Import `ExportRow` at top of file**

Add `ExportRow` to the imports on line 4:

```typescript
import { ItemGroup, Item, ItemGroupRow, ItemRow, ExportRow } from "./catalog.types";
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/catalog/catalog.repository.ts
git commit -m "feat: add getGroupByName and exportItems repository functions"
```

---

### Task 4: Create CSV parsing and import/export logic module

**Files:**
- Create: `backend/src/modules/catalog/catalog.csv.ts`

- [ ] **Step 1: Write the module**

```typescript
import { ImportRow } from "./catalog.types";

export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

export function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatCsvRow(data: (string | number)[]): string {
  return data.map(escapeCsvField).join(",");
}

const EXPECTED_HEADER = ["id", "name", "group_name", "group_vat_rate", "price"];

export function parseCsv(text: string): { rows: ImportRow[]; error?: string } {
  const trimmed = text.trimEnd();
  if (!trimmed) {
    return { rows: [], error: "CSV file is empty" };
  }

  const lines = trimmed.split("\n");
  const header = parseCsvLine(lines[0]);

  const missing = EXPECTED_HEADER.filter(h => !header.includes(h));
  if (missing.length > 0 || header.length !== EXPECTED_HEADER.length) {
    return { rows: [], error: `Invalid CSV: expected columns ${EXPECTED_HEADER.join(",")}` };
  }

  const idIdx = header.indexOf("id");
  const nameIdx = header.indexOf("name");
  const groupNameIdx = header.indexOf("group_name");
  const groupVatRateIdx = header.indexOf("group_vat_rate");
  const priceIdx = header.indexOf("price");

  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const parts = parseCsvLine(line);
    if (parts.length < EXPECTED_HEADER.length) {
      return { rows: [], error: `Row ${i + 1}: missing fields (expected ${EXPECTED_HEADER.length}, got ${parts.length})` };
    }
    const row: ImportRow = {
      id: parts[idIdx].trim(),
      name: parts[nameIdx].trim(),
      groupName: parts[groupNameIdx].trim(),
      groupVatRate: parts[groupVatRateIdx].trim(),
      price: parts[priceIdx].trim(),
    };
    if (!row.id) return { rows: [], error: `Row ${i + 1}: missing id` };
    if (!row.name) return { rows: [], error: `Row ${i + 1}: missing name` };
    if (!row.groupName) return { rows: [], error: `Row ${i + 1}: missing group_name` };
    if (!row.groupVatRate) return { rows: [], error: `Row ${i + 1}: missing group_vat_rate` };
    if (!row.price) return { rows: [], error: `Row ${i + 1}: missing price` };
    rows.push(row);
  }

  if (rows.length === 0) {
    return { rows: [], error: "CSV file contains no data rows" };
  }

  // Check duplicate IDs in file
  const seenIds = new Map<string, number>();
  rows.forEach((r, idx) => {
    if (seenIds.has(r.id)) {
      // error will be set after loop
    } else {
      seenIds.set(r.id, idx);
    }
  });
  const allIds = rows.map(r => r.id);
  for (const id of new Set(allIds)) {
    const count = allIds.filter(x => x === id).length;
    if (count > 1) {
      const indices = rows.map((r, i) => r.id === id ? i + 2 : -1).filter(i => i > 0);
      return { rows: [], error: `Duplicate ID ${id} at rows ${indices.join(" and ")}` };
    }
  }

  return { rows };
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/catalog/catalog.csv.ts
git commit -m "feat: add CSV parsing and formatting utilities"
```

---

### Task 5: Add export and import routes

**Files:**
- Modify: `backend/src/api/routes/catalog.routes.ts`

- [ ] **Step 1: Replace imports and add multer setup**

Replace lines 1-12 with:

```typescript
import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import multer from "multer";
import { checkAdmin } from "../middleware/auth.middleware";
import {
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  listItems,
  createItem,
  updateItem,
  deleteItem,
  getGroupByName,
  getItem,
  exportItems,
} from "../../modules/catalog/catalog.repository";
import { parseCsv, formatCsvRow } from "../../modules/catalog/catalog.csv";
import type { ImportPreview, ImportResult } from "../../modules/catalog/catalog.types";
import { getPool } from "../../db";

const upload = multer({ storage: multer.memoryStorage() });
```

- [ ] **Step 2: Add export route**

Add before `export default router;`:

```typescript
router.post("/export", async (req: Request, res: Response): Promise<void> => {
  const { groupId } = req.body;
  const rows = await exportItems(groupId);
  const header = formatCsvRow(["id", "name", "group_name", "group_vat_rate", "price"]);
  const csv = header + "\n" + rows.map(r => formatCsvRow([r.id, r.name, r.group_name, r.group_vat_rate, r.price])).join("\n") + "\n";
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=catalog-export.csv");
  res.send(csv);
});
```

- [ ] **Step 3: Add import route**

Add after the export route:

```typescript
router.post("/import", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const text = req.file.buffer.toString("utf-8");
  const parseResult = parseCsv(text);
  if (parseResult.error) {
    res.status(400).json({ groupsToCreate: [], itemsToCreate: [], itemsToUpdate: [], errors: [parseResult.error] });
    return;
  }

  const csvRows = parseResult.rows;
  const dryRun = req.body.dryRun === "true" || req.body.dryRun === true;

  const errors: string[] = [];
  const groupsToCreate: ImportPreview["groupsToCreate"] = [];
  const itemsToCreate: ImportPreview["itemsToCreate"] = [];
  const itemsToUpdate: ImportPreview["itemsToUpdate"] = [];

  // Validate numeric fields
  for (let i = 0; i < csvRows.length; i++) {
    const r = csvRows[i];
    const rowNum = i + 2;
    if (isNaN(parseFloat(r.groupVatRate))) {
      errors.push(`Row ${rowNum}: invalid group_vat_rate "${r.groupVatRate}"`);
    }
    if (isNaN(parseFloat(r.price))) {
      errors.push(`Row ${rowNum}: invalid price "${r.price}"`);
    }
  }

  if (errors.length > 0) {
    res.status(400).json({ groupsToCreate, itemsToCreate, itemsToUpdate, errors });
    return;
  }

  // Resolve groups (by name, case-sensitive)
  const groupMap = new Map<string, { name: string; vatRate: number; existingId?: string }>();
  for (const r of csvRows) {
    if (!groupMap.has(r.groupName)) {
      const existing = await getGroupByName(r.groupName);
      const vatRate = parseFloat(r.groupVatRate);
      if (existing) {
        if (existing.vatRate !== vatRate) {
          errors.push(`Group "${r.groupName}" exists with VAT ${existing.vatRate}%, import has ${vatRate}%`);
        }
        groupMap.set(r.groupName, { name: r.groupName, vatRate, existingId: existing.id });
      } else {
        groupMap.set(r.groupName, { name: r.groupName, vatRate });
        groupsToCreate.push({ name: r.groupName, vatRate });
      }
    }
  }

  // Load all groups for old-group-name resolution in diffs
  const allGroups = await listGroups();
  const groupById = new Map(allGroups.map(g => [g.id, g]));

  // Diff items (by id)
  for (const r of csvRows) {
    const price = parseFloat(r.price);
    const existing = await getItem(r.id);

    if (existing) {
      const oldGroup = groupById.get(existing.groupId);
      const oldGroupName = oldGroup?.name || existing.groupId;

      if (existing.name !== r.name || existing.price !== price || existing.groupId !== groupMap.get(r.groupName)?.existingId) {
        itemsToUpdate.push({
          id: r.id,
          name: r.name,
          groupName: r.groupName,
          price,
          oldName: existing.name,
          oldPrice: existing.price,
          oldGroupName,
        });
      }
    } else {
      itemsToCreate.push({
        id: r.id,
        name: r.name,
        groupName: r.groupName,
        price,
      });
    }
  }

  const preview: ImportPreview = { groupsToCreate, itemsToCreate, itemsToUpdate, errors };

  if (dryRun) {
    res.json(preview);
    return;
  }

  if (errors.length > 0) {
    res.status(400).json(preview);
    return;
  }

  // Execute in transaction
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let groupsCreated = 0;
    const finalGroupMap = new Map<string, string>();

    for (const g of groupsToCreate) {
      const id = uuid();
      await client.query(
        `INSERT INTO item_groups (id, name, vat_rate) VALUES ($1, $2, $3)`,
        [id, g.name, g.vatRate]
      );
      finalGroupMap.set(g.name, id);
      groupsCreated++;
    }

    for (const [name, info] of groupMap) {
      if (info.existingId) {
        finalGroupMap.set(name, info.existingId);
      }
    }

    let itemsCreated = 0;
    let itemsUpdated = 0;

    for (const item of itemsToCreate) {
      const groupId = finalGroupMap.get(item.groupName);
      if (!groupId) continue;
      await client.query(
        `INSERT INTO items (id, name, group_id, price) VALUES ($1, $2, $3, $4)`,
        [item.id, item.name, groupId, item.price]
      );
      itemsCreated++;
    }

    for (const item of itemsToUpdate) {
      const groupId = finalGroupMap.get(item.groupName);
      if (!groupId) continue;
      await client.query(
        `UPDATE items SET name = $2, group_id = $3, price = $4, updated_at = NOW() WHERE id = $1`,
        [item.id, item.name, groupId, item.price]
      );
      itemsUpdated++;
    }

    await client.query("COMMIT");

    const result: ImportResult = {
      groupsCreated,
      itemsCreated,
      itemsUpdated,
      groupsToCreate,
      itemsToCreate,
      itemsToUpdate,
      errors,
    };
    res.json(result);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/routes/catalog.routes.ts
git commit -m "feat: add POST /catalog/export and /catalog/import routes"
```

---

### Task 6: Run backend tests

**Files:**
- (Verify only)

- [ ] **Step 1: Run existing backend tests**

```bash
cd backend && npx vitest run
```

Expected: All existing tests pass.

- [ ] **Step 2: Commit (if all pass)**

```bash
git add -A && git commit -m "test: verify backend tests pass after import/export routes"
```

---

### Task 7: Add upload and download methods to frontend API client

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add `upload` and `rawPost` methods**

Add these methods to the `api` export object, after the `delete` method on line 44:

```typescript
  upload: async <T>(path: string, file: File, extraFields?: Record<string, string>): Promise<T> => {
    const formData = new FormData();
    formData.append("file", file);
    if (extraFields) {
      Object.entries(extraFields).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }
    const headers: Record<string, string> = {};
    const pin = getAdminPin();
    if (pin) {
      headers["x-admin-pin"] = pin;
    }
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Request failed");
    }
    return res.json();
  },

  downloadCsv: async (path: string, body?: unknown): Promise<void> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const pin = getAdminPin();
    if (pin) {
      headers["x-admin-pin"] = pin;
    }
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Request failed");
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalog-export.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },
```

And add these to the TypeScript type. Before line 44 (`delete`), the object literal is the `api` variable. Add the new methods inside the object.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "feat: add upload and downloadCsv methods to API client"
```

---

### Task 8: Create CatalogImportExport component

**Files:**
- Create: `frontend/src/components/CatalogImportExport.tsx`

- [ ] **Step 1: Write the component**

```typescript
import { useState, useEffect } from "react";
import { api } from "../api/client";

interface ItemGroup {
  id: string;
  name: string;
  vatRate: number;
}

interface GroupToCreate {
  name: string;
  vatRate: number;
}

interface ItemToCreate {
  id: string;
  name: string;
  groupName: string;
  price: number;
}

interface ItemToUpdate {
  id: string;
  name: string;
  groupName: string;
  price: number;
  oldName: string;
  oldPrice: number;
  oldGroupName: string;
}

interface ImportPreview {
  groupsToCreate: GroupToCreate[];
  itemsToCreate: ItemToCreate[];
  itemsToUpdate: ItemToUpdate[];
  errors: string[];
  groupsCreated?: number;
  itemsCreated?: number;
  itemsUpdated?: number;
}

function CatalogImportExport() {
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    api.get<ItemGroup[]>("/catalog/groups").then(setGroups);
  }, []);

  const handleExport = async (groupId?: string) => {
    setLoading(true);
    try {
      await api.downloadCsv("/catalog/export", groupId ? { groupId } : {});
    } finally {
      setLoading(false);
    }
  };

  const generateSample = () => {
    const sample = [
      ["id", "name", "group_name", "group_vat_rate", "price"],
      [crypto.randomUUID(), "Espresso", "Hot Drinks", "19", "2.50"],
      [crypto.randomUUID(), "Cappuccino", "Hot Drinks", "19", "3.00"],
      [crypto.randomUUID(), "Cookie", "Bakery", "7", "1.80"],
      [crypto.randomUUID(), "Muffin", "Bakery", "7", "2.20"],
    ];
    const csv = sample.map(row => row.map(v => v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v).join(",")).join("\n") + "\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalog-sample.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await api.upload<ImportPreview>("/catalog/import", file, { dryRun: "true" });
      setPreview(data);
    } catch (e: any) {
      setPreview({ groupsToCreate: [], itemsToCreate: [], itemsToUpdate: [], errors: [e.message] });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!file || !preview || preview.errors.length > 0) return;
    setLoading(true);
    try {
      const data = await api.upload<ImportPreview>("/catalog/import", file, { dryRun: "false" });
      setPreview(data);
      setResult(`Created ${data.groupsCreated || 0} groups, ${data.itemsCreated || 0} items, updated ${data.itemsUpdated || 0} items.`);
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const shortId = (id: string) => id.substring(0, 8);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-white text-xl font-bold mb-4">Export Catalog</h2>
        <div className="bg-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              onClick={() => handleExport(selectedGroupId || undefined)}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded px-4 py-2 text-sm"
            >
              Download CSV
            </button>
            <button
              onClick={generateSample}
              className="bg-gray-600 hover:bg-gray-500 text-white rounded px-4 py-2 text-sm"
            >
              Download Sample CSV
            </button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-white text-xl font-bold mb-4">Import Catalog</h2>
        <div className="bg-gray-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setPreview(null);
                setResult(null);
              }}
              className="text-gray-300 text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-gray-700 file:text-white hover:file:bg-gray-600"
            />
            <button
              onClick={handlePreview}
              disabled={!file || loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded px-4 py-2 text-sm"
            >
              Preview
            </button>
          </div>

          {loading && <div className="text-gray-400 text-sm">Processing...</div>}

          {result && (
            <div className="bg-green-900/30 border border-green-700 rounded-lg p-3">
              <p className="text-green-400 text-sm">{result}</p>
            </div>
          )}

          {preview && (
            <div className="space-y-4">
              {preview.groupsToCreate.length > 0 && (
                <div>
                  <h3 className="text-blue-400 text-sm font-semibold mb-2">
                    Groups to Create ({preview.groupsToCreate.length})
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-700">
                        <th className="text-left py-1">Name</th>
                        <th className="text-right py-1">VAT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.groupsToCreate.map((g, i) => (
                        <tr key={i} className="border-b border-gray-800">
                          <td className="text-blue-300 py-1">{g.name}</td>
                          <td className="text-blue-300 text-right py-1">{g.vatRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview.itemsToCreate.length > 0 && (
                <div>
                  <h3 className="text-green-400 text-sm font-semibold mb-2">
                    Items to Create ({preview.itemsToCreate.length})
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-700">
                        <th className="text-left py-1">ID</th>
                        <th className="text-left py-1">Name</th>
                        <th className="text-left py-1">Group</th>
                        <th className="text-right py-1">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.itemsToCreate.map((item, i) => (
                        <tr key={i} className="border-b border-gray-800">
                          <td className="text-green-300 py-1 font-mono">{shortId(item.id)}</td>
                          <td className="text-green-300 py-1">{item.name}</td>
                          <td className="text-green-300 py-1">{item.groupName}</td>
                          <td className="text-green-300 text-right py-1">{item.price.toFixed(2)}€</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview.itemsToUpdate.length > 0 && (
                <div>
                  <h3 className="text-yellow-400 text-sm font-semibold mb-2">
                    Items to Update ({preview.itemsToUpdate.length})
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-700">
                        <th className="text-left py-1">ID</th>
                        <th className="text-left py-1">Name</th>
                        <th className="text-left py-1">Group</th>
                        <th className="text-right py-1">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.itemsToUpdate.map((item, i) => (
                        <tr key={i} className="border-b border-gray-800">
                          <td className="text-yellow-300 py-1 font-mono">{shortId(item.id)}</td>
                          <td className="text-yellow-300 py-1">
                            <span className="text-gray-500 line-through">{item.oldName}</span> → {item.name}
                          </td>
                          <td className="text-yellow-300 py-1">
                            <span className="text-gray-500 line-through">{item.oldGroupName}</span> → {item.groupName}
                          </td>
                          <td className="text-yellow-300 text-right py-1">
                            <span className="text-gray-500 line-through">{item.oldPrice.toFixed(2)}€</span> → {item.price.toFixed(2)}€
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview.errors.length > 0 && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
                  <h3 className="text-red-400 text-sm font-semibold mb-1">Errors</h3>
                  {preview.errors.map((err, i) => (
                    <p key={i} className="text-red-300 text-xs">{err}</p>
                  ))}
                </div>
              )}

              {preview.errors.length === 0 && (preview.itemsToCreate.length > 0 || preview.itemsToUpdate.length > 0 || preview.groupsToCreate.length > 0) && (
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded px-4 py-2 text-sm"
                >
                  Confirm Import
                </button>
              )}

              {preview.errors.length === 0 && preview.itemsToCreate.length === 0 && preview.itemsToUpdate.length === 0 && preview.groupsToCreate.length === 0 && (
                <p className="text-gray-400 text-sm">No changes to apply.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CatalogImportExport;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/CatalogImportExport.tsx
git commit -m "feat: add CatalogImportExport component with diff preview"
```

---

### Task 9: Add import/export tab to AdminLayout

**Files:**
- Modify: `frontend/src/views/AdminLayout.tsx`

- [ ] **Step 1: Add import and render**

In `AdminLayout.tsx`:

Line 5 — add the import:
```typescript
import CatalogImportExport from "../components/CatalogImportExport";
```

Line 9 — extend the Tab type:
```typescript
type Tab = "groups" | "items" | "terminals" | "company" | "daily" | "transactions" | "import-export";
```

Lines 11-18 — add to the tabs array (before the closing `]`):
```typescript
  { id: "import-export", label: "Import/Export" },
```

Lines 55-60 — add the render condition:
```typescript
        {tab === "import-export" && <CatalogImportExport />}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/AdminLayout.tsx
git commit -m "feat: add import/export tab to admin panel"
```

---

### Task 10: Update frontend tests

**Files:**
- Modify: `frontend/src/tests/Admin.test.tsx`

- [ ] **Step 1: Add test for the new import/export tab**

Add this test at the end of the `AdminLayout` describe block (after line 99):

```typescript
  it("renders Import/Export tab", () => {
    render(<MemoryRouter><AdminLayout /></MemoryRouter>);
    expect(screen.getByText("Import/Export")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Update the API mock to include new methods**

In the `vi.mock("../api/client", ...)` block (lines 9-26), add the new methods to the mock:

```typescript
    upload: vi.fn().mockResolvedValue({}),
    downloadCsv: vi.fn().mockResolvedValue(undefined),
```

Add these after line 23 (`delete: vi.fn().mockResolvedValue({ status: "deleted" }),`).

- [ ] **Step 3: Run frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass, including the new "renders Import/Export tab" test.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/tests/Admin.test.tsx
git commit -m "test: add Import/Export tab test and mock new API methods"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npx vitest run
```

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

- [ ] **Step 3: TypeScript check frontend**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: TypeScript check backend**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 5: Manual verification**

Start the app and verify:
- Export: select a group from dropdown, click Download CSV, verify file has correct columns
- Sample: click Download Sample CSV, verify 4 items across 2 groups with UUIDs
- Import preview: upload the sample file, verify diff panel shows changes
- Import confirm: confirm, verify items appear in the Items tab
- Edge case: import a file with duplicate IDs, verify error message

- [ ] **Step 6: Commit final**

```bash
git add -A
git commit -m "chore: final verification after import/export feature"
```
