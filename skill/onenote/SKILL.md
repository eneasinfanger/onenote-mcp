---
name: onenote
description: Liest, durchsucht und erstellt OneNote-Notizen über die lokale OneNote-Desktop-App.
---

# OneNote (lokal über COM)

Zugriff läuft über die COM-Schnittstelle der installierten OneNote-Desktop-App, nicht über Microsoft Graph: Das Office-365-Konto wird von der Schule verwaltet, App-Freigaben sind dort nicht erlaubt.

## Kommandozeile

```powershell
$on = "$env:USERPROFILE\.claude\skills\onenote\scripts\onenote.mjs"
node $on <befehl> [optionen]
```

| Befehl | Zweck |
|---|---|
| `tree` | Übersicht: Notizbücher, Gruppen, Abschnitte mit Seitenzahl |
| `sections --filter <text>` | Abschnitte mit vollem Pfad und ID (Filter auf den Pfad, ohne Gross-/Kleinschreibung) |
| `pages --id <abschnittId>` | Seiten eines Abschnitts: `Titel \| Datum \| ID` (Einrückung = Unterseite) |
| `read --id <seitenId>` | Seiteninhalt als Text (Tabellen als `\| … \|`, Bilder/Freihand als Platzhalter) |
| `search --query <text> [--id <notizbuch-/abschnittId>]` | Seiten, die den Text enthalten (Windows-Suchindex) |
| `create --id <abschnittId> --title <text> [--body <text> \| --body-file <pfad>]` | Neue Seite; jede Zeile wird ein Absatz, einfaches HTML wie `<b>` geht |

`--json` liefert strukturierte Daten statt Text.

Jeder Kommandozeilenaufruf startet die COM-Brücke neu (ca. 0,5 s). Sollen viele Seiten gelesen werden (z. B. ein ganzer Abschnitt), ist ein kurzes Node-Skript schneller, das die Bibliothek direkt importiert: `import { listSections, listPages, readPage, close } from "file:///C:/Users/Eneas/WebstormProjects/onenote-mcp/lib/onenote.mjs"`. Weitere Funktionen: `getTree`, `search`, `createPage`. Am Ende `close()` aufrufen.

## Vorgehen

1. Abschnitt finden: `sections --filter` mit einem Teil des Namens. Abschnittsnamen kommen oft mehrfach vor (z. B. „Aktuelles SJ 25_26“ in mehreren Gruppen), deshalb am vollen Pfad orientieren.
2. `pages` für die Seitenliste, dann `read` für die benötigten Seiten. Nur lesen, was für die Aufgabe nötig ist.
3. Ergebnis (Zusammenfassung, Lernzettel usw.) im Chat liefern. In OneNote nur schreiben, wenn der Nutzer das ausdrücklich will.

Für Schreibzugriff mit `create` am besten einen Bereich nehmen, der dem Nutzer gehört: das eigene Notizbuch oder die eigene Schülergruppe im Kursnotizbuch. In der `_Inhaltsbibliothek` haben Schüler meist nur Leserechte.

## Notizbücher des Nutzers

- **Eneas @ sluz**: persönliches Notizbuch
- **INA 23cL ABU**: Kursnotizbuch ABU. Eigener Bereich: `BBZW; Infanger Eneas`. Material der Lehrperson: `_Inhaltsbibliothek`
- **S-INA23cL-Notizbuch**: Klassen-Notizbuch mit Modulen (M306, M322, M347)

Gruppen anderer Schüler (z. B. `BBZW; <Name>`) nur lesen, wenn der Nutzer das ausdrücklich verlangt.

## Grenzen

- Gelesen wird nur, was die Desktop-App lokal synchronisiert hat. Meldet ein Befehl „Objekt nicht gefunden“, das Notizbuch in OneNote öffnen und synchronisieren lassen.
- Text in Bildern, Freihand und angehängten Dateien ist nicht lesbar, nur als Platzhalter sichtbar.
