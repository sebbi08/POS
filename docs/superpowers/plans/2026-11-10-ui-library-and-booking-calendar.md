# Component Library und Buchungskalender – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auswertung und Buchungen bekommen einen Kalender mit Buchungszahlen pro Tag und eine Schnellauswahl der letzten Feste; Admin-Frontend und Kasse werden komplett auf shadcn/ui umgestellt.

**Architecture:** Ein neuer Lese-Endpunkt `GET /api/reporting/booking-days` liefert alle Buchungstage mit Anzahl (gleiche Zählung wie `orderCount`). Das Frontend gruppiert sie in reinen Funktionen zu Festen und zeigt sie in einem `DateRangePicker` (shadcn `Popover` + `Calendar`). Beide React-Apps bekommen je eine eigene shadcn-Einrichtung (Tailwind v4, CSS-Variablen, nur dunkel); die Kasse zusätzlich Touch-Größen und eine `TouchDialog`-Hülle, die das heutige Schließ- und Fokusverhalten der Dialoge erhält.

**Tech Stack:** Express + Vitest (Backend), React 19 + Vite 8 + Tailwind 4 + TypeScript 7 (Frontend), Electron + electron-vite (Kasse), shadcn/ui (Radix, cva, tailwind-merge, lucide-react), react-day-picker v9 + date-fns (nur Frontend), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-11-10-ui-library-and-booking-calendar-design.md`. Die Spec ist maßgeblich, hier steht nur, was sie nicht festlegt.

## Global Constraints

- Arbeit ausschließlich im Worktree `/home/sebastian/code/POS/.claude/worktrees/ui-library-calendar`, Branch `feature/ui-library-calendar`.
- Jede Commit-Message endet mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stil wie im Repo: `feat(frontend): …`, `test(e2e): …` usw.
- Kein Versions-Bump in irgendeiner `package.json`.
- Nur dunkles Theme; Primärfarbe Blau (`oklch(0.546 0.245 262.881)` = Tailwind `blue-600`), `--primary-foreground` weiß; destruktive Aktionen `variant="destructive"`.
- Keine Webfonts; System-Font-Stack wie heute. Keine Laufzeit-Requests ins Netz aus der Kasse (CSP in `terminal/src/renderer/index.html` bleibt unverändert).
- Tage sind ISO-Strings `YYYY-MM-DD` in `Europe/Berlin`. **Nie** `Date.prototype.toISOString()` für einen Kalendertag verwenden (verschiebt in UTC+-Zonen um einen Tag).
- Barrierefreie Namen, Rollen und Dialog-Titel, auf die sich Tests stützen, bleiben exakt gleich. Einzige gewollte Ausnahme: die Labels „Von“/„Bis“ verschwinden.
- Kassen-Bedienelemente: mindestens 48 × 48 px (`min-h-12 min-w-12`), nichts nur per Hover.
- TypeScript 7: `paths` ohne `baseUrl` (`"paths": { "@/*": ["./src/*"] }`).

## Review Focus

1. **Range-Auswahl beim erneuten Öffnen:** Ist schon 10.–12. gewählt und man tippt 20., dann 22., muss 20.–22. herauskommen, nicht 10.–22. (react-day-picker erweitert im `range`-Modus sonst den bestehenden Bereich). → Test in Task 4.
2. **Sommer-/Winterzeit-Wechsel:** 24./25./26.10.2026 und 28./29./30.03.2026 sind je ein zusammenhängendes Fest; die Tagesarithmetik darf nicht über lokale Millisekunden laufen. → Test in Task 3.
3. **Fest über Monats-/Jahresgrenze:** 31.07.–01.08. ist ein Fest mit Label „31. Juli – 1. August 2026“; 31.12.2025–01.01.2026 → „31. Dezember 2025 – 1. Januar 2026“; Trigger-Label bei Jahreswechsel zeigt beide Jahre. → Tests in Task 3.
4. **Radix-Escape doppelt:** Der PIN-Dialog hat einen eigenen Escape-Handler; zusammen mit Radix würde `onCancel` zweimal feuern. Bestehender Test „Escape cancels“ erwartet `toHaveBeenCalledOnce`. → Task 8 (Escape nur über Radix).
5. **Hängende `pointer-events: none` auf `<body>`:** Radix setzt das während eines modalen Dialogs; wird der Dialog per Unmount geschlossen (so arbeitet die Kasse), muss es wieder weg sein, sonst ist die Kasse nicht mehr bedienbar. → Test in Task 7.

---

### Task 1: Backend – Endpunkt `booking-days`

**Files:**
- Modify: `backend/src/modules/reporting/reporting.types.ts`
- Modify: `backend/src/modules/reporting/reporting.projections.ts`
- Modify: `backend/src/api/routes/reporting.routes.ts`
- Test: `backend/src/__tests__/reporting.test.ts`

**Interfaces:**
- Produces: `interface BookingDay { day: string; orderCount: number }` (exportiert aus `reporting.types.ts`); `getBookingDays(): BookingDay[]` aufsteigend nach `day`, nur Tage mit `orderCount > 0`; Route `GET /api/reporting/booking-days` → `BookingDay[]`, hinter `checkAdmin`.

- [ ] **Step 1: Failing tests** in `reporting.test.ts` (Helfer `sale`/`cancel` existieren schon):
  - `"booking days count sales per Berlin day, ascending"`: Verkäufe `2026-07-10T10:00:00Z`, `2026-07-11T21:30:00Z` (= 23:30 Berlin, zählt 11.), `2026-07-11T22:30:00Z` (= 00:30 Berlin, zählt 12.) → `[{day:"2026-07-10",orderCount:1},{day:"2026-07-11",orderCount:1},{day:"2026-07-12",orderCount:1}]`.
  - `"booking days skip cancelled and discarded orders"`: Verkauf a, Verkauf b + `cancel("c","b",…)`, verworfene offene Bestellung → nur a zählt; Tag ohne gezählte Buchung fehlt im Ergebnis.
  - `"booking days sum equals report orderCount"`: mehrere Verkäufe über 3 Tage inkl. Storno → `sum(getBookingDays() in [from,to]) === getReport(from,to).orderCount`.
  - Route: `"GET /api/reporting/booking-days returns the days"` (200, Array) und `"GET /api/reporting/booking-days needs the admin PIN"` (ohne `x-admin-pin` → 401, wie bei den anderen Routen).
- [ ] **Step 2:** `cd backend && npx vitest run src/__tests__/reporting.test.ts` → die neuen Tests scheitern (`getBookingDays` nicht definiert).
- [ ] **Step 3:** `getBookingDays()` implementieren: dieselben Prädikate wie `getReport` (`isSale`, `!order.cancelledByOrderId`, `berlinDay(order.closedAt)`), Map → sortiertes Array. Route ohne Query-Parameter.
- [ ] **Step 4:** Tests laufen grün; `cd backend && npx vitest run` komplett grün.
- [ ] **Step 5:** Commit `feat(backend): reporting/booking-days lists days with their sale count`.

---

### Task 2: Frontend – shadcn/ui einrichten

**Files:**
- Create: `frontend/components.json`, `frontend/src/lib/utils.ts`, `frontend/src/components/ui/{button,input,label,select,card,table,badge,alert,alert-dialog,dialog,popover,calendar}.tsx`
- Modify: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/vitest.config.*`, `frontend/src/index.css`, `frontend/index.html`, `frontend/src/tests/setup.ts`
- Test: `frontend/src/tests/ui-smoke.test.tsx`

**Interfaces:**
- Produces: Pfad-Alias `@/` → `frontend/src/`; `cn(...inputs: ClassValue[]): string` in `@/lib/utils`; shadcn-Bausteine unter `@/components/ui/*` mit Standard-API.

- [ ] **Step 1: Failing test** `ui-smoke.test.tsx`: `"shadcn button renders with primary styling"` – `render(<Button>OK</Button>)` aus `@/components/ui/button`; `getByRole("button",{name:"OK"})` hat Klasse `bg-primary`.
- [ ] **Step 2:** `cd frontend && npx vitest run src/tests/ui-smoke.test.tsx` → FAIL (Modul nicht gefunden).
- [ ] **Step 3:** Einrichten:
  - Alias in `tsconfig.json` (`paths`, s. Global Constraints), `vite.config.ts` und Vitest-Config (`resolve.alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }`).
  - `npx shadcn@latest init` (Stil new-york, Basisfarbe neutral, CSS-Variablen) und `npx shadcn@latest add button input label select card table badge alert alert-dialog dialog popover calendar`. Scheitert die CLI an TS 7/Vite 8, Komponenten von ui.shadcn.com manuell übernehmen und die Abhängigkeiten selbst installieren.
  - `index.css`: dunkle Palette direkt in `:root` (nur dunkel), Primär-Blau laut Global Constraints, `body { background: var(--background); color: var(--foreground) }`, bisheriger Font-Stack. `index.html`: `<html lang="de" class="dark">`.
  - `src/tests/setup.ts`: Polyfills für jsdom – `ResizeObserver` (Stub-Klasse), `Element.prototype.hasPointerCapture/releasePointerCapture/setPointerCapture`, `Element.prototype.scrollIntoView`, `window.matchMedia` – jeweils nur, wenn nicht vorhanden.
- [ ] **Step 4:** Smoke-Test grün; `cd frontend && npx vitest run` (alle bestehenden Tests grün) und `npm run build` grün.
- [ ] **Step 5:** Commit `build(frontend): set up shadcn/ui with a dark theme`.

---

### Task 3: Frontend – Buchungstage und Feste (reine Funktionen)

**Files:**
- Create: `frontend/src/lib/booking-days.ts`
- Test: `frontend/src/tests/booking-days.test.ts`

**Interfaces:**
- Produces (alle aus `@/lib/booking-days`):
  - `type BookingDay = { day: string; orderCount: number }`
  - `type Festival = { from: string; to: string; orderCount: number }`
  - `addDays(iso: string, n: number): string` – Arithmetik über UTC (`Date.UTC`), nie lokale Zeit
  - `isoToDate(iso: string): Date` (lokale Mitternacht) und `dateToIso(d: Date): string` (aus lokalen Feldern `getFullYear/getMonth/getDate`)
  - `groupFestivals(days: BookingDay[], limit = 5): Festival[]` – aufeinanderfolgende Tage (`addDays(prev.day,1) === day`) zusammenfassen, Summe bilden, neueste zuerst, auf `limit` kürzen; Eingabe darf unsortiert sein
  - `formatRangeLabel(from: string, to: string): string` – `"12.07.2026"` | `"10.07. – 12.07.2026"` | `"28.12.2025 – 02.01.2026"`
  - `formatFestivalLabel(f: Festival): string` – `"1. Mai 2026"` | `"10.–12. Juli 2026"` | `"31. Juli – 1. August 2026"` | `"31. Dezember 2025 – 1. Januar 2026"`
  - `formatCount(n: number): string` – `"1 Buchung"` | `"1.044 Buchungen"` (de-DE Tausenderpunkt)

- [ ] **Step 1: Failing tests** mit genau diesen Fällen:
  - `groupFestivals`: `[10.07.,11.07.,12.07.,14.07.]` → zwei Feste, neuestes zuerst `{from:"2026-07-14",to:"2026-07-14"}`, dann `{from:"2026-07-10",to:"2026-07-12",orderCount:Summe}`; 7 getrennte Tage → genau 5 Ergebnisse, die neuesten; leeres Array → `[]`; unsortierte Eingabe → gleiches Ergebnis wie sortiert.
  - DST: `["2026-10-24","2026-10-25","2026-10-26"]` und `["2026-03-28","2026-03-29","2026-03-30"]` → je **ein** Fest. Monats-/Jahresgrenze: `["2026-07-31","2026-08-01"]` und `["2025-12-31","2026-01-01"]` → je ein Fest.
  - `addDays("2026-10-25",1) === "2026-10-26"`, `addDays("2026-03-01",-1) === "2026-02-28"`.
  - `dateToIso(isoToDate("2026-07-10")) === "2026-07-10"`.
  - Alle Label-Beispiele aus dem Interfaces-Block oben, plus `formatCount(1)`, `formatCount(1044)`.
- [ ] **Step 2:** `cd frontend && npx vitest run src/tests/booking-days.test.ts` → FAIL.
- [ ] **Step 3:** Implementieren. Monatsnamen über `toLocaleDateString("de-DE", { month: "long", timeZone: "UTC" })` auf `Date.UTC`-Werten oder date-fns `format` mit `de`-Locale – beides ok, solange die Tests passen.
- [ ] **Step 4:** Tests grün.
- [ ] **Step 5:** Commit `feat(frontend): group booking days into festivals`.

---

### Task 4: Frontend – `DateRangePicker` und Einbau

**Files:**
- Create: `frontend/src/components/DateRangePicker.tsx`
- Modify: `frontend/src/components/ReportOverview.tsx`, `frontend/src/components/TransactionHistory.tsx`
- Delete: `frontend/src/components/RangeFields.tsx`
- Test: `frontend/src/tests/DateRangePicker.test.tsx`; Modify `frontend/src/tests/Admin.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`groupFestivals`, `formatRangeLabel`, `formatFestivalLabel`, `formatCount`, `isoToDate`, `dateToIso`), Task 1 (`GET /reporting/booking-days` → `BookingDay[]`), `api.get` aus `../api/client`.
- Produces: `DateRangePicker({ from, to, onChange }: { from: string; to: string; onChange: (r: { from: string; to: string }) => void })`. Trigger: `Button variant="outline"` mit `CalendarDays`-Icon, Text `formatRangeLabel(from,to)`, `aria-label={"Zeitraum: " + formatRangeLabel(from,to)}`. Fest-Einträge sind Buttons mit Namen `"<formatFestivalLabel>, <formatCount>"`, z. B. `"10.–12. Juli 2026, 1.044 Buchungen"`. Überschrift der Liste: „Letzte Buchungstage“. Leer: „Noch keine Buchungen“. Ladefehler: „Buchungszahlen konnten nicht geladen werden“.

Auswahl-Logik (nicht über das eingebaute `range`-Verhalten von react-day-picker, siehe Review Focus 1):

```
state pending: Date | null   // null beim Öffnen und nach Schließen
Calendar mode="range", selected = pending ? { from: pending, to: undefined } : { from: isoToDate(from), to: isoToDate(to) }
onSelect: no-op; Klicks über onDayClick(day):
  pending == null → pending = day
  sonst → [a,b] = sortiert(pending, day); onChange({ from: dateToIso(a), to: dateToIso(b) }); schließen
```

Weitere Festlegungen: `defaultMonth={isoToDate(from)}`, `locale={de}`, `weekStartsOn={1}`, ein Monat. Gezählte Tage über `modifiers={{ booked: Date[] }}` farbig hinterlegt; Anzahl klein unter der Tageszahl über eine eigene `DayButton`-Komponente, die die Zahl aus einer `Map<iso, number>` holt. Barrierefreier Tagesname über `labels.labelDayButton`: `"Samstag, 11. Juli 2026, 534 Buchungen"` (ohne Buchungen ohne Zusatz). Laden bei jedem Öffnen (`onOpenChange(true)`), veraltete Antworten verwerfen.

`ReportOverview`/`TransactionHistory`: `from`/`to` in **einen** State `range` zusammenlegen, damit ein Fest-Klick nur einen Request auslöst.

- [ ] **Step 1: Failing tests** `DateRangePicker.test.tsx` (`api.get` gemockt; `booking-days` liefert `[{day:"2026-07-10",orderCount:212},{day:"2026-07-11",orderCount:534},{day:"2026-07-12",orderCount:298},{day:"2026-06-06",orderCount:87}]`; Start `from=to="2026-07-12"`):
  - `"trigger shows the range"`: Button-Name `"Zeitraum: 12.07.2026"`; bei `from="2026-07-10"` → `"Zeitraum: 10.07. – 12.07.2026"`.
  - `"shows booking counts on days"`: nach Öffnen hat der Tag einen Button mit Namen, der `"11. Juli 2026, 534 Buchungen"` enthält.
  - `"opens on the month of from"`: Monatsüberschrift enthält „Juli 2026“.
  - `"festival click selects the whole festival"`: Klick auf `"10.–12. Juli 2026, 1.044 Buchungen"` → `onChange({from:"2026-07-10",to:"2026-07-12"})` einmal, Popover zu.
  - `"two day clicks select a range"`: 13., dann 15. → `{from:"2026-07-13",to:"2026-07-15"}`.
  - `"reversed clicks are swapped"`: 15., dann 13. → `{from:"2026-07-13",to:"2026-07-15"}`.
  - `"same day twice selects one day"`: 13., 13. → `{from:"2026-07-13",to:"2026-07-13"}`.
  - `"a new selection ignores the current range"` (Review Focus 1): Start `from="2026-07-10",to="2026-07-12"`, 20., dann 22. → `{from:"2026-07-20",to:"2026-07-22"}`.
  - `"closing after one click keeps the range"`: 13., dann Escape → `onChange` nicht aufgerufen.
  - `"reloads counts on every open"`: zweimal öffnen → `api.get` zweimal mit `"/reporting/booking-days"`.
  - `"load error still allows picking"`: `api.get` rejected → Text „Buchungszahlen konnten nicht geladen werden“, zwei Tagesklicks rufen `onChange` trotzdem.
  - `"empty list"`: `[]` → „Noch keine Buchungen“.
- [ ] **Step 2:** `cd frontend && npx vitest run src/tests/DateRangePicker.test.tsx` → FAIL.
- [ ] **Step 3:** `DateRangePicker` implementieren, in beide Seiten einbauen, `RangeFields.tsx` löschen.
- [ ] **Step 4:** `Admin.test.tsx` anpassen: „requests the selected range“ (Report und Transactions) über Fest-Klick bzw. zwei Tagesklicks statt `getByLabelText("Von")`; „defaults both dates to today“ prüft den Trigger-Namen `"Zeitraum: " + heute im Format TT.MM.JJJJ`; „ignores a slower earlier response…“ löst den zweiten Request über eine Kalenderauswahl aus. Danach `cd frontend && npx vitest run` grün.
- [ ] **Step 5:** Commit `feat(frontend): calendar with booking counts replaces the date fields`.

---

### Task 5: Frontend – Layout, Login, Auswertung, Buchungen auf shadcn

**Files:**
- Create: `frontend/src/components/ConfirmDialog.tsx`
- Modify: `frontend/src/views/AdminLayout.tsx`, `frontend/src/views/Login.tsx`, `frontend/src/components/ReportOverview.tsx`, `frontend/src/components/TransactionHistory.tsx`
- Test: `frontend/src/tests/Admin.test.tsx`, `frontend/src/tests/Login.test.tsx`

**Interfaces:**
- Produces: `ConfirmDialog({ open, title, description, confirmLabel, destructive, onConfirm, onCancel }: { open: boolean; title: string; description: string; confirmLabel: string; destructive?: boolean; onConfirm: () => void; onCancel: () => void })` auf Basis von shadcn `AlertDialog` (Rolle `alertdialog`, Abbrechen-Knopf „Abbrechen“).

Festlegungen:
- Storno in `TransactionHistory`: `ConfirmDialog` mit `title="Buchung stornieren?"`, `description={"Buchung #" + id.slice(0,8) + " wirklich stornieren?"}`, `confirmLabel="Stornieren"`, `destructive`. `window.confirm` entfällt.
- Status-Badges bleiben `<span>` mit Text „Abgeschlossen“/„Storniert“ (shadcn `Badge` rendert `span`; bestehender Test nutzt `selector: "span"`).
- Login: Ziffernblock bleibt (Ziffern als Knopftext, „Löschen“, „Anmelden“), neu als `Card` + Raster aus `Button size="lg"`.
- Navigation: Liste aus `Button` (`variant={active ? "secondary" : "ghost"}`, linksbündig); aktive Seite mit `aria-current="page"`. „Abmelden“ `variant="destructive"`.
- Auswertung: Kennzahlen als `Card`, MwSt./Terminals/Top-Artikel als `Table`, Fehler als `Alert variant="destructive"`.

- [ ] **Step 1: Failing tests** in `Admin.test.tsx`, ersetzen die `stubGlobal("confirm")`-Varianten:
  - `"Stornieren is offered only for closed originals, after confirmation"`: Klick auf Zeilen-„Stornieren“ → `getByRole("alertdialog")` enthält `"Buchung #abc12345 wirklich stornieren?"`; Klick auf „Stornieren“ im Dialog → `api.post("/orders/abc12345-1234/cancel", …)`.
  - `"does not cancel when the confirmation is declined"`: im Dialog „Abbrechen“ → `api.post` nicht aufgerufen, Dialog weg.
  - `"marks the active tab"`: in `AdminLayout` hat „Auswertung“ `aria-current="page"`.
- [ ] **Step 2:** `cd frontend && npx vitest run src/tests/Admin.test.tsx` → die neuen Tests scheitern.
- [ ] **Step 3:** Umbau der vier Dateien; `ConfirmDialog` anlegen.
- [ ] **Step 4:** `cd frontend && npx vitest run` grün (inkl. unveränderter `Login.test.tsx`), `npm run build` grün.
- [ ] **Step 5:** Commit `feat(frontend): layout, login, report and bookings use shadcn/ui`.

---

### Task 6: Frontend – Katalog, Import/Export, Terminals, Firmendaten auf shadcn

**Files:**
- Modify: `frontend/src/components/CatalogManager.tsx`, `CatalogImportExport.tsx`, `TerminalConfig.tsx`, `CompanySettings.tsx`
- Test: `frontend/src/tests/Admin.test.tsx`

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 5).

Festlegungen:
- `TerminalConfig`: „Neuen Schlüssel erzeugen“ öffnet `ConfirmDialog` mit `title="Schlüssel neu erzeugen?"`, `description="Der alte Schlüssel wird ungültig. Das Terminal muss neu eingerichtet werden. Fortfahren?"`, `confirmLabel="Fortfahren"`, `destructive`.
- Jede Terminal-Karte ist ein `Card` mit `role="group"` und `aria-label={terminal.name}` (gibt der E2E-Suite in Task 10 einen klassenfreien Locator).
- Formulare: `Label` + `Input`/`Select`, Knöpfe `Button`, Tabellen `Table`, Meldungen `Alert`. Native `<select>` darf bleiben, wo der Radix-`Select` Tests bricht, die `getByRole("option")` nutzen – Builder entscheidet pro Stelle, Optik angleichen.

- [ ] **Step 1: Failing tests** in `Admin.test.tsx` (ersetzen die `confirm`-Stubs der TerminalConfig-Tests):
  - `"terminal config shows generated key"`: Klick „Neuen Schlüssel erzeugen“ → `alertdialog` mit obigem Text; „Fortfahren“ → Key-Request und neuer Schlüssel sichtbar.
  - `"does not generate a key when the confirmation is declined"`: „Abbrechen“ → kein `api.post`.
  - `"terminal card is a named group"`: `getByRole("group", { name: "Bar" })` existiert.
- [ ] **Step 2:** Tests laufen rot.
- [ ] **Step 3:** Umbau der vier Komponenten.
- [ ] **Step 4:** `cd frontend && npx vitest run` und `npm run build` grün; `grep -rn "window.confirm\|bg-gray-" frontend/src --include=*.tsx | grep -v components/ui` liefert nichts.
- [ ] **Step 5:** Commit `feat(frontend): catalog, import, terminals and company settings use shadcn/ui`.

---

### Task 7: Kasse – shadcn/ui einrichten, Touch-Button, `TouchDialog`

**Files:**
- Create: `terminal/components.json`, `terminal/src/renderer/lib/utils.ts`, `terminal/src/renderer/components/ui/{button,card,badge,alert,dialog,label,input,select,switch,scroll-area}.tsx`, `terminal/src/renderer/components/ui/touch-dialog.tsx`
- Modify: `terminal/package.json`, `terminal/tsconfig.json`, `terminal/electron.vite.config.ts` (nur `renderer.resolve.alias`), `terminal/vitest.config.mts` (Projekt `renderer`), `terminal/src/renderer/index.css`, `terminal/src/renderer/index.html` (`class="dark"` an `<html>`, CSP unverändert), `terminal/src/renderer/test/setup.ts`
- Test: `terminal/src/renderer/components/ui/touch-dialog.test.tsx`, `terminal/src/renderer/components/ui/button.test.tsx`

**Interfaces:**
- Produces:
  - Alias `@/` → `terminal/src/renderer/`; `cn()` in `@/lib/utils`.
  - `Button` mit zusätzlichen Größen: `size: "touch"` (Default, `min-h-12 min-w-12 px-4 text-base`), `"touch-lg"` (`min-h-16 px-6 text-xl font-bold`), `"key"` (`h-14 text-2xl`, für Keypad).
  - `TouchDialog({ title, onClose, escapeCloses = false, className, children }: { title: string; onClose: () => void; escapeCloses?: boolean; className?: string; children: React.ReactNode })`: rendert Radix `Dialog` mit `open` immer `true` (Mount = offen, wie heute); `DialogTitle` = `title` (dadurch Dialog-Name); `aria-describedby={undefined}`; Content `tabIndex={-1}`; `onOpenAutoFocus`: `preventDefault()` und Content selbst fokussieren; `onInteractOutside`: immer `preventDefault()`; `onEscapeKeyDown`: `preventDefault()` außer bei `escapeCloses`; `onOpenChange(false)` → `onClose()`. Kein eingebautes X-Schließkreuz.

- [ ] **Step 1: Failing tests:**
  - `button.test.tsx`: `"default size is touch-sized"` – Klasse enthält `min-h-12`.
  - `touch-dialog.test.tsx`:
    - `"is a modal dialog named by its title"` – `getByRole("dialog",{name:"Bezahlen"})` mit `aria-modal="true"`.
    - `"focuses the dialog itself, not the first button"` – Dialog hat Fokus, obwohl ein Button darin ist.
    - `"a tap outside does not close"` – `pointerDown` auf das Overlay/`document.body` → `onClose` nicht aufgerufen.
    - `"Escape does not close by default"` / `"Escape closes with escapeCloses"` – `keyDown(document.body,{key:"Escape"})`, `onClose` 0× bzw. genau 1×.
    - `"unmounting leaves the page tappable"` (Review Focus 5) – rendern, unmounten → `document.body.style.pointerEvents` ist `""`.
- [ ] **Step 2:** `cd terminal && npx vitest run --project renderer src/renderer/components/ui` → FAIL.
- [ ] **Step 3:** Einrichtung wie Task 2 (shadcn init/add, ggf. manuell), Theme identisch zum Frontend (gleiche CSS-Variablen in `index.css`), Polyfills in `test/setup.ts` wie im Frontend, `Button`-Größen und `TouchDialog` implementieren.
- [ ] **Step 4:** Neue Tests grün; `cd terminal && npx vitest run` komplett grün; `npm run build` grün.
- [ ] **Step 5:** Commit `build(terminal): set up shadcn/ui with touch sizes and a touch dialog`.

---

### Task 8: Kasse – Dialoge auf `TouchDialog`

**Files:**
- Modify: `terminal/src/renderer/components/{PinDialog,CheckoutDialog,CancelList,SettingsDialog,PrinterSettings}.tsx`
- Test: bestehende `PinDialog.test.tsx`, `CheckoutDialog.test.tsx`, `PrinterSettings.test.tsx`, `tests/App.test.tsx`

**Interfaces:**
- Consumes: `TouchDialog`, `Button` (Task 7).

Festlegungen:
- Titel exakt wie heute: „Admin-PIN“, „Bezahlen“, „Buchung stornieren“, Titel des Einstellungs-Dialogs unverändert.
- `PinDialog`: `escapeCloses` = true; der **eigene** Escape-Zweig im `keydown`-Handler entfällt (Radix übernimmt, Review Focus 4); der Enter-Zweig mit `preventDefault()` bleibt.
- Alle anderen Dialoge: `escapeCloses` = false (heute schließt dort Escape nicht).
- Knöpfe: Bestätigen (`OK`, `Abschließen & Drucken`, `Ja, stornieren`) `size="touch-lg"`, Abbrechen `variant="secondary" size="touch-lg"`; Schnellbeträge (`Passend (…)`, `5 €` …) `size="touch"`.
- Die bisherigen `useEffect(() => dialogRef.current?.focus())` entfallen (macht `TouchDialog`).

- [ ] **Step 1:** Zusätzlicher failing test in `CheckoutDialog.test.tsx`: `"a tap outside keeps the entered amount"` – „5“ tippen, `pointerDown` auf `document.body` → Dialog noch da, „Gegeben“ zeigt `5`, `onCancel` nicht aufgerufen.
- [ ] **Step 2:** `cd terminal && npx vitest run --project renderer src/renderer/components/CheckoutDialog.test.tsx` → neuer Test rot (oder grün nur zufällig; dann nach dem Umbau erneut prüfen).
- [ ] **Step 3:** Fünf Komponenten umbauen.
- [ ] **Step 4:** `cd terminal && npx vitest run` grün – insbesondere unverändert: „is a modal dialog“, „takes the focus…“, „has no text field…“, „Escape cancels“ (genau einmal), „digits and Enter on a hardware keyboard submit“.
- [ ] **Step 5:** Commit `feat(terminal): dialogs use shadcn/ui and keep their touch behaviour`.

---

### Task 9: Kasse – Hauptbildschirm, Einrichtung, Meldungen

**Files:**
- Modify: `terminal/src/renderer/components/{StatusBar,ItemGrid,OrderPanel,Keypad,MessageBar,SetupWizard}.tsx`, `terminal/src/renderer/App.tsx`
- Test: `terminal/src/renderer/tests/App.test.tsx`, `terminal/src/renderer/components/Keypad.test.tsx`

**Interfaces:**
- Consumes: `Button`, `Card`, `Badge`, `Alert`, `ScrollArea`, `Input`, `Label` (Task 7).

Festlegungen:
- `ItemGrid`: Artikel als `Button` (`variant="secondary"`, mindestens `min-h-24`), Name und Preis wie heute.
- `OrderPanel`: `Card` + `ScrollArea` für die Zeilen; +/−/Entfernen `size="touch"` (Icon-Buttons behalten ihre heutigen `aria-label`s); „Bezahlen“ `size="touch-lg"`, „Verwerfen“ `variant="destructive"`.
- `StatusBar`: Knöpfe `size="touch"`; Anzahl unsynchronisierter Buchungen als `Badge`.
- `Keypad`: Tasten `Button size="key"`; `aria-label`s („Komma“, „Alles löschen“, „Letzte Ziffer löschen“) und Hardware-Tastatur-Logik unverändert.
- `MessageBar`, Uhrzeit-Warnung, Speicherfehler: `Alert` mit unveränderter `role` (`alert` bzw. `status`, wie heute im jeweiligen Element).
- `SetupWizard`: `Card`, `Label`, `Input` (Server-URL und Terminal-Schlüssel bleiben echte Textfelder, wie heute), Knöpfe `size="touch-lg"`.

- [ ] **Step 1:** Failing test in `App.test.tsx`: `"every button on the till is touch-sized"` – nach dem Laden des Verkaufsbildschirms hat jedes `getAllByRole("button")` eine Klasse aus `min-h-12 | min-h-16 | min-h-24 | h-14` (Regex auf `className`).
- [ ] **Step 2:** `cd terminal && npx vitest run --project renderer src/renderer/tests/App.test.tsx` → neuer Test rot.
- [ ] **Step 3:** Umbau.
- [ ] **Step 4:** `cd terminal && npx vitest run` grün; `npm run build` grün; `grep -rn "bg-gray-\|hover:" terminal/src/renderer --include=*.tsx | grep -v components/ui` liefert nichts, was nur per Hover funktioniert.
- [ ] **Step 5:** Commit `feat(terminal): till, setup and messages use shadcn/ui`.

---

### Task 10: E2E anpassen und Gesamtprüfung

**Files:**
- Modify: `e2e/admin-reporting.spec.ts`, `e2e/admin.spec.ts` (ggf. `e2e/terminal.spec.ts`)

Festlegungen:
- `admin.spec.ts` Zeilen ~79–80 und ~95–96 (prüfen „Von“/„Bis“ auf Wert bzw. Sichtbarkeit): stattdessen der Trigger `getByRole("button",{ name: /^Zeitraum: \d{2}\.\d{2}\.\d{4}$/ })` sichtbar, Standard ist ein einzelner Tag (heute).
- Zeile ~182 (`getByLabel("Von").fill(dayOffset(-1))`): Zeitraum über den Kalender wählen – Trigger `getByRole("button",{ name: /^Zeitraum:/ })`, dann gestern und morgen per Tag-Button (Name enthält das deutsche Datum) oder das neueste Fest in „Letzte Buchungstage“.
- Zeile ~230 („Zeitraum ungültig“ über Datumsfelder): ersetzen durch API-Test `request.get(`${API}/reporting/summary?from=2099-01-02&to=2099-01-01`, { headers: ADMIN })` → Status 400, Body `{ error: "Zeitraum ungültig" }`.
- `page.once("dialog", …)` (Storno ~188, Schlüssel ~242): durch Klicks im `getByRole("alertdialog")` ersetzen, Texte wie in Task 5/6.
- Zeile ~238 `locator("div.bg-gray-800")`: ersetzen durch `page.getByRole("group", { name: terminalName })`.
- Neuer Test `"auswertung: calendar shows the booking count of today"`: eine Buchung über die API anlegen (vorhandene Helfer), Auswertung öffnen, Kalender öffnen, Tag-Button für heute hat einen Namen mit `"<n> Buchung"`, wobei `n` = `orderCount` aus `GET /reporting/summary?from=heute&to=heute` direkt davor.

- [ ] **Step 1:** Spec-Änderungen schreiben; `npm run test:e2e` → neue/angepasste Tests vor dem Fix ggf. rot, danach alle grün. (Backend und Frontend-Dev-Server müssen laufen wie bisher für die E2E-Suite – siehe `e2e/global-setup.ts`.)
- [ ] **Step 2:** `npm test` (Repo-Root: Backend, Frontend, Kasse) grün.
- [ ] **Step 3:** `cd frontend && npm run build` und `cd terminal && npm run build` grün; `grep -rnoE "https?://[^\"' )]+" terminal/out/renderer | grep -v "www.w3.org\|reactjs.org\|react.dev"` liefert keine Laufzeit-Ressourcen (Fonts, CSS, Skripte).
- [ ] **Step 4:** Sichtprüfung: Admin im Browser und Kasse (`cd terminal && npm run dev`) einmal durchklicken – Auswertung mit Kalender und Schnellauswahl, Storno-Bestätigung, Bezahl-Dialog, PIN-Dialog; Screenshots für die Übergabe.
- [ ] **Step 5:** Commit `test(e2e): pick ranges with the calendar and confirm in dialogs`.
