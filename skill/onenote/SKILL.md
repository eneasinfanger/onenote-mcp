---
name: onenote
description: Liest, durchsucht und erstellt OneNote-Notizen über die lokale OneNote-Desktop-App.
---

# OneNote (lokal über COM)

Zugriff läuft über die COM-Schnittstelle der installierten OneNote-Desktop-App. Kein Microsoft-Graph und kein MCP-Server: Das Office-365-Konto wird von der Schule verwaltet, App-Freigaben sind dort nicht erlaubt.

## Hilfsskript

```powershell
$on = "$env:USERPROFILE\.claude\skills\onenote\scripts\onenote.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File $on <befehl> [optionen]
```

| Befehl | Zweck |
|---|---|
| `tree` | Übersicht: Notizbücher, Gruppen, Abschnitte mit Seitenzahl |
| `sections -Filter <text>` | Abschnitte mit vollem Pfad und ID (Filter auf den Pfad, Platzhalter-Suche) |
| `pages -Id <abschnittId>` | Seiten eines Abschnitts: `Titel \| Datum \| ID` (Einrückung = Unterseite) |
| `read -Id <seitenId>` | Seiteninhalt als Text (Tabellen als `\| … \|`, Bilder/Freihand als Platzhalter) |
| `search -Query <text> [-Id <notizbuch-/abschnittId>]` | Seiten, die den Text enthalten (Windows-Suchindex) |
| `create -Id <abschnittId> -Title <text> [-Body <text> \| -BodyFile <pfad>]` | Neue Seite; jede Zeile wird ein Absatz, einfaches HTML wie `<b>` geht |

## Vorgehen

1. Abschnitt finden: `sections -Filter` mit einem Teil des Namens. Abschnittsnamen kommen oft mehrfach vor (z. B. „Aktuelles SJ 25_26“ in mehreren Gruppen), deshalb am vollen Pfad orientieren.
2. `pages` für die Seitenliste, dann `read` für die benötigten Seiten. Bei vielen Seiten nur das lesen, was für die Aufgabe nötig ist.
3. Ergebnis (Zusammenfassung, Lernzettel usw.) im Chat liefern. In OneNote nur schreiben, wenn der Nutzer das ausdrücklich will.

Für Schreibzugriff mit `create` am besten einen Bereich nehmen, der dem Nutzer gehört: das eigene Notizbuch oder die eigene Schülergruppe im Kursnotizbuch. In der `_Inhaltsbibliothek` haben Schüler meist nur Leserechte.

## Notizbücher des Nutzers

- **Eneas @ sluz**: persönliches Notizbuch
- **INA 23cL ABU**: Kursnotizbuch ABU. Eigener Bereich: `BBZW; Infanger Eneas`. Material der Lehrperson: `_Inhaltsbibliothek`
- **S-INA23cL-Notizbuch**: Klassen-Notizbuch mit Modulen (M306, M322, M347)

Gruppen anderer Schüler (z. B. `BBZW; <Name>`) nur lesen, wenn der Nutzer das ausdrücklich verlangt.

## Grenzen

- Gelesen wird nur, was die Desktop-App lokal synchronisiert hat. Fehlt etwas, das Notizbuch in OneNote öffnen und synchronisieren lassen.
- Text in Bildern, Freihand und angehängten Dateien ist nicht lesbar, nur als Platzhalter sichtbar.
- Für Bearbeitungen, die das Skript nicht abdeckt: `GetPageContent` / `UpdatePageContent` direkt über `New-Object -ComObject OneNote.Application` (Namespace `http://schemas.microsoft.com/office/onenote/2013/onenote`).
