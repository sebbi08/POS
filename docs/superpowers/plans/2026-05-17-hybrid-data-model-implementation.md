# Hybrid Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the POS system from fully event-sourced to a hybrid model — orders stay event-sourced with cancellation-as-separate-order, everything else becomes standard mutable SQL with hard delete.

**Architecture:** A new `db.ts` manages the PostgreSQL pool and standard tables. A new `order-eventstore.ts` handles order-specific event operations. Non-order modules get repository files that do direct SQL. Order projections and reporting projections consume from `order-eventstore`. The old generic `events` table and `eventstore/client.ts` are removed.

**Tech Stack:** Node.js/TypeScript, Express, PostgreSQL via `pg` driver, UUID v4

---

### Task 1: Create shared database pool with table initialization

**Files:**
- Create: `backend/src/db.ts`

- [ ] **Step 1: Write `db.ts`**

```typescript
import { Pool } from "pg";
import { config } from "./config";

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config.pg.connectionString });
  }
  return pool;
}

let tablesInitialized = false;

export async function initTables(): Promise<void> {
  if (tablesInitialized) return;
  const client = await getPool().connect();
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
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/db.ts && git commit -m "feat: add shared db pool and standard table initialization"
```

---

### Task 2: Create order-specific event store

**Files:**
- Create: `backend/src/modules/orders/order-eventstore.ts`

- [ ] **Step 1: Write `order-eventstore.ts`**

```typescript
import { getPool } from "../../db";

let tableInitialized = false;

async function initOrderEventsTable(): Promise<void> {
  if (tableInitialized) return;
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_events (
        id BIGSERIAL PRIMARY KEY,
        stream_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        data JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_order_events_stream ON order_events(stream_id, created_at);
    `);
    tableInitialized = true;
  } finally {
    client.release();
  }
}

export async function appendOrderEvent(
  streamId: string,
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  await initOrderEventsTable();
  const client = await getPool().connect();
  try {
    await client.query(
      `INSERT INTO order_events (stream_id, event_type, data) VALUES ($1, $2, $3)`,
      [streamId, eventType, JSON.stringify(data)]
    );
    await client.query(`NOTIFY "${streamId}", '1'`);
    await client.query(`NOTIFY "order_events", '1'`);
  } finally {
    client.release();
  }
}

export async function readOrderStream<E = Record<string, unknown>>(
  streamId: string
): Promise<{ type: string; data: E; created: Date }[]> {
  await initOrderEventsTable();
  const result = await getPool().query(
    `SELECT event_type, data, created_at FROM order_events WHERE stream_id = $1 ORDER BY id ASC`,
    [streamId]
  );
  return result.rows.map((row) => ({
    type: row.event_type,
    data: row.data as E,
    created: new Date(row.created_at),
  }));
}

export async function subscribeToOrderEvents(
  handler: (event: { type: string; data: Record<string, unknown>; streamId: string }) => void
): Promise<() => void> {
  await initOrderEventsTable();
  const client = await getPool().connect();
  await client.query('LISTEN "order_events"');

  const cleanup = () => {
    client.release();
  };

  client.on("notification", async () => {
    const result = await getPool().query(
      `SELECT stream_id, event_type, data FROM order_events ORDER BY id DESC LIMIT 1`
    );
    for (const row of result.rows) {
      handler({
        type: row.event_type,
        data: row.data,
        streamId: row.stream_id,
      });
    }
  });

  return cleanup;
}

export async function replayOrderEvents(
  handler: (event: { type: string; data: Record<string, unknown>; streamId: string }) => Promise<void>
): Promise<void> {
  await initOrderEventsTable();
  const result = await getPool().query(
    `SELECT stream_id, event_type, data FROM order_events ORDER BY id ASC`
  );
  for (const row of result.rows) {
    await handler({
      type: row.event_type,
      data: row.data,
      streamId: row.stream_id,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/orders/order-eventstore.ts && git commit -m "feat: add order-specific event store"
```

---

### Task 3: Update catalog types — remove `archived`

**Files:**
- Modify: `backend/src/modules/catalog/catalog.types.ts`

- [ ] **Step 1: Replace the file content**

```typescript
export interface ItemGroup {
  id: string;
  name: string;
  vatRate: number;
}

export interface Item {
  id: string;
  name: string;
  groupId: string;
  price: number;
}

export interface ItemGroupRow {
  id: string;
  name: string;
  vat_rate: number;
  created_at: string;
  updated_at: string;
}

export interface ItemRow {
  id: string;
  name: string;
  group_id: string;
  price: number;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/catalog/catalog.types.ts && git commit -m "refactor: remove archived from catalog types, add row interfaces"
```

---

### Task 4: Create catalog repository

**Files:**
- Create: `backend/src/modules/catalog/catalog.repository.ts`

- [ ] **Step 1: Write `catalog.repository.ts`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/catalog/catalog.repository.ts && git commit -m "feat: add catalog SQL repository"
```

---

### Task 5: Update catalog routes to use repository

**Files:**
- Modify: `backend/src/api/routes/catalog.routes.ts`

- [ ] **Step 1: Replace `catalog.routes.ts`**

```typescript
import { Router, Request, Response } from "express";
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
} from "../../modules/catalog/catalog.repository";

const router = Router();

router.use(checkAdmin);

router.get("/groups", (_req: Request, res: Response): void => {
  listGroups().then((groups) => res.json(groups));
});

router.post("/groups", (req: Request, res: Response): void => {
  const { name, vatRate } = req.body;
  createGroup(name, vatRate).then((id) => res.json({ id }));
});

router.put("/groups/:id", (req: Request, res: Response): void => {
  const { name, vatRate } = req.body;
  updateGroup(req.params.id, name, vatRate).then(() =>
    res.json({ status: "updated" })
  );
});

router.delete("/groups/:id", (req: Request, res: Response): void => {
  deleteGroup(req.params.id).then(() =>
    res.json({ status: "deleted" })
  );
});

router.get("/items", (_req: Request, res: Response): void => {
  listItems().then((items) => res.json(items));
});

router.post("/items", (req: Request, res: Response): void => {
  const { name, groupId, price } = req.body;
  createItem(name, groupId, price).then((id) => res.json({ id }));
});

router.put("/items/:id", (req: Request, res: Response): void => {
  const { name, groupId, price } = req.body;
  updateItem(req.params.id, name, groupId, price).then(() =>
    res.json({ status: "updated" })
  );
});

router.delete("/items/:id", (req: Request, res: Response): void => {
  deleteItem(req.params.id).then(() =>
    res.json({ status: "deleted" })
  );
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/api/routes/catalog.routes.ts && git commit -m "refactor: update catalog routes to use SQL repository"
```

---

### Task 6: Update terminal types — remove `archived`

**Files:**
- Modify: `backend/src/modules/terminals/terminals.types.ts`

- [ ] **Step 1: Replace the file content**

```typescript
export interface Terminal {
  id: string;
  name: string;
  groupIds: string[];
  printerVendorId?: number;
  printerProductId?: number;
}

export interface TerminalRow {
  id: string;
  name: string;
  group_ids: string[];
  printer_vendor_id: number | null;
  printer_product_id: number | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/terminals/terminals.types.ts && git commit -m "refactor: remove archived from terminal types, add row interface"
```

---

### Task 7: Create terminals repository

**Files:**
- Create: `backend/src/modules/terminals/terminals.repository.ts`

- [ ] **Step 1: Write `terminals.repository.ts`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/terminals/terminals.repository.ts && git commit -m "feat: add terminals SQL repository"
```

---

### Task 8: Update terminal routes to use repository

**Files:**
- Modify: `backend/src/api/routes/terminals.routes.ts`

- [ ] **Step 1: Replace `terminals.routes.ts`**

```typescript
import { Router, Request, Response } from "express";
import { checkAdmin } from "../middleware/auth.middleware";
import {
  listTerminals,
  createTerminal,
  updateTerminal,
  deleteTerminal,
  getTerminalItems,
} from "../../modules/terminals/terminals.repository";

const router = Router();

router.get("/", (_req: Request, res: Response): void => {
  listTerminals().then((terminals) =>
    res.json(
      terminals.map(({ id, name, groupIds }) => ({ id, name, groupIds }))
    )
  );
});

router.post("/", checkAdmin, (req: Request, res: Response): void => {
  const { name, groupIds, printerVendorId, printerProductId } = req.body;
  createTerminal(name, groupIds, printerVendorId, printerProductId).then((id) =>
    res.json({ id })
  );
});

router.put("/:id", checkAdmin, (req: Request, res: Response): void => {
  const { name, groupIds, printerVendorId, printerProductId } = req.body;
  updateTerminal(req.params.id, name, groupIds, printerVendorId, printerProductId).then(() =>
    res.json({ status: "updated" })
  );
});

router.delete("/:id", checkAdmin, (req: Request, res: Response): void => {
  deleteTerminal(req.params.id).then(() =>
    res.json({ status: "deleted" })
  );
});

router.get("/:id/items", (req: Request, res: Response): void => {
  getTerminalItems(req.params.id).then((items) => res.json(items));
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/api/routes/terminals.routes.ts && git commit -m "refactor: update terminal routes to use SQL repository"
```

---

### Task 9: Create company repository

**Files:**
- Create: `backend/src/modules/company/company.repository.ts`

- [ ] **Step 1: Write `company.repository.ts`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/company/company.repository.ts && git commit -m "feat: add company SQL repository"
```

---

### Task 10: Update company routes to use repository

**Files:**
- Modify: `backend/src/api/routes/company.routes.ts`

- [ ] **Step 1: Replace `company.routes.ts`**

```typescript
import { Router, Request, Response } from "express";
import { checkAdmin } from "../middleware/auth.middleware";
import { getCompanySettings, updateCompanySettings } from "../../modules/company/company.repository";

const router = Router();

router.get("/", (_req: Request, res: Response): void => {
  getCompanySettings().then((settings) => res.json(settings));
});

router.put("/", checkAdmin, (req: Request, res: Response): void => {
  const { name, address, city, vatId } = req.body;
  updateCompanySettings(name, address, city, vatId).then(() =>
    res.json({ status: "updated" })
  );
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/api/routes/company.routes.ts && git commit -m "refactor: update company routes to use SQL repository"
```

---

### Task 11: Remove old non-order projections

**Files:**
- Delete: `backend/src/modules/catalog/catalog.projections.ts`
- Delete: `backend/src/modules/catalog/catalog.commands.ts`
- Delete: `backend/src/modules/terminals/terminals.projections.ts`
- Delete: `backend/src/modules/terminals/terminals.commands.ts`
- Delete: `backend/src/modules/company/company.projections.ts`
- Delete: `backend/src/modules/company/company.commands.ts`

- [ ] **Step 1: Run the deletions and commit**

```bash
rm backend/src/modules/catalog/catalog.projections.ts \
   backend/src/modules/catalog/catalog.commands.ts \
   backend/src/modules/terminals/terminals.projections.ts \
   backend/src/modules/terminals/terminals.commands.ts \
   backend/src/modules/company/company.projections.ts \
   backend/src/modules/company/company.commands.ts && \
git add backend/src/modules/catalog/catalog.projections.ts \
         backend/src/modules/catalog/catalog.commands.ts \
         backend/src/modules/terminals/terminals.projections.ts \
         backend/src/modules/terminals/terminals.commands.ts \
         backend/src/modules/company/company.projections.ts \
         backend/src/modules/company/company.commands.ts && \
git commit -m "refactor: remove non-order projections and commands"
```

---

### Task 12: Update company types — remove event interfaces

**Files:**
- Modify: `backend/src/modules/company/company.types.ts`

- [ ] **Step 1: Replace the file content**

```typescript
export interface CompanySettings {
  name: string;
  address: string;
  city: string;
  vatId: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/company/company.types.ts && git commit -m "refactor: simplify company types, remove event interfaces"
```

---

### Task 13: Update order types

**Files:**
- Modify: `backend/src/modules/orders/orders.types.ts`

- [ ] **Step 1: Replace the file content**

```typescript
export type OrderStatus = "open" | "paid" | "closed";

export interface OrderItem {
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  total: number;
}

export interface Order {
  id: string;
  terminalId: string;
  status: OrderStatus;
  items: OrderItem[];
  pickupSeq: number;
  totalGross: number;
  totalVat: Record<number, number>;
  totalNet: number;
  createdAt: Date;
  closedAt?: Date;
  title?: string;
  cancelsOrderId?: string;
  cancelledByOrderId?: string;
}

export interface OrderOpenedEvent {
  id: string;
  terminalId: string;
}

export interface ItemAddedEvent {
  orderId: string;
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  total: number;
}

export interface ItemRemovedEvent {
  orderId: string;
  itemId: string;
}

export interface PickupReceiptPrintedEvent {
  orderId: string;
  itemId: string;
}

export interface FinalReceiptPrintedEvent {
  orderId: string;
}

export interface OrderPaidEvent {
  orderId: string;
  totalGross: number;
  totalVat: Record<number, number>;
  totalNet: number;
}

export interface OrderClosedEvent {
  orderId: string;
}

export interface OrderCancellationCreatedEvent {
  id: string;
  terminalId: string;
  title: string;
  cancelsOrderId: string;
  items: OrderItem[];
  totalGross: number;
  totalVat: Record<number, number>;
  totalNet: number;
  createdAt: string;
  closedAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/orders/orders.types.ts && git commit -m "refactor: update order types — remove cancelled status, add cancellation model"
```

---

### Task 14: Update order commands to use order-eventstore

**Files:**
- Modify: `backend/src/modules/orders/orders.commands.ts`

- [ ] **Step 1: Replace `orders.commands.ts`**

```typescript
import { v4 as uuid } from "uuid";
import { appendOrderEvent } from "./order-eventstore";
import {
  OrderOpenedEvent,
  ItemAddedEvent,
  ItemRemovedEvent,
  PickupReceiptPrintedEvent,
  FinalReceiptPrintedEvent,
  OrderPaidEvent,
  OrderClosedEvent,
  OrderCancellationCreatedEvent,
} from "./orders.types";

const STREAM = (id: string) => `order-${id}`;

export async function openOrder(terminalId: string): Promise<string> {
  const id = uuid();
  const data: OrderOpenedEvent = { id, terminalId };
  await appendOrderEvent(STREAM(id), "OrderOpened", data as unknown as Record<string, unknown>);
  return id;
}

export async function addItemToOrder(
  orderId: string,
  itemId: string,
  name: string,
  qty: number,
  unitPrice: number,
  vatRate: number
): Promise<void> {
  const total = unitPrice * qty;
  const vatAmount = total - total / (1 + vatRate / 100);

  const data: ItemAddedEvent = {
    orderId,
    itemId,
    name,
    qty,
    unitPrice,
    vatRate,
    vatAmount: Math.round(vatAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
  await appendOrderEvent(STREAM(orderId), "ItemAdded", data as unknown as Record<string, unknown>);
}

export async function removeItemFromOrder(
  orderId: string,
  itemId: string
): Promise<void> {
  const data: ItemRemovedEvent = { orderId, itemId };
  await appendOrderEvent(STREAM(orderId), "ItemRemoved", data as unknown as Record<string, unknown>);
}

export async function printPickupReceipt(
  orderId: string,
  itemId: string
): Promise<void> {
  const data: PickupReceiptPrintedEvent = { orderId, itemId };
  await appendOrderEvent(STREAM(orderId), "PickupReceiptPrinted", data as unknown as Record<string, unknown>);
}

export async function printFinalReceipt(orderId: string): Promise<void> {
  const data: FinalReceiptPrintedEvent = { orderId };
  await appendOrderEvent(STREAM(orderId), "FinalReceiptPrinted", data as unknown as Record<string, unknown>);
}

export async function payOrder(orderId: string): Promise<void> {
  const { orders } = require("./orders.projections");
  const order = orders.get(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const totalGross = order.items.reduce((sum: number, i: { total: number }) => sum + i.total, 0);
  const totalVat: Record<number, number> = {};
  for (const item of order.items) {
    totalVat[item.vatRate] =
      (totalVat[item.vatRate] || 0) + item.vatAmount;
  }
  const totalNet = totalGross - Object.values(totalVat).reduce((a, b) => a + b, 0);

  const data: OrderPaidEvent = {
    orderId,
    totalGross: Math.round(totalGross * 100) / 100,
    totalVat: Object.fromEntries(
      Object.entries(totalVat).map(([k, v]) => [k, Math.round(v * 100) / 100])
    ),
    totalNet: Math.round(totalNet * 100) / 100,
  };
  await appendOrderEvent(STREAM(orderId), "OrderPaid", data as unknown as Record<string, unknown>);
}

export async function closeOrder(orderId: string): Promise<void> {
  const data: OrderClosedEvent = { orderId };
  await appendOrderEvent(STREAM(orderId), "OrderClosed", data as unknown as Record<string, unknown>);
}

export async function cancelOrder(
  originalOrderId: string,
  terminalId: string,
  reason?: string
): Promise<string> {
  const { orders } = require("./orders.projections");
  const original = orders.get(originalOrderId);
  if (!original) throw new Error(`Order ${originalOrderId} not found`);
  if (original.status !== "closed") throw new Error(`Only closed orders can be cancelled`);
  if (original.cancelledByOrderId) throw new Error(`Order already cancelled`);

  const id = uuid();
  const title = reason || `Cancellation of order #${originalOrderId}`;

  const items = original.items.map((item) => ({
    ...item,
    qty: -item.qty,
    total: -item.total,
    vatAmount: -item.vatAmount,
  }));

  const totalGross = -original.totalGross;
  const totalNet = -original.totalNet;
  const totalVat: Record<number, number> = {};
  for (const [rate, amount] of Object.entries(original.totalVat)) {
    totalVat[Number(rate)] = -(amount as number);
  }

  const now = new Date().toISOString();

  const data: OrderCancellationCreatedEvent = {
    id,
    terminalId,
    title,
    cancelsOrderId: originalOrderId,
    items,
    totalGross,
    totalVat,
    totalNet,
    createdAt: now,
    closedAt: now,
  };
  await appendOrderEvent(STREAM(id), "OrderCancellationCreated", data as unknown as Record<string, unknown>);
  return id;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/orders/orders.commands.ts && git commit -m "refactor: update order commands to use order-eventstore, new cancellation model"
```

---

### Task 15: Update order projections

**Files:**
- Modify: `backend/src/modules/orders/orders.projections.ts`

- [ ] **Step 1: Replace `orders.projections.ts`**

```typescript
import { registerProjection } from "../../projections/runner";
import { Order, OrderItem, OrderStatus } from "./orders.types";

export const orders: Map<string, Order> = new Map();

export function initOrderProjections(): void {
  registerProjection("orders", "order", (event) => {
    switch (event.type) {
      case "OrderOpened": {
        const data = event.data;
        orders.set(data.id as string, {
          id: data.id as string,
          terminalId: data.terminalId as string,
          status: "open",
          items: [],
          pickupSeq: 0,
          totalGross: 0,
          totalVat: {},
          totalNet: 0,
          createdAt: new Date(),
        });
        break;
      }
      case "ItemAdded": {
        const data = event.data;
        const order = orders.get(data.orderId as string);
        if (order) {
          const existing = order.items.find(
            (i) => i.itemId === (data.itemId as string)
          );
          if (existing) {
            existing.qty += data.qty as number;
            existing.total += data.total as number;
            existing.vatAmount += data.vatAmount as number;
          } else {
            order.items.push({
              itemId: data.itemId as string,
              name: data.name as string,
              qty: data.qty as number,
              unitPrice: data.unitPrice as number,
              vatRate: data.vatRate as number,
              vatAmount: data.vatAmount as number,
              total: data.total as number,
            });
          }
        }
        break;
      }
      case "ItemRemoved": {
        const data = event.data;
        const order = orders.get(data.orderId as string);
        if (order) {
          order.items = order.items.filter(
            (i) => i.itemId !== (data.itemId as string)
          );
        }
        break;
      }
      case "PickupReceiptPrinted": {
        const order = orders.get(event.data.orderId as string);
        if (order) order.pickupSeq++;
        break;
      }
      case "OrderPaid": {
        const data = event.data;
        const order = orders.get(data.orderId as string);
        if (order) {
          order.status = "paid" as OrderStatus;
          order.totalGross = data.totalGross as number;
          order.totalVat = data.totalVat as Record<number, number>;
          order.totalNet = data.totalNet as number;
        }
        break;
      }
      case "OrderClosed": {
        const order = orders.get(event.data.orderId as string);
        if (order) {
          order.status = "closed" as OrderStatus;
          order.closedAt = new Date();
        }
        break;
      }
      case "OrderCancellationCreated": {
        const data = event.data;
        const order: Order = {
          id: data.id as string,
          terminalId: data.terminalId as string,
          status: "closed",
          items: (data.items as OrderItem[]).map((i) => ({
            ...i,
            qty: Number(i.qty),
            unitPrice: Number(i.unitPrice),
            vatRate: Number(i.vatRate),
            vatAmount: Number(i.vatAmount),
            total: Number(i.total),
          })),
          pickupSeq: 0,
          totalGross: data.totalGross as number,
          totalVat: data.totalVat as Record<number, number>,
          totalNet: data.totalNet as number,
          createdAt: new Date(data.createdAt as string),
          closedAt: new Date(data.closedAt as string),
          title: data.title as string,
          cancelsOrderId: data.cancelsOrderId as string,
        };
        orders.set(order.id, order);

        const original = orders.get(data.cancelsOrderId as string);
        if (original) {
          original.cancelledByOrderId = data.id as string;
        }
        break;
      }
    }
  });
}

export function getOpenOrdersByTerminal(terminalId: string): Order[] {
  const result: Order[] = [];
  for (const order of orders.values()) {
    if (order.terminalId === terminalId && order.status === "open") {
      result.push(order);
    }
  }
  return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/orders/orders.projections.ts && git commit -m "refactor: update order projections — remove userId, handle OrderCancellationCreated"
```

---

### Task 16: Update order routes for new cancellation and commands

**Files:**
- Modify: `backend/src/api/routes/orders.routes.ts`

- [ ] **Step 1: Replace `orders.routes.ts`**

```typescript
import { Router, Request, Response } from "express";
import {
  openOrder,
  addItemToOrder,
  removeItemFromOrder,
  printPickupReceipt,
  printFinalReceipt,
  payOrder,
  closeOrder,
  cancelOrder,
} from "../../modules/orders/orders.commands";
import { orders } from "../../modules/orders/orders.projections";
import { generatePickupReceiptPdf, generateFinalReceiptPdf } from "../../modules/receipts/receipts.pdf";
import { getItem } from "../../modules/catalog/catalog.repository";
import { getGroup } from "../../modules/catalog/catalog.repository";

const router = Router();

router.get("/", (req: Request, res: Response): void => {
  const terminalId = req.query.terminalId as string;
  const list = Array.from(orders.values()).filter(
    (o) => o.terminalId === terminalId
  );
  res.json(list);
});

router.post("/open", (req: Request, res: Response): void => {
  const { terminalId } = req.body;
  openOrder(terminalId).then((id) => res.json({ id }));
});

router.post("/:id/items", async (req: Request, res: Response): void => {
  const { itemId, qty } = req.body;
  try {
    const item = await getItem(itemId);
    if (!item) {
      res.status(404).json({ error: `Item ${itemId} not found` });
      return;
    }
    const group = await getGroup(item.groupId);
    const vatRate = group ? group.vatRate : 0;
    addItemToOrder(req.params.id, item.id, item.name, qty || 1, item.price, vatRate).then(() =>
      res.json({ status: "item added" })
    );
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/:id/items/:itemId", (req: Request, res: Response): void => {
  removeItemFromOrder(req.params.id, req.params.itemId).then(() =>
    res.json({ status: "item removed" })
  );
});

router.post("/:id/print-pickup", (req: Request, res: Response): void => {
  const { itemId } = req.body;
  printPickupReceipt(req.params.id, itemId).then(() => {
    const order = orders.get(req.params.id);
    generatePickupReceiptPdf(req.params.id, itemId, order?.pickupSeq ?? 1);
    res.json({ status: "printed" });
  });
});

router.post("/:id/print-final", (req: Request, res: Response): void => {
  printFinalReceipt(req.params.id).then(() => {
    generateFinalReceiptPdf(req.params.id);
    res.json({ status: "printed" });
  });
});

router.post("/:id/pay", (req: Request, res: Response): void => {
  payOrder(req.params.id).then(() => res.json({ status: "paid" }));
});

router.post("/:id/close", (req: Request, res: Response): void => {
  closeOrder(req.params.id).then(() => res.json({ status: "closed" }));
});

router.post("/:id/cancel", (req: Request, res: Response): void => {
  const { reason } = req.body;
  const order = orders.get(req.params.id);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  cancelOrder(req.params.id, order.terminalId, reason).then((cancellationId) =>
    res.json({ status: "cancelled", cancellationId })
  ).catch((err: Error) =>
    res.status(400).json({ error: err.message })
  );
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/api/routes/orders.routes.ts && git commit -m "refactor: update order routes — use catalog repository for item lookup, new cancel flow"
```

---

### Task 17: Update reporting types

**Files:**
- Modify: `backend/src/modules/reporting/reporting.types.ts`

- [ ] **Step 1: Replace `reporting.types.ts`**

```typescript
export interface DailyReport {
  date: string;
  orderCount: number;
  cancelledCount: number;
  totalGross: number;
  totalVat: number;
  totalNet: number;
  vatByGroup: Record<string, { rate: number; gross: number; vat: number }>;
  byTerminal: Record<string, { orderCount: number; total: number }>;
  topItems: { itemId: string; name: string; count: number }[];
}

export interface TransactionRecord {
  orderId: string;
  terminalId: string;
  items: string;
  itemCount: number;
  totalGross: number;
  totalVat: number;
  status: string;
  title?: string;
  cancelsOrderId?: string;
  closedAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/reporting/reporting.types.ts && git commit -m "refactor: update reporting types — remove userId/userName, add cancellation fields"
```

---

### Task 18: Update reporting projections

**Files:**
- Modify: `backend/src/modules/reporting/reporting.projections.ts`

- [ ] **Step 1: Replace `reporting.projections.ts`**

```typescript
import { registerProjection } from "../../projections/runner";
import { DailyReport, TransactionRecord } from "./reporting.types";
import { orders as ordersMap } from "../orders/orders.projections";

export const transactionHistory: TransactionRecord[] = [];
export const dailyReport: DailyReport = {
  date: new Date().toISOString().split("T")[0],
  orderCount: 0,
  cancelledCount: 0,
  totalGross: 0,
  totalVat: 0,
  totalNet: 0,
  vatByGroup: {},
  byTerminal: {},
  topItems: [],
};

const itemCounts: Map<string, { name: string; count: number }> = new Map();

export function initReportingProjections(): void {
  registerProjection("reporting", "order", (event) => {
    switch (event.type) {
      case "OrderClosed": {
        const orderId = event.data.orderId as string;
        const order = ordersMap.get(orderId);
        if (order && !order.cancelsOrderId) {
          const existingIdx = transactionHistory.findIndex((t) => t.orderId === orderId);
          if (existingIdx >= 0) {
            transactionHistory[existingIdx].status = "closed";
            transactionHistory[existingIdx].closedAt = new Date().toISOString();
          }
          dailyReport.orderCount++;
        }
        break;
      }
      case "OrderPaid": {
        const data = event.data;
        const orderId = data.orderId as string;
        const order = ordersMap.get(orderId);

        if (order) {
          const itemsText = order.items
            .map((i: { qty: number; name: string }) => `${i.qty}x ${i.name}`)
            .join(", ");

          const totalVat = Object.values(
            data.totalVat as Record<number, number>
          ).reduce((a: number, b: number) => a + b, 0);

          transactionHistory.push({
            orderId,
            terminalId: order.terminalId,
            items: itemsText,
            itemCount: order.items.length,
            totalGross: data.totalGross as number,
            totalVat,
            status: "paid",
            closedAt: new Date().toISOString(),
          });
        }
        break;
      }
      case "OrderCancellationCreated": {
        const data = event.data;
        const id = data.id as string;
        const cancelsOrderId = data.cancelsOrderId as string;
        const order = ordersMap.get(id);

        if (order) {
          const itemsText = order.items
            .map((i: { qty: number; name: string }) => `${i.qty}x ${i.name}`)
            .join(", ");

          transactionHistory.push({
            orderId: id,
            terminalId: order.terminalId,
            items: itemsText,
            itemCount: order.items.length,
            totalGross: order.totalGross,
            totalVat: Object.values(order.totalVat).reduce((a: number, b: number) => a + b, 0),
            status: "cancelled",
            title: data.title as string,
            cancelsOrderId,
            closedAt: new Date().toISOString(),
          });

          dailyReport.cancelledCount++;
        }
        break;
      }
      case "ItemAdded": {
        const name = event.data.name as string;
        const itemId = event.data.itemId as string;
        const existing = itemCounts.get(itemId);
        if (existing) {
          existing.count += event.data.qty as number;
        } else {
          itemCounts.set(itemId, { name, count: event.data.qty as number });
        }
        break;
      }
    }
  });
}

export function getDailyReport(date?: string): DailyReport {
  if (date) {
    dailyReport.date = date;
  }
  const topItems = Array.from(itemCounts.entries())
    .map(([itemId, { name, count }]) => ({ itemId, name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { ...dailyReport, topItems };
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/reporting/reporting.projections.ts && git commit -m "refactor: update reporting projections for cancellation-as-separate-order"
```

---

### Task 19: Update projections runner to use order-eventstore

**Files:**
- Modify: `backend/src/projections/runner.ts`

- [ ] **Step 1: Replace `projections/runner.ts`**

```typescript
import { replayOrderEvents, subscribeToOrderEvents } from "../modules/orders/order-eventstore";

type EventHandler = (
  event: { type: string; data: Record<string, unknown> },
  streamName: string
) => void | Promise<void>;

interface Subscription {
  name: string;
  prefix: string;
  handler: EventHandler;
}

const subscriptions: Subscription[] = [];

export function registerProjection(
  name: string,
  streamPrefix: string,
  handler: EventHandler
): void {
  subscriptions.push({ name, prefix: streamPrefix, handler });
}

export async function startProjections(): Promise<void> {
  if (subscriptions.length === 0) {
    console.log("No projections registered.");
    return;
  }

  console.log("Replaying order events...");
  await replayOrderEvents(async (event) => {
    const { streamId } = event;
    for (const sub of subscriptions) {
      if (streamId.startsWith(`${sub.prefix}-`)) {
        await sub.handler(event, streamId);
      }
    }
  });

  console.log(
    `Projections started: ${subscriptions.map((s) => s.name).join(", ")}`
  );

  subscribeToOrderEvents((event) => {
    const { streamId } = event;
    for (const sub of subscriptions) {
      if (streamId.startsWith(`${sub.prefix}-`)) {
        sub.handler(event, streamId);
      }
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/projections/runner.ts && git commit -m "refactor: update projections runner to use order-eventstore"
```

---

### Task 20: Update index.ts — init tables, remove old projections

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Replace `index.ts`**

```typescript
import express from "express";
import cors from "cors";
import { config } from "./config";
import { initTables } from "./db";
import { startProjections } from "./projections/runner";
import { initAuthProjections } from "./modules/auth/auth.projections";
import { initOrderProjections } from "./modules/orders/orders.projections";
import { initReportingProjections } from "./modules/reporting/reporting.projections";

import authRoutes from "./api/routes/auth.routes";
import catalogRoutes from "./api/routes/catalog.routes";
import ordersRoutes from "./api/routes/orders.routes";
import terminalsRoutes from "./api/routes/terminals.routes";
import reportingRoutes from "./api/routes/reporting.routes";
import companyRoutes from "./api/routes/company.routes";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/terminals", terminalsRoutes);
app.use("/api/reporting", reportingRoutes);
app.use("/api/company", companyRoutes);

initAuthProjections();
initOrderProjections();
initReportingProjections();

initTables().then(() => {
  startProjections().then(() => {
    app.listen(config.port, () => {
      console.log(`POS backend running on http://localhost:${config.port}`);
    });
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/index.ts && git commit -m "refactor: update index.ts — use initTables, remove old projections"
```

---

### Task 21: Update receipts PDF to use company repository

**Files:**
- Modify: `backend/src/modules/receipts/receipts.pdf.ts`

- [ ] **Step 1: Replace the import at line 5**

Change line 5 from:
```typescript
import { companySettings } from "../company/company.projections";
```
to:
```typescript
import { getCompanySettings } from "../company/company.repository";
```

- [ ] **Step 2: Make `generatePickupReceiptPdf` async for company settings**

Replace the function signature and first few lines of `generatePickupReceiptPdf`:

```typescript
export async function generatePickupReceiptPdf(
  orderId: string,
  itemId: string,
  pickupSeq: number
): Promise<string> {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const companySettings = await getCompanySettings();

  const item = order.items.find((i) => i.itemId === itemId);
  if (!item) throw new Error(`Item ${itemId} not found in order`);
```

- [ ] **Step 3: Make `generateFinalReceiptPdf` async for company settings**

Replace the function signature and first few lines of `generateFinalReceiptPdf`:

```typescript
export async function generateFinalReceiptPdf(
  orderId: string
): Promise<string> {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const companySettings = await getCompanySettings();

  const now = new Date().toLocaleString("de-DE");
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/receipts/receipts.pdf.ts && git commit -m "refactor: update receipt PDF to use company repository"
```

---

### Task 22: Remove old eventstore client

**Files:**
- Delete: `backend/src/eventstore/client.ts`

- [ ] **Step 1: Delete and commit**

```bash
rm backend/src/eventstore/client.ts && git add backend/src/eventstore/client.ts && git commit -m "refactor: remove old eventstore client"
```

---

### Task 23: Update backend tests

**Files:**
- Modify: `backend/src/__tests__/catalog.test.ts`
- Modify: `backend/src/__tests__/orders.test.ts`
- Modify: `backend/src/__tests__/api.test.ts`

- [ ] **Step 1: Replace `catalog.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("../../db", () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn(), on: vi.fn() }),
  }),
  initTables: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../config", () => ({
  config: {
    port: 3001,
    pg: { connectionString: "postgresql://test:test@localhost/test" },
    adminPin: "0000",
    receiptPdfDir: "/tmp/test",
  },
}));

import { listGroups, createGroup, listItems, createItem, deleteItem } from "../modules/catalog/catalog.repository";

const mockPool = (await vi.importMock("../../db")).getPool;

describe("Catalog Repository", () => {
  it("listGroups returns empty array when no rows", async () => {
    const result = await listGroups();
    expect(result).toEqual([]);
  });

  it("createGroup returns an id", async () => {
    const id = await createGroup("Hot Drinks", 19);
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("listItems returns empty array when no rows", async () => {
    const result = await listItems();
    expect(result).toEqual([]);
  });

  it("createItem returns an id", async () => {
    const id = await createItem("Espresso", "g1", 2.50);
    expect(id).toBeTruthy();
  });

  it("deleteItem does not throw", async () => {
    await expect(deleteItem("i1")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Replace `orders.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("../modules/orders/order-eventstore", () => ({
  appendOrderEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../db", () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn(), on: vi.fn() }),
  }),
  initTables: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../config", () => ({
  config: {
    port: 3001,
    pg: { connectionString: "postgresql://test:test@localhost/test" },
    adminPin: "0000",
    receiptPdfDir: "/tmp/test",
  },
}));

vi.mock("../projections/runner", () => ({
  registerProjection: vi.fn(),
  startProjections: vi.fn().mockResolvedValue(undefined),
}));

import { openOrder, cancelOrder } from "../modules/orders/orders.commands";
import {
  orders,
  initOrderProjections,
  getOpenOrdersByTerminal,
} from "../modules/orders/orders.projections";
import { registerProjection } from "../projections/runner";
import { appendOrderEvent } from "../modules/orders/order-eventstore";

describe("Orders Commands", () => {
  it("opens an order with OrderOpened event", async () => {
    const id = await openOrder("terminal-1");
    expect(id).toBeTruthy();
    expect(vi.mocked(appendOrderEvent)).toHaveBeenCalledWith(
      expect.stringContaining("order-"),
      "OrderOpened",
      expect.objectContaining({ terminalId: "terminal-1" })
    );
  });
});

describe("Orders Projections", () => {
  it("processes full order lifecycle: open → add → pay → close", () => {
    orders.clear();
    initOrderProjections();
    const handler = vi.mocked(registerProjection).mock.calls[0][2];

    handler({ type: "OrderOpened", data: { id: "o1", terminalId: "t1" } }, "order-o1");
    expect(orders.get("o1")!.status).toBe("open");

    handler({ type: "ItemAdded", data: { orderId: "o1", itemId: "i1", name: "Espresso", qty: 1, unitPrice: 2.50, vatRate: 19, vatAmount: 0.40, total: 2.50 } }, "order-o1");
    expect(orders.get("o1")!.items).toHaveLength(1);

    handler({ type: "OrderPaid", data: { orderId: "o1", totalGross: 2.50, totalVat: { "19": 0.40 }, totalNet: 2.10 } }, "order-o1");
    expect(orders.get("o1")!.status).toBe("paid");
    expect(orders.get("o1")!.totalGross).toBe(2.50);

    handler({ type: "OrderClosed", data: { orderId: "o1" } }, "order-o1");
    expect(orders.get("o1")!.status).toBe("closed");
  });

  it("OrderCancellationCreated creates cancellation order and links original", () => {
    orders.clear();
    initOrderProjections();
    const handler = vi.mocked(registerProjection).mock.calls[0][2];

    handler({ type: "OrderOpened", data: { id: "o1", terminalId: "t1" } }, "order-o1");
    handler({ type: "OrderClosed", data: { orderId: "o1" } }, "order-o1");

    handler({
      type: "OrderCancellationCreated",
      data: {
        id: "c1", terminalId: "t1", title: "Cancellation of order #o1",
        cancelsOrderId: "o1",
        items: [{ itemId: "i1", name: "Espresso", qty: -1, unitPrice: 2.50, vatRate: 19, vatAmount: -0.40, total: -2.50 }],
        totalGross: -2.50, totalVat: { "19": -0.40 }, totalNet: -2.10,
        createdAt: new Date().toISOString(), closedAt: new Date().toISOString(),
      }
    }, "order-c1");

    const cancellation = orders.get("c1")!;
    expect(cancellation.status).toBe("closed");
    expect(cancellation.title).toBe("Cancellation of order #o1");
    expect(cancellation.cancelsOrderId).toBe("o1");
    expect(cancellation.totalGross).toBe(-2.50);

    const original = orders.get("o1")!;
    expect(original.cancelledByOrderId).toBe("c1");
  });

  it("getOpenOrdersByTerminal filters by terminal and status", () => {
    orders.clear();
    initOrderProjections();
    const handler = vi.mocked(registerProjection).mock.calls[0][2];

    handler({ type: "OrderOpened", data: { id: "o1", terminalId: "bar" } }, "order-o1");
    handler({ type: "OrderOpened", data: { id: "o2", terminalId: "kitchen" } }, "order-o2");
    handler({ type: "OrderClosed", data: { orderId: "o2" } }, "order-o2");

    const barOrders = getOpenOrdersByTerminal("bar");
    expect(barOrders).toHaveLength(1);
    expect(barOrders[0].id).toBe("o1");
  });
});
```

- [ ] **Step 3: Replace `api.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../db", () => ({
  getPool: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn(), on: vi.fn() }),
  }),
  initTables: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../modules/orders/order-eventstore", () => ({
  appendOrderEvent: vi.fn().mockResolvedValue(undefined),
  readOrderStream: vi.fn().mockResolvedValue([]),
  subscribeToOrderEvents: vi.fn(),
  replayOrderEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../projections/runner", () => ({
  registerProjection: vi.fn(),
  startProjections: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../config", () => ({
  config: {
    pg: { connectionString: "postgresql://test:test@localhost/test" },
    adminPin: "0000",
    receiptPdfDir: "/tmp/test",
  },
}));

const app = express();
app.use(express.json());

import authRoutes from "../api/routes/auth.routes";
import terminalsRoutes from "../api/routes/terminals.routes";
import companyRoutes from "../api/routes/company.routes";

app.use("/api/auth", authRoutes);
app.use("/api/terminals", terminalsRoutes);
app.use("/api/company", companyRoutes);

describe("Auth Routes", () => {
  it("POST /api/auth/login with correct PIN returns admin role", async () => {
    const res = await request(app).post("/api/auth/login").send({ pin: "0000" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
  });

  it("POST /api/auth/login with wrong PIN returns 401", async () => {
    const res = await request(app).post("/api/auth/login").send({ pin: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid PIN");
  });

  it("POST /api/auth/login with short PIN returns 400", async () => {
    const res = await request(app).post("/api/auth/login").send({ pin: "12" });
    expect(res.status).toBe(400);
  });
});

describe("Terminals Routes", () => {
  it("GET /api/terminals returns terminal list (public)", async () => {
    const res = await request(app).get("/api/terminals");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/terminals without admin PIN returns 403", async () => {
    const res = await request(app).post("/api/terminals").send({ name: "Test" });
    expect(res.status).toBe(403);
  });

  it("POST /api/terminals with admin PIN creates terminal", async () => {
    const res = await request(app)
      .post("/api/terminals")
      .set("x-admin-pin", "0000")
      .send({ name: "Bar", groupIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
  });
});

describe("Company Routes", () => {
  it("GET /api/company returns company settings (public)", async () => {
    const res = await request(app).get("/api/company");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("name");
  });

  it("PUT /api/company without admin PIN returns 403", async () => {
    const res = await request(app).put("/api/company").send({ name: "Test" });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 4: Run tests to verify**

```bash
cd backend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/__tests__/ && git commit -m "test: update tests for hybrid data model"
```

---

### Task 24: Verify the build compiles

**Files:** none

- [ ] **Step 1: Run TypeScript compiler**

```bash
cd backend && npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 2: Fix any issues and commit if needed**

```bash
git add -A && git commit -m "fix: resolve TypeScript compilation errors"
```
```

---

### Task 25: Update frontend TransactionHistory for cancellation orders

**Files:**
- Modify: `frontend/src/components/TransactionHistory.tsx`

- [ ] **Step 1: Replace `TransactionHistory.tsx`**

```tsx
import { useState, useEffect } from "react";
import { api } from "../api/client";

interface Transaction {
  orderId: string;
  terminalId: string;
  items: string;
  totalGross: number;
  status: string;
  title?: string;
  cancelsOrderId?: string;
  closedAt: string;
}

function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [terminal, setTerminal] = useState("");

  const load = () => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (search) params.set("search", search);
    if (terminal) params.set("terminal", terminal);
    api.get<Transaction[]>(`/reporting/transactions?${params}`).then(setTransactions);
  };

  useEffect(() => { load(); }, [status, search, terminal]);

  return (
    <div>
      <h2 className="text-white text-xl font-bold mb-4">Transactions</h2>

      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 bg-gray-800 text-white rounded px-3 py-2 text-sm border border-gray-700"
          placeholder="Search by order ID or item..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="bg-gray-800 text-white rounded px-3 py-2 text-sm border border-gray-700"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input
          className="bg-gray-800 text-white rounded px-3 py-2 text-sm border border-gray-700 w-32"
          placeholder="Terminal"
          value={terminal}
          onChange={(e) => setTerminal(e.target.value)}
        />
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-gray-700">
            <th className="text-left py-2">Order #</th>
            <th className="text-left py-2">Terminal</th>
            <th className="text-left py-2">Items</th>
            <th className="text-right py-2">Total</th>
            <th className="text-left py-2">Status</th>
            <th className="text-left py-2">Title</th>
            <th className="text-left py-2">Closed</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr
              key={t.orderId}
              className={`border-b border-gray-800 ${
                t.status === "cancelled" ? "line-through text-red-400" : "text-white"
              }`}
            >
              <td className="py-2">{t.orderId.slice(0, 8)}</td>
              <td className="py-2 text-gray-400">{t.terminalId}</td>
              <td className="py-2">{t.items}</td>
              <td className="py-2 text-right">{t.totalGross.toFixed(2)}€</td>
              <td className="py-2">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    t.status === "cancelled"
                      ? "bg-red-600 text-white"
                      : "bg-green-600 text-white"
                  }`}
                >
                  {t.status}
                </span>
              </td>
              <td className="py-2 text-gray-500 text-xs">
                {t.title || (t.cancelsOrderId ? `Cancels #${t.cancelsOrderId.slice(0, 8)}` : "")}
              </td>
              <td className="py-2 text-gray-500 text-xs">
                {t.closedAt ? new Date(t.closedAt).toLocaleTimeString("de-DE") : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {transactions.length === 0 && (
        <div className="text-gray-500 text-center py-8">No transactions found</div>
      )}
    </div>
  );
}

export default TransactionHistory;
```

- [ ] **Step 2: Verify frontend compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TransactionHistory.tsx && git commit -m "feat: update transaction history for cancellation-as-separate-order"
```
```

---

### Task 26: Update frontend CatalogManager — remove archived concept

**Files:**
- Modify: `frontend/src/components/CatalogManager.tsx`

- [ ] **Step 1: Replace `CatalogManager.tsx`**

```tsx
import { useState, useEffect } from "react";
import { api } from "../api/client";

interface ItemGroup {
  id: string;
  name: string;
  vatRate: number;
}

interface Item {
  id: string;
  name: string;
  groupId: string;
  price: number;
}

interface Props {
  type: "groups" | "items";
}

function CatalogManager({ type }: Props) {
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<ItemGroup[]>("/catalog/groups"),
      api.get<Item[]>("/catalog/items"),
    ]).then(([g, i]) => {
      setGroups(g);
      setItems(i);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const [form, setForm] = useState({
    name: "",
    vatRate: "19",
    price: "",
    groupId: "",
  });

  if (loading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <h2 className="text-white text-xl font-bold mb-4">
        {type === "groups" ? "Item Groups" : "Items"}
      </h2>

      {type === "groups" && (
        <>
          <div className="bg-gray-800 rounded-xl p-4 mb-4">
            <div className="grid grid-cols-4 gap-2">
              <input
                className="bg-gray-700 text-white rounded px-3 py-2 text-sm col-span-2"
                placeholder="Group name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
                placeholder="VAT %"
                type="number"
                value={form.vatRate}
                onChange={(e) => setForm({ ...form, vatRate: e.target.value })}
              />
              <button
                onClick={async () => {
                  await api.post("/catalog/groups", {
                    name: form.name,
                    vatRate: parseFloat(form.vatRate),
                  });
                  setForm({ ...form, name: "", vatRate: "19" });
                  load();
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-2 text-sm"
              >
                Add
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2">Name</th>
                <th className="text-right py-2">VAT</th>
                <th className="text-right py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className="border-b border-gray-800">
                  <td className="text-white py-2">{g.name}</td>
                  <td className="text-white text-right py-2">{g.vatRate}%</td>
                  <td className="text-right py-2">
                    <button
                      onClick={() => api.delete(`/catalog/groups/${g.id}`).then(load)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {type === "items" && (
        <>
          <div className="bg-gray-800 rounded-xl p-4 mb-4">
            <div className="grid grid-cols-4 gap-2">
              <input
                className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
                placeholder="Item name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <select
                className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
                value={form.groupId}
                onChange={(e) => setForm({ ...form, groupId: e.target.value })}
              >
                <option value="">Select group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <input
                className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
                placeholder="Price"
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
              <button
                onClick={async () => {
                  await api.post("/catalog/items", {
                    name: form.name,
                    groupId: form.groupId,
                    price: parseFloat(form.price),
                  });
                  setForm({ ...form, name: "", groupId: "", price: "" });
                  load();
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-2 text-sm"
                disabled={!form.groupId}
              >
                Add
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Group</th>
                <th className="text-right py-2">Price</th>
                <th className="text-right py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-gray-800">
                  <td className="text-white py-2">{item.name}</td>
                  <td className="text-gray-400 py-2">
                    {groups.find((g) => g.id === item.groupId)?.name ?? ""}
                  </td>
                  <td className="text-white text-right py-2">
                    {item.price.toFixed(2)}€
                  </td>
                  <td className="text-right py-2">
                    <button
                      onClick={() => api.delete(`/catalog/items/${item.id}`).then(load)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default CatalogManager;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/CatalogManager.tsx && git commit -m "refactor: remove archived concept from CatalogManager, use hard delete"
```

---

### Task 27: Update frontend TerminalConfig — remove archived concept

**Files:**
- Modify: `frontend/src/components/TerminalConfig.tsx`

- [ ] **Step 1: Replace `TerminalConfig.tsx`**

```tsx
import { useState, useEffect } from "react";
import { api } from "../api/client";

interface Terminal {
  id: string;
  name: string;
  groupIds: string[];
}

interface ItemGroup {
  id: string;
  name: string;
}

function TerminalConfig() {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [form, setForm] = useState({ name: "", groupIds: [] as string[] });

  const load = () => {
    api.get<Terminal[]>("/terminals").then(setTerminals);
    api.get<ItemGroup[]>("/catalog/groups").then(setGroups);
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <h2 className="text-white text-xl font-bold mb-4">Terminals</h2>

      <div className="bg-gray-800 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-3 gap-2">
          <input
            className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
            placeholder="Terminal name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="flex flex-wrap gap-1">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() =>
                  setForm({
                    ...form,
                    groupIds: form.groupIds.includes(g.id)
                      ? form.groupIds.filter((id) => id !== g.id)
                      : [...form.groupIds, g.id],
                  })
                }
                className={`px-2 py-1 rounded text-xs ${
                  form.groupIds.includes(g.id)
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300"
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
          <button
            onClick={async () => {
              await api.post("/terminals", {
                name: form.name,
                groupIds: form.groupIds,
              });
              setForm({ name: "", groupIds: [] });
              load();
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-2 text-sm"
          >
            Add
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {terminals.map((t) => (
          <div
            key={t.id}
            className="bg-gray-800 rounded-xl p-4 flex items-center justify-between"
          >
            <div>
              <div className="text-white font-medium">{t.name}</div>
              <div className="text-gray-400 text-xs mt-1">
                Groups:{" "}
                {t.groupIds
                  .map((gid) => groups.find((g) => g.id === gid)?.name ?? "")
                  .join(", ")}
              </div>
            </div>
            <button
              onClick={() => api.delete(`/terminals/${t.id}`).then(load)}
              className="text-red-400 hover:text-red-300 text-sm"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TerminalConfig;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TerminalConfig.tsx && git commit -m "refactor: remove archived concept from TerminalConfig, use hard delete"
```

---

### Task 28: Update frontend test data — remove archived, userName, reason

**Files:**
- Modify: `frontend/src/tests/Admin.test.tsx`

- [ ] **Step 1: Replace `Admin.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CatalogManager from "../components/CatalogManager";
import AdminLayout from "../views/AdminLayout";
import TransactionHistory from "../components/TransactionHistory";
import DailyOverview from "../components/DailyOverview";

vi.mock("../api/client", () => ({
  api: {
    get: vi.fn((_path: string) => {
      if (_path === "/reporting/daily") {
        return Promise.resolve({
          date: "2026-05-13", orderCount: 0, cancelledCount: 0,
          totalGross: 0, totalVat: 0, totalNet: 0,
          vatByGroup: {}, byTerminal: {}, topItems: [],
        });
      }
      return Promise.resolve([]);
    }),
    post: vi.fn().mockResolvedValue({ id: "new-id" }),
    put: vi.fn().mockResolvedValue({ status: "updated" }),
    delete: vi.fn().mockResolvedValue({ status: "deleted" }),
    clearAdminPin: vi.fn(),
  },
}));

import { api } from "../api/client";

describe("CatalogManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows group list with VAT rates", async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: "g1", name: "Hot Drinks", vatRate: 19 },
      { id: "g2", name: "Food", vatRate: 7 },
    ]);
    render(<CatalogManager type="groups" />);
    await waitFor(() => {
      expect(screen.getByText("Hot Drinks")).toBeInTheDocument();
      expect(screen.getByText("19%")).toBeInTheDocument();
    });
  });

  it("shows item list with group names and prices", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([
      { id: "g1", name: "Hot Drinks", vatRate: 19 },
    ]);
    vi.mocked(api.get).mockResolvedValueOnce([
      { id: "i1", name: "Espresso", groupId: "g1", price: 2.50 },
    ]);
    render(<CatalogManager type="items" />);
    await waitFor(() => {
      expect(screen.getByText("Espresso")).toBeInTheDocument();
      expect(screen.getByText("2.50€")).toBeInTheDocument();
    });
  });

  it("Delete button calls DELETE", async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: "g1", name: "Drinks", vatRate: 19 },
    ]);
    render(<CatalogManager type="groups" />);
    await waitFor(() => screen.getByText("Drinks"));

    fireEvent.click(screen.getByText("Delete"));
    expect(api.delete).toHaveBeenCalledWith("/catalog/groups/g1");
  });
});

describe("AdminLayout", () => {
  it("renders all navigation tabs", () => {
    render(<AdminLayout onLogout={vi.fn()} />);
    expect(screen.getByText("Item Groups")).toBeInTheDocument();
    expect(screen.getByText("Items")).toBeInTheDocument();
    expect(screen.getByText("Terminals")).toBeInTheDocument();
    expect(screen.getByText("Company")).toBeInTheDocument();
    expect(screen.getByText("Daily Overview")).toBeInTheDocument();
    expect(screen.getByText("Transactions")).toBeInTheDocument();
  });

  it("no longer has Users tab", () => {
    render(<AdminLayout onLogout={vi.fn()} />);
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
  });

  it("Logout button is present", () => {
    render(<AdminLayout onLogout={vi.fn()} />);
    expect(screen.getByText("Logout")).toBeInTheDocument();
  });

  it("calls onLogout when logout clicked", () => {
    const onLogout = vi.fn();
    render(<AdminLayout onLogout={onLogout} />);
    fireEvent.click(screen.getByText("Logout"));
    expect(onLogout).toHaveBeenCalled();
  });
});

describe("TransactionHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows closed and cancelled orders with status badges", async () => {
    vi.mocked(api.get).mockResolvedValue([
      { orderId: "abc12345-1234", terminalId: "Bar", items: "1x Espresso", totalGross: 2.50, status: "closed", closedAt: "2026-01-01T12:00:00Z" },
      { orderId: "def67890-5678", terminalId: "Bar", items: "2x Latte", totalGross: -7.00, status: "cancelled", title: "Cancellation of order #abc12345", closedAt: "2026-01-01T12:05:00Z" },
    ]);

    render(<TransactionHistory />);
    await waitFor(() => {
      expect(screen.getByText("closed")).toBeInTheDocument();
      expect(screen.getByText("cancelled")).toBeInTheDocument();
      expect(screen.getByText("Cancellation of order #abc12345")).toBeInTheDocument();
    });
  });

  it("has search and filter inputs", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    render(<TransactionHistory />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search by order ID or item...")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Terminal")).toBeInTheDocument();
    });
  });

  it("shows empty state when no transactions", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    render(<TransactionHistory />);
    await waitFor(() => {
      expect(screen.getByText("No transactions found")).toBeInTheDocument();
    });
  });
});

describe("DailyOverview", () => {
  it("shows summary cards and breakdown", async () => {
    vi.mocked(api.get).mockResolvedValue({
      date: "2026-05-13",
      orderCount: 47,
      cancelledCount: 2,
      totalGross: 873.50,
      totalVat: 112.30,
      totalNet: 761.20,
      vatByGroup: { "g1": { rate: 19, gross: 500, vat: 79.83 } },
      byTerminal: { "Bar": { orderCount: 30, total: 500 } },
      topItems: [{ itemId: "i1", name: "Espresso", count: 45 }],
    });

    render(<DailyOverview />);
    await waitFor(() => {
      expect(screen.getByText("47")).toBeInTheDocument();
      expect(screen.getByText("873.50€")).toBeInTheDocument();
      expect(screen.getByText("Top Items")).toBeInTheDocument();
      expect(screen.getByText(/Espresso/)).toBeInTheDocument();
    });
  });

  it("shows cancelled order warning when count > 0", async () => {
    vi.mocked(api.get).mockResolvedValue({
      date: "2026-05-13",
      orderCount: 10,
      cancelledCount: 3,
      totalGross: 100,
      totalVat: 10,
      totalNet: 90,
      vatByGroup: {},
      byTerminal: {},
      topItems: [],
    });

    render(<DailyOverview />);
    await waitFor(() => {
      expect(screen.getByText(/3 cancelled order/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/tests/Admin.test.tsx && git commit -m "test: update frontend tests for hard-delete model and new cancellation fields"
```

---

### Task 29: Update frontend API client — remove archived status expectation

**Files:**
- Modify: `frontend/src/tests/Admin.test.tsx` (already handled in Task 28)

- [ ] **Step 1: Verify frontend compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Fix any issues and commit**

```bash
git add -A && git commit -m "fix: resolve frontend TypeScript and test issues"
```

---

### Task 30: E2E test — manual verification

**Files:** none

- [ ] **Step 1: Start the system**

```bash
./start.sh
```

- [ ] **Step 2: Create test order via curl**

```bash
# Create terminals
curl -s -X POST http://localhost:3001/api/terminals \
  -H "Content-Type: application/json" \
  -H "x-admin-pin: 0000" \
  -d '{"name":"Bar","groupIds":[]}'
```

```bash
# Create group and item
curl -s -X POST http://localhost:3001/api/catalog/groups \
  -H "Content-Type: application/json" \
  -H "x-admin-pin: 0000" \
  -d '{"name":"Drinks","vatRate":19}'
```

```bash
# Open, add item, pay, close
curl -s -X POST http://localhost:3001/api/orders/open \
  -H "Content-Type: application/json" \
  -d '{"terminalId":"<terminal-id>"}'
```

Verify all commands work through the full lifecycle including cancellation.

- [ ] **Step 3: Stop the system and commit any fixes**

---

### Task 31: Final verification

- [ ] **Step 1: Run all tests**

```bash
cd backend && npx vitest run && cd ..
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend && npx vitest run && cd ..
```

Expected: all tests pass.

- [ ] **Step 3: Verify TypeScript compiles for both projects**

```bash
cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit && cd ..
```

Expected: no errors.
