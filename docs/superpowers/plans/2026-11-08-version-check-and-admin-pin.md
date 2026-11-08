# Versionsprüfung und Admin-PIN – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** „Artikel abholen“ und „Buchungen übertragen“ prüfen vorher die Versionen von Kasse und Server und verlangen den Admin-PIN, den nur der Server prüft. Die lokalen Daten der Kasse bekommen eine Formatversion mit Migrationsmechanismus.

**Architecture:**
- Alle Pakete tragen eine gemeinsame Version. Der Server liefert sie über `GET /api/version` aus und prüft sie zusätzlich auf den Sync-Endpunkten.
- Eine neue Middleware nach `checkTerminalKey` prüft in dieser Reihenfolge Version (409), Sperre (429) und PIN (401).
- Die Kasse fragt vor jedem Abgleich `/api/version` ab, zeigt dann einen PIN-Dialog und schickt den PIN nur im Request mit.
- `LocalStore` bekommt `format.json` und eine `migrate()`-Kette, die Main vor allem anderen ausführt.

**Tech Stack:** wie bisher (Express 5, React 19, Electron, Vitest 5, Playwright).

**Spec:** `docs/superpowers/specs/2026-11-08-version-check-and-admin-pin-design.md`

## Global Constraints

- Gemeinsame Version **`0.2.0`** in `package.json`, `backend/package.json`, `frontend/package.json` und `terminal/package.json`.
- Versionsvergleich: Eine Version passt nur bei identischem `MAJOR.MINOR.PATCH` (Regex `^\d+\.\d+\.\d+$`). „Älter“ und „neuer“ werden numerisch pro Stelle bestimmt. Eine unlesbare Version gilt als „passt nicht“.
- Neue Header: `x-terminal-version` und `x-admin-pin`.
- Reihenfolge der Prüfungen: Schlüssel 401 → Version 409 → Sperre 429 → PIN 401.
- Exakte Server-Texte:
  - `"Versionen passen nicht zusammen"` (409, Body zusätzlich `serverVersion`)
  - `"Admin-PIN falsch"` (401)
  - `"Zu viele falsche PIN-Versuche – bitte in 5 Minuten erneut versuchen"` (429)
  - der bestehende Text `"Terminal-Schlüssel ungültig"`
- Sperre: 5 falsche PINs in Folge pro Terminal-ID führen zu 5 Minuten Sperre (`300_000` ms). Ein richtiger PIN oder das Ende der Sperre setzt den Zähler zurück. Vergleich mit `crypto.timingSafeEqual`.
- Exakte Texte an der Kasse:
  - `Kasse ist veraltet (Kasse ${k}, Server ${s}) – bitte App beenden und neu starten, damit das Update installiert wird`
  - `Server ist veraltet (Server ${s}, Kasse ${k}) – bitte zuerst den Server aktualisieren`
  - `Versionen passen nicht zusammen`
  - `Admin-PIN falsch`
  - der Sperrtext vom Server
  - der bestehende Text `Server nicht erreichbar`
- PIN-Dialog: Titel „Admin-PIN“, Knöpfe „OK“ und „Abbrechen“, Eingabe maskiert.
- Der PIN wird nie gespeichert und nie geloggt: nicht in `settings.json`, nicht im Event-Log, nicht in `console.*`, auf keiner Seite.
- Keine Versionsprüfung und kein erzwungenes Update beim Start der Kasse.
- Lokales Datenformat: `format.json` = `{ "format": 1 }`. Fehlt die Datei, gilt Format 1. Bei einem höheren Format als dem eigenen wird nichts verändert, und die Kasse zeigt `Lokale Daten stammen von einer neueren Version – bitte aktuelle Version installieren`.

## Review Focus

1. **Übertragen ohne offene Buchungen:** Es erscheinen weder PIN-Dialog noch Versionsabfrage. Das Ergebnis lautet wie bisher „0 Buchung(en) übertragen“, weil kein Request nötig ist. → Test in Task 4.
2. **„Abbrechen“ im PIN-Dialog:** Es wird nichts abgeglichen, es erscheint keine Fehlermeldung, und die Kasse bleibt bedienbar. → Test in Task 4.
3. **Falscher PIN beim Einrichten:** Es werden keine Einstellungen und kein Katalog gespeichert, und der Assistent bleibt offen. → Test in Task 4.
4. **Mehrere Upload-Stapel:** Jeder Stapel schickt denselben PIN mit. Ein 401 oder 429 in Stapel 2 behält `partial.accepted` aus Stapel 1. → Test in Task 3.
5. **Sperre läuft ab:** Nach 5 Minuten ist der richtige PIN wieder gültig, und der Zähler steht auf 0. → Test in Task 2.

---

### Task 1: Gemeinsame Version und `GET /api/version`

**Files:**
- Modify: alle vier `package.json` → `"version": "0.2.0"`, danach `npm install --package-lock-only` je Paket, damit die Lockfiles mitziehen.
- Create: `backend/src/version.ts`
- Modify: `backend/src/index.ts`, also `app.get("/api/version", …)` vor den anderen Routen.
- Modify: `.github/workflows/terminal-release.yml`. Der Tag-Check prüft zusätzlich `backend/package.json`.
- Modify: `frontend/src/views/AdminLayout.tsx`. Die Version steht klein neben „Administration“, etwa als `v0.2.0`, geladen über `GET /api/version`.
- Test: `backend/src/__tests__/version.test.ts` (neu), `frontend/src/tests/Admin.test.tsx`

**Interfaces:**
- Produces:
  - `serverVersion(): string` liest `version` aus der `package.json` neben `dist/` bzw. `src/`. Der Pfad wird relativ zu `import.meta.url` aufgelöst (`../package.json`), das Ergebnis wird gecacht.
  - `GET /api/version` liefert `{ version: string }`, öffentlich und ohne Auth.

- [ ] **Step 1: Write the failing tests**
  - `version.test.ts`:
    - `"all package.json files carry the same version"` liest die vier Dateien relativ zum Repo-Root und erwartet eine einzige Version, nämlich `"0.2.0"`.
    - `"GET /api/version returns the backend version"` erwartet per supertest `{ version: "0.2.0" }`.
  - `Admin.test.tsx`: `"header shows server version"`. Der Fetch-Mock liefert `{ version: "0.2.0" }`, erwartet wird der Text `v0.2.0`.
- [ ] **Step 2:** `cd backend && npx vitest run src/__tests__/version.test.ts` und `cd frontend && npx vitest run` – Expected: FAIL.
- [ ] **Step 3:** Implementieren wie oben beschrieben. Damit supertest den Endpunkt ohne Projektionen testen kann, wird die Route bei Bedarf in `backend/src/api/routes/version.routes.ts` ausgelagert.
- [ ] **Step 4:** `npm test` (Root) – Expected: PASS. Der Workflow muss weiterhin als YAML parsen: `python3 -c "import yaml;yaml.safe_load(open('.github/workflows/terminal-release.yml'))"`.
- [ ] **Step 5: Commit** `feat: shared version 0.2.0 and GET /api/version`

### Task 2: Server prüft Version, Sperre und PIN auf den Sync-Endpunkten

**Files:**
- Create: `backend/src/api/middleware/sync-access.middleware.ts`, `backend/src/modules/sync/pin-guard.ts`
- Modify: `backend/src/api/routes/sync.routes.ts`. Beide Routen bekommen `checkTerminalKey, checkSyncAccess`.
- Modify: `backend/src/__tests__/sync.test.ts` und `e2e/admin-reporting.spec.ts` (Helfer `syncSale`). Beide senden künftig `x-terminal-version: "0.2.0"` und `x-admin-pin: "0000"`.
- Test: `backend/src/__tests__/sync-access.test.ts` (neu)

**Interfaces:**
- Consumes: `serverVersion()` aus Task 1, `config.adminPin`, `res.locals.terminal` aus `checkTerminalKey`.
- Produces:
  - `createPinGuard(opts: { maxFailures: number; lockMs: number; now: () => number }): { isLocked(terminalId: string): boolean; recordFailure(terminalId: string): void; recordSuccess(terminalId: string): void }`
  - `pinMatches(given: string, expected: string): boolean` mit `timingSafeEqual`. Bei unterschiedlicher Länge gibt es `false`, ohne Exception.
  - `checkSyncAccess(req, res, next)` nutzt eine modulweite Guard-Instanz `{ maxFailures: 5, lockMs: 300_000, now: Date.now }`. Für Tests wird sie über `export function resetSyncAccessForTests(now?: () => number)` neu erzeugt.

- [ ] **Step 1: Write the failing tests** (`sync-access.test.ts`, supertest gegen eine Mini-App mit gemocktem `checkTerminalKey`, der `res.locals.terminal = { id: "t1" }` setzt):
  - `"missing x-terminal-version → 409 with serverVersion"`
  - `"different version → 409 before PIN is checked"`: Bei falscher Version und falschem PIN ist der Status 409, und der Fehlerzähler steigt nicht.
  - `"wrong PIN → 401 Admin-PIN falsch"`
  - `"5 wrong PINs lock the terminal: 6th request with correct PIN → 429"`
  - `"lock expires after 5 minutes and counter restarts"`: Mit fake `now` und +300_000 ms ist der richtige PIN wieder gültig (200). Danach gilt: 4 falsche PINs führen noch nicht zur Sperre.
  - `"correct PIN resets the failure count"`: 4 falsche, 1 richtiger und wieder 4 falsche führen nicht zu 429.
  - `"lock is per terminal"`: t1 gesperrt, t2 nicht.
  - `pinMatches("0000","00000") === false` (kein Throw)
- [ ] **Step 2:** `cd backend && npx vitest run src/__tests__/sync-access.test.ts` – Expected: FAIL.
- [ ] **Step 3:** Implementieren. Den PIN nicht loggen. Für die bestehenden `sync.test.ts` die Header ergänzen.
- [ ] **Step 4:** `cd backend && npx vitest run && npx tsc --noEmit` – Expected: PASS.
- [ ] **Step 5: Commit** `feat(sync): require matching version and admin PIN, lock after 5 wrong PINs`

### Task 3: Sync-Client der Kasse – Versionsabfrage, PIN, neue Fehlertexte

**Files:**
- Create: `terminal/src/renderer/sync/version.ts`
- Modify: `terminal/src/renderer/sync/client.ts`
- Test: `terminal/src/renderer/sync/version.test.ts`, `terminal/src/renderer/sync/client.test.ts`

**Interfaces:**
- Produces:
  - `compareVersions(a: string, b: string): -1 | 0 | 1 | null`. Bei unlesbarer Version gibt es `null`.
  - `versionMismatchText(appVersion: string, serverVersion: string): string | null`. Bei gleicher Version gibt es `null`, sonst einen der drei Texte aus den Global Constraints (Kasse älter, Kasse neuer, unlesbar).
  - `checkServerVersion(serverUrl: string, appVersion: string): Promise<void>` ruft `GET /api/version` auf, mit dem 15-s-Timeout. Bei Abweichung wirft es `SyncError(versionMismatchText(...))`, bei Netzfehler `SyncError("Server nicht erreichbar")`.
  - `interface SyncAuth { pin: string; appVersion: string }`
  - `fetchCatalog(s: TerminalSettings, auth: SyncAuth)` und `uploadAll(s: TerminalSettings, uploads: BookingUpload[], auth: SyncAuth)` senden zusätzlich `x-terminal-version` und `x-admin-pin`. Die Signaturen ändern sich also um den letzten Parameter.
  - Fehlerzuordnung in `request`:
    - 401 mit `error === "Admin-PIN falsch"` → `SyncError("Admin-PIN falsch")`
    - 401 sonst → der bestehende Schlüssel-Text
    - 429 → `SyncError(body.error)`, Fallback ist der Sperrtext aus den Global Constraints
    - 409 → `SyncError(versionMismatchText(auth.appVersion, body.serverVersion) ?? "Versionen passen nicht zusammen")`

- [ ] **Step 1: Write the failing tests**
  - `compareVersions`:
    - `("0.2.0","0.2.0") → 0`
    - `("0.9.0","0.10.0") → -1`
    - `("1.0.0","0.9.9") → 1`
    - `("0.2.0-rc1","0.2.0") → null`
  - `versionMismatchText`: Für alle drei Fälle wird der exakte Text erwartet.
  - `checkServerVersion`: Bei Abweichung wirft es mit dem Text „Kasse ist veraltet (Kasse 0.2.0, Server 0.3.0) – …“. Bei einem `fetch`-Reject wirft es „Server nicht erreichbar“.
  - `client.test.ts`:
    - `"fetchCatalog sends x-admin-pin and x-terminal-version"`
    - `"401 Admin-PIN falsch maps to PIN text, other 401 to key text"`
    - `"429 maps to server lock text"`
    - `"409 maps to version text using serverVersion"`
    - `"uploadAll sends the same PIN in every batch and keeps partial on 401 in batch 2"`
- [ ] **Step 2:** `cd terminal && npx vitest run src/renderer/sync` – Expected: FAIL.
- [ ] **Step 3:** Implementieren. Aufrufer in `useTerminal.ts` werden in Task 4 angepasst. Bis dahin kann `tsc` dort fehlschlagen, deshalb gehören Task 3 und Task 4 in denselben Branch-Stand, bevor `tsc` als Gate gilt. Ruling: In Task 3 wird nur `vitest` für `src/renderer/sync` verlangt.
- [ ] **Step 4:** `cd terminal && npx vitest run src/renderer/sync` – Expected: PASS.
- [ ] **Step 5: Commit** `feat(terminal): version check and admin PIN in sync client`

### Task 4: Kasse – PIN-Dialog und Ablauf bei Abholen, Übertragen und Einrichtung

**Files:**
- Create: `terminal/src/renderer/components/PinDialog.tsx`
- Modify: `terminal/src/renderer/state/useTerminal.ts` (`fetchCatalog`, `upload`), `terminal/src/renderer/App.tsx`, `terminal/src/renderer/components/SetupWizard.tsx` (nur falls nötig)
- Modify: `terminal/src/renderer/tests/fake-bridge.ts`, `terminal/src/renderer/tests/App.test.tsx`
- Modify: `e2e/terminal.spec.ts`. Nach „Einrichten & Artikel abholen“, „Artikel abholen“ und „Buchungen übertragen“ wird im Dialog „Admin-PIN“ `0000` eingegeben und „OK“ geklickt. Ausnahme: Übertragen mit 0 offenen Buchungen.
- Test: `terminal/src/renderer/tests/App.test.tsx`

**Interfaces:**
- Consumes:
  - aus Task 3: `checkServerVersion`, `fetchCatalog(s, auth)`, `uploadAll(s, uploads, auth)`, `SyncError`
  - Bridge: `appVersion()`
- Produces:
  - `PinDialog({ onSubmit(pin: string): void; onCancel(): void })`
  - Der Ablauf in `useTerminal`. Die Aktionen bekommen den PIN über einen Promise-basierten Prompt `requestPin(): Promise<string | null>`. Ihn stellt `App` bereit und übergibt ihn an `useTerminal({ requestPin })`, oder `useTerminal` hält den Dialog-State selbst. Entscheidend ist der Ablauf:
    1. `checkServerVersion(settings.serverUrl, appVersion)`. Bei einem Fehler erscheint die Meldung, und es geht nicht weiter.
    2. `requestPin()`. Bei `null` (Abbrechen) passiert ohne Meldung nichts weiter.
    3. Der Abgleich mit `{ pin, appVersion }`.
  - Die Netzwartezeiten laufen weiterhin außerhalb der Aktions-Queue (R12), und der `syncing`-Guard deckt die ganze Sequenz einschließlich der PIN-Eingabe ab.
  - **Übertragen ohne Buchungen**, also `pendingUploads` leer: keine Versionsprüfung, kein PIN, Meldung wie bisher.
  - **Einrichtung:** dieselbe Sequenz mit den Kandidaten-Einstellungen. Bei Fehler oder Abbruch wird nichts gespeichert, die bestehende Logik bleibt.
  - Der PIN-String wird nach dem Abgleich nicht im State behalten.

- [ ] **Step 1: Write the failing tests** (App.test, Sync-Client gemockt):
  - `"Artikel abholen asks for PIN and sends it"`: Nach „Artikel abholen“ erscheint der Dialog „Admin-PIN“, PIN „1234“ und „OK“ führen zu einem `fetchCatalog`-Aufruf mit `{ pin: "1234", appVersion }`.
  - `"version mismatch shows message and no PIN dialog"`: `checkServerVersion` wirft `SyncError("Server ist veraltet …")`. Die Meldung ist sichtbar, es gibt keinen Dialog und keinen `fetchCatalog`-Aufruf.
  - `"cancel in PIN dialog aborts silently"`: kein `fetchCatalog`-Aufruf, keine Fehlermeldung.
  - `"wrong PIN on upload shows Admin-PIN falsch, nothing marked synced"`
  - `"upload with nothing pending needs no PIN"`: kein Dialog, kein `checkServerVersion`-Aufruf.
  - `"setup: wrong PIN saves nothing and wizard stays"`
  - `"PIN is not persisted"`: Nach erfolgreichem Abholen enthält kein `saveSettings`-, `appendEvents`- oder `saveCatalog`-Aufruf den PIN-String. Geprüft wird per `JSON.stringify` aller Fake-Bridge-Aufrufe.
- [ ] **Step 2:** `cd terminal && npx vitest run src/renderer/tests` – Expected: FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `cd terminal && npx vitest run && npx tsc --noEmit && npm run build`. Danach `npm run test:e2e` vom Root, mit Postgres über `docker compose up -d postgres` (vorher `pg_isready` abwarten) und `DISPLAY=:0`. Expected: alles PASS.
- [ ] **Step 5: Commit** `feat(terminal): admin PIN dialog and version check before every sync`

### Task 5: Migrierbares lokales Datenformat

**Files:**
- Create: `terminal/src/main/migrations.ts`
- Modify: `terminal/src/main/store.ts`
- Modify: `terminal/src/main/index.ts`. `start()` ruft `store.migrate()` vor `compact` auf. Bei `FormatTooNewError` werden `compact` und die Store-IPC übersprungen, und `app:storeError` liefert den Text.
- Modify: `terminal/src/preload/index.ts`, `terminal/src/shared/types.ts`. Die Bridge bekommt `storeError(): Promise<string | null>`.
- Modify: `terminal/src/renderer/App.tsx`. Ist `storeError` nicht `null`, zeigt die App nur einen Vollbild-Hinweis mit diesem Text.
- Test: `terminal/src/main/store.test.ts`, `terminal/src/main/migrations.test.ts`, `terminal/src/renderer/tests/App.test.tsx`

**Interfaces:**
- Produces:
  - `export const CURRENT_FORMAT = 1;`
  - `export interface Migration { from: number; run(dir: string): Promise<void> }`
  - `export const MIGRATIONS: Migration[] = [];` mit einem Kommentar: Felder werden nur ergänzt. Umbenennen oder Entfernen geht nur per Migration. Neue Pflichtfelder bekommen beim Lesen einen Standardwert.
  - `export class FormatTooNewError extends Error {}` mit der Meldung aus den Global Constraints
  - `LocalStore.migrate(migrations = MIGRATIONS, current = CURRENT_FORMAT): Promise<void>` läuft serialisiert. Fehlt `format.json`, gilt Format 1.
    - Format größer als `current`: Es wirft `FormatTooNewError` und verändert nichts.
    - Sonst: Es führt für `f = format … current-1` die Migration mit `from === f` aus, schreibt danach jeweils `format.json` atomar mit `f+1`, und schreibt am Ende `format.json` mit `current`, falls die Datei noch fehlt.
  - `LocalStore.format(): Promise<number>` (für Tests)

- [ ] **Step 1: Write the failing tests**
  - `"missing format.json counts as format 1 and is written"`
  - `"higher format is refused without touching files"`: Bei `format.json` = 2 und Ereignissen im Verzeichnis wirft `migrate()` `FormatTooNewError`. Die Dateien haben danach byteweise denselben Inhalt.
  - `"runs migrations in order and bumps format after each"`: Mit zwei Test-Migrationen (`from: 1` und `from: 2`, `current = 3`) wird die Reihenfolge protokolliert, am Ende steht `format.json` = 3.
  - `"failed migration leaves format at the last completed step"`: Wirft die zweite Migration, steht `format.json` auf 2.
  - App: `"storeError shows blocking message"`
- [ ] **Step 2:** `cd terminal && npx vitest run src/main src/renderer/tests` – Expected: FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `cd terminal && npx vitest run && npx tsc --noEmit && npm run build` – Expected: PASS.
- [ ] **Step 5: Commit** `feat(terminal): versioned local data format with migration chain`
