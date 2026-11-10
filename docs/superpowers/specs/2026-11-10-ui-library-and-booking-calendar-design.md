# Component Library (shadcn/ui) und Buchungskalender

**Datum**: 2026-11-10
**Status**: zur Freigabe
**Branch/Worktree**: `feature/ui-library-calendar` in `.claude/worktrees/ui-library-calendar`

## Worum es geht und warum

Der Verein bucht nur an wenigen Tagen im Jahr, nämlich an seinen Festen. In der Auswertung
(Admin-Frontend) stellt man den Zeitraum heute über zwei nackte `<input type="date">` ein
(`frontend/src/components/RangeFields.tsx`). Man sieht dabei nicht, an welchen Tagen es
Buchungen gab. Der Nutzer muss das Datum des letzten Fests jedes Mal woanders nachschlagen.

Gewünscht ist ein Kalender, der an jedem Tag direkt die Zahl der Buchungen zeigt, plus eine
Schnellauswahl der letzten Feste.

Gleichzeitig soll eine Component Library eingeführt und **im selben Zug** in Admin-Frontend
und Kasse (`terminal/`) eingebaut werden. Heute schreiben alle Komponenten ihre
Tailwind-Klassen von Hand, Dialoge, Knöpfe und Eingabefelder sind mehrfach unterschiedlich
nachgebaut, und Admin und Kasse teilen keinen UI-Code.

## Ziele

1. In Auswertung und Buchungen zeigt ein aufklappbarer Kalender an jedem Tag mit Buchungen
   die Anzahl. Ein Zeitraum lässt sich mit zwei Klicks wählen, ein ganzes Fest mit einem Klick
   aus einer Schnellauswahl.
2. Admin-Frontend und Kasse sind vollständig auf shadcn/ui-Bausteine umgestellt und wirken wie
   aus einem Guss.
3. Die Kasse ist durchgehend für reine Touch-Bedienung ausgelegt.

## Nicht-Ziele

- Keine neuen Funktionen in der Kasse oder im Admin, abgesehen vom Kalender.
- Keine helle Variante und kein Umschalter zwischen hell und dunkel.
- Keine Änderung an Abläufen, Sync-Format, Event-Store oder Backend-Logik, abgesehen vom
  neuen Lese-Endpunkt für die Kalenderzahlen.
- Kein Versions-Bump und kein Release als Teil dieser Arbeit.

## Anti-Ziele

- Die Kasse lädt zur Laufzeit irgendetwas aus dem Netz (Schriften, Icons, CSS). Sie muss
  komplett offline laufen.
- Bedienelemente der Kasse, die nur per Maus (Hover, Rechtsklick, kleine Klickziele) sinnvoll
  nutzbar sind.
- Kalenderzahl und Auswertung widersprechen sich für denselben Zeitraum.
- Bestehende Tests werden gelöscht statt angepasst, oder Funktionen gehen beim Umbau verloren.

## Entscheidungen des Nutzers

1. **Kalender-Variante C:** Ein Knopf mit dem aktuellen Zeitraum öffnet ein Popover. Darin
   stehen links die „Letzten Buchungstage“ als Schnellauswahl, rechts ein Monatskalender mit
   Buchungszahlen an den Tagen.
2. Folgende Annahmen hat der Nutzer bestätigt:
   - Die Zahl am Tag zählt wie das Feld „Buchungen“ der Auswertung (`orderCount`):
     abgeschlossene Verkäufe ohne Stornos.
   - Ein Tag ist der Kalendertag in `Europe/Berlin`, wie heute (`berlinDay`). Eine Buchung um
     1 Uhr nachts zählt also zum Folgetag.
   - Die Seite „Buchungen“ bekommt denselben Kalender.
   - Die Schnellauswahl zeigt die letzten 5 Feste.
   - Beim Öffnen springt der Kalender auf den Monat des gewählten Zeitraums.
3. **Component Library:** shadcn/ui, eingebaut in Admin-Frontend **und** Kasse.
4. **Das Aussehen darf sich sichtbar ändern.**
5. **Kasse: nur Touch.**
6. Beides, Kalender und Library-Umbau, kommt in einem Rutsch in einem Worktree.
7. Bestätigt wurden außerdem die folgenden Vorschläge: dunkles Theme in beiden Apps,
   Touch-Größen, offline-fähige Kasse, eigene Kopie der Bausteine pro Paket, unveränderte
   Funktion, alle Tests und E2E-Tests am Ende grün.

## Teil 1: Buchungskalender

### Backend: neuer Endpunkt

`GET /api/reporting/booking-days` (hinter `checkAdmin` wie die übrigen Reporting-Routen)

Antwort, aufsteigend nach Tag sortiert, **nur Tage mit mindestens einer Buchung**:

```json
[{ "day": "2026-07-10", "orderCount": 212 }, { "day": "2026-07-11", "orderCount": 534 }]
```

- Gezählt wird exakt wie `getReport().orderCount`: `isSale(order)` ist wahr, die Bestellung ist
  nicht storniert (`!order.cancelledByOrderId`), Tag ist `berlinDay(order.closedAt)`. Die
  Prädikate werden wiederverwendet, nicht kopiert. So gilt für jeden Zeitraum: Summe der
  Tageszahlen = `orderCount` der Auswertung. Ein Backend-Test sichert genau diese Gleichheit ab.
- **Ohne Zeitraum-Parameter, liefert alle Tage** (*meine Entscheidung*). Ein Verein hat ein paar
  Dutzend Buchungstage im Jahr, die Antwort bleibt winzig. Kalender und Schnellauswahl kommen
  so mit einem einzigen Request aus.
- Liegt in `reporting.projections.ts` (`getBookingDays()`) und `reporting.routes.ts`.

### Frontend: Komponente `DateRangePicker`

Ersetzt `RangeFields.tsx` in `ReportOverview.tsx` und `TransactionHistory.tsx`. Die Props
bleiben gleich (`from`, `to`, `onChange` für beide Werte zusammen o. ä.), die Werte bleiben
ISO-Tage (`YYYY-MM-DD`).

**Auslöser:** shadcn-`Button` (outline) mit Kalender-Icon und Zeitraum.
- Zeitraum über mehrere Tage: `10.07. – 12.07.2026`. Liegen die Tage in verschiedenen Jahren,
  bekommen beide Daten die Jahreszahl.
- Einzelner Tag: `12.07.2026`.
- Barrierefreier Name, z. B. `aria-label="Zeitraum: 10.07. – 12.07.2026"`.

**Popover** (shadcn `Popover` + `Calendar`, letzterer basiert auf react-day-picker):
- **Links, Schnellauswahl „Letzte Buchungstage“:** Aufeinanderfolgende Kalendertage mit
  Buchungen werden zu einem Fest zusammengefasst. Ein Tag ohne Buchung trennt zwei Feste. Die
  neuesten 5 stehen oben. Jeder Eintrag zeigt den Zeitraum („10.–12. Juli 2026“, bei einem Tag
  „1. Mai 2026“) und die Summe („1.044 Buchungen“). Ein Klick setzt `from`/`to` auf das Fest und
  schließt das Popover. Ohne Buchungstage zeigt die Liste „Noch keine Buchungen“.
- **Rechts, Monatskalender:** ein Monat mit Vor/Zurück-Navigation, deutsche Locale
  (`date-fns/locale/de`), Woche beginnt am Montag. Tage mit Buchungen sind farbig hinterlegt
  und zeigen unter der Tageszahl klein die Anzahl. Der barrierefreie Name des Tages enthält die
  Anzahl, z. B. „Samstag, 11. Juli 2026, 534 Buchungen“.
- **Auswahl:** `mode="range"`. Erster Klick setzt den Starttag, zweiter Klick den Endtag. Danach
  wird übernommen und das Popover schließt. Liegt der zweite Klick vor dem ersten, wird
  getauscht, damit `from <= to` immer gilt. Zweimal derselbe Tag ergibt einen Einzeltag.
  Schließt man das Popover nach nur einem Klick (Escape, Klick daneben), bleibt der bisherige
  Zeitraum unverändert.
- Beim Öffnen zeigt der Kalender den Monat von `from`.
- Die Zahlen werden **bei jedem Öffnen** neu geladen, damit frisch übertragene Buchungen
  auftauchen. Während des Ladens sind Kalender und Auswahl schon nutzbar, nur ohne Zahlen.
  Schlägt der Request fehl, erscheint im Popover ein kleiner Hinweis und der Kalender
  funktioniert ohne Zahlen weiter.
- Startwert bleibt heute (`todayIso`), wie bisher.

**Hinweis Seite „Buchungen“:** Dort zählt die Liste auch Stornos und Gegenbuchungen
(`effectiveTime`). Der Kalender zeigt trotzdem dieselben Zahlen wie in der Auswertung, also
Verkäufe. Er dient nur dem Finden der Tage. *Meine Entscheidung*, damit es eine einzige,
einheitliche Bedeutung der Zahl gibt.

**Ungültiger Zeitraum:** Über die Oberfläche lässt sich `from > to` nicht mehr erzeugen. Die
Backend-Prüfung („Zeitraum ungültig“) bleibt bestehen und wird weiterhin im Backend-Test
abgedeckt. Den E2E-Test, der „Zeitraum ungültig“ über die Datumsfelder auslöst, ersetzt der
Builder durch einen gleichwertigen Test, etwa direkt gegen die API, oder streicht ihn mit
Begründung, wenn der Backend-Test ihn vollständig abdeckt.

## Teil 2: shadcn/ui in Admin und Kasse

### Einrichtung (beide Pakete getrennt)

- `frontend/` und `terminal/` bekommen jeweils eine eigene shadcn-Einrichtung: `components.json`,
  Bausteine unter `src/components/ui/` bzw. `terminal/src/renderer/components/ui/`, Helfer `cn()`
  unter `lib/utils.ts`, Pfad-Alias `@/` in `tsconfig` und Vite- bzw. electron-vite-Config
  (Renderer). Keine gemeinsame Paket-Ebene, die Kasse baut weiter unabhängig mit
  electron-builder (*Entscheidung bestätigt*).
- Tailwind v4 mit CSS-Variablen (shadcn-Standard für v4) in `index.css`.
- Abhängigkeiten nach shadcn-Vorgabe, etwa `radix-ui` bzw. `@radix-ui/*`,
  `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `react-day-picker`,
  `date-fns`, `tw-animate-css`. Die Kalender-Abhängigkeiten braucht nur das Frontend. Das Repo
  nutzt React 19, Vite 8 und TypeScript 7. Der Builder prüft die Verträglichkeit und weicht bei
  Bedarf auf passende Versionen aus.

### Theme

- **Nur dunkel** in beiden Apps: Klasse `dark` fest auf `<html>`, shadcn-Theme „neutral“ bzw.
  „zinc“ als Grundlage, **Blau als Primärfarbe** (entspricht dem heutigen `blue-600`,
  *meine Entscheidung*). Destruktive Aktionen (Storno, Abmelden, Verwerfen) nutzen die Variante
  `destructive`.
- Schrift: der bisherige System-Font-Stack, **keine Webfonts** (*meine Entscheidung*, offline-sicher).
  Icons kommen aus `lucide-react` und werden mitgebündelt.
- Die Kasse lädt zur Laufzeit nichts aus dem Netz. Prüfung: `npm run build` im Terminal und
  ein Blick in das gebaute `out/renderer`, ob keine externen URLs referenziert werden.

### Admin-Frontend: was umgebaut wird

| Stelle | Heute | Neu (shadcn) |
|---|---|---|
| `views/AdminLayout.tsx` Navigation | handgebaute Buttons | `Button` (Varianten `secondary`/`ghost`) oder shadcn `Sidebar`, Builder entscheidet, Abmelden als `destructive` |
| `views/Login.tsx` | Bildschirm-Ziffernblock mit 6 Punkten, Löschen/Anmelden, keine Tastatureingabe | **Ziffernblock bleibt** (Ablauf unverändert), neu gestaltet als `Card` mit Raster aus `Button`s. Ziffern bleiben als Text auf den Knöpfen, weil E2E-Logins sie per `getByText(d)` antippen |
| `ReportOverview.tsx` | Kacheln, Tabellen | `Card` für Kennzahlen, `Table` für MwSt./Terminals/Top-Artikel, `DateRangePicker`, `Alert` für Fehler |
| `TransactionHistory.tsx` | Inputs, Select, Tabelle, `window.confirm` | `Input`, `Select`, `Table`, `Badge` (Abgeschlossen/Storniert), `AlertDialog` statt `window.confirm` für den Storno, `DateRangePicker` |
| `CatalogManager.tsx` | Formular + Tabelle | `Input`, `Label`, `Select`, `Button`, `Table`, ggf. `Dialog` fürs Bearbeiten, falls heute schon ein Bearbeiten-Formular existiert |
| `CatalogImportExport.tsx` | Upload, Vorschau, Meldungen | `Button`, `Table`, `Alert`, `Card` |
| `TerminalConfig.tsx` | Liste, Schlüssel anzeigen/neu erzeugen mit Bestätigung | `Card`/`Table`, `Button`, `AlertDialog` für Bestätigungen |
| `CompanySettings.tsx` | Formular | `Label`, `Input`, `Button`, Erfolgsmeldung als `Alert` o. ä. |

Wo heute `window.confirm` steht, kommt ein `AlertDialog`. Das ändert keine Funktion, nur die
Darstellung. E2E-Tests, die heute `page.on("dialog")` nutzen, werden angepasst.

### Kasse: was umgebaut wird

| Komponente | Neu (shadcn) |
|---|---|
| `StatusBar.tsx` | `Button` (große Touch-Größe), `Badge` für unsynchronisierte Buchungen/Status |
| `ItemGrid.tsx` | große `Button`-Kacheln oder `Card` als Button. Kacheln bleiben mindestens so groß wie heute |
| `OrderPanel.tsx` | `Card`, `Button` für +/−/Entfernen/Bezahlen/Verwerfen, `ScrollArea` für lange Bestellungen |
| `CheckoutDialog.tsx`, `PinDialog.tsx`, `SettingsDialog.tsx`, `CancelList.tsx` | `Dialog` (Radix) |
| `Keypad.tsx` | Raster aus großen `Button`s |
| `SetupWizard.tsx`, `PrinterSettings.tsx` | `Card`, `Label`, `Input`, `Select`, `Switch`/`Checkbox`, `Button` |
| `MessageBar.tsx`, Uhrzeit-Warnung, Speicherfehler in `App.tsx` | `Alert` (mit passender Rolle, siehe unten) |

**Touch-Regeln für die Kasse:**
- Jedes antippbare Element ist mindestens 48 × 48 px groß. Primäraktionen (Bezahlen, Artikel)
  sind deutlich größer. shadcn-Standardgrößen reichen dafür nicht. Die Kasse bekommt eigene
  größere `size`-Varianten im `Button` bzw. passende Klassen.
- Nichts ist nur per Hover erreichbar, keine Tooltips als einzige Information, kein Rechtsklick.
- Popover und Select müssen sich per Tippen öffnen und schließen lassen.
- **Dialoge schließen wie heute** (*meine Entscheidung*, folgt aus „Funktion unverändert“):
  Ein Tippen außerhalb schließt **keinen** Kassen-Dialog, sonst wären „Gegeben“ oder ein
  halber Storno weg. Escape schließt nur dort, wo es heute schon schließt (PIN-Dialog). Jeder
  Dialog schließt über seinen eigenen Knopf. Technisch heißt das: `onInteractOutside` überall
  und `onEscapeKeyDown` außer beim PIN-Dialog per `preventDefault` abfangen. Am besten
  geschieht das zentral in einer kasseneigenen Dialog-Hülle.
- Beträge und PIN werden weiter über den Bildschirm-`Keypad` eingegeben (seit Commit
  `20d4be4`), nicht über Eingabefelder.

### Verhalten, das erhalten bleiben muss

- **Barrierefreie Namen bleiben gleich:** Button-Beschriftungen, Überschriften, Dialog-Titel
  (z. B. Dialog „Admin-PIN“, „Buchung stornieren“), Labels und Rollen (`alert`, `status`,
  `row`, `dialog`), auf die sich Unit- und E2E-Tests stützen. Einzige gewollte Ausnahme sind
  die Labels „Von“/„Bis“, die durch den `DateRangePicker` wegfallen.
- Der PIN-Dialog bleibt `aria-modal` und schließt mit Escape (vgl. Commit `d08180b`). Radix
  `Dialog` liefert das mit.
- **Fokus-Verhalten wie heute:** In Bezahl- und PIN-Dialog bekommt das Dialogfeld selbst den
  Fokus (`tabIndex={-1}`), damit Windows nie seine Touch-Tastatur öffnet und nichts hinter dem
  Dialog Tastendrücke erhält. Radix' automatischer Fokus auf den ersten Knopf wird per
  `onOpenAutoFocus` unterdrückt, sonst würde ein Hardware-Enter z. B. „Passend“ auslösen.
  Das Abfangen von Enter im PIN-Dialog (`preventDefault`) bleibt erhalten. Die bestehenden
  Tests, die genau das prüfen, bleiben unverändert grün.
- `MessageBar` und Warnungen behalten ihre Rollen (`alert` bzw. `status`).

## Tests

- **Backend:** Unit-Tests für `getBookingDays()` und den Endpunkt: Zählung ohne Stornos, ohne
  verworfene Bestellungen, Tagesgrenze `Europe/Berlin` (Buchung 23:30 und 00:30), Summe über
  Zeitraum = `orderCount` der Auswertung, `checkAdmin` greift.
- **Frontend:** Tests für `DateRangePicker`: Zahlen an Tagen, Gruppierung zu Festen (Lücke
  trennt), nur die neuesten 5, Klick auf Fest setzt Zeitraum, zwei Klicks setzen Zeitraum,
  vertauschte Reihenfolge, Abbruch nach einem Klick ändert nichts, Fehler beim Laden.
  Bestehende Admin-Tests werden angepasst.
- **Kasse:** bestehende Tests (`App.test.tsx`, `PinDialog.test.tsx`, `CheckoutDialog.test.tsx`,
  `Keypad.test.tsx`, `PrinterSettings.test.tsx`) laufen weiter, Anpassungen nur dort, wo sich
  das DOM ändert, nicht die Bedeutung.
- **jsdom und Radix:** Für Radix-Komponenten braucht das Test-Setup wahrscheinlich Polyfills
  (`ResizeObserver`, `hasPointerCapture`/`scrollIntoView`, `matchMedia`) in
  `frontend/src/tests/setup.ts` bzw. `terminal/src/renderer/test/setup.ts`.
- **E2E:** `npm run test:e2e` ist am Ende grün. `admin-reporting.spec.ts` stellt Zeiträume nicht
  mehr über „Von“/„Bis“ ein, sondern über den Kalender oder die Schnellauswahl. Mindestens ein
  E2E-Test öffnet den Kalender und prüft, dass an einem Tag mit Buchungen die richtige Zahl steht.
- `npm test` (Backend, Frontend, Terminal) und `tsc`/Build beider Apps sind grün.

## Dem Builder überlassen

- Exakte Abstände, Größen und Varianten innerhalb der Vorgaben oben.
- Ob die Admin-Navigation als `Button`-Liste oder mit dem shadcn-`Sidebar`-Baustein umgesetzt wird.
- Reihenfolge und Zuschnitt der Commits. Sinnvoll: zuerst Einrichtung pro Paket, dann Endpunkt
  und Kalender, dann Admin-Seiten, dann Kasse.
- Wie der E2E-Test Tage im Kalender anklickt.
- shadcn-Stil (z. B. „new-york“) und genaue Grautöne.
