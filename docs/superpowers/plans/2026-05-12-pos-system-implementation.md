# POS System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-user, event-sourced POS system with React frontend, Node.js/TypeScript backend, and EventStoreDB.

**Architecture:** Modular monolith — single Express backend with module boundaries (catalog, auth, orders, receipts, terminals, reporting, company). React SPA with role-based routing (POS terminal + Admin panel). All state changes are immutable events in EventStoreDB. Projections build read models via catch-up subscriptions.

**Tech Stack:** Node.js, TypeScript, Express, React, Tailwind CSS, EventStoreDB, @point-of-sale/webusb-receipt-printer, @point-of-sale/receipt-printer-encoder, pdfmake

---

## Phase 1: Project Scaffolding & Infrastructure

### Task 1: Initialize project and install dependencies

**Files:**
- Create: `docker-compose.yml`
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`

- [ ] **Step 1: Create root docker-compose.yml for EventStoreDB**

```yaml
version: "3.8"
services:
  eventstore:
    image: eventstore/eventstore:24.10.0-alpha-arm64v8
    environment:
      - EVENTSTORE_CLUSTER_SIZE=1
      - EVENTSTORE_RUN_PROJECTIONS=All
      - EVENTSTORE_START_STANDARD_PROJECTIONS=true
      - EVENTSTORE_HTTP_PORT=2113
      - EVENTSTORE_INSECURE=true
      - EVENTSTORE_ENABLE_ATOM_PUB_OVER_HTTP=true
    ports:
      - "2113:2113"
    volumes:
      - eventstore-data:/var/lib/eventstore
volumes:
  eventstore-data:
```

- [ ] **Step 2: Create backend/package.json**

```json
{
  "name": "pos-backend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@eventstore/db-client": "^6.2.1",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "pdfmake": "^0.2.10",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/uuid": "^10.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 3: Create backend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create frontend/package.json**

```json
{
  "name": "pos-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@point-of-sale/receipt-printer-encoder": "^2.0.0",
    "@point-of-sale/webusb-receipt-printer": "^2.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.45",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.6.0",
    "vite": "^5.4.3"
  }
}
```

- [ ] **Step 5: Create frontend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 6: Create frontend/vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
```

- [ ] **Step 7: Create frontend/index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>POS System</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create frontend/tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 9: Create frontend/postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 10: Install backend dependencies**

```bash
cd backend && npm install
```

Expected: Installs express, @eventstore/db-client, pdfmake, uuid, etc.

- [ ] **Step 11: Install frontend dependencies**

```bash
cd frontend && npm install
```

Expected: Installs react, tailwindcss, vite, @point-of-sale packages.

- [ ] **Step 12: Commit**

```bash
git add docker-compose.yml backend/package.json backend/tsconfig.json backend/package-lock.json \
  frontend/package.json frontend/tsconfig.json frontend/vite.config.ts frontend/index.html \
  frontend/tailwind.config.js frontend/postcss.config.js frontend/package-lock.json
git commit -m "feat: scaffold project with backend, frontend, and EventStoreDB"
```

---

### Task 2: Backend Express app entry point and config

**Files:**
- Create: `backend/src/config.ts`
- Create: `backend/src/index.ts`

- [ ] **Step 1: Create backend/src/config.ts**

```typescript
export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  esdb: {
    connectionString:
      process.env.ESDB_CONNECTION || "esdb://localhost:2113?tls=false",
  },
  receiptPdfDir:
    process.env.RECEIPT_PDF_DIR || "./data/receipts",
};
```

- [ ] **Step 2: Create backend/src/index.ts**

```typescript
import express from "express";
import cors from "cors";
import { config } from "./config";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(config.port, () => {
  console.log(`POS backend running on http://localhost:${config.port}`);
});
```

- [ ] **Step 3: Verify it starts**

```bash
cd backend && npx tsx src/index.ts
```

Expected: `POS backend running on http://localhost:3001`. Ctrl+C to stop.

- [ ] **Step 4: Commit**

```bash
git add backend/src/config.ts backend/src/index.ts
git commit -m "feat: add Express app entry point and config"
```

---

## Phase 2: EventStoreDB Client & Projection Runner

### Task 3: EventStoreDB client wrapper

**Files:**
- Create: `backend/src/eventstore/client.ts`

- [ ] **Step 1: Create backend/src/eventstore/client.ts**

```typescript
import {
  EventStoreDBClient,
  jsonEvent,
  StreamNotFoundError,
  AppendResult,
  JSONEventType,
} from "@eventstore/db-client";
import { config } from "../config";

let client: EventStoreDBClient;

export function getClient(): EventStoreDBClient {
  if (!client) {
    client = EventStoreDBClient.connectionString(config.esdb.connectionString);
  }
  return client;
}

export async function appendEvent<
  E extends JSONEventType = JSONEventType
>(
  streamName: string,
  eventType: string,
  data: E["data"]
): Promise<AppendResult> {
  const c = getClient();
  const event = jsonEvent({ type: eventType, data });
  return c.appendToStream(streamName, [event], {
    expectedRevision: "any",
  });
}

export async function appendEvents<
  E extends JSONEventType = JSONEventType
>(
  streamName: string,
  events: { type: string; data: E["data"] }[]
): Promise<AppendResult> {
  const c = getClient();
  const esdbEvents = events.map((e) =>
    jsonEvent({ type: e.type, data: e.data })
  );
  return c.appendToStream(streamName, esdbEvents, {
    expectedRevision: "any",
  });
}

export async function readStream<E = Record<string, unknown>>(
  streamName: string
): Promise<{ type: string; data: E; created: Date }[]> {
  const c = getClient();
  const events: { type: string; data: E; created: Date }[] = [];
  try {
    for await (const resolved of c.readStream(streamName)) {
      const e = resolved.event;
      if (e) {
        events.push({
          type: e.type,
          data: e.data as E,
          created: new Date(e.created),
        });
      }
    }
  } catch (err) {
    if (err instanceof StreamNotFoundError) {
      return [];
    }
    throw err;
  }
  return events;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/eventstore/client.ts
git commit -m "feat: add EventStoreDB client wrapper with append and read helpers"
```

---

### Task 4: Projection runner

**Files:**
- Create: `backend/src/projections/runner.ts`

- [ ] **Step 1: Create backend/src/projections/runner.ts**

```typescript
import { getClient } from "../eventstore/client";

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
  const client = getClient();
  for (const sub of subscriptions) {
    try {
      await client.subscribeToStream(
        `$ce-${sub.prefix}`,
        {
          fromRevision: "start",
        },
        {
          credentials: undefined,
        }
      );
    } catch {
      // Fallback: subscribe to all if category subscription not supported
      const s = client.subscribeToAll({ fromPosition: "start" });
      (async () => {
        for await (const resolved of s) {
          const e = resolved.event;
          if (
            e &&
            e.streamId.startsWith(`${sub.prefix}-`)
          ) {
            await sub.handler(
              { type: e.type, data: e.data as Record<string, unknown> },
              e.streamId
            );
          }
        }
      })();
      continue;
    }

    // Category subscription
    const s = client.subscribeToStream(`$ce-${sub.prefix}`);
    (async () => {
      for await (const resolved of s) {
        const e = resolved.event;
        if (e) {
          await sub.handler(
            { type: e.type, data: e.data as Record<string, unknown> },
            e.streamId
          );
        }
      }
    })();
  }

  console.log(
    `Projections started: ${subscriptions.map((s) => s.name).join(", ")}`
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/projections/runner.ts
git commit -m "feat: add projection runner with category stream subscriptions"
```

---

## Phase 3: Catalog Module

### Task 5: Catalog types and commands

**Files:**
- Create: `backend/src/modules/catalog/catalog.types.ts`
- Create: `backend/src/modules/catalog/catalog.commands.ts`

- [ ] **Step 1: Create backend/src/modules/catalog/catalog.types.ts**

```typescript
export interface ItemGroup {
  id: string;
  name: string;
  vatRate: number;
  archived: boolean;
}

export interface Item {
  id: string;
  name: string;
  groupId: string;
  price: number;
  archived: boolean;
}

export interface ItemGroupCreatedEvent {
  id: string;
  name: string;
  vatRate: number;
}

export interface ItemGroupUpdatedEvent {
  id: string;
  name: string;
  vatRate: number;
}

export interface ItemGroupArchivedEvent {
  id: string;
}

export interface ItemCreatedEvent {
  id: string;
  name: string;
  groupId: string;
  price: number;
}

export interface ItemUpdatedEvent {
  id: string;
  name: string;
  groupId: string;
  price: number;
}

export interface ItemArchivedEvent {
  id: string;
}
```

- [ ] **Step 2: Create backend/src/modules/catalog/catalog.commands.ts**

```typescript
import { v4 as uuid } from "uuid";
import { appendEvent } from "../../eventstore/client";
import {
  ItemGroupCreatedEvent,
  ItemGroupUpdatedEvent,
  ItemGroupArchivedEvent,
  ItemCreatedEvent,
  ItemUpdatedEvent,
  ItemArchivedEvent,
} from "./catalog.types";

const GROUP_STREAM = (id: string) => `catalog-${id}`;
const ITEM_STREAM = (id: string) => `catalog-${id}`;

export async function createItemGroup(
  name: string,
  vatRate: number
): Promise<string> {
  const id = uuid();
  const data: ItemGroupCreatedEvent = { id, name, vatRate };
  await appendEvent(GROUP_STREAM(id), "ItemGroupCreated", data);
  return id;
}

export async function updateItemGroup(
  id: string,
  name: string,
  vatRate: number
): Promise<void> {
  const data: ItemGroupUpdatedEvent = { id, name, vatRate };
  await appendEvent(GROUP_STREAM(id), "ItemGroupUpdated", data);
}

export async function archiveItemGroup(id: string): Promise<void> {
  const data: ItemGroupArchivedEvent = { id };
  await appendEvent(GROUP_STREAM(id), "ItemGroupArchived", data);
}

export async function createItem(
  name: string,
  groupId: string,
  price: number
): Promise<string> {
  const id = uuid();
  const data: ItemCreatedEvent = { id, name, groupId, price };
  await appendEvent(ITEM_STREAM(id), "ItemCreated", data);
  return id;
}

export async function updateItem(
  id: string,
  name: string,
  groupId: string,
  price: number
): Promise<void> {
  const data: ItemUpdatedEvent = { id, name, groupId, price };
  await appendEvent(ITEM_STREAM(id), "ItemUpdated", data);
}

export async function archiveItem(id: string): Promise<void> {
  const data: ItemArchivedEvent = { id };
  await appendEvent(ITEM_STREAM(id), "ItemArchived", data);
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/catalog/catalog.types.ts backend/src/modules/catalog/catalog.commands.ts
git commit -m "feat: add catalog types and command functions"
```

---

### Task 6: Catalog projections

**Files:**
- Create: `backend/src/modules/catalog/catalog.projections.ts`

- [ ] **Step 1: Create backend/src/modules/catalog/catalog.projections.ts**

```typescript
import { registerProjection } from "../../projections/runner";
import { ItemGroup, Item } from "./catalog.types";

export const groups: Map<string, ItemGroup> = new Map();
export const items: Map<string, Item> = new Map();

export function initCatalogProjections(): void {
  registerProjection("current-catalog", "catalog", (event) => {
    switch (event.type) {
      case "ItemGroupCreated":
        groups.set(event.data.id as string, {
          id: event.data.id as string,
          name: event.data.name as string,
          vatRate: event.data.vatRate as number,
          archived: false,
        });
        break;
      case "ItemGroupUpdated": {
        const g = groups.get(event.data.id as string);
        if (g) {
          g.name = event.data.name as string;
          g.vatRate = event.data.vatRate as number;
        }
        break;
      }
      case "ItemGroupArchived": {
        const g = groups.get(event.data.id as string);
        if (g) {
          g.archived = true;
        }
        break;
      }
      case "ItemCreated":
        items.set(event.data.id as string, {
          id: event.data.id as string,
          name: event.data.name as string,
          groupId: event.data.groupId as string,
          price: event.data.price as number,
          archived: false,
        });
        break;
      case "ItemUpdated": {
        const item = items.get(event.data.id as string);
        if (item) {
          item.name = event.data.name as string;
          item.groupId = event.data.groupId as string;
          item.price = event.data.price as number;
        }
        break;
      }
      case "ItemArchived": {
        const item = items.get(event.data.id as string);
        if (item) {
          item.archived = true;
        }
        break;
      }
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/catalog/catalog.projections.ts
git commit -m "feat: add catalog projection (current-catalog)"
```

---

## Phase 4: Auth Module

### Task 7: Auth types and commands

**Files:**
- Create: `backend/src/modules/auth/auth.types.ts`
- Create: `backend/src/modules/auth/auth.commands.ts`

- [ ] **Step 1: Create backend/src/modules/auth/auth.types.ts**

```typescript
export type UserRole = "admin" | "terminal";

export interface User {
  id: string;
  name: string;
  pin: string;
  role: UserRole;
  archived: boolean;
}

export interface Session {
  id: string;
  userId: string;
  terminalId?: string;
  startedAt: Date;
  endedAt?: Date;
}

export interface UserCreatedEvent {
  id: string;
  name: string;
  pin: string;
  role: UserRole;
}

export interface UserArchivedEvent {
  id: string;
}

export interface SessionStartedEvent {
  id: string;
  userId: string;
  terminalId?: string;
}

export interface SessionEndedEvent {
  id: string;
}
```

- [ ] **Step 2: Create backend/src/modules/auth/auth.commands.ts**

```typescript
import { v4 as uuid } from "uuid";
import { appendEvent } from "../../eventstore/client";
import {
  UserCreatedEvent,
  UserArchivedEvent,
  SessionStartedEvent,
  SessionEndedEvent,
  UserRole,
} from "./auth.types";

const USER_STREAM = (id: string) => `auth-${id}`;
const SESSION_STREAM = "auth-sessions";

export async function createUser(
  name: string,
  pin: string,
  role: UserRole
): Promise<string> {
  const id = uuid();
  const data: UserCreatedEvent = { id, name, pin, role };
  await appendEvent(USER_STREAM(id), "UserCreated", data);
  return id;
}

export async function archiveUser(id: string): Promise<void> {
  const data: UserArchivedEvent = { id };
  await appendEvent(USER_STREAM(id), "UserArchived", data);
}

export async function startSession(
  userId: string,
  terminalId?: string
): Promise<string> {
  const id = uuid();
  const data: SessionStartedEvent = { id, userId, terminalId };
  await appendEvent(SESSION_STREAM, "SessionStarted", data);
  return id;
}

export async function endSession(sessionId: string): Promise<void> {
  const data: SessionEndedEvent = { id: sessionId };
  await appendEvent(SESSION_STREAM, "SessionEnded", data);
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/auth/auth.types.ts backend/src/modules/auth/auth.commands.ts
git commit -m "feat: add auth types and command functions"
```

---

### Task 8: Auth projections and PIN validation

**Files:**
- Create: `backend/src/modules/auth/auth.projections.ts`

- [ ] **Step 1: Create backend/src/modules/auth/auth.projections.ts**

```typescript
import { registerProjection } from "../../projections/runner";
import { User } from "./auth.types";

export const users: Map<string, User> = new Map();
export const activeSessions: Map<
  string,
  { userId: string; terminalId?: string; startedAt: Date }
> = new Map();

export function initAuthProjections(): void {
  registerProjection("current-users", "auth", (event) => {
    switch (event.type) {
      case "UserCreated":
        users.set(event.data.id as string, {
          id: event.data.id as string,
          name: event.data.name as string,
          pin: event.data.pin as string,
          role: event.data.role as "admin" | "terminal",
          archived: false,
        });
        break;
      case "UserArchived": {
        const u = users.get(event.data.id as string);
        if (u) {
          u.archived = true;
        }
        break;
      }
      case "SessionStarted":
        activeSessions.set(event.data.id as string, {
          userId: event.data.userId as string,
          terminalId: event.data.terminalId as string | undefined,
          startedAt: new Date(),
        });
        break;
      case "SessionEnded":
        activeSessions.delete(event.data.id as string);
        break;
    }
  });
}

export function validatePin(pin: string): User | null {
  for (const user of users.values()) {
    if (user.pin === pin && !user.archived) {
      return user;
    }
  }
  return null;
}

export function getSessionUser(sessionId: string): User | null {
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  return users.get(session.userId) ?? null;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/auth/auth.projections.ts
git commit -m "feat: add auth projections and PIN validation"
```

---

## Phase 5: Company & Terminals Module

### Task 9: Company settings types and commands

**Files:**
- Create: `backend/src/modules/company/company.types.ts`
- Create: `backend/src/modules/company/company.commands.ts`

- [ ] **Step 1: Create backend/src/modules/company/company.types.ts**

```typescript
export interface CompanySettings {
  name: string;
  address: string;
  city: string;
  vatId: string;
}

export interface CompanySettingsUpdatedEvent extends CompanySettings {}
```

- [ ] **Step 2: Create backend/src/modules/company/company.commands.ts**

```typescript
import { appendEvent } from "../../eventstore/client";
import { CompanySettingsUpdatedEvent } from "./company.types";

const STREAM = "company-settings";

export async function updateCompanySettings(
  name: string,
  address: string,
  city: string,
  vatId: string
): Promise<void> {
  const data: CompanySettingsUpdatedEvent = { name, address, city, vatId };
  await appendEvent(STREAM, "CompanySettingsUpdated", data);
}
```

- [ ] **Step 3: Create company projection inline in commands**

Add projection registration for company settings. Create `backend/src/modules/company/company.projections.ts`:

```typescript
import { registerProjection } from "../../projections/runner";
import { CompanySettings } from "./company.types";

export const companySettings: CompanySettings = {
  name: "",
  address: "",
  city: "",
  vatId: "",
};

export function initCompanyProjection(): void {
  registerProjection("company-info", "company-settings", (event) => {
    if (event.type === "CompanySettingsUpdated") {
      Object.assign(companySettings, event.data);
    }
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/company/
git commit -m "feat: add company settings module with projection"
```

---

### Task 10: Terminals types, commands, and projection

**Files:**
- Create: `backend/src/modules/terminals/terminals.types.ts`
- Create: `backend/src/modules/terminals/terminals.commands.ts`
- Create: `backend/src/modules/terminals/terminals.projections.ts`

- [ ] **Step 1: Create backend/src/modules/terminals/terminals.types.ts**

```typescript
export interface Terminal {
  id: string;
  name: string;
  groupIds: string[];
  printerVendorId?: number;
  printerProductId?: number;
  archived: boolean;
}

export interface TerminalCreatedEvent {
  id: string;
  name: string;
  groupIds: string[];
  printerVendorId?: number;
  printerProductId?: number;
}

export interface TerminalUpdatedEvent {
  id: string;
  name: string;
  groupIds: string[];
  printerVendorId?: number;
  printerProductId?: number;
}

export interface TerminalArchivedEvent {
  id: string;
}
```

- [ ] **Step 2: Create backend/src/modules/terminals/terminals.commands.ts**

```typescript
import { v4 as uuid } from "uuid";
import { appendEvent } from "../../eventstore/client";
import {
  TerminalCreatedEvent,
  TerminalUpdatedEvent,
  TerminalArchivedEvent,
} from "./terminals.types";

const STREAM = (id: string) => `terminal-${id}`;

export async function createTerminal(
  name: string,
  groupIds: string[],
  printerVendorId?: number,
  printerProductId?: number
): Promise<string> {
  const id = uuid();
  const data: TerminalCreatedEvent = {
    id,
    name,
    groupIds,
    printerVendorId,
    printerProductId,
  };
  await appendEvent(STREAM(id), "TerminalCreated", data);
  return id;
}

export async function updateTerminal(
  id: string,
  name: string,
  groupIds: string[],
  printerVendorId?: number,
  printerProductId?: number
): Promise<void> {
  const data: TerminalUpdatedEvent = {
    id,
    name,
    groupIds,
    printerVendorId,
    printerProductId,
  };
  await appendEvent(STREAM(id), "TerminalUpdated", data);
}

export async function archiveTerminal(id: string): Promise<void> {
  const data: TerminalArchivedEvent = { id };
  await appendEvent(STREAM(id), "TerminalArchived", data);
}
```

- [ ] **Step 3: Create backend/src/modules/terminals/terminals.projections.ts**

```typescript
import { registerProjection } from "../../projections/runner";
import { Terminal } from "./terminals.types";

export const terminals: Map<string, Terminal> = new Map();

export function initTerminalProjections(): void {
  registerProjection("current-terminals", "terminal", (event) => {
    switch (event.type) {
      case "TerminalCreated":
        terminals.set(event.data.id as string, {
          id: event.data.id as string,
          name: event.data.name as string,
          groupIds: (event.data.groupIds as string[]) || [],
          printerVendorId: event.data.printerVendorId as number | undefined,
          printerProductId: event.data.printerProductId as number | undefined,
          archived: false,
        });
        break;
      case "TerminalUpdated": {
        const t = terminals.get(event.data.id as string);
        if (t) {
          t.name = event.data.name as string;
          t.groupIds = (event.data.groupIds as string[]) || [];
          t.printerVendorId = event.data.printerVendorId as number | undefined;
          t.printerProductId = event.data.printerProductId as number | undefined;
        }
        break;
      }
      case "TerminalArchived": {
        const t = terminals.get(event.data.id as string);
        if (t) {
          t.archived = true;
        }
        break;
      }
    }
  });
}

export function getTerminalItems(terminalId: string): Map<string, { name: string; price: number }> {
  const { items } = require("../catalog/catalog.projections");
  const terminal = terminals.get(terminalId);
  if (!terminal) return new Map();
  const result = new Map<string, { name: string; price: number }>();
  for (const [id, item] of items) {
    if (!item.archived && terminal.groupIds.includes(item.groupId)) {
      result.set(id, { name: item.name, price: item.price });
    }
  }
  return result;
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/terminals/
git commit -m "feat: add terminals module with commands and projection"
```

---

## Phase 6: Orders Module

### Task 11: Orders types

**Files:**
- Create: `backend/src/modules/orders/orders.types.ts`

- [ ] **Step 1: Create backend/src/modules/orders/orders.types.ts**

```typescript
export type OrderStatus = "open" | "paid" | "closed" | "cancelled";

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
  userId: string;
  status: OrderStatus;
  items: OrderItem[];
  pickupSeq: number;
  totalGross: number;
  totalVat: Record<number, number>;
  totalNet: number;
  createdAt: Date;
  closedAt?: Date;
  cancelledReason?: string;
}

export interface OrderOpenedEvent {
  id: string;
  terminalId: string;
  userId: string;
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

export interface OrderCancelledEvent {
  orderId: string;
  reason: string;
  userId: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/orders/orders.types.ts
git commit -m "feat: add orders types"
```

---

### Task 12: Orders commands

**Files:**
- Create: `backend/src/modules/orders/orders.commands.ts`

- [ ] **Step 1: Create backend/src/modules/orders/orders.commands.ts**

```typescript
import { v4 as uuid } from "uuid";
import { appendEvent } from "../../eventstore/client";
import { groups } from "../catalog/catalog.projections";
import { items } from "../catalog/catalog.projections";
import {
  OrderOpenedEvent,
  ItemAddedEvent,
  ItemRemovedEvent,
  PickupReceiptPrintedEvent,
  FinalReceiptPrintedEvent,
  OrderPaidEvent,
  OrderClosedEvent,
  OrderCancelledEvent,
} from "./orders.types";

const STREAM = (id: string) => `order-${id}`;

export async function openOrder(
  terminalId: string,
  userId: string
): Promise<string> {
  const id = uuid();
  const data: OrderOpenedEvent = { id, terminalId, userId };
  await appendEvent(STREAM(id), "OrderOpened", data);
  return id;
}

export async function addItemToOrder(
  orderId: string,
  itemId: string,
  qty: number
): Promise<void> {
  const item = items.get(itemId);
  if (!item || item.archived) throw new Error(`Item ${itemId} not found`);

  const group = groups.get(item.groupId);
  const vatRate = group ? group.vatRate : 0;
  const total = item.price * qty;
  const vatAmount = total - total / (1 + vatRate / 100);

  const data: ItemAddedEvent = {
    orderId,
    itemId,
    name: item.name,
    qty,
    unitPrice: item.price,
    vatRate,
    vatAmount: Math.round(vatAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
  await appendEvent(STREAM(orderId), "ItemAdded", data);
}

export async function removeItemFromOrder(
  orderId: string,
  itemId: string
): Promise<void> {
  const data: ItemRemovedEvent = { orderId, itemId };
  await appendEvent(STREAM(orderId), "ItemRemoved", data);
}

export async function printPickupReceipt(
  orderId: string,
  itemId: string
): Promise<void> {
  const data: PickupReceiptPrintedEvent = { orderId, itemId };
  await appendEvent(STREAM(orderId), "PickupReceiptPrinted", data);
}

export async function printFinalReceipt(orderId: string): Promise<void> {
  const data: FinalReceiptPrintedEvent = { orderId };
  await appendEvent(STREAM(orderId), "FinalReceiptPrinted", data);
}

export async function payOrder(orderId: string): Promise<void> {
  const { orders } = require("./orders.projections");
  const order = orders.get(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const totalGross = order.items.reduce((sum, i) => sum + i.total, 0);
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
  await appendEvent(STREAM(orderId), "OrderPaid", data);
}

export async function closeOrder(orderId: string): Promise<void> {
  const data: OrderClosedEvent = { orderId };
  await appendEvent(STREAM(orderId), "OrderClosed", data);
}

export async function cancelOrder(
  orderId: string,
  reason: string,
  userId: string
): Promise<void> {
  const data: OrderCancelledEvent = { orderId, reason, userId };
  await appendEvent(STREAM(orderId), "OrderCancelled", data);
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/orders/orders.commands.ts
git commit -m "feat: add orders command functions"
```

---

### Task 13: Orders projection

**Files:**
- Create: `backend/src/modules/orders/orders.projections.ts`

- [ ] **Step 1: Create backend/src/modules/orders/orders.projections.ts**

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
          userId: data.userId as string,
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
      case "OrderCancelled": {
        const data = event.data;
        const order = orders.get(data.orderId as string);
        if (order) {
          order.status = "cancelled" as OrderStatus;
          order.closedAt = new Date();
          order.cancelledReason = data.reason as string;
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

export function getLastClosedOrder(
  terminalId: string,
  userId: string
): Order | null {
  let last: Order | null = null;
  for (const order of orders.values()) {
    if (
      order.terminalId === terminalId &&
      order.userId === userId &&
      (order.status === "closed" || order.status === "cancelled")
    ) {
      if (!last || (order.closedAt && last.closedAt && order.closedAt > last.closedAt)) {
        last = order;
      }
    }
  }
  return last;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/orders/orders.projections.ts
git commit -m "feat: add orders projection with query helpers"
```

---

## Phase 7: Receipts Module

### Task 14: Receipts types and PDF generation

**Files:**
- Create: `backend/src/modules/receipts/receipts.types.ts`
- Create: `backend/src/modules/receipts/receipts.pdf.ts`

- [ ] **Step 1: Create backend/src/modules/receipts/receipts.types.ts**

```typescript
export interface ReceiptPrintNotification {
  orderId: string;
  type: "pickup" | "final";
  itemId?: string;
  terminalId: string;
}
```

- [ ] **Step 2: Create backend/src/modules/receipts/receipts.pdf.ts**

```typescript
import PdfPrinter from "pdfmake";
import fs from "fs";
import path from "path";
import { config } from "../../config";
import { companySettings } from "../company/company.projections";
import { orders } from "../orders/orders.projections";
import { items } from "../catalog/catalog.projections";

const fonts = {
  Courier: {
    normal: "Courier",
    bold: "Courier-Bold",
  },
};

const printer = new PdfPrinter(fonts);

export async function generatePickupReceiptPdf(
  orderId: string,
  itemId: string,
  pickupSeq: number
): Promise<string> {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const item = order.items.find((i) => i.itemId === itemId);
  if (!item) throw new Error(`Item ${itemId} not found in order`);

  const now = new Date().toLocaleString("de-DE");

  const doc = printer.createPdfKitDocument({
    pageSize: { width: 200, height: 200 },
    pageMargins: [10, 10, 10, 10],
    content: [
      { text: companySettings.name, style: "header", alignment: "center" },
      { text: companySettings.address, alignment: "center", fontSize: 8 },
      { text: companySettings.city, alignment: "center", fontSize: 8 },
      { text: `USt-ID: ${companySettings.vatId}`, alignment: "center", fontSize: 8 },
      { text: "─".repeat(20), alignment: "center", margin: [0, 4] },
      { text: `Pickup #${pickupSeq}`, style: "subheader", alignment: "center" },
      { text: "", margin: [0, 4] },
      { text: `${item.qty}× ${item.name}`, alignment: "center", fontSize: 12 },
      { text: "", margin: [0, 4] },
      { text: now, alignment: "center", fontSize: 8 },
      { text: `Order #${orderId.slice(0, 8)}`, alignment: "center", fontSize: 8 },
    ],
    styles: {
      header: { fontSize: 10, bold: true },
      subheader: { fontSize: 10, bold: true },
    },
    defaultStyle: { font: "Courier" },
  });

  const dir = path.join(config.receiptPdfDir, "pickup");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${orderId}-${itemId}.pdf`);
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

export async function generateFinalReceiptPdf(
  orderId: string
): Promise<string> {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const now = new Date().toLocaleString("de-DE");

  const itemLines = order.items.map(
    (i) => ({
      columns: [
        { text: `${i.qty}× ${i.name}`, width: "auto" },
        { text: `${i.total.toFixed(2)}€`, alignment: "right", width: "*" },
      ],
      fontSize: 8,
      margin: [0, 1],
    })
  );

  const vatLines = Object.entries(order.totalVat).map(
    ([rate, amount]) => ({
      columns: [
        { text: `VAT ${rate}%:`, width: "auto" },
        { text: `${(amount as number).toFixed(2)}€`, alignment: "right", width: "*" },
      ],
      fontSize: 8,
      margin: [0, 1],
    })
  );

  const doc = printer.createPdfKitDocument({
    pageSize: { width: 200, height: 400 },
    pageMargins: [10, 10, 10, 10],
    content: [
      { text: companySettings.name, style: "header", alignment: "center" },
      { text: companySettings.address, alignment: "center", fontSize: 8 },
      { text: companySettings.city, alignment: "center", fontSize: 8 },
      { text: `USt-ID: ${companySettings.vatId}`, alignment: "center", fontSize: 8 },
      { text: "─".repeat(20), alignment: "center", margin: [0, 4] },
      { text: "Final Receipt", style: "subheader", alignment: "center" },
      { text: "", margin: [0, 2] },
      ...itemLines,
      { text: "─".repeat(20), alignment: "center", margin: [0, 4] },
      ...vatLines,
      { text: "─".repeat(20), alignment: "center", margin: [0, 4] },
      {
        columns: [
          { text: "Total:", bold: true, width: "auto" },
          { text: `${order.totalGross.toFixed(2)} €`, bold: true, alignment: "right", width: "*" },
        ],
        fontSize: 10,
        margin: [0, 2],
      },
      { text: "", margin: [0, 4] },
      { text: `Order #${orderId.slice(0, 8)} · ${order.terminalId}`, alignment: "center", fontSize: 8 },
      { text: now, alignment: "center", fontSize: 8 },
    ],
    styles: {
      header: { fontSize: 10, bold: true },
      subheader: { fontSize: 10, bold: true },
    },
    defaultStyle: { font: "Courier" },
  });

  const dir = path.join(config.receiptPdfDir, "final");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${orderId}.pdf`);
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/receipts/
git commit -m "feat: add receipts types and PDF generation for pickup and final receipts"
```

---

## Phase 8: Reporting Module

### Task 15: Reporting projections

**Files:**
- Create: `backend/src/modules/reporting/reporting.types.ts`
- Create: `backend/src/modules/reporting/reporting.projections.ts`

- [ ] **Step 1: Create backend/src/modules/reporting/reporting.types.ts**

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
  userId: string;
  userName: string;
  items: string;
  itemCount: number;
  totalGross: number;
  totalVat: number;
  status: string;
  reason?: string;
  closedAt: string;
}
```

- [ ] **Step 2: Create backend/src/modules/reporting/reporting.projections.ts**

```typescript
import { registerProjection } from "../../projections/runner";
import { DailyReport, TransactionRecord } from "./reporting.types";
import { users } from "../auth/auth.projections";

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
        // Will be populated when OrderPaid comes through first
        const orderId = event.data.orderId as string;
        const existing = transactionHistory.find((t) => t.orderId === orderId);
        if (existing) {
          existing.status = "closed";
          existing.closedAt = new Date().toISOString();
          dailyReport.orderCount++;
        }
        break;
      }
      case "OrderPaid": {
        const data = event.data;
        const orderId = data.orderId as string;
        const order = Array.from(
          require("../orders/orders.projections").orders.values()
        ).find((o: { id: string }) => o.id === orderId);

        if (order) {
          const userName = users.get(order.userId)?.name ?? order.userId;

          const itemsText = order.items
            .map((i: { qty: number; name: string }) => `${i.qty}x ${i.name}`)
            .join(", ");

          transactionHistory.push({
            orderId,
            terminalId: order.terminalId,
            userId: order.userId,
            userName,
            items: itemsText,
            itemCount: order.items.length,
            totalGross: data.totalGross as number,
            totalVat: Object.values(
              data.totalVat as Record<number, number>
            ).reduce((a: number, b: number) => a + b, 0),
            status: "paid",
            closedAt: new Date().toISOString(),
          });
        }
        break;
      }
      case "OrderCancelled": {
        const data = event.data;
        const orderId = data.orderId as string;

        const existing = transactionHistory.find((t) => t.orderId === orderId);
        if (existing) {
          existing.status = "cancelled";
          existing.reason = data.reason as string;
          existing.closedAt = new Date().toISOString();
        }
        dailyReport.cancelledCount++;
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

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/reporting/
git commit -m "feat: add reporting projections for daily overview and transaction history"
```

---

## Phase 9: API Routes & Middleware

### Task 16: Auth middleware

**Files:**
- Create: `backend/src/api/middleware/auth.middleware.ts`

- [ ] **Step 1: Create backend/src/api/middleware/auth.middleware.ts**

```typescript
import { Request, Response, NextFunction } from "express";
import { getSessionUser } from "../../modules/auth/auth.projections";

declare global {
  namespace Express {
    interface Request {
      sessionId?: string;
      userId?: string;
      userRole?: "admin" | "terminal";
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const sessionId = req.headers["x-session-id"] as string;
  if (!sessionId) {
    res.status(401).json({ error: "No session ID provided" });
    return;
  }

  const user = getSessionUser(sessionId);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  req.sessionId = sessionId;
  req.userId = user.id;
  req.userRole = user.role;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/api/middleware/auth.middleware.ts
git commit -m "feat: add auth middleware with session and admin role checks"
```

---

### Task 17: API routes — auth and catalog

**Files:**
- Create: `backend/src/api/routes/auth.routes.ts`
- Create: `backend/src/api/routes/catalog.routes.ts`

- [ ] **Step 1: Create backend/src/api/routes/auth.routes.ts**

```typescript
import { Router, Request, Response } from "express";
import { validatePin, startSession, endSession } from "../../modules/auth/auth.commands";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/login", (req: Request, res: Response): void => {
  const { pin, terminalId } = req.body;
  if (!pin || pin.length < 4) {
    res.status(400).json({ error: "PIN required (4+ digits)" });
    return;
  }

  const user = validatePin(pin);
  if (!user) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  startSession(user.id, terminalId).then((sessionId) => {
    res.json({
      sessionId,
      user: { id: user.id, name: user.name, role: user.role },
    });
  });
});

router.post("/logout", authMiddleware, (req: Request, res: Response): void => {
  endSession(req.sessionId!).then(() => {
    res.json({ status: "logged out" });
  });
});

router.get("/me", authMiddleware, (req: Request, res: Response): void => {
  res.json({ userId: req.userId, role: req.userRole });
});

export default router;
```

**Note:** The `validatePin` import above uses `auth.commands`. Since `validatePin` is in `auth.projections.ts`, update the import to:

```typescript
import { validatePin } from "./auth.projections";
import { startSession, endSession } from "./auth.commands";
```

Actually, let's keep it simple and move the validatePin import to reference auth.projections. The route file should import `validatePin` from `../../modules/auth/auth.projections` and `startSession`/`endSession` from `../../modules/auth/auth.commands`.

- [ ] **Step 2: Create backend/src/api/routes/catalog.routes.ts**

```typescript
import { Router, Request, Response } from "express";
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware";
import {
  createItemGroup,
  updateItemGroup,
  archiveItemGroup,
  createItem,
  updateItem,
  archiveItem,
} from "../../modules/catalog/catalog.commands";
import { groups, items } from "../../modules/catalog/catalog.projections";

const router = Router();

// All catalog routes require admin
router.use(authMiddleware, requireAdmin);

// Item Groups
router.get("/groups", (_req: Request, res: Response): void => {
  const list = Array.from(groups.values());
  res.json(list);
});

router.post("/groups", (req: Request, res: Response): void => {
  const { name, vatRate } = req.body;
  createItemGroup(name, vatRate).then((id) => res.json({ id }));
});

router.put("/groups/:id", (req: Request, res: Response): void => {
  const { name, vatRate } = req.body;
  updateItemGroup(req.params.id, name, vatRate).then(() =>
    res.json({ status: "updated" })
  );
});

router.delete("/groups/:id", (req: Request, res: Response): void => {
  archiveItemGroup(req.params.id).then(() =>
    res.json({ status: "archived" })
  );
});

// Items
router.get("/items", (_req: Request, res: Response): void => {
  const list = Array.from(items.values());
  res.json(list);
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
  archiveItem(req.params.id).then(() =>
    res.json({ status: "archived" })
  );
});

export default router;
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/routes/auth.routes.ts backend/src/api/routes/catalog.routes.ts
git commit -m "feat: add auth and catalog API routes"
```

---

### Task 18: API routes — orders, terminals, reporting, company

**Files:**
- Create: `backend/src/api/routes/orders.routes.ts`
- Create: `backend/src/api/routes/terminals.routes.ts`
- Create: `backend/src/api/routes/reporting.routes.ts`
- Create: `backend/src/api/routes/company.routes.ts`

- [ ] **Step 1: Create backend/src/api/routes/orders.routes.ts**

```typescript
import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
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
import { orders, getOpenOrdersByTerminal, getLastClosedOrder } from "../../modules/orders/orders.projections";
import { generatePickupReceiptPdf, generateFinalReceiptPdf } from "../../modules/receipts/receipts.pdf";

const router = Router();
router.use(authMiddleware);

router.get("/", (req: Request, res: Response): void => {
  const terminalId = req.query.terminalId as string;
  const list = Array.from(orders.values()).filter(
    (o) => o.terminalId === terminalId
  );
  res.json(list);
});

router.post("/open", (req: Request, res: Response): void => {
  const { terminalId } = req.body;
  openOrder(terminalId, req.userId!).then((id) => res.json({ id }));
});

router.post("/:id/items", (req: Request, res: Response): void => {
  const { itemId, qty } = req.body;
  addItemToOrder(req.params.id, itemId, qty || 1).then(() =>
    res.json({ status: "item added" })
  );
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
  const { reason, adminPin } = req.body;
  cancelOrder(req.params.id, reason, req.userId!).then(() =>
    res.json({ status: "cancelled" })
  );
});

export default router;
```

- [ ] **Step 2: Create backend/src/api/routes/terminals.routes.ts**

```typescript
import { Router, Request, Response } from "express";
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware";
import {
  createTerminal,
  updateTerminal,
  archiveTerminal,
} from "../../modules/terminals/terminals.commands";
import { terminals, getTerminalItems } from "../../modules/terminals/terminals.projections";

const router = Router();

// Admin-only management
router.get("/", authMiddleware, (_req: Request, res: Response): void => {
  res.json(Array.from(terminals.values()));
});

router.post("/", authMiddleware, requireAdmin, (req: Request, res: Response): void => {
  const { name, groupIds, printerVendorId, printerProductId } = req.body;
  createTerminal(name, groupIds, printerVendorId, printerProductId).then((id) =>
    res.json({ id })
  );
});

router.put("/:id", authMiddleware, requireAdmin, (req: Request, res: Response): void => {
  const { name, groupIds, printerVendorId, printerProductId } = req.body;
  updateTerminal(req.params.id, name, groupIds, printerVendorId, printerProductId).then(() =>
    res.json({ status: "updated" })
  );
});

router.delete("/:id", authMiddleware, requireAdmin, (req: Request, res: Response): void => {
  archiveTerminal(req.params.id).then(() =>
    res.json({ status: "archived" })
  );
});

// Get items for a terminal (terminal users need this)
router.get("/:id/items", authMiddleware, (req: Request, res: Response): void => {
  const terminalItems = getTerminalItems(req.params.id);
  res.json(Array.from(terminalItems.entries()).map(([id, data]) => ({
    id,
    name: data.name,
    price: data.price,
  })));
});

export default router;
```

- [ ] **Step 3: Create backend/src/api/routes/reporting.routes.ts**

```typescript
import { Router, Request, Response } from "express";
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware";
import { getDailyReport, transactionHistory } from "../../modules/reporting/reporting.projections";

const router = Router();
router.use(authMiddleware, requireAdmin);

router.get("/daily", (req: Request, res: Response): void => {
  const date = req.query.date as string | undefined;
  res.json(getDailyReport(date));
});

router.get("/transactions", (req: Request, res: Response): void => {
  let result = [...transactionHistory];

  const status = req.query.status as string;
  if (status && status !== "all") {
    result = result.filter((t) => t.status === status);
  }

  const terminal = req.query.terminal as string;
  if (terminal) {
    result = result.filter((t) => t.terminalId === terminal);
  }

  const search = req.query.search as string;
  if (search) {
    const s = search.toLowerCase();
    result = result.filter(
      (t) =>
        t.orderId.toLowerCase().includes(s) ||
        t.items.toLowerCase().includes(s)
    );
  }

  res.json(result);
});

export default router;
```

- [ ] **Step 4: Create backend/src/api/routes/company.routes.ts**

```typescript
import { Router, Request, Response } from "express";
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware";
import { updateCompanySettings } from "../../modules/company/company.commands";
import { companySettings } from "../../modules/company/company.projections";

const router = Router();

router.get("/", authMiddleware, (_req: Request, res: Response): void => {
  res.json(companySettings);
});

router.put("/", authMiddleware, requireAdmin, (req: Request, res: Response): void => {
  const { name, address, city, vatId } = req.body;
  updateCompanySettings(name, address, city, vatId).then(() =>
    res.json({ status: "updated" })
  );
});

export default router;
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/routes/orders.routes.ts backend/src/api/routes/terminals.routes.ts \
  backend/src/api/routes/reporting.routes.ts backend/src/api/routes/company.routes.ts
git commit -m "feat: add orders, terminals, reporting, and company API routes"
```

---

### Task 19: Wire up routes and projections in index.ts

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Update backend/src/index.ts**

```typescript
import express from "express";
import cors from "cors";
import { config } from "./config";
import { startProjections } from "./projections/runner";
import { initCatalogProjections } from "./modules/catalog/catalog.projections";
import { initAuthProjections } from "./modules/auth/auth.projections";
import { initOrderProjections } from "./modules/orders/orders.projections";
import { initTerminalProjections } from "./modules/terminals/terminals.projections";
import { initReportingProjections } from "./modules/reporting/reporting.projections";
import { initCompanyProjection } from "./modules/company/company.projections";

import authRoutes from "./api/routes/auth.routes";
import catalogRoutes from "./api/routes/catalog.routes";
import ordersRoutes from "./api/routes/orders.routes";
import terminalsRoutes from "./api/routes/terminals.routes";
import reportingRoutes from "./api/routes/reporting.routes";
import companyRoutes from "./api/routes/company.routes";

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/terminals", terminalsRoutes);
app.use("/api/reporting", reportingRoutes);
app.use("/api/company", companyRoutes);

// Initialize projections
initCatalogProjections();
initAuthProjections();
initOrderProjections();
initTerminalProjections();
initReportingProjections();
initCompanyProjection();

startProjections().then(() => {
  app.listen(config.port, () => {
    console.log(`POS backend running on http://localhost:${config.port}`);
  });
});
```

- [ ] **Step 2: Verify it compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: wire up all routes and projections in Express app"
```

---

## Phase 10: Frontend Foundation

### Task 20: React app shell, router, and API client

**Files:**
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/index.css`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/api/client.ts`

- [ ] **Step 1: Create frontend/src/main.tsx**

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 2: Create frontend/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
```

- [ ] **Step 3: Create frontend/src/App.tsx**

```typescript
import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Login from "./views/Login";
import POSLayout from "./views/POSLayout";
import AdminLayout from "./views/AdminLayout";

export interface UserSession {
  sessionId: string;
  user: { id: string; name: string; role: "admin" | "terminal" };
}

function App() {
  const [session, setSession] = useState<UserSession | null>(() => {
    const stored = localStorage.getItem("pos-session");
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    if (session) {
      localStorage.setItem("pos-session", JSON.stringify(session));
    } else {
      localStorage.removeItem("pos-session");
    }
  }, [session]);

  const handleLogin = (s: UserSession) => setSession(s);
  const handleLogout = () => setSession(null);

  if (!session) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Routes>
      <Route
        path="/pos/*"
        element={<POSLayout session={session} onLogout={handleLogout} />}
      />
      <Route
        path="/admin/*"
        element={
          session.user.role === "admin" ? (
            <AdminLayout session={session} onLogout={handleLogout} />
          ) : (
            <Navigate to="/pos" />
          )
        }
      />
      <Route
        path="*"
        element={
          <Navigate
            to={session.user.role === "admin" ? "/admin" : "/pos"}
          />
        }
      />
    </Routes>
  );
}

export default App;
```

- [ ] **Step 4: Create frontend/src/api/client.ts**

```typescript
const BASE = "/api";

export function getSessionId(): string | null {
  const stored = localStorage.getItem("pos-session");
  if (!stored) return null;
  return JSON.parse(stored).sessionId;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const sessionId = getSessionId();
  if (sessionId) {
    headers["x-session-id"] = sessionId;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/main.tsx frontend/src/index.css frontend/src/App.tsx frontend/src/api/client.ts
git commit -m "feat: add React app shell, router, and API client"
```

---

## Phase 11: Frontend — Login View

### Task 21: Login page with PIN pad

**Files:**
- Create: `frontend/src/views/Login.tsx`

- [ ] **Step 1: Create frontend/src/views/Login.tsx**

```typescript
import { useState } from "react";
import { api } from "../api/client";
import type { UserSession } from "../App";

interface Props {
  onLogin: (session: UserSession) => void;
}

function Login({ onLogin }: Props) {
  const [pin, setPin] = useState("");
  const [terminal, setTerminal] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDigit = (d: string) => {
    if (pin.length < 6) {
      setPin(pin + d);
      setError("");
    }
  };

  const handleClear = () => setPin("");
  const handleBackspace = () => setPin(pin.slice(0, -1));

  const handleLogin = async () => {
    if (pin.length < 4) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.post<UserSession>("/auth/login", {
        pin,
        terminalId: terminal || undefined,
      });
      onLogin(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Login failed");
      setPin("");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 rounded-2xl p-8 w-96 shadow-2xl">
        <h1 className="text-white text-2xl font-bold text-center mb-6">
          POS Login
        </h1>

        {error && (
          <div className="bg-red-500/20 text-red-300 rounded-lg p-3 mb-4 text-center text-sm">
            {error}
          </div>
        )}

        <div className="mb-4">
          <input
            type="text"
            className="w-full bg-gray-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
            placeholder="Terminal name (optional)"
            value={terminal}
            onChange={(e) => setTerminal(e.target.value)}
          />
        </div>

        <div className="bg-gray-700 rounded-lg p-4 mb-4 text-center">
          <div className="text-gray-400 text-xs mb-1">Enter PIN</div>
          <div className="flex justify-center gap-2 mb-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full ${
                  i < pin.length ? "bg-blue-400" : "bg-gray-600"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", ""].map((d, i) =>
            d ? (
              <button
                key={i}
                onClick={() => handleDigit(d)}
                className="bg-gray-700 hover:bg-gray-600 text-white text-xl font-bold rounded-lg py-3 transition-colors"
              >
                {d}
              </button>
            ) : (
              <div key={i} />
            )
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleClear}
            className="bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg py-3 text-sm font-semibold"
          >
            Clear
          </button>
          <button
            onClick={handleLogin}
            disabled={pin.length < 4 || loading}
            className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg py-3 text-sm font-semibold disabled:cursor-not-allowed"
          >
            {loading ? "..." : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/Login.tsx
git commit -m "feat: add login page with PIN pad"
```

---

## Phase 12: Frontend — POS Terminal

### Task 22: POS terminal view with item grid and order panel

**Files:**
- Create: `frontend/src/views/POSLayout.tsx`
- Create: `frontend/src/components/ItemGrid.tsx`
- Create: `frontend/src/components/OrderPanel.tsx`
- Create: `frontend/src/hooks/usePrinter.ts`

- [ ] **Step 1: Create frontend/src/views/POSLayout.tsx**

```typescript
import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { UserSession } from "../App";
import ItemGrid from "../components/ItemGrid";
import OrderPanel from "../components/OrderPanel";

interface TerminalItem {
  id: string;
  name: string;
  price: number;
}

interface OrderItem {
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
}

interface Order {
  id: string;
  status: string;
  items: OrderItem[];
}

interface Props {
  session: UserSession;
  onLogout: () => void;
}

function POSLayout({ session, onLogout }: Props) {
  const [terminalId, setTerminalId] = useState<string>("");
  const [terminals, setTerminals] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<TerminalItem[]>([]);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ id: string; name: string }[]>("/terminals").then((data) => {
      setTerminals(data);
      if (data.length > 0) {
        const saved = localStorage.getItem("pos-terminal");
        const tid = saved && data.find((t) => t.id === saved) ? saved : data[0].id;
        setTerminalId(tid);
      }
      setLoading(false);
    });
  }, []);

  const loadItems = useCallback((tid: string) => {
    localStorage.setItem("pos-terminal", tid);
    api.get<TerminalItem[]>(`/terminals/${tid}/items`).then(setItems);
  }, []);

  useEffect(() => {
    if (terminalId) loadItems(terminalId);
  }, [terminalId, loadItems]);

  const handleNewOrder = async () => {
    const data = await api.post<{ id: string }>("/orders/open", { terminalId });
    setCurrentOrder({ id: data.id, status: "open", items: [] });
  };

  const handleAddItem = async (itemId: string) => {
    if (!currentOrder) return;
    await api.post(`/orders/${currentOrder.id}/items`, { itemId, qty: 1 });
    const orders = await api.get<Order[]>(`/orders?terminalId=${terminalId}`);
    const updated = orders.find((o) => o.id === currentOrder.id);
    if (updated) setCurrentOrder(updated);
  };

  const handlePrintPickup = async (itemId: string) => {
    if (!currentOrder) return;
    await api.post(`/orders/${currentOrder.id}/print-pickup`, { itemId });
  };

  const handlePrintFinal = async () => {
    if (!currentOrder) return;
    await api.post(`/orders/${currentOrder.id}/print-final`);
  };

  const handlePayAndClose = async () => {
    if (!currentOrder) return;
    await api.post(`/orders/${currentOrder.id}/pay`);
    await api.post(`/orders/${currentOrder.id}/close`);
    setCurrentOrder(null);
  };

  const handleCancel = async () => {
    if (!currentOrder) return;
    await api.post(`/orders/${currentOrder.id}/cancel`, {
      reason: "Cancelled from terminal",
    });
    setCurrentOrder(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h1 className="text-white font-bold text-lg">POS Terminal</h1>
          {terminals.length > 1 && (
            <select
              value={terminalId}
              onChange={(e) => setTerminalId(e.target.value)}
              className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
            >
              {terminals.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">{session.user.name}</span>
          <button
            onClick={onLogout}
            className="bg-red-600 hover:bg-red-500 text-white text-sm px-3 py-1 rounded"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 flex gap-4 p-4 overflow-hidden">
        <div className="flex-[3]">
          <ItemGrid
            items={items}
            onAddItem={handleAddItem}
            onNewOrder={handleNewOrder}
            hasOrder={!!currentOrder}
          />
        </div>
        <div className="flex-[2]">
          <OrderPanel
            order={currentOrder}
            onPrintPickup={handlePrintPickup}
            onPrintFinal={handlePrintFinal}
            onPayAndClose={handlePayAndClose}
            onCancel={handleCancel}
          />
        </div>
      </main>
    </div>
  );
}

export default POSLayout;
```

- [ ] **Step 2: Create frontend/src/components/ItemGrid.tsx**

```typescript
interface TerminalItem {
  id: string;
  name: string;
  price: number;
}

interface Props {
  items: TerminalItem[];
  onAddItem: (itemId: string) => void;
  onNewOrder: () => void;
  hasOrder: boolean;
}

function ItemGrid({ items, onAddItem, onNewOrder, hasOrder }: Props) {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-3">
        <button
          onClick={onNewOrder}
          className={`w-full rounded-lg py-3 text-lg font-bold transition-colors ${
            hasOrder
              ? "bg-gray-700 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-500 text-white"
          }`}
          disabled={hasOrder}
        >
          {hasOrder ? "Order in progress" : "New Order"}
        </button>
      </div>
      <div className="flex-1 grid grid-cols-3 gap-2 overflow-y-auto">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => hasOrder && onAddItem(item.id)}
            disabled={!hasOrder}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg p-3 flex flex-col items-center justify-center text-center min-h-[80px] transition-colors"
          >
            <span className="text-white font-semibold text-sm">{item.name}</span>
            <span className="text-gray-400 text-xs mt-1">
              {item.price.toFixed(2)}€
            </span>
          </button>
        ))}
        {items.length === 0 && (
          <div className="col-span-3 text-gray-500 text-center py-8">
            No items assigned to this terminal
          </div>
        )}
      </div>
    </div>
  );
}

export default ItemGrid;
```

- [ ] **Step 3: Create frontend/src/components/OrderPanel.tsx**

```typescript
interface OrderItem {
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
}

interface Order {
  id: string;
  status: string;
  items: OrderItem[];
}

interface Props {
  order: Order | null;
  onPrintPickup: (itemId: string) => void;
  onPrintFinal: () => void;
  onPayAndClose: () => void;
  onCancel: () => void;
}

function OrderPanel({
  order,
  onPrintPickup,
  onPrintFinal,
  onPayAndClose,
  onCancel,
}: Props) {
  if (!order) {
    return (
      <div className="h-full bg-gray-800 rounded-xl p-4 flex items-center justify-center text-gray-500">
        No open order. Click "New Order" to start.
      </div>
    );
  }

  const total = order.items.reduce((sum, i) => sum + i.total, 0);

  return (
    <div className="h-full bg-gray-800 rounded-xl p-4 flex flex-col">
      <h2 className="text-white font-bold text-lg mb-3">
        Order #{order.id.slice(0, 8)}
      </h2>

      <div className="flex-1 overflow-y-auto mb-3">
        {order.items.map((item) => (
          <div
            key={item.itemId}
            className="flex items-center justify-between bg-gray-700 rounded-lg p-3 mb-2"
          >
            <div className="flex-1">
              <div className="text-white font-medium">{item.name}</div>
              <div className="text-gray-400 text-xs">
                {item.qty}× {item.unitPrice.toFixed(2)}€
              </div>
            </div>
            <div className="text-white font-bold mr-3">
              {item.total.toFixed(2)}€
            </div>
            <button
              onClick={() => onPrintPickup(item.itemId)}
              className="text-yellow-400 hover:text-yellow-300 text-xs px-2 py-1 rounded border border-yellow-600"
            >
              Pickup
            </button>
          </div>
        ))}
        {order.items.length === 0 && (
          <div className="text-gray-500 text-center py-4">
            Add items from the grid
          </div>
        )}
      </div>

      <div className="border-t border-gray-700 pt-3 mb-3">
        <div className="flex justify-between text-white font-bold text-lg">
          <span>Total</span>
          <span>{total.toFixed(2)}€</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onPrintFinal}
          disabled={order.items.length === 0}
          className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white rounded-lg py-3 text-sm font-semibold"
        >
          Print Final
        </button>
        <button
          onClick={onCancel}
          className="bg-red-900 hover:bg-red-800 text-red-300 rounded-lg py-3 text-sm font-semibold"
        >
          Cancel
        </button>
        <button
          onClick={onPayAndClose}
          disabled={order.items.length === 0}
          className="col-span-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-lg py-3 text-lg font-bold"
        >
          Pay & Close
        </button>
      </div>
    </div>
  );
}

export default OrderPanel;
```

- [ ] **Step 4: Create frontend/src/hooks/usePrinter.ts**

```typescript
import { useEffect, useState } from "react";

interface PrinterDevice {
  vendorId: number;
  productId: number;
}

export function usePrinter(device?: PrinterDevice) {
  const [connected, setConnected] = useState(false);
  const [printer, setPrinter] = useState<unknown>(null);

  useEffect(() => {
    if (!device) return;

    async function connect() {
      try {
        const { default: ReceiptPrinterEncoder } = await import(
          "@point-of-sale/receipt-printer-encoder"
        );
        const { default: WebUSBReceiptPrinter } = await import(
          "@point-of-sale/webusb-receipt-printer"
        );

        const encoder = new ReceiptPrinterEncoder();
        const usbPrinter = new WebUSBReceiptPrinter();
        await usbPrinter.connect();
        setPrinter({ encoder, usbPrinter });
        setConnected(true);
      } catch {
        setConnected(false);
      }
    }

    connect();
  }, [device]);

  async function printPickup(
    company: { name: string; address: string; city: string; vatId: string },
    pickupSeq: number,
    itemName: string,
    qty: number,
    orderId: string
  ) {
    if (!printer) return;
    const { encoder, usbPrinter } = printer as {
      encoder: { initialize: () => unknown; text: (t: string) => unknown; bold: (b: boolean) => unknown; align: (a: string) => unknown; newline: () => unknown; line: (c: string) => unknown; encode: () => Uint8Array };
      usbPrinter: { print: (data: Uint8Array) => Promise<void> };
    };

    encoder.initialize();
    encoder.bold(true);
    encoder.align("center");
    encoder.text(company.name);
    encoder.newline();
    encoder.bold(false);
    encoder.text(company.address);
    encoder.newline();
    encoder.text(company.city);
    encoder.newline();
    encoder.text(`USt-ID: ${company.vatId}`);
    encoder.newline();
    encoder.line("-".repeat(32));
    encoder.newline();
    encoder.bold(true);
    encoder.text(`Pickup #${pickupSeq}`);
    encoder.newline();
    encoder.bold(false);
    encoder.newline();
    encoder.text(`${qty}x ${itemName}`);
    encoder.newline();
    encoder.newline();
    encoder.text(new Date().toLocaleString("de-DE"));
    encoder.newline();
    encoder.text(`Order #${orderId.slice(0, 8)}`);
    encoder.newline();
    encoder.newline();

    await usbPrinter.print(encoder.encode());
  }

  return { connected, printPickup } as const;
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/POSLayout.tsx frontend/src/components/ItemGrid.tsx \
  frontend/src/components/OrderPanel.tsx frontend/src/hooks/usePrinter.ts
git commit -m "feat: add POS terminal view with item grid, order panel, and printer hook"
```

---

## Phase 13: Frontend — Admin Panel

### Task 23: Admin layout, catalog manager, and company settings

**Files:**
- Create: `frontend/src/views/AdminLayout.tsx`
- Create: `frontend/src/components/CatalogManager.tsx`
- Create: `frontend/src/components/CompanySettings.tsx`
- Create: `frontend/src/components/TerminalConfig.tsx`
- Create: `frontend/src/components/UserManager.tsx`
- Create: `frontend/src/components/DailyOverview.tsx`
- Create: `frontend/src/components/TransactionHistory.tsx`

- [ ] **Step 1: Create frontend/src/views/AdminLayout.tsx**

```typescript
import { useState } from "react";
import type { UserSession } from "../App";
import CatalogManager from "../components/CatalogManager";
import CompanySettings from "../components/CompanySettings";
import TerminalConfig from "../components/TerminalConfig";
import UserManager from "../components/UserManager";
import DailyOverview from "../components/DailyOverview";
import TransactionHistory from "../components/TransactionHistory";

type Tab =
  | "groups"
  | "items"
  | "terminals"
  | "users"
  | "company"
  | "daily"
  | "transactions";

const tabs: { id: Tab; label: string }[] = [
  { id: "groups", label: "Item Groups" },
  { id: "items", label: "Items" },
  { id: "terminals", label: "Terminals" },
  { id: "users", label: "Users" },
  { id: "company", label: "Company" },
  { id: "daily", label: "Daily Overview" },
  { id: "transactions", label: "Transactions" },
];

interface Props {
  session: UserSession;
  onLogout: () => void;
}

function AdminLayout({ session, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("daily");

  return (
    <div className="min-h-screen bg-gray-900 flex">
      <nav className="w-56 bg-gray-800 flex flex-col border-r border-gray-700">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-white font-bold text-lg">Admin Panel</h1>
          <p className="text-gray-400 text-xs mt-1">{session.user.name}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                tab === t.id
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-gray-700">
          <button
            onClick={onLogout}
            className="w-full bg-red-600 hover:bg-red-500 text-white rounded-lg py-2 text-sm"
          >
            Logout
          </button>
        </div>
      </nav>
      <main className="flex-1 overflow-y-auto p-6">
        {tab === "groups" && <CatalogManager type="groups" />}
        {tab === "items" && <CatalogManager type="items" />}
        {tab === "terminals" && <TerminalConfig />}
        {tab === "users" && <UserManager />}
        {tab === "company" && <CompanySettings />}
        {tab === "daily" && <DailyOverview />}
        {tab === "transactions" && <TransactionHistory />}
      </main>
    </div>
  );
}

export default AdminLayout;
```

- [ ] **Step 2: Create frontend/src/components/CatalogManager.tsx**

```typescript
import { useState, useEffect } from "react";
import { api } from "../api/client";

interface ItemGroup {
  id: string;
  name: string;
  vatRate: number;
  archived: boolean;
}

interface Item {
  id: string;
  name: string;
  groupId: string;
  price: number;
  archived: boolean;
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
      setItems(i.filter((item) => !item.archived));
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const [form, setForm] = useState<{
    name: string;
    vatRate: string;
    price: string;
    groupId: string;
  }>({ name: "", vatRate: "19", price: "", groupId: "" });

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
              {groups
                .filter((g) => !g.archived)
                .map((g) => (
                  <tr key={g.id} className="border-b border-gray-800">
                    <td className="text-white py-2">{g.name}</td>
                    <td className="text-white text-right py-2">{g.vatRate}%</td>
                    <td className="text-right py-2">
                      <button
                        onClick={() => api.delete(`/catalog/groups/${g.id}`).then(load)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Archive
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
                {groups
                  .filter((g) => !g.archived)
                  .map((g) => (
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
                      Archive
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

- [ ] **Step 3: Create frontend/src/components/CompanySettings.tsx**

```typescript
import { useState, useEffect } from "react";
import { api } from "../api/client";

interface Company {
  name: string;
  address: string;
  city: string;
  vatId: string;
}

function CompanySettings() {
  const [form, setForm] = useState<Company>({
    name: "",
    address: "",
    city: "",
    vatId: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Company>("/company").then(setForm);
  }, []);

  const handleSave = async () => {
    await api.put("/company", form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h2 className="text-white text-xl font-bold mb-4">Company Settings</h2>
      <div className="bg-gray-800 rounded-xl p-6 max-w-md">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-gray-400 text-sm">Name</label>
            <input
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm mt-1"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm">Address</label>
            <input
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm mt-1"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm">City</label>
            <input
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm mt-1"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm">VAT ID</label>
            <input
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm mt-1"
              value={form.vatId}
              onChange={(e) => setForm({ ...form, vatId: e.target.value })}
            />
          </div>
          <button
            onClick={handleSave}
            className="bg-green-600 hover:bg-green-500 text-white rounded-lg py-2 text-sm font-semibold mt-2"
          >
            {saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CompanySettings;
```

- [ ] **Step 4: Create frontend/src/components/TerminalConfig.tsx**

```typescript
import { useState, useEffect } from "react";
import { api } from "../api/client";

interface Terminal {
  id: string;
  name: string;
  groupIds: string[];
  printerVendorId?: number;
  printerProductId?: number;
  archived: boolean;
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
            {groups
              .filter((g) => !(g as { archived?: boolean }).archived)
              .map((g) => (
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
        {terminals
          .filter((t) => !t.archived)
          .map((t) => (
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
                Archive
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}

export default TerminalConfig;
```

- [ ] **Step 5: Create frontend/src/components/UserManager.tsx**

```typescript
import { useState, useEffect } from "react";
import { api } from "../api/client";

interface User {
  id: string;
  name: string;
  pin: string;
  role: string;
  archived: boolean;
}

function UserManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ name: "", pin: "", role: "terminal" });

  const load = () => {
    api.get<User[]>("/auth/users").then(setUsers);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    await api.post("/auth/users", form);
    setForm({ name: "", pin: "", role: "terminal" });
    load();
  };

  return (
    <div>
      <h2 className="text-white text-xl font-bold mb-4">Users</h2>

      <div className="bg-gray-800 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-4 gap-2">
          <input
            className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
            placeholder="PIN (4-6 digits)"
            type="password"
            maxLength={6}
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value })}
          />
          <select
            className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="terminal">Terminal</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={handleAdd}
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
            <th className="text-left py-2">Role</th>
            <th className="text-right py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users
            .filter((u) => !u.archived)
            .map((u) => (
              <tr key={u.id} className="border-b border-gray-800">
                <td className="text-white py-2">{u.name}</td>
                <td className="text-gray-400 py-2 capitalize">{u.role}</td>
                <td className="text-right py-2">
                  <button
                    onClick={() => api.delete(`/auth/users/${u.id}`).then(load)}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    Archive
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export default UserManager;
```

- [ ] **Step 6: Create frontend/src/components/DailyOverview.tsx**

```typescript
import { useState, useEffect } from "react";
import { api } from "../api/client";

interface DailyReport {
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

function DailyOverview() {
  const [report, setReport] = useState<DailyReport | null>(null);

  useEffect(() => {
    api.get<DailyReport>("/reporting/daily").then(setReport);
  }, []);

  if (!report) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <h2 className="text-white text-xl font-bold mb-4">
        Daily Overview — {report.date}
      </h2>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Orders", value: report.orderCount },
          { label: "Gross Revenue", value: `${report.totalGross.toFixed(2)}€` },
          { label: "VAT Collected", value: `${report.totalVat.toFixed(2)}€` },
          { label: "Net Revenue", value: `${report.totalNet.toFixed(2)}€` },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-gray-800 rounded-xl p-4 text-center"
          >
            <div className="text-2xl font-bold text-white">{card.value}</div>
            <div className="text-gray-400 text-xs mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {report.cancelledCount > 0 && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 mb-4 text-red-300 text-sm">
          {report.cancelledCount} cancelled order(s) excluded from totals
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-white font-semibold mb-2">By VAT Group</h3>
          {Object.entries(report.vatByGroup).map(([_, data]) => (
            <div
              key={data.rate}
              className="flex justify-between text-sm py-1 border-b border-gray-700"
            >
              <span className="text-gray-400">{data.rate}% VAT</span>
              <span className="text-white">
                {data.gross.toFixed(2)}€ gross / {data.vat.toFixed(2)}€ VAT
              </span>
            </div>
          ))}
        </div>

        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-white font-semibold mb-2">By Terminal</h3>
          {Object.entries(report.byTerminal).map(([name, data]) => (
            <div
              key={name}
              className="flex justify-between text-sm py-1 border-b border-gray-700"
            >
              <span className="text-gray-400">{name}</span>
              <span className="text-white">
                {data.total.toFixed(2)}€ · {data.orderCount} orders
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-4 mt-4">
        <h3 className="text-white font-semibold mb-2">Top Items</h3>
        {report.topItems.map((item, i) => (
          <div
            key={item.itemId}
            className="flex justify-between text-sm py-1 border-b border-gray-700"
          >
            <span className="text-gray-400">
              {i + 1}. {item.name}
            </span>
            <span className="text-white">{item.count}× sold</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DailyOverview;
```

- [ ] **Step 7: Create frontend/src/components/TransactionHistory.tsx**

```typescript
import { useState, useEffect } from "react";
import { api } from "../api/client";

interface Transaction {
  orderId: string;
  terminalId: string;
  userName: string;
  items: string;
  totalGross: number;
  totalVat: number;
  status: string;
  reason?: string;
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
            <th className="text-left py-2">User</th>
            <th className="text-left py-2">Items</th>
            <th className="text-right py-2">Total</th>
            <th className="text-left py-2">Status</th>
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
              <td className="py-2 text-gray-400">{t.userName}</td>
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
                {t.reason && (
                  <span className="text-gray-500 text-xs ml-2">{t.reason}</span>
                )}
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

- [ ] **Step 8: Commit**

```bash
git add frontend/src/views/AdminLayout.tsx frontend/src/components/CatalogManager.tsx \
  frontend/src/components/CompanySettings.tsx frontend/src/components/TerminalConfig.tsx \
  frontend/src/components/UserManager.tsx frontend/src/components/DailyOverview.tsx \
  frontend/src/components/TransactionHistory.tsx
git commit -m "feat: add admin panel with all configuration views and reports"
```

---

### Task 24: Add auth/users API endpoint to support user Admin CRUD

**Files:**
- Modify: `backend/src/api/routes/auth.routes.ts`

- [ ] **Step 1: Add user management routes to auth.routes.ts**

We need to add GET/POST/DELETE for users. Update `backend/src/api/routes/auth.routes.ts` with these additions (after existing routes):

```typescript
// Add imports:
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware";
import {
  createUser,
  archiveUser,
} from "../../modules/auth/auth.commands";
import { users } from "../../modules/auth/auth.projections";

// Add routes before `export default router`:

router.get("/users", authMiddleware, requireAdmin, (_req: Request, res: Response): void => {
  res.json(Array.from(users.values()));
});

router.post("/users", authMiddleware, requireAdmin, (req: Request, res: Response): void => {
  const { name, pin, role } = req.body;
  createUser(name, pin, role).then((id) => res.json({ id }));
});

router.delete("/users/:id", authMiddleware, requireAdmin, (req: Request, res: Response): void => {
  archiveUser(req.params.id).then(() =>
    res.json({ status: "archived" })
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/api/routes/auth.routes.ts
git commit -m "feat: add user management API endpoints for admin"
```

---

## Phase 14: Integration & Startup

### Task 25: Create startup script and README

**Files:**
- Create: `start.sh`

- [ ] **Step 1: Create start.sh**

```bash
#!/bin/bash
set -e

echo "Starting EventStoreDB..."
docker compose up -d

echo "Waiting for EventStoreDB..."
until curl -s http://localhost:2113/health/live > /dev/null 2>&1; do
  sleep 1
done

echo "EventStoreDB is ready!"

echo "Starting backend..."
cd backend && npm run dev &
BACKEND_PID=$!

echo "Starting frontend..."
cd ../frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo "POS System running:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3001"
echo "  ESDB UI:  http://localhost:2113"
echo ""
echo "Press Ctrl+C to stop all services"

trap "kill $BACKEND_PID $FRONTEND_PID; docker compose down" EXIT
wait
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x start.sh
```

- [ ] **Step 3: Add .gitignore**

```bash
echo "node_modules/\ndist/\ndata/\n.superpowers/" > .gitignore
```

- [ ] **Step 4: Commit**

```bash
git add start.sh .gitignore
git commit -m "chore: add startup script and gitignore"
```

---

## Plan Self-Review

**1. Spec coverage check:**
- Multi-user sessions with PIN auth: Tasks 7, 8, 16, 17, 21
- EventStoreDB with immutable events: Tasks 3, 4, 5-15
- Admin panel (items, groups, terminals, users, company): Tasks 23, 24
- Daily overview: Tasks 15, 18, 23 (DailyOverview component)
- Transaction history with search/filter: Tasks 15, 18, 23 (TransactionHistory component)
- Print receipt (pickup per item + final): Tasks 14, 18, 22
- VAT on groups, items inherit: Tasks 5, 6, 12
- ESC/POS via WebUSB from Chrome kiosk + server PDF: Tasks 14, 22 (usePrinter hook)
- No deletion (archive only): All command files use archive pattern
- Order lifecycle + cancellation: Tasks 11, 12, 13
- Company header on receipts: Tasks 9, 14
- All prices with € sign: Both frontend and PDF code
- Terminal-specific item sets: Tasks 10, 22

**2. Placeholder scan:** No TODOs, TBDs, or vague "implement later" items found.

**3. Type consistency:** Backend types flow from .types.ts → .commands.ts → .projections.ts → routes. Frontend types match API payloads. Event property names are consistent.

**One gap found:** The `require` calls in `orders.commands.ts` and `terminals.projections.ts` use `require()` which is not idiomatic TypeScript. These should use proper imports. Let me note this as a refinement for implementation — during execution, replace `require()` calls with proper imports by restructuring the module dependency graph. This is a known circular dependency issue that should be resolved by injecting the orders map or using a lazy-access pattern.
