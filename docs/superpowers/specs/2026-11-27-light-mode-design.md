# Light Mode für Admin-Web und Kasse

## Ziel
Beide Frontends (Admin-Web `frontend/`, Kasse `terminal/`) bekommen zusätzlich zum bisherigen
Dark Mode einen Light Mode. Standard ist „System“ (folgt `prefers-color-scheme`, auch bei
Wechsel zur Laufzeit); der Nutzer kann auf „Hell“ oder „Dunkel“ festlegen.

- Nicht-Ziel: Farbschema/Branding neu gestalten; der Dark Mode bleibt optisch wie er ist.
- Anti-Ziel: Texte oder Statusfarben, die in einem der beiden Modi schlecht lesbar sind.

## Ansätze
- **A (gewählt):** Web speichert in localStorage, Kasse in `TerminalSettings` (wie Rückgeldrechner).
- B: Beide in localStorage – weniger Code, aber die Kassen-Einstellung lebt getrennt von den
  übrigen Kassen-Einstellungen.
- Electron `nativeTheme` verworfen: bringt gegenüber CSS/`matchMedia` nichts.

## Design
- **Tokens:** In beiden `index.css` bekommt `:root` einen hellen Satz (shadcn-neutral hell,
  gleiche blaue Primärfarbe), der bisherige dunkle Satz wandert nach `.dark`. `color-scheme`
  folgt dem Modus. Festes `class="dark"` in beiden `index.html` entfällt.
- **Umschaltung:** Ein kleines Theme-Modul je App (`"system" | "light" | "dark"`) setzt/entfernt
  `dark` auf `<html>` und hört bei „System“ auf `matchMedia`-Änderungen. Wird vor dem ersten
  Rendern in `main.tsx` angewendet (Kasse: kein Inline-Script wegen CSP).
- **Web:** Wahl in localStorage. Dreistufiger Umschalter unten in der Sidebar (über „Abmelden“)
  und kompakt auf der Login-Seite.
- **Kasse:** Neues Feld `theme` in `TerminalSettings`; fehlt es (bestehende Installationen),
  gilt „system“. Neue Zeile „Darstellung: System / Hell / Dunkel“ im Einstellungsdialog.
  Bis die Settings geladen sind, gilt das System-Schema.
- **Feste Farben:** Die ~25 auf dunklen Hintergrund abgestimmten Klassen (`text-yellow-300`,
  `text-green-300`, `text-emerald-*`, `text-blue-*`, `bg-red-500/20` …) bekommen Varianten, die in
  beiden Modi lesbar sind (z. B. `text-green-700 dark:text-green-300`). Bewusst vollflächige
  Elemente (gelbes Banner mit dunklem Text, rote/grüne MessageBar mit weißem Text, Overlay
  `bg-black/50`) bleiben.
- **Hinweis:** Kassen, deren Betriebssystem auf hell steht, sind nach dem Update hell, bis jemand
  „Dunkel“ wählt.

## Tests
Unit-Tests für das Theme-Modul (Auflösung System/Hell/Dunkel, Reaktion auf Systemwechsel,
Persistenz) und für die Umschalter in Web und Kasse; bestehende Tests bleiben grün. Sichtprüfung
beider Modi im Browser.
