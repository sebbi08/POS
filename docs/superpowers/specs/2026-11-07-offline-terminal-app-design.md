# Offline-Terminal-App (Electron)

**Datum**: 2026-11-07
**Status**: zur Freigabe

## Worum es geht und warum

Das POS wird bei Vereinsfesten eingesetzt: 2–4 Kassen-Terminals auf Windows- und
Linux-Rechnern, vor Ort schlechtes bis gar kein WLAN. Der Server (Express +
PostgreSQL) steht im Internet. Heute ist jedes Terminal nur ein Browser-Tab, der
für jeden Klick (Bestellung öffnen, Artikel hinzufügen, drucken, abschließen) den
Server anspricht – ohne Netz geht am Fest gar nichts.

Ziel: Die Terminals werden **eigenständige Desktop-Anwendungen**, die das ganze
Fest über **komplett ohne Server** kassieren. Mit dem Server sprechen sie nur
**vorher** (Artikel abholen) und **danach** (Buchungen übertragen). Pflege von
Artikeln/Preisen und die Auswertung bleiben auf dem Server.

## Ziele

- Terminal kassiert vollständig offline, inklusive Bon- und Abholbon-Druck.
- Terminal startet nach Neustart/Absturz ohne Server wieder, mit allen bisherigen
  Buchungen und der zuletzt offenen Bestellung.
- Manueller Knopf „Artikel abholen“ und manueller Knopf „Buchungen übertragen“.
- Übertragung ist wiederholbar: Abbruch mittendrin → nochmal drücken, nichts wird
  doppelt gezählt, nichts geht verloren.
- Server wertet nach Tagen aus, auf Basis der echten Buchungszeit am Terminal.
- App aktualisiert sich selbst über GitHub Releases.

## Nicht-Ziele

- Kein automatischer Hintergrund-Sync, kein Live-Abgleich während des Fests.
- Keine Kommunikation der Terminals untereinander; jedes Terminal führt seine eigene Kasse.
- Keine Preis-/Artikelpflege am Terminal.
- Keine Kassenübersicht / kein Umsatzbericht am Terminal (Auswertung nur auf dem Server).
- Keine TSE / Fiskalisierung (früherer Versuch liegt im Tag `tse`, ist nicht Teil davon).
- Kein Kassieren mehr im Browser.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Eine Buchung geht verloren – durch Absturz, Stromausfall, abgebrochene Übertragung
  oder Update der App.
- Eine Buchung wird auf dem Server doppelt gezählt.
- Buchungen landen in der Auswertung am Tag der Übertragung statt am Festtag.
- Das Terminal bleibt hängen oder blockiert beim Kassieren, weil es versucht, den
  Server zu erreichen.

## Rahmenbedingungen

- Plattformen: Windows und Linux (x64).
- Bondrucker: ESC/POS-Thermodrucker per USB. Heute per WebUSB aus dem Browser
  angesprochen (`frontend/src/views/POSLayout.tsx`, `frontend/src/utils/printer.ts`,
  `@point-of-sale/receipt-printer-encoder`), inkl. Workarounds aus Commit `f8e53ec`
  (Reset-Bug umgangen, Ränder). Dieses Druckverhalten/Layout muss erhalten bleiben.
- Bestehender Stack: React 19 + Vite + Tailwind im Frontend, Express 5 + pg im
  Backend, TypeScript, Vitest, Playwright-E2E. Die neue App baut darauf auf.
- Buchungen sind auf dem Server event-basiert (`order_events`-Tabelle, Events
  `OrderOpened`, `ItemAdded`, `ItemRemoved`, `PickupReceiptPrinted`,
  `FinalReceiptPrinted`, `OrderClosed`, `OrderCancellationCreated`), Bestell-IDs
  sind UUIDs.
- Das Repo hat aktuell **kein Git-Remote**. Für Auto-Update über GitHub Releases
  wird ein **öffentliches** GitHub-Repository angelegt (Entscheidung des Nutzers).
  Es gibt **kein Code-Signing** – die Windows-Warnung „unbekannter Herausgeber“
  beim Installieren ist akzeptiert.

## Entscheidungen des Nutzers

1. **Electron-App** für Windows und Linux (nicht PWA).
2. **Abgleich nur manuell**: Knopf „Artikel abholen“, Knopf „Buchungen übertragen“.
3. **Kassieren nur noch über die neue App**; die Browser-Kasse (`/pos/:terminalId`)
   entfällt. Der Browser bleibt für die Verwaltung (Admin).
4. **Auto-Update über GitHub Releases**, öffentliches Repository, ohne Code-Signing.
5. Funktionen am Terminal während des Fests:
   - **Kassieren wie heute**: Artikel antippen, Menge ±, Artikel entfernen, offene
     Bestellung verwerfen. Abschließen über **einen Knopf „Bezahlen & Drucken“**
     (ersetzt die heute getrennten Knöpfe „Print“ und „Pay & Close“; Abschließen
     ohne Bon gibt es nicht mehr).
   - **Abholbons pro Terminal ein-/ausschaltbar** – eingestellt auf dem Server beim
     Terminal, kommt mit „Artikel abholen“ aufs Terminal. (Heute wird immer pro
     Artikel ein Abholbon gedruckt.)
   - **Storno einer abgeschlossenen Buchung am Terminal** – **ohne PIN**, nur mit
     einer extra Bestätigung (z. B. „Buchung #a1b2 über 12,50 € wirklich
     stornieren?“). Erzeugt wie heute eine Gegenbuchung
     (`OrderCancellationCreated`), die mit übertragen wird.
   - **Letzten Bon nachdrucken.**
   - **Rückgeldrechner** (gegebenen Betrag eingeben → Rückgeld), **am Terminal
     selbst ein-/ausschaltbar**.
   - **Druckereinstellungen lokal** am Terminal (wie heute).
   - **Keine** Kassenübersicht am Terminal.
6. Ersteinrichtung: Serveradresse eintragen, aus der Terminal-Liste des Servers
   auswählen, welches Gerät das ist. Übertragung ist geschützt, damit nicht jeder
   Buchungen einspielen kann. (Vorschlag, bestätigt; Ausgestaltung s. „Meine
   Entscheidungen“.)
7. Am Terminal ist immer sichtbar: wann zuletzt Artikel abgeholt wurden und wie
   viele Buchungen noch nicht übertragen sind. (Vorschlag, bestätigt.)
8. Übertragene Buchungen bleiben als Sicherheit noch eine Weile lokal liegen.
   (Vorschlag, bestätigt.)
9. **Eine Stornobuchung zählt immer am Tag und zur Uhrzeit der Originalbuchung** –
   egal ob am Terminal oder später im Admin storniert. In der Auswertung wird das
   Original also an seinem eigenen Zeitpunkt aufgehoben.
10. **Auswertung über einen wählbaren Zeitraum** (ein oder mehrere Tage). Feste
    überschneiden sich nicht, ein Zeitraum entspricht also einem Fest.
11. **Oberfläche komplett auf Deutsch** – Terminal-App **und** Admin-Bereich
    (heute ist alles Englisch: „Pay & Close“, „Pickup #“, „Daily Overview“ …).
    Das gilt auch für Bontexte.

## Meine Entscheidungen (vom Nutzer gegenzulesen)

- **Storno am Terminal nur für noch nicht übertragene Buchungen.** Bereits
  übertragene Buchungen werden im Admin storniert. Damit kann eine Buchung nie von
  zwei Stellen storniert werden, und die Übertragung enthält immer nur
  vollständige, in sich geschlossene Buchungen.
- **Zugang pro Terminal mit eigenem Schlüssel.** Der Schlüssel wird im Admin beim
  Terminal erzeugt (anzeigen, neu erzeugen = alter wird ungültig) und beim
  Einrichten am Terminal eingegeben. „Artikel abholen“ und „Buchungen übertragen“
  verlangen ihn. Die Admin-PIN liegt nie auf einem Kassenrechner. Die
  Terminal-Liste für die Ersteinrichtung darf offen bleiben (nur Namen).
- **Uhrzeit-Prüfung:** Bei „Artikel abholen“ und „Buchungen übertragen“ vergleicht
  das Terminal seine Uhr mit der Serverzeit und warnt deutlich, wenn sie mehr als
  5 Minuten abweicht. Korrigiert wird nichts; gespeichert wird die echte
  Terminalzeit.
- **Zeitraum-Auswertung nach Kalendertagen** in Ortszeit Europe/Berlin (Von-Datum
  00:00 bis Bis-Datum 23:59). Da ein Fest als Ganzes ausgewertet wird, spielt der
  Tageswechsel um Mitternacht keine Rolle.
- **Reihenfolge beim Abschließen:** Buchung (inkl. `OrderClosed`) wird dauerhaft
  gespeichert, **dann** gedruckt. Druckfehler → Hinweis + „Letzten Bon
  nachdrucken“.

## Verhalten im Detail

### Artikel abholen

- Holt für das eingerichtete Terminal: zugewiesene Warengruppen (Name,
  MwSt.-Satz), deren Artikel (ID, Name, Preis, Gruppe), die Terminal-Einstellungen
  (Name, Abholbons an/aus) und die Firmendaten für den Bonkopf (Name, Adresse,
  Ort, USt-ID).
- Ersetzt den lokalen Katalog vollständig und atomar: entweder der neue Stand ist
  komplett da, oder der alte bleibt. Schlägt es fehl, kassiert das Terminal mit
  dem alten Stand weiter und zeigt den Fehler an.
- Ist eine Bestellung gerade offen, bleiben deren bereits erfasste Positionen
  unverändert (Name/Preis/MwSt. wie beim Antippen).

### Kassieren offline

- Preis, MwSt.-Satz und Name werden beim Antippen aus dem lokalen Katalog in die
  Buchung übernommen (Snapshot). Spätere Änderungen auf dem Server betreffen alte
  Buchungen nie.
- Beträge/MwSt. werden am Terminal genauso berechnet wie heute im Backend
  (`addItemToOrder`, `closeOrder`, `cancelOrder` in
  `backend/src/modules/orders/orders.commands.ts`, Rundung auf 2 Nachkommastellen).
- Jede Aktion wird **sofort dauerhaft** auf die Festplatte geschrieben, bevor die
  Oberfläche sie als erledigt zeigt. Absturz oder Stromausfall zwischen zwei
  Klicks darf höchstens den letzten, noch nicht bestätigten Klick kosten.
- Jedes Ereignis trägt die **echte Uhrzeit des Terminals** und die Terminal-ID.
- Höchstens eine offene Bestellung pro Terminal (wie heute).

### Drucken

- Gleiches Bon-Layout wie heute (Firmenkopf, Positionen, MwSt.-Aufstellung,
  Summe, Schnitt), danach – falls für das Terminal aktiviert – ein Abholbon pro
  Position (wie heute).
- Druck läuft komplett lokal. Ein Druckfehler (Drucker aus, Papier leer) darf die
  Buchung nicht verhindern oder verlieren: die Buchung ist gespeichert, der
  Fehler wird angezeigt, „Letzten Bon nachdrucken“ ist der Weg zurück.
- Das serverseitige PDF (`generateCombinedReceiptPdf`) wird am Terminal nicht
  erzeugt.

### Storno am Terminal

- Liste der abgeschlossenen, **noch nicht übertragenen** Buchungen dieses
  Terminals.
- Storno nur nach Bestätigungsdialog mit Buchungsnummer und Betrag.
- Erzeugt eine Gegenbuchung mit negierten Mengen/Beträgen, identisch zur heutigen
  Logik in `cancelOrder`. Eine Buchung kann nur einmal storniert werden.
- Die Gegenbuchung zählt in der Auswertung am Zeitpunkt der Originalbuchung.

### Buchungen übertragen

- Schickt alle abgeschlossenen, noch nicht vom Server bestätigten Buchungen
  (inkl. Gegenbuchungen) samt ihrer Ereignisse und Original-Zeitstempel.
- Eine Bestellung, die beim Übertragen noch offen ist, bleibt lokal und geht beim
  nächsten Mal mit.
- Der Server übernimmt jede Buchung **genau einmal** (erkennbar an ihrer ID).
  Erneutes Senden einer bereits bekannten Buchung ist kein Fehler, sondern wird
  bestätigt.
- Erst nach Bestätigung durch den Server gilt eine Buchung lokal als übertragen.
- Übertragung erfordert die Zugangsdaten aus der Einrichtung; ohne gültige
  Zugangsdaten lehnt der Server ab.

### Server-Änderungen

- **Neue Endpunkte** für „Artikel abholen“ (ein Paket mit allem oben Genannten)
  und „Buchungen übertragen“ (Annahme eines Stapels von Buchungen, idempotent).
- **Terminal-Einstellung „Abholbons drucken“** in der Terminal-Verwaltung
  (`TerminalConfig.tsx`, Tabelle `terminals`).
- **Terminal-Schlüssel**: neue Spalte in `terminals`, Erzeugen/Anzeigen/Neu-Erzeugen
  in `TerminalConfig.tsx`, eigene Prüfung für die beiden Sync-Endpunkte.
- **Serverzeit** wird in den Antworten beider Sync-Endpunkte mitgeliefert (für die
  Uhrzeit-Prüfung am Terminal).
- **Auswertung nach Buchungstag**: Heute ist `dailyReport` in
  `backend/src/modules/reporting/reporting.projections.ts` eine einzige
  Gesamtsumme über alle Events, der `date`-Parameter wird nur als Beschriftung
  übernommen, und `closedAt` wird beim Abspielen der Events auf „jetzt“ gesetzt.
  Das muss so umgebaut werden, dass Auswertung und Transaktionsliste die
  Original-Buchungszeit vom Terminal verwenden und nach einem **Zeitraum
  (Von/Bis-Datum)** filtern. Gegenbuchungen (Storno, auch aus dem Admin) zählen
  am Zeitpunkt der Originalbuchung. Der Admin bekommt dafür eine Von/Bis-Auswahl
  statt eines einzelnen Tages. Auswertung pro Terminal bleibt erhalten.
- **Admin-Bereich auf Deutsch übersetzen** (alle Texte, auch die serverseitig
  erzeugten Bon-PDFs).
- **Browser-Kasse entfernen**: Route `/pos/:terminalId`, `POSLayout`,
  Terminal-Auswahl im Login sowie die nur von ihr genutzten Order-Endpunkte
  (`/api/orders/open`, `/:id/items`, `/:id/print`, `/:id/close`). Storno aus dem
  Admin (`TransactionHistory`) bleibt.

### Ersteinrichtung & Statusanzeige am Terminal

- Erster Start: Serveradresse, Zugangsdaten, Terminal aus Liste wählen, dann
  direkt „Artikel abholen“.
- Ständig sichtbar: Terminal-Name, Stand der Artikel (Datum/Uhrzeit), Anzahl nicht
  übertragener Buchungen.
- Einstellungen am Terminal: Drucker, Rückgeldrechner an/aus, Server/Terminal neu
  einrichten.

### Updates

- Auto-Update über GitHub Releases für Windows und Linux.
- Ein Update darf keine lokalen Buchungen verlieren; die Daten liegen außerhalb
  des Programmverzeichnisses.
- Ein Update soll nie mitten im Kassieren erzwungen werden.

## Dem Builder überlassen

- Lokale Speicherung (z. B. SQLite oder append-only Datei) – Hauptsache dauerhaft
  und absturzsicher, außerhalb des App-Verzeichnisses.
- Ansprechen des USB-Druckers in Electron (WebUSB im Renderer oder Node-USB im
  Main-Prozess), solange das heutige Druckergebnis erhalten bleibt.
- Anlegen des öffentlichen GitHub-Repos und Einrichten des Remotes erfolgt in
  Absprache mit dem Nutzer (das ist ein nach außen sichtbarer Schritt).
- Code-Aufteilung zwischen Admin-Web-Frontend und Terminal-App (gemeinsame
  Komponenten/Rechenlogik), Paket-/Ordnerstruktur im Repo.
- Format der Sync-Schnittstelle, Stapelgrößen, Aufbewahrungsdauer übertragener
  Buchungen lokal.
- Build-/Release-Werkzeug (z. B. electron-builder + electron-updater) und
  CI-Workflow.
