# Versionsprüfung und Admin-PIN für den Abgleich

**Datum**: 2026-11-08
**Status**: zur Freigabe
**Baut auf**: `docs/superpowers/specs/2026-11-07-offline-terminal-app-design.md`

## Worum es geht und warum

Kasse (Electron-App `terminal/`) und Server (`backend/`) müssen zueinander passen. Ändert sich
das Format der Buchungen oder des Katalogs, darf keine alte Kasse mit einem neuen Server
abgleichen und umgekehrt. Bisher gibt es dafür keine Prüfung. Das Auto-Update läuft nur im
Hintergrund und wird erst beim Beenden der App installiert.

Außerdem soll nicht jeder, der an einer eingerichteten Kasse steht, Artikel abholen oder
Buchungen übertragen können. Dafür ist künftig zusätzlich der Admin-PIN des Servers nötig.

## Ziele

1. Ist beim Start der Kasse der Server erreichbar, werden die Versionen verglichen. Bei
   Abweichung wird erst nach einem Update weitergearbeitet.
2. Dieselbe Prüfung läuft bei „Artikel abholen“ und „Buchungen übertragen“.
3. „Artikel abholen“ (auch beim Einrichten) und „Buchungen übertragen“ verlangen den Admin-PIN.
   Der PIN wird ausschließlich auf dem Server geprüft und landet nie auf der Kasse, weder als
   Klartext noch als Hash.

## Nicht-Ziele

- Keine PIN-Abfrage für Kassieren, Storno, Nachdruck oder Einstellungen.
- Keine Versionsprüfung und kein Update ohne Netz. Am Fest startet die Kasse wie bisher.
- Kein automatisches Update des Servers.
- Kein neues Verfahren für den Admin-PIN selbst. Er bleibt `ADMIN_PIN` auf dem Server, derselbe
  wie beim Admin-Login im Browser.

## Anti-Ziele

- Die Kasse hängt beim Start lange, weil sie ohne Netz auf den Server wartet.
- Eine offene Bestellung oder nicht übertragene Buchungen gehen durch das erzwungene Update
  verloren.
- Der PIN wird auf der Kasse gespeichert, geloggt oder in einer Datei abgelegt.

## Entscheidungen des Nutzers

1. **Beim Start mit erreichbarem Server:**
   - **Kasse älter als Server:** Das Update wird erzwungen. Die Kasse lädt es, installiert es und
     startet neu. Bis dahin wird nicht kassiert.
   - **Kasse neuer als Server:** Fehlermeldung, die Kasse startet nicht.
   - **Gleiche Version:** normaler Start.
2. **Ohne Internet bzw. wenn der Server nicht erreichbar ist:** normaler Start ohne Prüfung.
3. **Bei „Artikel abholen“ und „Buchungen übertragen“:** dieselbe Prüfung. Bei Abweichung kein
   Abgleich, sondern eine Meldung, welche Seite aktualisiert werden muss.
4. **Terminal-Schlüssel:** wird wie bisher beim Einrichten eingegeben und gespeichert.
5. **Admin-PIN:** wird bei jedem „Artikel abholen“ (auch beim ersten Abholen in der Einrichtung)
   und bei jedem „Buchungen übertragen“ eingegeben. Der Server prüft ihn, die Kasse merkt ihn
   sich nicht.
6. **Bestätigte Vorschläge:**
   - Nach 5 falschen PINs nimmt der Server 5 Minuten lang keine weiteren Versuche an.
   - Die Versionsprüfung kommt vor der PIN-Abfrage.
   - Eine offene Bestellung übersteht das Update.
   - Als Notausgang startet die Kasse ohne Netzwerk trotzdem, falls der Server vor einem Fest
     nicht rechtzeitig aktualisiert wurde.
7. **Erzwungenes Update schlägt fehl, obwohl der Server erreichbar ist** (z. B. Server nur im
   Vereins-WLAN ohne Internet, Release noch nicht fertig): Zusätzlich zu „Erneut versuchen“ gibt
   es den Knopf **„Trotzdem starten“**. Die Kasse kassiert dann offline weiter, aber
   „Artikel abholen“ und „Buchungen übertragen“ bleiben gesperrt, bis die Versionen passen
   (die Versionsprüfung vor jedem Abgleich verhindert ihn ohnehin).

## Verhalten im Detail

### Eine gemeinsame Versionsnummer

- Server und Kasse tragen dieselbe Versionsnummer: `version` in `backend/package.json` und
  `terminal/package.json`, außerdem `frontend/package.json` und die Root-`package.json`.
- Die nächste Version ist für alle **0.2.0** (meine Entscheidung). Ein Test stellt sicher, dass
  alle vier Dateien dieselbe Version tragen.
- Der Release-Workflow prüft zusätzlich zur Kasse auch `backend/package.json` gegen den Tag.
- Verglichen wird die vollständige Version (`MAJOR.MINOR.PATCH`), nicht nur ein Teil davon.
  Gleich heißt identisch. „Älter“ und „neuer“ werden numerisch pro Stelle bestimmt (0.10.0 ist
  neuer als 0.9.0). Eine Version, die nicht diesem Muster entspricht (auch mit Zusätzen wie
  `-rc1`), gilt als „unbekannt“: Beim Start führt das zu einem normalen Start, beim Abgleich zur
  Meldung „Versionen passen nicht zusammen“ (meine Entscheidung).

### Server

- `GET /api/version` (öffentlich) liefert `{ version }`. Der Wert wird zur Laufzeit aus
  `backend/package.json` gelesen.
- **Sync-Endpunkte:** `GET /api/sync/catalog` und `POST /api/sync/bookings` verlangen
  zusätzlich zu `x-terminal-id`/`x-terminal-key` noch zwei Header:
  - `x-terminal-version`: Fehlt er oder weicht er von der Serverversion ab, antwortet der Server
    mit **409** `{ error: "Versionen passen nicht zusammen", serverVersion }`. Diese Prüfung kommt
    vor der PIN-Prüfung.
  - `x-admin-pin`: Ist er falsch, antwortet der Server mit **401**
    `{ error: "Admin-PIN falsch" }`.

  Kassen der Version 0.1.0 senden keinen Versions-Header und werden damit abgewiesen. Sie
  aktualisieren sich im Hintergrund ohnehin selbst.
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

### Kasse – Start

1. Gibt es noch keine Einstellungen, also noch keine Einrichtung: keine Prüfung beim Start (die
   Prüfung kommt im Assistenten, siehe unten).
2. Gibt es Einstellungen: Die Kasse zeigt kurz „Prüfe Version …“ und ruft `GET /api/version` mit
   einem Timeout von **3 Sekunden** auf (meine Entscheidung). Die 3 Sekunden gelten nur für diese
   Abfrage; das Laden eines Updates darf danach so lange dauern wie nötig.
   - **Kein Ergebnis** (Timeout, Netzfehler, Fehlerstatus): normaler Start, keine Meldung.
   - **Gleiche Version:** normaler Start.
   - **Server neuer:** Bildschirm „Update auf Version X wird geladen …“ mit Fortschritt. Die
     App prüft über `electron-updater` das GitHub-Release, lädt es und installiert es mit
     sofortigem Neustart (`quitAndInstall`).
     - Gibt es kein passendes Update oder schlägt das Laden fehl: Fehlermeldung „Update auf
       Version X konnte nicht geladen werden“ mit den Knöpfen „Erneut versuchen“ und
       „Trotzdem starten“. „Trotzdem starten“ öffnet die Kasse normal; jeder spätere Abgleich
       scheitert an der Versionsprüfung (Meldung „Kasse ist veraltet …“), bis das Update
       installiert ist. Offline startet die Kasse ohnehin normal.
     - Nicht paketierte App (Entwicklung/Tests): kein Update möglich, stattdessen dieselbe
       Fehlermeldung mit denselben Knöpfen.
   - **Kasse neuer:** Fehlermeldung „Server ist veraltet (Server X, Kasse Y) – bitte zuerst den
     Server aktualisieren“ und kein Start. Es gibt einen Knopf „Erneut versuchen“.
3. Lokale Buchungen und eine offene Bestellung liegen auf der Festplatte außerhalb des
   Programmverzeichnisses und bleiben beim Update erhalten.
4. Das bisherige Hintergrund-Update (Installation beim Beenden) bleibt zusätzlich bestehen.
   Beide nutzen einen gemeinsamen Updater, damit Hintergrund-Prüfung und erzwungenes Update
   nicht gegeneinander laufen (meine Entscheidung).

### Kasse – Einrichtung

- „Terminals laden“ ruft zuerst `GET /api/version` auf. Weichen die Versionen ab, gilt dasselbe
  wie beim Start: Server neuer → Update erzwingen, Kasse neuer → Fehlermeldung.
- „Einrichten & Artikel abholen“ prüft die Version erneut und fragt dann den Admin-PIN ab,
  siehe unten.

### Kasse – „Artikel abholen“ und „Buchungen übertragen“

1. Zuerst `GET /api/version`, mit dem normalen 15-Sekunden-Timeout des Abgleichs.
   - **Abweichung:** kein Abgleich. Meldung „Kasse ist veraltet – bitte App neu starten, um das
     Update zu installieren“ bzw. „Server ist veraltet – bitte zuerst den Server aktualisieren“.
     Es folgt keine PIN-Abfrage.
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

### Admin-Bereich

Keine Änderung nötig. Optional zeigt die Auswertungsseite die Serverversion, zum Beispiel in
der Fußzeile (meine Entscheidung: ja, klein in der Kopfzeile neben „Administration“).

## Tests

- Die bestehenden Sync-Tests im Backend und die End-to-End-Tests senden künftig Version und PIN.
- Die End-to-End-Tests geben den PIN `0000` in den neuen Dialog ein (Testserver mit
  `ADMIN_PIN=0000`).
- Das Backend liest die Version zur Laufzeit aus `backend/package.json` neben `dist/`. So wird
  es heute gestartet.

## Dem Builder überlassen

- Wo die Startprüfung technisch läuft, im Main-Prozess oder im Renderer mit IPC zum Updater,
  solange die App ohne Server höchstens 3 Sekunden später startet.
- Wie `electron-updater` für das erzwungene Update angesprochen wird (`checkForUpdates`,
  `downloadUpdate`, `quitAndInstall`) und wie der Fortschritt übermittelt wird.
- Die Form der PIN-Eingabe, ob Ziffernblock wie beim Admin-Login oder Eingabefeld; deutsch und
  touch-tauglich.
- Datenstruktur der Sperre.
