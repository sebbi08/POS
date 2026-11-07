# Offline-Terminal-App – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kassen-Terminals werden eine eigenständige Electron-App, die offline kassiert und druckt und auf Knopfdruck Artikel vom Server holt bzw. Buchungen an ihn überträgt. Der Server wertet nach Zeitraum aus.

**Architecture:** Der Server bekommt zwei Sync-Endpunkte (`GET /api/sync/catalog`, `POST /api/sync/bookings`), die mit einem Terminal-Schlüssel geschützt sind. Das Terminal schreibt genau die Order-Events, die der Server heute schon kennt, in eine lokale append-only JSONL-Datei (Main-Prozess, fsync). Beim Übertragen fügt der Server sie idempotent mit Original-Zeitstempel in `order_events` ein. Die Auswertung rechnet auf Anfrage aus der `orders`-Projektion statt aus inkrementellen Tageszählern. Die Browser-Kasse fällt weg, ihre Komponenten (Artikelraster, Bestellpanel, Druck) ziehen in die App.

**Tech Stack:** Backend Express 5 + pg + Vitest (bestehend). Terminal: Electron (aktuelle stabile Version), electron-vite, React 19, Tailwind 4, `@point-of-sale/receipt-printer-encoder`, WebUSB im Renderer, electron-builder + electron-updater, Vitest, Playwright (`_electron`).

**Spec:** `docs/superpowers/specs/2026-11-07-offline-terminal-app-design.md`

## Global Constraints

- Alle sichtbaren Texte auf Deutsch: Terminal-App, Admin-Bereich und Login, Bons.
- Plattformen: Windows x64 (NSIS-Installer) und Linux x64 (AppImage). Kein Code-Signing.
- Auto-Update über GitHub Releases eines **öffentlichen** Repos.
- Das Terminal spricht den Server **nur** bei Ersteinrichtung, „Artikel abholen“, „Buchungen übertragen“ und beim Update-Check an. Keiner dieser Aufrufe darf das Kassieren blockieren.
- Erst dauerhaft speichern (fsync), dann Oberfläche aktualisieren, dann drucken.
- Zeitstempel: ISO-8601 UTC aus der Terminal-Uhr (`occurredAt`). Auswertungstage sind Kalendertage in `Europe/Berlin`.
- Uhrzeit-Warnung ab einer Abweichung von **mehr als 5 Minuten** zur Serverzeit. Es wird nichts korrigiert.
- Geldrundung überall wie bisher im Backend: `round2(x) = Math.round(x * 100) / 100`. Die MwSt. ist im Bruttopreis enthalten: `vat = total - total / (1 + rate / 100)`.
- Ein Storno am Terminal braucht keine PIN, nur einen Bestätigungsdialog. Stornierbar sind nur noch nicht übertragene Buchungen.
- Eine Gegenbuchung zählt in Auswertung und Transaktionsliste am Zeitpunkt der Originalbuchung.
- Die Admin-PIN wird nie auf dem Terminal gespeichert. Terminal-Zugang erfolgt über Header `x-terminal-id` + `x-terminal-key`.
- Lokale Daten liegen in `app.getPath("userData")/data`, überschreibbar per Env `POS_TERMINAL_DATA_DIR`. Nie im Programmverzeichnis.

## Review Focus

1. **Viele Events auf einmal** (Übertragung eines ganzen Festes): Alle müssen in der Live-Projektion ankommen, nicht nur das letzte. → Test in Task 1.
2. **Dieselbe Übertragung zweimal** (Timeout, erneut gedrückt, zwei Fenster): Jede Buchung zählt genau einmal, die zweite Antwort meldet sie trotzdem als `accepted`. → Tests in Task 4 und Task 13.
3. **Stromausfall mitten im Schreiben:** Eine abgeschnittene letzte Zeile in `events.jsonl` darf den Start nicht verhindern. Alle vollständigen Events bleiben erhalten. → Test in Task 7.
4. **Drucker fehlt, ist aus oder hat kein Papier beim Abschließen:** Die Buchung ist trotzdem gespeichert, der Zähler „nicht übertragen“ steigt, eine deutsche Fehlermeldung erscheint, und „Letzten Bon nachdrucken“ funktioniert danach. → Test in Task 11.
5. **„Artikel abholen“ schlägt fehl** (kein Netz, falscher Schlüssel, Server 500): Der alte Katalog bleibt vollständig nutzbar, und eine verständliche deutsche Meldung erscheint. → Test in Task 10.

---

## Teil A – Server

### Task 1: Event-Zeitstempel und verlustfreie Live-Projektion

Heute hat der Handler keinen Zugriff auf die Event-Zeit. Die Projektion setzt `createdAt`/`closedAt` deshalb auf `new Date()`, und beim Neustart des Servers wird alles auf „jetzt“ datiert. `subscribeToOrderEvents` liest pro NOTIFY nur `ORDER BY id DESC LIMIT 1`.

**Files:**
- Modify: `backend/src/modules/orders/order-eventstore.ts`
- Modify: `backend/src/projections/runner.ts`
- Modify: `backend/src/modules/orders/orders.projections.ts`
- Test: `backend/src/__tests__/eventstore.test.ts` (neu), `backend/src/__tests__/orders.test.ts`

**Interfaces:**
- Produces:
  - `type StoredEvent = { id: number; type: string; data: Record<string, unknown>; streamId: string; occurredAt: Date }`. `occurredAt` entspricht `created_at`.
  - `appendOrderEvent(streamId, eventType, data, occurredAt?: Date): Promise<void>`. Fehlt `occurredAt`, gilt `NOW()`.
  - `insertOrderEvents(client: PoolClient, streamId: string, events: { type: string; data: Record<string, unknown>; occurredAt: Date }[]): Promise<void>` fügt innerhalb einer vom Aufrufer gehaltenen Transaktion ein und sendet `NOTIFY "order_events"`. Postgres liefert die Benachrichtigung erst beim Commit.
  - `replayOrderEvents(handler: (e: StoredEvent) => Promise<void>): Promise<number>` gibt die höchste abgespielte `id` zurück (0 bei leerer Tabelle).
  - `subscribeToOrderEvents(fromId: number, handler: (e: StoredEvent) => void | Promise<void>)` holt pro Benachrichtigung `WHERE id > lastId ORDER BY id ASC`. Die Abrufe laufen nacheinander über eine Promise-Kette, damit sich zwei Benachrichtigungen nicht überholen.
  - `EventHandler` in `runner.ts` bekommt `StoredEvent`.
  - Projektion: `OrderOpened` → `createdAt = occurredAt`, `OrderClosed` → `closedAt = occurredAt`.

- [ ] **Step 1: Write the failing tests**
  - `eventstore.test.ts` mit gemocktem `getPool` (Muster wie `orders.test.ts`):
    - `"subscriber delivers every event inserted since the last seen id"`: Die Notification-Abfrage liefert 3 Zeilen (ids 5, 6, 7). Der Handler wird dreimal in dieser Reihenfolge aufgerufen. Die nächste Abfrage nutzt `$1 = 7`.
    - `"replay returns highest id"` → `7`.
  - `orders.test.ts`: `"OrderClosed sets closedAt from occurredAt"`. Der Handler erhält `occurredAt: new Date("2026-06-01T20:15:00Z")`, erwartet wird `orders.get("o1")!.closedAt?.toISOString() === "2026-06-01T20:15:00.000Z"`. Für `createdAt` bei `OrderOpened` entsprechend.
- [ ] **Step 2:** `cd backend && npx vitest run src/__tests__/eventstore.test.ts src/__tests__/orders.test.ts` – Expected: FAIL.
- [ ] **Step 3:** Die Interfaces oben implementieren. `startProjections` übergibt den Rückgabewert von `replayOrderEvents` als `fromId` an `subscribeToOrderEvents`. Bestehende Aufrufer von `appendOrderEvent` bleiben unverändert gültig.
- [ ] **Step 4:** `cd backend && npx vitest run` – Expected: alle PASS. Bestehende Projektions-Tests reichen bei Bedarf `occurredAt: new Date()` mit.
- [ ] **Step 5: Commit** `fix(events): carry event time into projections, deliver all events to live subscribers`

### Task 2: Auswertung über einen Zeitraum

**Files:**
- Modify (Rewrite): `backend/src/modules/reporting/reporting.projections.ts`, `backend/src/modules/reporting/reporting.types.ts`
- Modify: `backend/src/api/routes/reporting.routes.ts`, `backend/src/index.ts` (`initReportingProjections` entfällt)
- Test: `backend/src/__tests__/reporting.test.ts` (neu schreiben)

**Interfaces:**
- Consumes: `orders: Map<string, Order>` aus `orders.projections.ts`. `closedAt` ist ab Task 1 die echte Zeit.
- Produces (reine Funktionen, keine eigene Projektion mehr):
  - `berlinDay(d: Date): string` → `"YYYY-MM-DD"` über `d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })`.
  - `effectiveTime(o: Order): Date | undefined` gibt für eine Gegenbuchung `orders.get(o.cancelsOrderId).closedAt` zurück, sonst `o.closedAt`.
  - `interface Report { from: string; to: string; orderCount; cancelledCount; totalGross; totalVat; totalNet; vatByGroup: Record<string, { rate; gross; vat }>; byTerminal: Record<string, { orderCount; total }>; topItems: { itemId; name; count }[] }` hat dieselben Feldnamen wie der bisherige `DailyReport`, nur `date` wird durch `from`/`to` ersetzt.
  - `getReport(from: string, to: string): Report`. Gezählt werden **Verkäufe**: `status === "closed"`, kein `cancelsOrderId`, nicht verworfen (`OrderClosed.cancelled`). Dafür bekommt `Order` das Feld `discarded: boolean`, gesetzt in der Projektion. Ein Verkauf zählt, wenn `berlinDay(closedAt)` in `[from, to]` liegt. Verkäufe mit `cancelledByOrderId` gehen nicht in die Summen ein, sondern nur in `cancelledCount`. `topItems`: die 10 Artikel mit der höchsten Menge.
  - `listTransactions(f: { from: string; to: string; status?: "all" | "closed" | "cancelled"; terminal?: string; search?: string }): TransactionRecord[]` enthält Verkäufe und Gegenbuchungen, gefiltert nach `berlinDay(effectiveTime)`. `closedAt` ist `effectiveTime().toISOString()`. Sortiert absteigend nach `closedAt`. Offene Bestellungen werden nicht mehr aufgelistet.
  - Routen: `GET /api/reporting/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` und `GET /api/reporting/transactions?from&to&status&terminal&search`. Fehlt `from`/`to` oder ist es ungültig, antwortet der Server mit 400 `{ error: "Zeitraum ungültig" }`. `/daily` entfällt.

- [ ] **Step 1: Write the failing tests.** Orders werden direkt über den Order-Projektionshandler aufgebaut (wie bisher):
  - `"counts a sale closed at 23:30 Berlin time on that calendar day"`: `closedAt = 2026-06-01T21:30:00Z` → `getReport("2026-06-01","2026-06-01").orderCount === 1` und `getReport("2026-06-02","2026-06-02").orderCount === 0`.
  - `"range spanning two days sums both"`: Verkäufe am 06-01 (10 €) und 06-02 (5 €). `getReport("2026-06-01","2026-06-02").totalGross === 15`.
  - `"cancellation counts at the original booking time"`: Verkauf am 06-01, Gegenbuchung mit `createdAt` am 06-05. Ergebnis: `getReport("2026-06-01","2026-06-01")` liefert `orderCount 0`, `cancelledCount 1`, `totalGross 0`. `getReport("2026-06-05","2026-06-05").cancelledCount === 0`. `listTransactions({from:"2026-06-01",to:"2026-06-01"})` enthält beide Einträge.
  - `"discarded open order is not a sale"`: `OrderClosed` mit `cancelled: true` → `orderCount 0`.
  - `"vat by rate and by terminal"`: Werte aus dem bestehenden Test `accumulates daily totals` übernehmen.
  - Route: `GET /api/reporting/summary` ohne `from` → 400.
- [ ] **Step 2:** `cd backend && npx vitest run src/__tests__/reporting.test.ts` – Expected: FAIL.
- [ ] **Step 3:** Implementieren. `transactionHistory`, `dailyReport`, `itemCounts` und `initReportingProjections` werden gelöscht.
- [ ] **Step 4:** `cd backend && npx vitest run` – Expected: PASS.
- [ ] **Step 5: Commit** `feat(reporting): range-based report and transactions using booking time`

### Task 3: Terminal-Schlüssel und Abholbon-Einstellung

**Files:**
- Modify: `backend/src/db.ts`: In `initTables` nach dem `CREATE TABLE terminals` folgen `ALTER TABLE terminals ADD COLUMN IF NOT EXISTS api_key TEXT` und `ADD COLUMN IF NOT EXISTS print_pickup_receipts BOOLEAN NOT NULL DEFAULT TRUE`.
- Modify: `backend/src/modules/terminals/terminals.types.ts`, `terminals.repository.ts`, `backend/src/api/routes/terminals.routes.ts`
- Create: `backend/src/api/middleware/terminal-auth.middleware.ts`
- Test: `backend/src/__tests__/api.test.ts`, `backend/src/__tests__/terminal-auth.test.ts` (neu)

**Interfaces:**
- Produces:
  - `Terminal` bekommt `printPickupReceipts: boolean`. `apiKey` steht **nicht** im `Terminal`-Objekt.
  - `createTerminal(name, groupIds, printPickupReceipts = true)`, `updateTerminal(id, name, groupIds, printPickupReceipts)`. Die ungenutzten `printerVendorId/ProductId`-Parameter entfallen, die Spalten bleiben bestehen.
  - `generateTerminalKey(id: string): Promise<string>` erzeugt `crypto.randomBytes(24).toString("base64url")`, speichert ihn und gibt ihn zurück.
  - `getTerminalKey(id: string): Promise<string | null>`
  - `findTerminalByKey(id: string, key: string): Promise<Terminal | null>` vergleicht mit `crypto.timingSafeEqual`. Bei Längenunterschied oder fehlendem Schlüssel gibt es `null`.
  - `checkTerminalKey(req, res, next)` liest `x-terminal-id`/`x-terminal-key` und setzt `res.locals.terminal: Terminal`. Fehlt etwas oder ist es falsch: 401 `{ error: "Terminal-Schlüssel ungültig" }`.
  - Routen: `GET /api/terminals` (öffentlich) liefert `{ id, name, groupIds, printPickupReceipts }`. `GET /api/terminals/:id/key` (Admin) liefert `{ key: string | null }`. `POST /api/terminals/:id/key` (Admin) liefert `{ key }` (neu erzeugt, der alte wird ungültig). `POST`/`PUT` nehmen `printPickupReceipts` entgegen.
  - `GET /api/terminals/:id/items` entfällt (nur von der Browser-Kasse genutzt).

- [ ] **Step 1: Write the failing tests**
  - `"POST /api/terminals/:id/key without admin PIN returns 403"`
  - `"POST /api/terminals/:id/key returns a 32-char key"`: `body.key` passt auf `/^[A-Za-z0-9_-]{32}$/`.
  - `terminal-auth.test.ts`: `"rejects missing headers with 401 and German message"`, `"rejects wrong key"`, `"accepts correct key and sets res.locals.terminal"`. Das Repository wird dabei gemockt.
  - `"findTerminalByKey returns null for key of different length"` (kein Throw).
- [ ] **Step 2:** `cd backend && npx vitest run` – Expected: neue Tests FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `cd backend && npx vitest run` – Expected: PASS.
- [ ] **Step 5: Commit** `feat(terminals): per-terminal key and pickup receipt setting`

### Task 4: Sync-Endpunkte

**Files:**
- Create: `backend/src/modules/sync/sync.types.ts`, `sync.validation.ts`, `sync.service.ts`, `backend/src/api/routes/sync.routes.ts`
- Modify: `backend/src/db.ts`: neue Tabelle `synced_orders (order_id TEXT PRIMARY KEY, terminal_id TEXT NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`
- Modify: `backend/src/index.ts`: `app.use("/api/sync", syncRoutes)`, `express.json({ limit: "10mb" })`
- Test: `backend/src/__tests__/sync.test.ts`

**Interfaces** (die Vertragstypen werden in Task 7 Zeichen für Zeichen nach `terminal/src/shared/contract.ts` kopiert):
```ts
export type BookingEventType = "OrderOpened" | "ItemAdded" | "ItemRemoved"
  | "FinalReceiptPrinted" | "PickupReceiptPrinted" | "OrderClosed" | "OrderCancellationCreated";
export interface BookingEvent { type: BookingEventType; data: Record<string, unknown>; occurredAt: string }
export interface BookingUpload { orderId: string; events: BookingEvent[] }
export interface UploadRequest { orders: BookingUpload[] }
export interface UploadResponse { serverTime: string; accepted: string[]; rejected: { orderId: string; error: string }[] }
export interface CatalogSnapshot {
  serverTime: string;
  terminal: { id: string; name: string; printPickupReceipts: boolean };
  company: { name: string; address: string; city: string; vatId: string };
  groups: { id: string; name: string; vatRate: number }[];
  items: { id: string; name: string; groupId: string; price: number }[];
}
```
Die Felder in `data` sind exakt die bestehenden Interfaces aus `orders.types.ts`.

- Produces:
  - `GET /api/sync/catalog` (mit `checkTerminalKey`) liefert `CatalogSnapshot`: nur die Gruppen des Terminals und deren Artikel, sortiert nach Name.
  - `validateUpload(u: BookingUpload, terminalId: string, isKnownSale: (id: string) => boolean): string | null` gibt einen deutschen Fehlertext oder `null` zurück. Regeln:
    - `events` ist nicht leer, jeder Typ steht in der Liste, und jedes `occurredAt` ist ein gültiges Datum.
    - **Verkauf:** Das erste Event ist `OrderOpened` mit `data.id === orderId` und `data.terminalId === terminalId`. Alle übrigen Events haben `data.orderId === orderId`, und das letzte ist `OrderClosed`.
    - **Gegenbuchung:** Es gibt genau ein Event `OrderCancellationCreated` mit `data.id === orderId`, `data.terminalId === terminalId`, und `isKnownSale(data.cancelsOrderId)` ist wahr.
  - `ingestUploads(terminalId: string, uploads: BookingUpload[]): Promise<UploadResponse>` arbeitet die Liste der Reihe nach ab. Pro Buchung läuft eine eigene Transaktion:
    1. `INSERT INTO synced_orders … ON CONFLICT DO NOTHING RETURNING order_id`. Liefert das keine Zeile, ist die Buchung schon bekannt: `accepted`, keine Events.
    2. Sonst folgt `insertOrderEvents(client, "order-" + orderId, events)` mit `occurredAt = new Date(e.occurredAt)`, dann `COMMIT`.
    3. Ein Validierungsfehler landet in `rejected`, die Verarbeitung geht mit der nächsten Buchung weiter.
    - `isKnownSale` gibt `true` für eine Order-ID, die in diesem Batch bereits `accepted` ist oder in `orders` mit gleicher `terminalId` und ohne `cancelledByOrderId` existiert.
  - `POST /api/sync/bookings` (mit `checkTerminalKey`) nimmt `UploadRequest` und antwortet mit `UploadResponse`. Bei mehr als 200 Orders oder fehlendem Array: 400.

- [ ] **Step 1: Write the failing tests** (`db` gemockt, Client-`query` als Spy):
  - `"catalog returns only the terminal's groups and items with serverTime"`
  - `"accepts a valid sale and inserts its events with original occurredAt"`: Der Spy sieht das INSERT in `order_events` mit `created_at` gleich `occurredAt`.
  - `"second upload of the same order is accepted without inserting events"`: Das `synced_orders`-INSERT liefert `rows: []`, erwartet wird kein `order_events`-INSERT und `accepted` enthält die ID.
  - `"rejects sale from another terminal"`: `rejected[0].error` ist nicht leer, die übrigen Orders im Batch werden trotzdem `accepted`.
  - `"accepts cancellation whose original is earlier in the same batch"`
  - `"rejects sale whose last event is not OrderClosed"`
  - `"POST /api/sync/bookings without key returns 401"`
- [ ] **Step 2:** `cd backend && npx vitest run src/__tests__/sync.test.ts` – Expected: FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `cd backend && npx vitest run` – Expected: PASS.
- [ ] **Step 5: Commit** `feat(sync): catalog download and idempotent booking upload for terminals`

### Task 5: Browser-Kasse entfernen

**Files:**
- Modify: `backend/src/api/routes/orders.routes.ts` – Es bleibt nur `POST /:id/cancel` (Admin-Storno, jetzt mit `checkAdmin`). `GET /`, `/open`, `/:id/items`, `DELETE /:id/items/:itemId`, `/:id/print` und `/:id/close` entfallen.
- Delete: `backend/src/modules/receipts/` (nur von `/:id/print` genutzt), `config.receiptPdfDir` und die `pdfmake`-Abhängigkeit samt `@types/pdfmake`, `@types/pdfkit`, `src/types/pdfmake.d.ts`
- Modify: `backend/src/modules/orders/orders.commands.ts` – Es bleiben nur `cancelOrder` und seine Hilfsfunktionen.
- Delete: `frontend/src/views/POSLayout.tsx`, `frontend/src/components/ItemGrid.tsx`, `OrderPanel.tsx`, `PrinterSettings.tsx`, `frontend/src/utils/printer.ts`, `frontend/src/types/receipt-printer-encoder.d.ts`, `frontend/src/tests/POS.test.tsx`, `PrinterSettings.test.tsx`, `frontend/src/tests/__mocks__/`, die Aliase in `frontend/vitest.config.ts`, beide `@point-of-sale/*`-Abhängigkeiten, `e2e/pos.spec.ts`
  - Diese Dateien sind die Vorlage für Task 9 und Task 11. Dort holt man sie mit `git show $(git log -1 --format=%H --diff-filter=D -- frontend/src/views/POSLayout.tsx)^:<pfad>`.
- Modify: `frontend/src/App.tsx` (Route `/pos/:terminalId` entfällt), `frontend/src/views/Login.tsx` (keine Terminal-Auswahl mehr, nur noch PIN-Eingabe)
- Modify: `e2e/admin-reporting.spec.ts` – Bestellungen werden jetzt angelegt, indem man per API einen Terminal-Schlüssel erzeugt und `POST /api/sync/bookings` aufruft. Das Admin-Storno bleibt.
- Test: `backend/src/__tests__/api.test.ts` (Order-Route-Tests anpassen), `frontend/src/tests/Login.test.tsx`

- [ ] **Step 1:** Tests anpassen bzw. hinzufügen:
  - `"POST /api/orders/:id/cancel without admin PIN returns 403"`
  - `"POST /api/orders/open returns 404"`
  - `Login.test.tsx`: Die Startseite zeigt direkt die PIN-Eingabe, ohne Terminal-Buttons.
- [ ] **Step 2:** `npm test` (Root) – Expected: angepasste Tests FAIL.
- [ ] **Step 3:** Entfernen und anpassen wie oben beschrieben.
- [ ] **Step 4:** `npm test` – Expected: PASS. Danach `cd backend && npx tsc --noEmit` und `cd frontend && npx tsc --noEmit` ohne Fehler.
- [ ] **Step 5: Commit** `refactor: remove browser POS, keep admin only`

### Task 6: Admin – Terminal-Einstellungen, Zeitraum-Auswertung, alles auf Deutsch

**Files:**
- Modify: `frontend/src/components/TerminalConfig.tsx`: Checkbox „Abholbons drucken“; pro Terminal die Buttons „Schlüssel anzeigen“ und „Neuen Schlüssel erzeugen“. Erzeugen braucht eine Bestätigung: „Der alte Schlüssel wird ungültig. Das Terminal muss neu eingerichtet werden. Fortfahren?“
- Modify: `frontend/src/components/DailyOverview.tsx` → umbenennen in `ReportOverview.tsx`. Titel „Auswertung“, Felder „Von“/„Bis“ (Standard: beide heute), lädt `/reporting/summary`.
- Modify: `frontend/src/components/TransactionHistory.tsx`: dieselben Von/Bis-Felder, lädt `/reporting/transactions`, kein Status „open“ mehr.
- Modify: alle übrigen Admin- und Login-Texte auf Deutsch: `AdminLayout.tsx`, `Login.tsx`, `CatalogManager.tsx`, `CatalogImportExport.tsx`, `CompanySettings.tsx`, deutsche Fehlermeldungen der Backend-Routen. Zahlen im Format `12,50 €` über `toLocaleString("de-DE", { style: "currency", currency: "EUR" })`.
- Test: `frontend/src/tests/Admin.test.tsx`, `Login.test.tsx`, `e2e/admin.spec.ts`, `e2e/admin-reporting.spec.ts`

Feste Begriffe (überall gleich verwenden): Warengruppen, Artikel, Terminals, Firmendaten, Auswertung, Buchungen, Import/Export, Abmelden, Speichern, Abbrechen, Löschen, Bearbeiten, Stornieren, MwSt.

- [ ] **Step 1: Write the failing tests**
  - `Admin.test.tsx`: `"report tab requests summary for selected range"`. Wenn „Von“ auf `2026-06-01` und „Bis“ auf `2026-06-02` gesetzt sind, ruft `fetch` `/api/reporting/summary?from=2026-06-01&to=2026-06-02` auf.
  - `"terminal config shows generated key"`: Ein Klick auf „Neuen Schlüssel erzeugen“ und die Bestätigung führen dazu, dass der zurückgegebene Schlüssel sichtbar ist.
  - `"tabs are German"`: Die Tabs „Auswertung“, „Buchungen“, „Warengruppen“, „Artikel“, „Terminals“, „Firmendaten“ und „Import/Export“ sind sichtbar.
  - Die E2E-Specs werden auf die deutschen Texte umgestellt.
- [ ] **Step 2:** `cd frontend && npx vitest run` – Expected: FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `npm test && npm run test:e2e` – Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): German UI, range report, terminal key and pickup settings`

## Teil B – Terminal-App (`terminal/`)

### Task 7: Grundgerüst und lokaler Speicher

**Files:**
- Create: `terminal/package.json` (`name: "pos-terminal"`, `productName: "POS Kasse"`, `main: "out/main/index.js"`). Scripts: `dev` (`electron-vite dev`), `build` (`electron-vite build`), `test` (`vitest run`), `dist` (`electron-vite build && electron-builder`).
- Create: `terminal/electron.vite.config.ts`, `terminal/tsconfig.json`, `terminal/vitest.config.ts`. Vitest-Projekte: `src/main/**` mit `node`, `src/renderer/**` mit `jsdom`.
- Create: `terminal/src/shared/contract.ts` (Kopie aus Task 4), `terminal/src/shared/types.ts`
- Create: `terminal/src/main/index.ts` (Fenster `1280×800`, `contextIsolation: true`, IPC-Handler für den Store), `terminal/src/main/store.ts`, `terminal/src/preload/index.ts`
- Create: `terminal/src/renderer/index.html`, `main.tsx`, `App.tsx` (vorerst nur eine Platzhalterseite „POS Kasse“), `index.css` (Tailwind wie im Frontend)
- Modify: Root `package.json` → `test` führt zusätzlich `cd terminal && npx vitest run` aus. `.gitignore`: `terminal/out`, `terminal/dist`.
- Test: `terminal/src/main/store.test.ts`

**Interfaces:**
```ts
// shared/types.ts
export interface NewEvent { orderId: string; type: BookingEventType; data: Record<string, unknown>; occurredAt: string }
export interface LocalEvent extends NewEvent { seq: number }
export type CatalogItem = CatalogSnapshot["items"][number];
export type CatalogGroup = CatalogSnapshot["groups"][number];
export interface SavedPrinter { vendorId: number; productId: number; name: string }
export interface TerminalSettings {
  serverUrl: string; terminalId: string; terminalKey: string;
  changeCalculator: boolean; printer: SavedPrinter | null; paperWidth: "58" | "80";
  lastCatalogFetchAt: string | null; clockSkewMs: number | null;
}
export interface TerminalBridge {   // window.terminal
  appendEvents(events: NewEvent[]): Promise<LocalEvent[]>;
  readEvents(): Promise<LocalEvent[]>;
  markSynced(orderIds: string[]): Promise<void>;
  readSynced(): Promise<Record<string, string>>;     // orderId -> syncedAt ISO
  saveCatalog(c: CatalogSnapshot): Promise<void>;
  loadCatalog(): Promise<CatalogSnapshot | null>;
  saveSettings(s: TerminalSettings): Promise<void>;
  loadSettings(): Promise<TerminalSettings | null>;
  appVersion(): Promise<string>;
}
```
- `class LocalStore { constructor(dir: string) }` mit denselben Methoden wie `TerminalBridge` (ohne `appVersion`) und zusätzlich `compact(retentionDays: number, now: Date): Promise<void>`.
  - Dateien: `events.jsonl`, `synced.jsonl` (`{"orderId","syncedAt"}` pro Zeile), `catalog.json`, `settings.json`.
  - `appendEvents` schreibt alle Events mit **einem** `fs.write` und ruft danach `fsync` auf. Erst dann wird aufgelöst. `seq` wird fortlaufend ab dem höchsten vorhandenen Wert vergeben. Aufrufe werden über eine interne Promise-Kette serialisiert.
  - `readEvents` überspringt eine nicht parsebare **letzte** Zeile mit `console.warn`. Eine nicht parsebare Zeile mitten in der Datei bricht dagegen mit einem Fehler ab.
  - JSON-Dateien werden atomar geschrieben: `*.tmp` schreiben, `fsync`, `rename`.
  - `compact(30, now)` entfernt die Events von Orders, deren `syncedAt` älter als 30 Tage ist, und schreibt die Datei atomar neu. Main ruft das einmal beim Start auf.
- Datenverzeichnis: `process.env.POS_TERMINAL_DATA_DIR ?? join(app.getPath("userData"), "data")`.

- [ ] **Step 1: Write the failing tests** (`store.test.ts`, temporäres Verzeichnis über `fs.mkdtemp`):
  - `"appendEvents assigns increasing seq and readEvents returns them in order"`
  - `"events survive a new LocalStore instance on the same dir"`
  - `"truncated last line is skipped, previous events kept"`: zwei Events schreiben, dann `{"orderId":"x","ty` anhängen. Erwartet: `readEvents()` liefert 2 Events.
  - `"saveCatalog is atomic: no partial file left after write"`: Danach existiert `catalog.json`, `catalog.json.tmp` nicht.
  - `"compact drops only orders synced more than 30 days ago"`
  - `"concurrent appendEvents calls do not interleave or duplicate seq"`: `Promise.all` mit 20 Aufrufen ergibt `seq` 1..20 ohne Lücken.
- [ ] **Step 2:** `cd terminal && npm install && npx vitest run src/main` – Expected: FAIL.
- [ ] **Step 3:** Grundgerüst und Store implementieren. Preload exponiert `window.terminal` über `contextBridge`.
- [ ] **Step 4:** `npx vitest run src/main` → PASS. `npm run build` → ohne Fehler. `npm run dev` öffnet ein Fenster mit „POS Kasse“.
- [ ] **Step 5: Commit** `feat(terminal): electron app skeleton with durable local event store`

### Task 8: Buchungslogik (rein, ohne UI)

**Files:**
- Create: `terminal/src/renderer/domain/money.ts`, `domain/orders.ts`, `domain/sync-selection.ts`
- Test: `terminal/src/renderer/domain/orders.test.ts`, `sync-selection.test.ts`

**Interfaces:**
```ts
export interface OrderLine { itemId: string; name: string; qty: number; unitPrice: number; vatRate: number; vatAmount: number; total: number }
export interface LocalOrder {
  id: string; terminalId: string; status: "open" | "closed"; discarded: boolean;
  lines: OrderLine[]; totalGross: number; totalVat: Record<string, number>; totalNet: number;
  openedAt: string; closedAt?: string; firstSeq: number;
  cancelsOrderId?: string; cancelledByOrderId?: string; title?: string;
}
export function projectOrders(events: LocalEvent[]): Map<string, LocalOrder>;
export function openOrderOf(orders: Map<string, LocalOrder>): LocalOrder | undefined;
// Commands: pure, return events to persist; `now` ISO, `newId` uuid injected for tests
export function cmdAddItem(order: LocalOrder | undefined, terminalId: string, item: CatalogItem, group: CatalogGroup, now: string, newId: () => string): NewEvent[];
export function cmdChangeQty(order: LocalOrder, itemId: string, delta: 1 | -1, now: string): NewEvent[];
export function cmdRemoveLine(order: LocalOrder, itemId: string, now: string): NewEvent[];
export function cmdDiscard(order: LocalOrder, now: string): NewEvent[];
export function cmdCheckout(order: LocalOrder, printPickups: boolean, now: string): NewEvent[];
export function cmdCancel(original: LocalOrder, now: string, newId: () => string): NewEvent[];
export function lastPrintable(orders: Map<string, LocalOrder>): LocalOrder | undefined;
// sync-selection.ts
export function pendingUploads(events: LocalEvent[], orders: Map<string, LocalOrder>, synced: Record<string, string>): BookingUpload[];
export function unsyncedCount(orders: Map<string, LocalOrder>, synced: Record<string, string>): number;
export function cancellableOrders(orders: Map<string, LocalOrder>, synced: Record<string, string>): LocalOrder[];
```
Regeln:
- `cmdAddItem` ohne offene Order erzeugt `OrderOpened` + `ItemAdded`. `unitPrice`, `vatRate` und `name` werden aus dem Katalog übernommen. Die Beträge berechnet man wie in `backend/src/modules/orders/orders.commands.ts` (`addItemToOrder`).
- `cmdChangeQty(-1)` auf einer Zeile mit `qty 1` erzeugt `ItemRemoved` statt `ItemAdded qty -1`.
- `cmdCheckout` erzeugt in dieser Reihenfolge: `FinalReceiptPrinted`, dann pro Zeile `PickupReceiptPrinted` (nur bei `printPickups`), dann `OrderClosed`. Die Summen kommen aus `closeOrder` im Backend. Bei leerer Order wird ein Fehler geworfen.
- `cmdDiscard` erzeugt `OrderClosed` mit `cancelled: true` und leeren Summen.
- `cmdCancel` erzeugt ein einzelnes `OrderCancellationCreated` mit negierten Zeilen und Summen wie bei `cancelOrder` im Backend. `title` ist `Storno zu Bestellung #${original.id.slice(0, 8)}`. Der Befehl wirft einen Fehler, wenn das Original bereits storniert, verworfen, offen oder selbst eine Gegenbuchung ist.
- Bei `projectOrders` ist `closedAt` das `occurredAt` von `OrderClosed`. Bei einer Gegenbuchung ist es das `occurredAt` des Events.
- `pendingUploads` umfasst alle geschlossenen Orders ohne Eintrag in `synced`, aufsteigend nach `firstSeq`, mit all ihren Events in `seq`-Reihenfolge. Offene Orders sind nicht dabei.
- `lastPrintable` ist die geschlossene, nicht verworfene Order mit dem höchsten `firstSeq`, Gegenbuchungen eingeschlossen.

- [ ] **Step 1: Write the failing tests**
  - `"add, add same item, checkout → totals and VAT match backend rounding"`: 3 × 2,50 € bei 19 % ergibt `totalGross 7.5`, `totalVat {"19": 1.2}`, `totalNet 6.3`.
  - `"decrease qty 1 emits ItemRemoved"`
  - `"checkout without pickups emits no PickupReceiptPrinted, last event is OrderClosed"`
  - `"cancel negates lines and links both orders after projection"`
  - `"cancel of an already cancelled order throws"`
  - `"pendingUploads excludes open and synced orders and keeps original before its cancellation"`
  - `"cancellableOrders excludes synced, discarded, cancelled and cancellation orders"`
- [ ] **Step 2:** `cd terminal && npx vitest run src/renderer/domain` – Expected: FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Gleicher Befehl – Expected: PASS.
- [ ] **Step 5: Commit** `feat(terminal): offline order domain and sync selection`

### Task 9: Bondruck in Electron

**Files:**
- Create: `terminal/src/renderer/print/layout.ts` (Bon-Aufbau als Datenstruktur), `print/encode.ts` (ESC/POS über Encoder, inkl. Rand-Workaround), `print/usb.ts` (WebUSB-Transport)
  - Vorlagen: `frontend/src/views/POSLayout.tsx` (`handlePrint`) und `frontend/src/utils/printer.ts` aus dem Stand vor Task 5.
- Create: `terminal/src/main/usb.ts`: Handler `select-usb-device`, `setDevicePermissionHandler`, `setPermissionCheckHandler` für `usb`.
- Create: `terminal/src/renderer/components/PrinterSettings.tsx` (aus dem Frontend übernehmen, übersetzt). Der Drucker wird in `TerminalSettings.printer`/`paperWidth` gespeichert statt in localStorage.
- Test: `terminal/src/renderer/print/layout.test.ts`, `components/PrinterSettings.test.tsx`

**Interfaces:**
```ts
export type ReceiptLine =
  | { kind: "text"; text: string; align: "left" | "center" | "right"; bold?: boolean }
  | { kind: "rule" } | { kind: "blank" } | { kind: "cut" };
export interface PrintContext { company: CatalogSnapshot["company"]; terminalName: string; width: 32 | 42; copy: boolean }
export function layoutFinalReceipt(order: LocalOrder, ctx: PrintContext): ReceiptLine[];
export function layoutPickupReceipts(order: LocalOrder, ctx: PrintContext): ReceiptLine[][];
export function layoutJobs(order: LocalOrder, ctx: PrintContext, printPickups: boolean): ReceiptLine[][]; // final (+ pickups unless cancellation)
export function encodeJob(lines: ReceiptLine[], width: 32 | 42): Uint8Array;
export class PrintError extends Error {}               // message is German, shown to user
export function printJobs(printer: SavedPrinter, jobs: Uint8Array[]): Promise<void>; // throws PrintError
```
Feste Texte auf dem Bon (Layout sonst wie bisher):
- Kopf: Firmenname fett und zentriert, Adresse, Ort, `USt-ID: …`
- Titel: `Kassenbon`, bei einer Gegenbuchung `STORNO`. Bei `copy` folgt darunter `*** KOPIE ***`.
- Position: `${qty} x ${name}` linksbündig, `${betrag} EUR` rechtsbündig. Betrag mit Komma, z. B. `7,50`.
- MwSt.: `MwSt. 19 %:` … `1,20 EUR`
- Summe: `Summe: 7,50 EUR`, fett und zentriert.
- Fuß: `Bestellung #${id.slice(0,8)} · ${terminalName}`, darunter `closedAt` mit `toLocaleString("de-DE")`. Bei einer Gegenbuchung zusätzlich `Storno zu #${cancelsOrderId.slice(0,8)}`.
- Abholbon: Titel `Abholbon #${n}`, dann die Position zentriert, Fuß wie oben.
- Gegenbuchungen bekommen keine Abholbons.
- `PrintError`-Meldungen: `"Kein Drucker eingerichtet"`, `"Drucker nicht gefunden – ist er eingeschaltet und angeschlossen?"`, `"Drucken fehlgeschlagen: ${detail}"`.
- `select-usb-device` in Main: Bei einem Filter mit vendorId/productId wird automatisch das erste passende Gerät gewählt. Bei leerem Filter (Suche in den Druckereinstellungen) schickt Main `details.deviceList` per `webContents.send("usb:choose", list)`. Der Renderer zeigt die Liste und antwortet über `ipcRenderer.invoke("usb:chosen", deviceId | null)`. Die Bridge bekommt dafür `onUsbChoose(cb)` und `chooseUsb(id)`.

- [ ] **Step 1: Write the failing tests**
  - `"final receipt contains German totals with comma decimals"`: Der Text enthält `Kassenbon`, `3 x Bier`, `7,50 EUR`, `MwSt. 19 %:` und `Summe: 7,50 EUR`.
  - `"copy flag adds KOPIE line"`
  - `"cancellation prints STORNO and no pickup jobs"`: `layoutJobs(cancel, ctx, true).length === 1`
  - `"pickup jobs only when enabled"`: 2 Zeilen, `printPickups=true` → 3 Jobs, `false` → 1 Job.
  - `PrinterSettings.test.tsx`: Die gespeicherte Auswahl landet über die gemockte Bridge in `saveSettings`.
- [ ] **Step 2:** `cd terminal && npx vitest run src/renderer/print src/renderer/components` – Expected: FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Tests PASS. Danach manuell mit echtem Drucker: `npm run dev`, Drucker in den Einstellungen suchen und Testdruck auslösen.
- [ ] **Step 5: Commit** `feat(terminal): German receipt layout and USB printing in Electron`

### Task 10: Sync-Client (Einrichtung, Artikel abholen, Buchungen übertragen)

**Files:**
- Create: `terminal/src/renderer/sync/client.ts`
- Test: `terminal/src/renderer/sync/client.test.ts`

**Interfaces:**
```ts
export class SyncError extends Error {}   // German message for the user
export const CLOCK_WARN_MS = 5 * 60 * 1000;
export function listTerminals(serverUrl: string): Promise<{ id: string; name: string }[]>;
export function fetchCatalog(s: TerminalSettings): Promise<{ catalog: CatalogSnapshot; clockSkewMs: number }>;
export function uploadAll(s: TerminalSettings, uploads: BookingUpload[]): Promise<{ accepted: string[]; rejected: { orderId: string; error: string }[]; clockSkewMs: number }>;
```
- `clockSkewMs = Date.parse(serverTime) - (Zeitpunkt der Anfrage + Antwort) / 2`
- `uploadAll` schickt Stapel zu je 50 Orders, nacheinander. Schlägt ein Stapel fehl, wirft die Funktion `SyncError`. Was vorher `accepted` war, steht dann in `error.partial: { accepted: string[] }`, damit der Aufrufer es trotzdem als übertragen markiert.
- Fehlertexte: Netzwerk/Timeout → `"Server nicht erreichbar"`, 401 → `"Terminal-Schlüssel ungültig – bitte Terminal neu einrichten"`, sonst `"Serverfehler (${status})"`. Timeout nach 15 s (`AbortSignal.timeout`).
- `serverUrl` wird normalisiert: kein abschließender `/`, fehlt das Schema, wird `https://` ergänzt.

- [ ] **Step 1: Write the failing tests** (`fetch` gemockt):
  - `"fetchCatalog sends terminal headers and returns skew"`
  - `"fetchCatalog maps 401 to German key error"`, `"network error maps to Server nicht erreichbar"`, `"500 maps to Serverfehler (500)"`
  - `"uploadAll sends 120 orders in 3 batches of max 50"`
  - `"uploadAll failure on batch 2 exposes batch-1 accepted ids in partial"`
- [ ] **Step 2:** `cd terminal && npx vitest run src/renderer/sync` – Expected: FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(terminal): sync client with batching, clock skew and German errors`

### Task 11: Kassenoberfläche

**Files:**
- Create: `terminal/src/renderer/state/useTerminal.ts`
- Create: `terminal/src/renderer/components/SetupWizard.tsx`, `StatusBar.tsx`, `ItemGrid.tsx`, `OrderPanel.tsx` (übernommen aus dem Frontend), `CheckoutDialog.tsx`, `CancelList.tsx`, `SettingsDialog.tsx`
- Modify: `terminal/src/renderer/App.tsx`: Gibt es keine Settings, erscheint `SetupWizard`, sonst die Kasse.
- Test: `terminal/src/renderer/tests/App.test.tsx` (Bridge, Sync-Client und `printJobs` gemockt)

**Interfaces:**
- Consumes: Bridge (Task 7), Domain (Task 8), `layoutJobs`/`encodeJob`/`printJobs` (Task 9), Sync-Client (Task 10).
- Produces: `useTerminal()` liefert `{ ready, settings, catalog, orders, openOrder, unsyncedCount, clockWarning: string | null, busy, message: { kind: "error" | "info"; text: string } | null, actions }`. Die Actions sind `addItem`, `changeQty`, `removeLine`, `discard`, `checkout`, `cancel`, `reprintLast`, `fetchCatalog`, `upload`, `saveSettings` und `dismissMessage`. Alle laufen über eine gemeinsame Warteschlange nacheinander. Jede Action persistiert zuerst über `appendEvents`, aktualisiert dann den Zustand und druckt erst danach.

Verhalten und feste Texte:
- **Einrichtung:** Felder „Serveradresse“ → Button „Terminals laden“ → Auswahl → Feld „Terminal-Schlüssel“ → Button „Einrichten & Artikel abholen“. Schlägt das Abholen fehl, wird nichts gespeichert und die `SyncError`-Meldung angezeigt.
- **Statusleiste:**
  - Terminal-Name
  - `Artikelstand: ${toLocaleString("de-DE")}` bzw. `Noch keine Artikel abgeholt`
  - `${n} Buchung(en) nicht übertragen`
  - Buttons „Artikel abholen“, „Buchungen übertragen“, „Letzten Bon nachdrucken“, „Storno“, „Einstellungen“
  - Bei einer Uhrabweichung über `CLOCK_WARN_MS` ein dauerhaftes gelbes Banner: `Die Uhr dieses Rechners weicht um ${m} Minuten von der Serverzeit ab. Bitte Uhrzeit prüfen.`
- **Bestellpanel:** leer → `Keine offene Bestellung. Artikel antippen zum Starten.`; Buttons „Bezahlen & Drucken“ und „Verwerfen“ (mit Bestätigung `Bestellung verwerfen?`).
- **Rückgeldrechner** (wenn `settings.changeCalculator`): „Bezahlen & Drucken“ öffnet `CheckoutDialog` mit `Summe`, Eingabe `Gegeben`, Anzeige `Rückgeld` (negativ → `Betrag reicht nicht`) und den Buttons „Abschließen & Drucken“ / „Abbrechen“. Ist er aus, wird direkt abgeschlossen.
- **Storno:** `CancelList` zeigt `cancellableOrders`. Ein Klick fragt `Buchung #${id8} über ${betrag} wirklich stornieren?` mit „Ja, stornieren“ / „Abbrechen“. Danach wird die Gegenbuchung persistiert und der STORNO-Bon gedruckt.
- **Druckfehler:** `message = { kind: "error", text: PrintError.message + " – Buchung ist gespeichert. „Letzten Bon nachdrucken“ verwenden." }`
- **Nachdrucken:** `lastPrintable` mit `copy: true`. Abholbons werden nachgedruckt, wenn das Terminal sie aktiviert hat.
- **Artikel abholen:** Bei Erfolg folgen `saveCatalog`, `lastCatalogFetchAt` und `clockSkewMs` werden gespeichert, dann `Artikel aktualisiert`. Bei Fehler bleibt der alte Katalog unangetastet.
- **Übertragen:** `pendingUploads` → `uploadAll` → `markSynced(accepted ∪ partial.accepted)`. Ergebnis: `${a} Buchung(en) übertragen` plus gegebenenfalls `, ${r} abgelehnt: ${erster Fehler}`.
- **Einstellungen:** Drucker (`PrinterSettings`), „Rückgeldrechner anzeigen“ an/aus, Papierbreite, „Terminal neu einrichten“. Neu einrichten ist gesperrt, solange `unsyncedCount > 0` ist, mit dem Hinweis `Erst alle Buchungen übertragen`.
- Beim Start wird die offene Bestellung wiederhergestellt, und `compact` läuft (über Main).

- [ ] **Step 1: Write the failing tests** (RTL):
  - `"first start shows setup wizard"`
  - `"tap item twice then Bezahlen & Drucken persists events before printing"`: Die Mock-Reihenfolge ist `appendEvents` (mit `OrderClosed`) vor `printJobs`. `1 Buchung(en) nicht übertragen` ist sichtbar.
  - `"print failure keeps booking and shows German error; reprint calls printJobs with copy"`: `printJobs` wirft `new PrintError("Drucker nicht gefunden – ist er eingeschaltet und angeschlossen?")`. Die Meldung ist sichtbar, und der Zähler steht auf 1.
  - `"double click on Bezahlen & Drucken closes only one order"`: Genau ein `OrderClosed` wird persistiert.
  - `"fetch catalog failure keeps old items visible and shows Server nicht erreichbar"`
  - `"cancel requires confirmation and then persists OrderCancellationCreated"`
  - `"change calculator shows Rückgeld 2,50 € for Gegeben 10 on 7,50 €"`
  - `"open order is restored after remount"`: Die Bridge liefert Events einer offenen Order.
  - `"upload marks accepted orders synced and counter drops to 0"`
- [ ] **Step 2:** `cd terminal && npx vitest run src/renderer/tests` – Expected: FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `cd terminal && npx vitest run` – Expected: alle PASS.
- [ ] **Step 5: Commit** `feat(terminal): offline POS UI with setup, checkout, storno, reprint and sync`

### Task 12: Installer und Auto-Update

**Files:**
- Create: `terminal/electron-builder.yml`: `appId: de.pos.kasse`, `productName: POS Kasse`, `directories.output: dist`, `win.target: nsis` (x64), `nsis.oneClick: false`, `nsis.perMachine: false`, `linux.target: AppImage` (x64), `linux.category: Office`, `publish: { provider: github, owner: <OWNER>, repo: <REPO>, releaseType: release }`
- Create: `terminal/src/main/updater.ts`
- Create: `.github/workflows/terminal-release.yml`
- Modify: `terminal/src/main/index.ts` (Updater starten), Bridge um `onUpdateReady(cb)` erweitern, `StatusBar.tsx` zeigt `Update ${version} bereit – wird beim Beenden installiert`.
- Test: `terminal/src/main/updater.test.ts`

**Interfaces:**
- `startUpdater(opts: { isPackaged: boolean; notify: (version: string) => void }): void`. Bei `!isPackaged` passiert nichts. Sonst gilt `autoDownload = true` und `autoInstallOnAppQuit = true`. Danach `checkForUpdates()` 10 s nach dem Start und dann alle 30 Minuten. Fehler werden nur geloggt. `quitAndInstall` wird **nie** aufgerufen.
- Workflow: Trigger `push` auf Tags `terminal-v*`. Matrix `windows-latest` und `ubuntu-latest`. Schritte: `npm ci` in `terminal/`, dann `npx electron-builder --publish always` mit `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` und `permissions: contents: write`. Die Version kommt aus `terminal/package.json`, die zum Tag passen muss.

- [ ] **Step 1:** `<OWNER>`/`<REPO>` mit dem Nutzer klären und erst nach seiner Zustimmung das öffentliche Repo anlegen und den Remote setzen, z. B. `gh repo create <name> --public --source . --remote origin`. Ohne Zustimmung bleiben Platzhalter stehen und der Task wird als blockiert gemeldet.
- [ ] **Step 2: Write the failing tests** (`electron-updater` gemockt): `"does nothing when not packaged"`, `"never calls quitAndInstall"`, `"update-downloaded triggers notify with version"`, `"check errors are swallowed"`.
- [ ] **Step 3:** `cd terminal && npx vitest run src/main/updater.test.ts` – Expected: FAIL.
- [ ] **Step 4:** Implementieren.
- [ ] **Step 5:** Tests PASS. Danach `cd terminal && npx electron-builder --linux AppImage --publish never` ausführen: Es soll `dist/POS Kasse-<version>.AppImage` entstehen. Auf Windows deckt das der CI-Lauf ab.
- [ ] **Step 6: Commit** `feat(terminal): installers and GitHub Releases auto-update`

### Task 13: End-to-End über App und Server

**Files:**
- Create: `e2e/terminal.spec.ts` (Playwright `_electron`)
- Modify: `e2e/global-setup.ts` (vorher `cd terminal && npx electron-vite build`), `playwright.config.ts` falls nötig

**Interfaces:**
- Consumes: alle vorherigen Tasks. Der Spec startet die App mit `_electron.launch({ args: ["terminal/out/main/index.js"], env: { ...process.env, POS_TERMINAL_DATA_DIR: tmpDir } })`. Testdaten (Gruppe, Artikel, Terminal, Schlüssel, Firmendaten) werden per Admin-API angelegt.

- [ ] **Step 1: Write the tests**
  - `"setup, fetch items, sell offline without printer, restart keeps booking"`:
    1. Einrichten
    2. 2 × Bier, „Bezahlen & Drucken“: Es erscheint die Druckfehler-Meldung, und `1 Buchung(en) nicht übertragen` ist sichtbar.
    3. App schließen und neu starten: Der Zähler steht weiterhin auf 1.
  - `"upload twice counts once in the admin report"`: Zweimal „Buchungen übertragen“. Danach liefert die Admin-API `GET /api/reporting/summary?from=<heute>&to=<heute>` `orderCount === 1`.
  - `"storno at terminal before upload shows as cancelled in admin"`
  - `"server unreachable on Artikel abholen keeps items"`: Die Serveradresse in den Einstellungen wird über die Bridge auf einen toten Port umgestellt. Die Meldung `Server nicht erreichbar` erscheint, und die Artikel bleiben sichtbar.
- [ ] **Step 2:** `npm run test:e2e` – Expected: alle Specs PASS.
- [ ] **Step 3: Commit** `test(e2e): terminal app against real backend`
