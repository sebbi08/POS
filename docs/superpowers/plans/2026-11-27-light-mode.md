# Light Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-Web und Kasse bekommen einen Light Mode; Standard folgt dem System, der Nutzer kann System/Hell/Dunkel wählen.

**Architecture:** shadcn-Tokens: heller Satz in `:root`, dunkler Satz in `.dark`. Ein kleines Theme-Modul pro App setzt `dark` auf `<html>` und folgt bei „system“ `matchMedia("(prefers-color-scheme: dark)")`. Web speichert die Wahl in localStorage, die Kasse im Feld `theme` der `TerminalSettings`.

**Tech Stack:** React 19, Tailwind v4 (`@custom-variant dark (&:is(.dark *))`), Vitest + Testing Library (jsdom), Electron (Kasse).

**Spec:** `docs/superpowers/specs/2026-11-27-light-mode-design.md`

## Global Constraints

- Drei Werte, exakt: `type ThemePreference = "system" | "light" | "dark"`; Standard `"system"`.
- UI-Beschriftungen (deutsch, exakt): Überschrift „Darstellung“, Optionen „System“, „Hell“, „Dunkel“.
- Dunkle Token-Werte bleiben unverändert (nur von `:root` nach `.dark` verschieben).
- Kasse: kein Inline-Script in `index.html` (CSP `script-src 'self'`).
- Bestehende Kassen-Settings ohne `theme` gelten als `"system"`; keine Store-Migration nötig.
- Kein gemeinsames Paket zwischen `frontend/` und `terminal/` – das Theme-Modul existiert in beiden Apps.

## Review Focus

1. Ungültiger/fremder Wert in localStorage (`"pos-theme" = "blau"`) → wie `"system"` behandeln, kein Absturz. (Test in Task 1)
2. Systemwechsel hell↔dunkel während die App läuft und Wahl „system“ → Klasse wechselt sofort; bei „light“/„dark“ → bleibt. (Tests in Task 1 und Task 3)
3. localStorage nicht verfügbar / wirft (privates Fenster) → App startet trotzdem mit System-Schema. (Test in Task 1)
4. Alte Kassen-`settings.json` ohne `theme` → System-Schema, Einstellungsdialog zeigt „System“ aktiv. (Test in Task 4)
5. „Terminal neu einrichten“ behält die gewählte Darstellung (Wizard übernimmt `...initial`). (Test in Task 4)

---

### Task 1: Web – Theme-Modul, Tokens, Start ohne Aufblitzen

**Files:**
- Create: `frontend/src/lib/theme.ts`
- Create: `frontend/src/tests/theme.test.ts`
- Modify: `frontend/src/index.css` (`:root`-Block → hell, bisheriger Block → `.dark`)
- Modify: `frontend/index.html` (`class="dark"` entfernen)
- Modify: `frontend/src/main.tsx` (vor `createRoot`: `applyTheme(loadThemePreference())`)
- Modify: `frontend/src/App.tsx` (`useTheme(useThemePreference()[0])` im Komponentenrumpf)

**Interfaces:**
- Produces (`frontend/src/lib/theme.ts`):
  - `export type ThemePreference = "system" | "light" | "dark"`
  - `export const THEME_STORAGE_KEY = "pos-theme"`
  - `export function resolveTheme(pref: ThemePreference, systemDark: boolean): "light" | "dark"`
  - `export function applyTheme(pref: ThemePreference): void` – setzt/entfernt `dark` auf `document.documentElement`, setzt `style.colorScheme`.
  - `export function useTheme(pref: ThemePreference): void` – wendet an; bei `"system"` Listener auf `matchMedia("(prefers-color-scheme: dark)")` `change`, Cleanup beim Wechsel.
  - `export function loadThemePreference(): ThemePreference` – liest localStorage, ungültig/fehlend/Exception → `"system"`.
  - `export function useThemePreference(): [ThemePreference, (p: ThemePreference) => void]` – modulweiter Store via `useSyncExternalStore`; Setter speichert (Exception schlucken) und benachrichtigt alle Nutzer.

- [ ] **Step 1: Failing tests in `frontend/src/tests/theme.test.ts`**

Test-Helfer: `fakeMatchMedia(dark: boolean)` ersetzt `window.matchMedia` per `vi.stubGlobal`/Zuweisung durch ein Objekt mit `matches` und gespeicherten `change`-Listenern; `setSystemDark(v)` ändert `matches` und ruft die Listener. `afterEach`: `localStorage.clear()`, `document.documentElement.className = ""`.

```ts
it("resolveTheme", () => {
  expect(resolveTheme("system", true)).toBe("dark");
  expect(resolveTheme("system", false)).toBe("light");
  expect(resolveTheme("light", true)).toBe("light");
  expect(resolveTheme("dark", false)).toBe("dark");
});
it("loadThemePreference falls back to system for missing or invalid values", () => {
  expect(loadThemePreference()).toBe("system");
  localStorage.setItem(THEME_STORAGE_KEY, "blau");
  expect(loadThemePreference()).toBe("system");
  localStorage.setItem(THEME_STORAGE_KEY, "light");
  expect(loadThemePreference()).toBe("light");
});
it("loadThemePreference survives a throwing localStorage", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
  expect(loadThemePreference()).toBe("system");
});
it("applyTheme toggles the dark class and color-scheme", () => {
  fakeMatchMedia(false);
  applyTheme("dark");
  expect(document.documentElement).toHaveClass("dark");
  expect(document.documentElement.style.colorScheme).toBe("dark");
  applyTheme("system");
  expect(document.documentElement).not.toHaveClass("dark");
});
it("useTheme follows system changes only while on system", () => {
  fakeMatchMedia(false);
  const { rerender } = renderHook(({ p }) => useTheme(p), { initialProps: { p: "system" as ThemePreference } });
  act(() => setSystemDark(true));
  expect(document.documentElement).toHaveClass("dark");
  rerender({ p: "light" });
  act(() => setSystemDark(true));
  expect(document.documentElement).not.toHaveClass("dark");
});
it("useThemePreference persists and shares the choice", () => {
  const a = renderHook(() => useThemePreference());
  const b = renderHook(() => useThemePreference());
  act(() => a.result.current[1]("dark"));
  expect(b.result.current[0]).toBe("dark");
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
});
```

- [ ] **Step 2: Run, expect FAIL** – `cd frontend && npx vitest run src/tests/theme.test.ts` → „Failed to resolve import ../lib/theme“.

- [ ] **Step 3: Implement `frontend/src/lib/theme.ts`** (Interfaces oben). Der Store in `useThemePreference` initialisiert lazy über `loadThemePreference()`.

- [ ] **Step 4: Tokens in `frontend/src/index.css`.** Kommentar „Dark theme only.“ ersetzen. `:root` (hell) mit `color-scheme: light; --radius: 0.625rem;` und:

```
--background: oklch(0.985 0 0);   --foreground: oklch(0.145 0 0);
--card: oklch(1 0 0);             --card-foreground: oklch(0.145 0 0);
--popover: oklch(1 0 0);          --popover-foreground: oklch(0.145 0 0);
--primary: oklch(0.546 0.245 262.881); --primary-foreground: oklch(1 0 0);
--secondary: oklch(0.95 0 0);     --secondary-foreground: oklch(0.205 0 0);
--muted: oklch(0.95 0 0);         --muted-foreground: oklch(0.5 0 0);
--accent: oklch(0.95 0 0);        --accent-foreground: oklch(0.205 0 0);
--destructive: oklch(0.577 0.245 27.325);
--border: oklch(0.9 0 0);         --input: oklch(0.9 0 0);
--ring: oklch(0.546 0.245 262.881);
```

Darunter `.dark { color-scheme: dark; …bisherige Werte unverändert… }` (ohne `--radius`).

- [ ] **Step 5: `index.html`, `main.tsx`, `App.tsx`** wie unter Files angegeben anpassen.

- [ ] **Step 6: Run** – `cd frontend && npx vitest run && npx tsc --noEmit` → alles grün.

- [ ] **Step 7: Commit**

```bash
git add frontend docs/superpowers
git commit -m "feat(frontend): add light theme tokens and theme preference module"
```

---

### Task 2: Web – Umschalter und Farbkorrekturen

**Files:**
- Create: `frontend/src/components/ThemeToggle.tsx`
- Create: `frontend/src/tests/ThemeToggle.test.tsx`
- Modify: `frontend/src/views/AdminLayout.tsx` (Toggle im Footer-`div` über „Abmelden“, `space-y-2`)
- Modify: `frontend/src/views/Login.tsx` (Toggle unterhalb der Card; Punkt `bg-blue-400` → `bg-primary`)
- Modify: `frontend/src/components/CatalogImportExport.tsx:171-245`

**Interfaces:**
- Consumes: `useThemePreference`, `ThemePreference` aus Task 1.
- Produces: `export default function ThemeToggle(): JSX.Element` – keine Props.

- [ ] **Step 1: Failing test `ThemeToggle.test.tsx`**

```ts
it("shows the three options with System active by default and switches", async () => {
  render(<ThemeToggle />);
  expect(screen.getByRole("group", { name: "Darstellung" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: "Hell" }));
  expect(screen.getByRole("button", { name: "Hell" })).toHaveAttribute("aria-pressed", "true");
  expect(localStorage.getItem("pos-theme")).toBe("light");
});
```

(`afterEach`: `localStorage.clear()`; der modulweite Store muss dazu passen – ggf. im Test über `useThemePreference`-Setter auf `"system"` zurücksetzen.)

- [ ] **Step 2: Run, expect FAIL** – `cd frontend && npx vitest run src/tests/ThemeToggle.test.tsx`.

- [ ] **Step 3: Implement `ThemeToggle`** – `div role="group" aria-label="Darstellung"`, drei `Button size="sm"` mit `aria-pressed`, aktive `variant="secondary"`, sonst `"ghost"`; Reihenfolge System, Hell, Dunkel; volle Breite, gleich breit (`grid grid-cols-3`).

- [ ] **Step 4: Einbauen** in AdminLayout und Login (siehe Files).

- [ ] **Step 5: Farben in `CatalogImportExport.tsx`** – je Paar hell/dunkel:
  - `text-emerald-400` → `text-emerald-700 dark:text-emerald-400`; `text-emerald-300` → `text-emerald-700 dark:text-emerald-300`
  - `text-blue-400` → `text-blue-700 dark:text-blue-400`; `text-blue-300` → `text-blue-700 dark:text-blue-300`
  - `text-yellow-400` → `text-amber-700 dark:text-yellow-400`; `text-yellow-300` → `text-amber-700 dark:text-yellow-300`

- [ ] **Step 6: Run** – `cd frontend && npx vitest run && npx tsc --noEmit` → grün (bestehende Login/Admin-Tests unverändert grün).

- [ ] **Step 7: Commit** – `feat(frontend): add theme toggle to admin sidebar and login`

---

### Task 3: Kasse – Theme-Modul, Settings-Feld, Tokens

**Files:**
- Create: `terminal/src/renderer/lib/theme.ts`
- Create: `terminal/src/renderer/lib/theme.test.ts`
- Modify: `terminal/src/shared/types.ts` (`ThemePreference` exportieren; `TerminalSettings` um `theme?: ThemePreference`)
- Modify: `terminal/src/renderer/index.css` (wie Task 1 Step 4, identische Werte; Kommentar anpassen)
- Modify: `terminal/src/renderer/index.html` (`class="dark"` entfernen)
- Modify: `terminal/src/renderer/main.tsx` (vor `createRoot`: `applyTheme("system")`)
- Modify: `terminal/src/renderer/App.tsx` (direkt nach `const t = useTerminal();`: `useTheme(t.settings?.theme ?? "system");` – vor allen frühen Returns)

**Interfaces:**
- Produces (`terminal/src/shared/types.ts`): `export type ThemePreference = "system" | "light" | "dark"`
- Produces (`terminal/src/renderer/lib/theme.ts`): `resolveTheme`, `applyTheme`, `useTheme` mit denselben Signaturen wie Task 1 (Typ aus `../../shared/types`). Kein localStorage-Teil.

- [ ] **Step 1: Failing tests** `theme.test.ts` – die Tests `resolveTheme`, `applyTheme toggles…` und `useTheme follows system changes only while on system` aus Task 1 übernehmen (gleicher `fakeMatchMedia`-Helfer).

- [ ] **Step 2: Run, expect FAIL** – `cd terminal && npx vitest run src/renderer/lib/theme.test.ts`.

- [ ] **Step 3: Implement** `theme.ts`, Typ in `types.ts`.

- [ ] **Step 4: Tokens, `index.html`, `main.tsx`, `App.tsx`** wie unter Files.

- [ ] **Step 5: Run** – `cd terminal && npx vitest run && npx tsc --noEmit -p tsconfig.json` → grün.

- [ ] **Step 6: Commit** – `feat(terminal): add light theme tokens and follow the system scheme`

---

### Task 4: Kasse – „Darstellung“ im Einstellungsdialog und Farbkorrekturen

**Files:**
- Modify: `terminal/src/renderer/components/SettingsDialog.tsx` (neue Zeile zwischen Rückgeldrechner und „Terminal neu einrichten“)
- Create: `terminal/src/renderer/components/SettingsDialog.test.tsx`
- Modify: `terminal/src/renderer/tests/App.test.tsx` (Wizard-Erhalt, s. Step 1)
- Modify: `terminal/src/renderer/components/StatusBar.tsx:39`, `SettingsDialog.tsx:67`, `PrinterSettings.tsx:203`, `CheckoutDialog.tsx:73`

**Interfaces:**
- Consumes: `ThemePreference`, `TerminalSettings.theme` (Task 3); bestehendes `onSave(patch: Partial<TerminalSettings>)`.

- [ ] **Step 1: Failing tests**

`SettingsDialog.test.tsx` (Settings-Fixture ohne `theme`):
```ts
it("shows System active when no theme is stored", () => {
  render(<SettingsDialog settings={base} hasOpenOrder={false} syncing={false} onSave={vi.fn()} onResetup={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByRole("group", { name: "Darstellung" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
});
it("saves the chosen theme as a patch", async () => {
  const onSave = vi.fn();
  render(<SettingsDialog settings={base} … onSave={onSave} … />);
  await userEvent.click(screen.getByRole("button", { name: "Dunkel" }));
  expect(onSave).toHaveBeenCalledWith({ theme: "dark" });
});
```
In `App.test.tsx` (mit `fake-bridge`): gespeicherte Settings mit `theme: "dark"` → `document.documentElement` hat `dark`; nach „Terminal neu einrichten“ und erfolgreichem Wizard enthält das gespeicherte Settings-Objekt weiterhin `theme: "dark"`. Den vorhandenen Ablauf für Neueinrichtung im Test als Vorlage nehmen.

- [ ] **Step 2: Run, expect FAIL** – `cd terminal && npx vitest run src/renderer/components/SettingsDialog.test.tsx src/renderer/tests/App.test.tsx`.

- [ ] **Step 3: Implement** – Zeile im Stil der Nachbarn (`bg-muted rounded-lg px-3 py-3`): Label „Darstellung“ (`text-muted-foreground text-xs`), darunter `div role="group" aria-label="Darstellung" className="grid grid-cols-3 gap-2"` mit drei `Button size="touch"` (`aria-pressed`, aktiv `variant="default"`, sonst `"secondary"`), Klick → `onSave({ theme })`. Aktiver Wert: `settings.theme ?? "system"`.

- [ ] **Step 4: Farben**
  - `StatusBar.tsx:39` `text-green-300` → `text-green-700 dark:text-green-300`
  - `SettingsDialog.tsx:67` `text-yellow-300` → `text-amber-700 dark:text-yellow-300`
  - `PrinterSettings.tsx:203` `text-red-300` → `text-red-700 dark:text-red-300`, `text-green-300` → `text-green-700 dark:text-green-300` (Hintergründe `bg-*-500/20` bleiben)
  - `CheckoutDialog.tsx:73` `text-green-400` → `text-green-700 dark:text-green-400`
  - Unverändert lassen: gelbe Banner/Badge mit `text-gray-900`, MessageBar `bg-red-700/bg-green-700 text-white`, Overlays `bg-black/50`.

- [ ] **Step 5: Run** – `cd terminal && npx vitest run && npx tsc --noEmit -p tsconfig.json` → grün.

- [ ] **Step 6: Commit** – `feat(terminal): choose light, dark or system theme in settings`

---

### Task 5: Gesamtprüfung und Sichtkontrolle

- [ ] **Step 1:** `npm test` im Repo-Root → alle Suites grün.
- [ ] **Step 2:** `cd frontend && npm run build` und `cd terminal && npm run build` → ohne Fehler.
- [ ] **Step 3:** Admin-Web per Vite-Dev-Server (127.0.0.1) mit Playwright MCP öffnen; mit `browser_emulate_media` `colorScheme: light` und `dark` Login, Auswertung, Import/Export-Vorschau prüfen; Umschalter Hell/Dunkel/System durchklicken, Reload behält Wahl. Kasse-Renderer analog über den Renderer-Dev-Server bzw. die bestehenden e2e-Hilfen (`e2e/terminal.spec.ts` als Vorlage) in beiden Modi ansehen, inkl. Einstellungsdialog und Statusleiste. Auffällige Kontrastprobleme beheben.
- [ ] **Step 4:** `npx playwright test` → grün (bestehende e2e-Tests dürfen nicht am Farbschema hängen; falls doch, Locator statt Farbe prüfen).
- [ ] **Step 5:** Commit etwaiger Korrekturen – `fix: polish light theme contrast`.
