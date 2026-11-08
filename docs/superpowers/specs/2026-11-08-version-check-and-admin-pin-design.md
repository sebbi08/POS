# Versionsprüfung und Admin-PIN für den Abgleich

**Datum**: 2026-11-08
**Status**: zur Freigabe
**Baut auf**: `docs/superpowers/specs/2026-11-07-offline-terminal-app-design.md`

## Worum es geht und warum

Kasse (Electron-App `terminal/`) und Server (`backend/`) müssen beim Abgleich zueinander passen.
Ändert sich das Format der Buchungen oder des Katalogs, darf keine alte Kasse mit einem neuen
Server abgleichen und umgekehrt. Bisher gibt es dafür keine Prüfung.

Außerdem soll nicht jeder, der an einer eingerichteten Kasse steht, Artikel abholen oder
Buchungen übertragen können. Dafür ist künftig zusätzlich der Admin-PIN des Servers nötig.

## Ziele

1. Bei „Artikel abholen“ (auch beim ersten Abholen in der Einrichtung) und bei
   „Buchungen übertragen“ werden die Versionen von Kasse und Server verglichen. Passen sie nicht,
   findet kein Abgleich statt.
2. Beide Abgleiche verlangen den Admin-PIN. Der PIN wird ausschließlich auf dem Server geprüft
   und landet nie auf der Kasse, weder als Klartext noch als Hash.
3. Die lokalen Daten der Kasse (Buchungen, Katalog, Einstellungen) bleiben über alle künftigen
   Versionen migrierbar. Ein Update darf nie dazu führen, dass alte lokale Daten nicht mehr
   gelesen werden können.

## Nicht-Ziele

- **Keine Versionsprüfung beim Start der Kasse und kein erzwungenes Update** (Entscheidung des
  Nutzers). Die Kasse startet immer wie bisher, mit oder ohne Netz.
- Keine PIN-Abfrage für Kassieren, Storno, Nachdruck oder Einstellungen.
- Kein automatisches Update des Servers.
- Kein neues Verfahren für den Admin-PIN selbst. Er bleibt `ADMIN_PIN` auf dem Server, derselbe
  wie beim Admin-Login im Browser.

## Anti-Ziele

- Nicht übertragene Buchungen gehen durch ein Update verloren oder werden unlesbar.
- Der PIN wird auf der Kasse gespeichert, geloggt oder in einer Datei abgelegt.
- Die Kasse blockiert beim Kassieren wegen der Versionsprüfung oder des PINs.

## Entscheidungen des Nutzers

1. Die Versionsprüfung läuft **nur beim Abgleich** („Artikel abholen“ und
   „Buchungen übertragen“), nicht beim Start. Bei Abweichung gibt es keinen Abgleich, sondern
   eine Meldung, welche Seite aktualisiert werden muss.
2. Die Kasse muss ihre lokalen Daten in jeder künftigen Version migrieren können.
3. **Terminal-Schlüssel:** wird wie bisher beim Einrichten eingegeben und gespeichert.
4. **Admin-PIN:** wird bei jedem „Artikel abholen“ (auch beim ersten Abholen in der Einrichtung)
   und bei jedem „Buchungen übertragen“ eingegeben. Der Server prüft ihn, die Kasse merkt ihn
   sich nicht.
5. **Bestätigte Vorschläge:**
   - Nach 5 falschen PINs nimmt der Server 5 Minuten lang keine weiteren Versuche an.
   - Die Versionsprüfung kommt vor der PIN-Abfrage.

## Verhalten im Detail

### Eine gemeinsame Versionsnummer

- Server und Kasse tragen dieselbe Versionsnummer: `version` in `backend/package.json` und
  `terminal/package.json`, außerdem `frontend/package.json` und die Root-`package.json`.
- Die nächste Version ist für alle **0.2.0** (meine Entscheidung). Ein Test stellt sicher, dass
  alle vier Dateien dieselbe Version tragen.
- Der Release-Workflow prüft zusätzlich zur Kasse auch `backend/package.json` gegen den Tag.
- **Vergleich:**
  - Verglichen wird die vollständige Version (`MAJOR.MINOR.PATCH`). Gleich heißt identisch.
  - „Älter“ und „neuer“ werden numerisch pro Stelle bestimmt, 0.10.0 ist also neuer als 0.9.0.
    Das bestimmt nur, welche Meldung erscheint.
  - Eine Version, die nicht diesem Muster entspricht, gilt als „passt nicht“.

### Server

- `GET /api/version` (öffentlich) liefert `{ version }`. Der Wert wird zur Laufzeit aus
  `backend/package.json` neben `dist/` gelesen.
- **Sync-Endpunkte:** `GET /api/sync/catalog` und `POST /api/sync/bookings` verlangen
  zusätzlich zu `x-terminal-id`/`x-terminal-key` noch zwei Header:
  - `x-terminal-version`: Fehlt er oder weicht er von der Serverversion ab, antwortet der Server
    mit **409** `{ error: "Versionen passen nicht zusammen", serverVersion }`. Diese Prüfung kommt
    vor der PIN-Prüfung.
  - `x-admin-pin`: Ist er falsch, antwortet der Server mit **401**
    `{ error: "Admin-PIN falsch" }`.

  Kassen der Version 0.1.0 senden keinen Versions-Header und werden damit abgewiesen. Sie
  aktualisieren sich im Hintergrund selbst und installieren das Update beim nächsten Beenden.
- **Reihenfolge der Prüfungen:** Terminal-Schlüssel (401 „Terminal-Schlüssel ungültig“), dann
  Version (409), dann Sperre (429), dann PIN (401 „Admin-PIN falsch“).
- **Sperre gegen Durchprobieren:**
  - Zählung pro Terminal-ID, im Speicher des Servers; nach einem Neustart ist sie zurückgesetzt.
  - Nach 5 falschen PINs in Folge gibt es 5 Minuten lang **429**
    `{ error: "Zu viele falsche PIN-Versuche – bitte in 5 Minuten erneut versuchen" }`, auch bei
    richtigem PIN.
  - Ein richtiger PIN oder das Ende der Sperre setzt den Zähler zurück (meine Entscheidung).
  - Der PIN wird zeitkonstant verglichen.
- Der PIN wird nirgends geloggt.

### Kasse – „Artikel abholen“, „Buchungen übertragen“ und die Einrichtung

1. Zuerst `GET /api/version`, mit dem normalen 15-Sekunden-Timeout des Abgleichs.
   - **Abweichung, Kasse älter:** Meldung „Kasse ist veraltet (Kasse Y, Server X) – bitte App
     beenden und neu starten, damit das Update installiert wird“. Kein Abgleich, keine
     PIN-Abfrage.
   - **Abweichung, Kasse neuer oder Version unbekannt:** Meldung „Server ist veraltet (Server X,
     Kasse Y) – bitte zuerst den Server aktualisieren“ bzw. „Versionen passen nicht zusammen“.
     Kein Abgleich.
   - **Server nicht erreichbar:** die bestehende Meldung „Server nicht erreichbar“.
2. Dann ein Dialog „Admin-PIN“ mit einer Ziffern-Eingabe, maskiert, und den Knöpfen „OK“ und
   „Abbrechen“.
3. Der Abgleich läuft mit `x-admin-pin` und `x-terminal-version`. Mehrere Stapel beim Übertragen
   verwenden denselben eingegebenen PIN.
4. Meldungen:
   - 401 „Admin-PIN falsch“ → „Admin-PIN falsch“
   - 429 → der Sperrtext des Servers
   - 409 → die Versionsmeldung aus Schritt 1
5. Der PIN liegt nur im Speicher, solange der Abgleich läuft. Danach wird er verworfen. Er wird
   nicht in `settings.json`, im Event-Log oder in Logs gespeichert.
6. Ein Teilerfolg beim Übertragen wird wie bisher behandelt (`partial.accepted` wird markiert).
7. **Einrichtung:** „Einrichten & Artikel abholen“ durchläuft dieselben Schritte. „Terminals
   laden“ bleibt ohne Versionsprüfung und ohne PIN.
8. Das Hintergrund-Update bleibt unverändert. Es installiert beim Beenden und wird nie erzwungen.

### Migrierbare lokale Daten

Damit künftige Versionen alte Daten immer lesen können (meine Ausgestaltung):

- Der lokale Speicher bekommt eine Formatversion: die Datei `format.json` mit `{ "format": 1 }`
  im Datenverzeichnis. Fehlt sie, gilt Format 1; das ist das heutige Format.
- `LocalStore` bekommt beim Start einen Migrationsschritt. Er liest die Formatversion und führt
  nacheinander alle Migrationen bis zum aktuellen Format aus. Heute gibt es noch keine Migration,
  nur den Mechanismus und den Test.
- Jede Migration schreibt atomar (tmp-Datei → fsync → rename) und erhöht erst danach `format.json`.
- Die Kasse weigert sich, Daten mit einem **höheren** Format als ihrem eigenen zu öffnen. Das
  passiert nur, wenn jemand eine ältere App über eine neuere installiert. Sie zeigt dann
  „Lokale Daten stammen von einer neueren Version – bitte aktuelle Version installieren“ und
  verändert nichts.
- Regel für künftige Änderungen, festgehalten als Kommentar im Store und in diesem Dokument:
  Felder in Events, Katalog und Einstellungen werden nur ergänzt, nie umbenannt oder entfernt,
  ohne dass eine Migration sie überführt. Neue Pflichtfelder bekommen beim Lesen einen
  Standardwert.

### Admin-Bereich

Die Serverversion wird klein in der Kopfzeile neben „Administration“ angezeigt (meine
Entscheidung).

## Tests

- Die bestehenden Sync-Tests im Backend und die End-to-End-Tests senden künftig Version und PIN.
- Die End-to-End-Tests geben den PIN `0000` in den neuen Dialog ein (Testserver mit
  `ADMIN_PIN=0000`).
- Ein Test prüft, dass alle vier `package.json` dieselbe Version tragen.
- Store-Tests:
  - fehlende `format.json` gilt als Format 1;
  - eine höhere Formatversion wird abgelehnt, ohne dass Daten verändert werden;
  - der Migrations-Mechanismus führt eine Test-Migration atomar aus.

## Dem Builder überlassen

- Die Form der PIN-Eingabe, ob Ziffernblock wie beim Admin-Login oder Eingabefeld; deutsch und
  touch-tauglich.
- Datenstruktur der Sperre.
- Wie die Formatversion bei Fehlern an den Renderer gemeldet wird.
