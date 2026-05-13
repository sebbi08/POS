# POS System — Design Specification

**Date:** 2026-05-12
**Status:** Approved

## Overview

A multi-user, event-sourced Point of Sale (POS) system for restaurant/cafe use. Multiple terminals with different item sets operate in separate sessions. All state changes are immutable events stored in PostgreSQL (events table + LISTEN/NOTIFY for real-time projections). The system has an admin panel for configuration and a POS terminal for order taking.

---

## 1. Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + TypeScript + Express |
| Frontend | React + Tailwind CSS (single SPA with role-based routing) |
| Event Store | PostgreSQL (events table + LISTEN/NOTIFY) |
| Receipt Printing | ESC/POS via WebUSB (browser) + PDF archive (server) |
| PDF Generation | pdfmake or jspdf |

---

## 2. Architecture: Modular Monolith

A single Node.js backend with clear module boundaries. Each module owns its streams in EventStoreDB and maintains its own projections. The frontend is a single React SPA with role-based views (POS Terminal, Admin Panel, Login).

### 2.1 Backend Modules

| Module | Responsibility |
|--------|---------------|
| `catalog` | CRUD for item groups & items → writes events. Catalog projections. |
| `auth` | Admin PIN validation (stateless, no user management) |
| `orders` | Order lifecycle (open → add items → pay/close/cancel). Order projections. |
| `receipts` | Receive print notifications from client, generate PDF copy, write print events |
| `terminals` | Terminal config, item set assignment via group filtering |
| `reporting` | Daily overview projection, transaction history projection |
| `company` | Company info config (name, address, VAT ID) used on all receipts |

### 2.2 Frontend Views (React SPA)

| Route | View | Access |
|-------|------|--------|
| `/login` | PIN entry screen | Public |
| `/pos` | POS Terminal — touch-friendly item grid, order panel, payment, print | Terminal role |
| `/admin` | Admin Panel — items, groups, terminals, users, daily overview, transactions, company settings | Admin role |

---

## 3. Event Model

All state changes are appended as immutable events. Nothing is ever deleted.

### 3.1 Stream Design

#### Catalog Streams
| Stream | Events |
|--------|--------|
| `catalog-$groupId` | `ItemGroupCreated`, `ItemGroupUpdated`, `ItemGroupArchived` |
| `catalog-$itemId` | `ItemCreated`, `ItemUpdated`, `ItemArchived` |

**ItemGroup schema:** `{ id, name, vatRate, archived }`
**Item schema:** `{ id, name, groupId, price, archived }`
- VAT is resolved from the group's `vatRate` at order time (snapshotted on `ItemAdded`).

#### Order Streams
| Stream | Events |
|--------|--------|
| `order-$orderId` | `OrderOpened`, `ItemAdded`, `ItemRemoved`, `PickupReceiptPrinted`, `FinalReceiptPrinted`, `OrderPaid`, `OrderClosed`, `OrderCancelled` |

**Order schema:** `{ id, terminalId, userId, items: OrderItem[], status: open|paid|closed|cancelled, totals }`

**OrderItem:** `{ itemId, name, qty, unitPrice, vatRate, vatAmount, total }`
- Item name, price, and VAT are snapshotted on `ItemAdded` so historical receipts remain correct even if items/groups change.

#### Auth Streams
| Stream | Events |
|--------|--------|
| `auth-$userId` | `UserCreated`, `UserArchived` |
| `auth-sessions` | `SessionStarted`, `SessionEnded` |

**User schema:** `{ id, name, pin, role: admin | terminal, archived }`

#### Terminal Streams
| Stream | Events |
|--------|--------|
| `terminal-$id` | `TerminalCreated`, `TerminalUpdated`, `TerminalArchived` |

**Terminal schema:** `{ id, name, groupIds: string[], printerConfig: { vendorId, productId } }`

#### Company Stream
| Stream | Events |
|--------|--------|
| `company-settings` | `CompanySettingsUpdated` |

**Company schema:** `{ name, address, city, vatId }`

---

## 4. Projections (Read Models)

| Projection | Source Streams | Purpose |
|------------|---------------|---------|
| `current-catalog` | `catalog-*` | POS item grid, admin catalog list |
| `active-orders` | `order-*` | Open orders by terminal, resume orders |
| `daily-report` | `order-*` (filtered by date) | Revenue, VAT breakdown, top items, by terminal |
| `transaction-history` | `order-*` (all closed/cancelled) | Searchable, filterable transaction log in admin |
| `terminal-items` | `catalog-*`, `terminal-*` | Filtered item grid per terminal based on assigned groups |
| `current-users` | `auth-*` | User list for admin |
| `current-terminals` | `terminal-*` | Terminal list for admin |
| `company-info` | `company-settings` | Company data for receipt headers |

---

## 5. POS Terminal Workflow

### 5.1 Order Lifecycle

```
OrderOpened → [ItemAdded × N | ItemRemoved]
            → [PickupReceiptPrinted × N]     optional, one per item
            → FinalReceiptPrinted
            → OrderPaid
            → OrderClosed

Alternative path:
OrderOpened → [ItemAdded × N]
            → OrderCancelled { reason, userId }
```

### 5.2 Item Grid
- Items displayed as a touch-friendly grid
- Filtered by the terminal's assigned groups
- Each button shows: item name + price (with €)

### 5.3 Order Panel
- Lists current items with qty, unit price, total
- Running total with VAT indication
- Actions: Print Pickup (per selected item), Print Final, Pay & Close, Cancel

### 5.4 Cancellation
- **Terminal:** Can cancel current open order or last closed order (within configurable time window). Requires admin PIN override.
- **Admin Panel:** Can cancel any order from transaction history. Requires reason text.

---

## 6. Receipt Printing

### 6.1 Print Flow
1. User clicks "Print Pickup" or "Print Final" in POS terminal
2. Browser formats receipt as ESC/POS byte array using `@point-of-sale/receipt-printer-encoder`
3. Sends to USB thermal printer via `@point-of-sale/webusb-receipt-printer`
4. Printer prints immediately (no dialog, Chrome kiosk mode)
5. Browser posts print notification to backend API
6. Backend generates & saves PDF copy for archive
7. `PickupReceiptPrinted` or `FinalReceiptPrinted` event written to EventStoreDB

### 6.2 Chrome Kiosk Launch
```
chrome --kiosk --kiosk-printing --enable-features=WebUsb \
       --disable-pdf-plugin --app=http://localhost:3000/pos
```

### 6.3 Receipt Format

#### Pickup Receipt
```
┌──────────────────┐
│ [Company Name]   │
│ [Address]        │
│ [City]           │
│ USt-ID: [VAT ID] │
│ ─────────────────│
│  Pickup #[seq]   │
│  1× [Item Name]  │
│  [Timestamp]     │
│  Order #[order]  │
└──────────────────┘
```
- No prices, no table number
- Company header from company settings

#### Final Receipt
```
┌──────────────────┐
│ [Company Name]   │
│ [Address]        │
│ [City]           │
│ USt-ID: [VAT ID] │
│ ─────────────────│
│  Final Receipt   │
│                  │
│ [qty]× [Name] [price]€  │
│ ...              │
│ ─────────────────│
│ VAT [rate]%: [amount]€  │
│ ...              │
│ ─────────────────│
│ Total: [total] € │
│                  │
│ Order #[id] · [Terminal] │
│ [Timestamp]      │
└──────────────────┘
```
- All prices with € sign
- VAT breakdown by rate
- Company header from company settings

---

## 7. Admin Panel

### 7.1 Navigation Sections
- **Item Groups** — CRUD, VAT rate assignment
- **Items** — CRUD, group assignment, price
- **Terminals** — CRUD, assign groups, printer config
- **Users** — CRUD, name, PIN, role
- **Company Settings** — name, address, city, VAT ID
- **Daily Overview** — revenue, VAT, top items, by terminal
- **Transaction History** — all closed/cancelled orders, searchable, filterable

### 7.2 No-Deletion Policy
- Items, groups, users, and terminals are archived (soft-delete via event), never removed
- Archived entities don't appear in POS but remain in projections and history

### 7.3 Transaction History
- Columns: Order #, Terminal, User, Items, Total, VAT, Status, Closed/Cancelled At
- Filters: status (all/closed/cancelled), date range, terminal, search by order ID or item name
- Cancelled orders shown with visual distinction (strikethrough, red badge)
- Reason shown for cancelled orders

### 7.4 Daily Overview
- Summary cards: # Orders, Gross Revenue, VAT Collected, Net Revenue
- VAT breakdown by group
- Revenue breakdown by terminal
- Top items sold
- Cancelled orders shown as separate line item (excluded from revenue totals)

---

## 8. Authentication & Sessions

### 8.1 Model
- **No terminal users** — terminals are selected directly from the start page
- **Admin PIN** — a single configurable PIN (`ADMIN_PIN` env var, default `0000`) grants admin access
- **Reverse proxy** handles external access control (basic auth, IP whitelist, etc.). The app itself has no user accounts.

### 8.2 Start Page
- Terminal grid: all non-archived terminals listed as buttons. Click to enter POS mode.
- "Admin Panel" button hidden at bottom — opens PIN pad for admin login.
- Admin PIN validated against `config.adminPin` on `POST /api/auth/login`, which returns `{ role: "admin", pin }`.

### 8.3 Backend Auth
- **Admin-only endpoints** (catalog, reporting, company config, terminal CRUD): require `x-admin-pin` header matching `config.adminPin`.
- **Public endpoints** (terminal list, terminal items, orders): no auth required.
- No sessions, no JWT, no token management. Stateless.

### 8.4 Multi-Session
- Multiple browser tabs/machines can select different terminals simultaneously.
- Each terminal has its own item set based on assigned groups.
- Each terminal's open orders are isolated (queried by `terminalId`).
- Admin can see all terminals' activity.

### 8.5 Configuration
- `ADMIN_PIN` env var (default `"0000"`) — change in production via reverse proxy or `.env`.
- Reverse proxy (nginx, Caddy, etc.) should handle external access control (basic auth, IP restrictions).

---

## 9. Project Structure (Current)

```
pos/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── catalog/       # item groups, items
│   │   │   ├── auth/          # admin PIN check (stub)
│   │   │   ├── orders/        # order lifecycle
│   │   │   ├── receipts/      # PDF generation, print events
│   │   │   ├── terminals/     # terminal config
│   │   │   ├── reporting/     # daily overview, transactions
│   │   │   └── company/       # company settings
│   │   ├── eventstore/        # PostgreSQL client, NOTIFY subscriptions
│   │   ├── projections/       # replay + LISTEN/NOTIFY runner
│   │   └── api/               # Express routes, checkAdmin middleware
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── views/
│   │   │   ├── Login.tsx       # terminal selection + admin PIN
│   │   │   ├── POSLayout.tsx   # POS terminal view
│   │   │   └── AdminLayout.tsx # admin panel
│   │   ├── components/
│   │   │   ├── ItemGrid.tsx
│   │   │   ├── OrderPanel.tsx
│   │   │   ├── CatalogManager.tsx
│   │   │   ├── CompanySettings.tsx
│   │   │   ├── TerminalConfig.tsx
│   │   │   ├── DailyOverview.tsx
│   │   │   └── TransactionHistory.tsx
│   │   └── api/
│   │       └── client.ts       # fetch wrapper, admin pin injection
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml          # PostgreSQL
├── start.sh
└── docs/
```

---

## 10. Non-Requirements / Out of Scope

- Inventory tracking
- Payment gateway integration (payment is recorded as paid, no card processing)
- Discounts / coupons
- Table management / floor plan
- Kitchen display system
- Multi-language support
- Email receipts
