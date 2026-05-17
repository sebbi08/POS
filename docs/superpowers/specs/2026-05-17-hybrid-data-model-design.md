# Hybrid Data Model — Design Specification

**Date:** 2026-05-17
**Status:** Pending review

## Overview

Refactor the POS system from fully event-sourced to a hybrid model: orders remain event-sourced (immutable, append-only) while all other entities (catalog, terminals, company settings) move to a standard mutable SQL model with hard delete support.

---

## 1. Motivation

- **Orders are transactional records** — they represent financial events that should never be silently mutated. Event sourcing provides a natural audit trail and ensures historical accuracy of receipts.
- **Catalog, terminals, and company settings are configuration** — they change over time and don't require an audit trail. Standard CRUD is simpler to reason about, easier to query, and avoids the overhead of projections for configuration data.
- **Cancellation as a separate order** — aligns with accounting practices where a credit note (Stornorechnung) is a distinct document, not a mutation of the original.

---

## 2. Database Schema

### 2.1 Order Events Table (immutable, append-only)

Replaces the generic `events` table. Only order events live here.

```sql
CREATE TABLE order_events (
    id BIGSERIAL PRIMARY KEY,
    stream_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_events_stream ON order_events(stream_id, created_at);
```

### 2.2 Item Groups

```sql
CREATE TABLE item_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    vat_rate NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.3 Items

```sql
CREATE TABLE items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    group_id TEXT NOT NULL REFERENCES item_groups(id) ON DELETE CASCADE,
    price NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`ON DELETE CASCADE`: deleting a group deletes all its items.

### 2.4 Terminals

```sql
CREATE TABLE terminals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    group_ids TEXT[] NOT NULL DEFAULT '{}',
    printer_vendor_id INTEGER,
    printer_product_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.5 Company Settings

Singleton row enforced by `CHECK` constraint.

```sql
CREATE TABLE company_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    vat_id TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. Order Domain Model

### 3.1 Types

```typescript
type OrderStatus = "open" | "paid" | "closed";

interface OrderItem {
  itemId: string;
  name: string;         // snapshotted at add time
  qty: number;
  unitPrice: number;    // snapshotted at add time
  vatRate: number;      // snapshotted at add time
  vatAmount: number;
  total: number;
}

interface Order {
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
  title?: string;                 // description field, used for cancellation orders
  cancelsOrderId?: string;       // set on cancellation order → points to original
  cancelledByOrderId?: string;   // set on original order → points to cancellation
}
```

### 3.2 Changes from current model

| Old | New |
|-----|-----|
| `userId` field | Removed (always same as terminalId, unused) |
| `status` includes `"cancelled"` | `status` is only `"open"`, `"paid"`, `"closed"` |
| `cancelledReason` | Replaced by `title` on the cancellation order |
| `OrderCancelled` event | Replaced by `OrderCancellationCreated` |

### 3.3 Event Types

**Kept:**
- `OrderOpened`
- `ItemAdded`
- `ItemRemoved`
- `PickupReceiptPrinted`
- `FinalReceiptPrinted`
- `OrderPaid`
- `OrderClosed`

**New:**
- `OrderCancellationCreated` — atomic event for cancellation orders

**Removed:**
- `OrderCancelled`

### 3.4 OrderCancellationCreated Event

```typescript
interface OrderCancellationCreatedData {
  id: string;                    // new order ID for the cancellation
  terminalId: string;           // same terminal as original
  title: string;                // "Cancellation of order #<originalId>"
  cancelsOrderId: string;       // original order ID
  items: OrderItem[];           // all items negated
  totalGross: number;           // negated
  totalVat: Record<number, number>;  // negated
  totalNet: number;             // negated
  createdAt: string;
  closedAt: string;
}
```

### 3.5 Order Lifecycle

```
Regular order:
  OrderOpened → [ItemAdded | ItemRemoved]* →
  [PickupReceiptPrinted]* → FinalReceiptPrinted →
  OrderPaid → OrderClosed

Cancellation (atomic, created already closed):
  OrderCancellationCreated
```

---

## 4. Cancellation Flow

### 4.1 API Endpoint

```
POST /api/orders/:originalId/cancel
Body: { reason?: string }
```

### 4.2 Logic

1. Look up original order from order projection
2. Validate: order exists, status is `"closed"`, `cancelledByOrderId` is not already set
3. Generate new UUID for cancellation order
4. Build `OrderCancellationCreated` event:
   - All items from original, negated (`qty`, `unitPrice`, `vatAmount`, `total`)
   - `title`: `"Cancellation of order #${originalId}"` (or `reason` if provided)
   - `cancelsOrderId`: `originalId`
   - `status`: `"closed"`
5. Append event with `stream_id = "order-${cancellationId}"`
6. Projection handler:
   - Builds the cancellation order with negated values
   - Sets `cancelledByOrderId` on the original order

### 4.3 Constraints

- Only `"closed"` orders can be cancelled
- Each order can be cancelled at most once
- Cancellation of a cancellation order is not allowed
- Cancellation orders never appear as `"open"` in POS terminals

---

## 5. Non-Order Entities — Standard CRUD

### 5.1 Architecture

No event sourcing for catalog, terminals, company settings. Each module gets a repository layer that directly queries/updates the corresponding SQL table. No projections.

### 5.2 Catalog

| Operation | SQL |
|-----------|-----|
| List groups | `SELECT * FROM item_groups ORDER BY name` |
| Create group | `INSERT INTO item_groups (id, name, vat_rate) VALUES (...)` |
| Update group | `UPDATE item_groups SET name=?, vat_rate=?, updated_at=NOW() WHERE id=?` |
| Delete group | `DELETE FROM item_groups WHERE id=?` (cascades to items) |
| List items | `SELECT * FROM items ORDER BY name` |
| Create item | `INSERT INTO items (id, name, group_id, price) VALUES (...)` |
| Update item | `UPDATE items SET name=?, group_id=?, price=?, updated_at=NOW() WHERE id=?` |
| Delete item | `DELETE FROM items WHERE id=?` |

### 5.3 Terminals

| Operation | SQL |
|-----------|-----|
| List terminals | `SELECT * FROM terminals ORDER BY name` |
| Create terminal | `INSERT INTO terminals (...) VALUES (...)` |
| Update terminal | `UPDATE terminals SET ..., updated_at=NOW() WHERE id=?` |
| Delete terminal | `DELETE FROM terminals WHERE id=?` |
| Get terminal items | `SELECT i.* FROM items i JOIN terminals t ON i.group_id = ANY(t.group_ids) WHERE t.id=?` |

### 5.4 Company Settings

| Operation | SQL |
|-----------|-----|
| Get | `SELECT * FROM company_settings WHERE id=1` |
| Update | `INSERT INTO company_settings (id, name, address, city, vat_id) VALUES (1, ...) ON CONFLICT (id) DO UPDATE SET ...` |

### 5.5 Files to remove

- `backend/src/modules/catalog/catalog.projections.ts`
- `backend/src/modules/terminals/terminals.projections.ts`
- `backend/src/modules/company/company.projections.ts`
- `backend/src/eventstore/client.ts` (replaced by order-specific event store + db pool)

### 5.6 Files to modify

- `backend/src/modules/catalog/catalog.commands.ts` → becomes `catalog.repository.ts` (direct SQL)
- `backend/src/modules/terminals/terminals.commands.ts` → becomes `terminals.repository.ts` (direct SQL)
- `backend/src/modules/company/company.commands.ts` → becomes `company.repository.ts` (direct SQL)
- `backend/src/modules/catalog/catalog.types.ts` → remove `archived` field
- `backend/src/modules/terminals/terminals.types.ts` → remove `archived` field
- `backend/src/api/routes/catalog.routes.ts` → use repository instead of projection Maps
- `backend/src/api/routes/terminals.routes.ts` → use repository instead of projection Maps
- `backend/src/api/routes/company.routes.ts` → use repository instead of projection Maps
- `backend/src/projections/runner.ts` → replay only from `order_events` table
- `backend/src/index.ts` → register only order projections

### 5.7 Files to create

- `backend/src/db.ts` — shared database pool, migrated from eventstore client
- `backend/src/modules/orders/order-eventstore.ts` — order-specific event store (append, read stream, replay all)
- `backend/src/modules/catalog/catalog.repository.ts`
- `backend/src/modules/terminals/terminals.repository.ts`
- `backend/src/modules/company/company.repository.ts`

---

## 6. Reporting

### 6.1 Changes

Reporting projections (`reporting.projections.ts`) continue to consume order events. They now also handle `OrderCancellationCreated` events.

### 6.2 Daily Overview

- Cancellation orders are shown flagged. Their negated amounts offset the original orders, producing net-zero revenue for cancelled transactions.
- `orderCount`: includes both original and cancellation orders
- `cancelledCount`: counts cancellation orders only
- `totalGross` / `totalVat` / `totalNet`: sum of all orders (originals + cancellations), so cancelled pairs net to zero
- VAT breakdown: uses summed values across all orders

### 6.3 Transaction History

- Both original and cancellation orders appear as separate rows
- Cancellation rows are flagged visually (strikethrough, negative amounts)
- Cancellation rows show the `title` field (e.g., "Cancellation of order #abc123")

---

## 7. Migration Strategy

### 7.1 Database

1. Create new tables: `item_groups`, `items`, `terminals`, `company_settings`
2. Migrate data from events to new tables by replaying current events
3. Create `order_events` table with same schema as `events`
4. Copy order-specific events from `events` to `order_events`
5. After verification, drop the `events` table

### 7.2 Code

1. Create new repository files for non-order modules
2. Create order-specific event store
3. Update API routes to use repositories
4. Remove projections for non-order modules
5. Update projections runner to only handle order events
6. Update types (remove `archived`, `userId`, `cancelledReason`)
7. Update frontend accordingly

### 7.3 Frontend Impact

- Catalog: no change (API responses stay the same shape)
- Terminals: no change
- Company: no change
- Orders: minimal change — cancellation orders appear in history with negative values
- Transaction history: visual update to show cancellation orders with `title`

---

## 8. Testing Strategy

- Update existing backend tests to work with new SQL tables instead of event-sourced catalog/terminals
- Add tests for cancellation-as-separate-order flow
- Add tests for hard delete behavior
- Add tests for `ON DELETE CASCADE` on item groups
- Update E2E tests if frontend flows change
- Verify reporting calculations with cancellation orders

---

## 9. Non-Requirements / Out of Scope

- Inventory tracking
- Payment gateway integration
- Discounts / coupons
- Table management
- Multi-language support
- Email receipts
- Migration of historical `events` table content (manual migration acceptable)
