# onenote-mcp

Zugriff von Claude auf die lokal installierte **OneNote-Desktop-App** über deren COM-Schnittstelle. Es braucht kein Microsoft Graph und keine App-Freigabe im Microsoft-365-Konto.

| Teil | Für | Ort |
|---|---|---|
| Bibliothek | gemeinsame Logik, importierbar | `lib/onenote.mjs` |
| MCP-Server | Claude-Desktop-App (Chat und Projekte) | `server.mjs` |
| Skill + Kommandozeile | Claude Code (Terminal, Code-Tab) | `skill/onenote/` |

## Aufbau

```
server.mjs / skill/onenote/scripts/onenote.mjs
        │  import
        ▼
lib/onenote.mjs   XML auswerten, Text aufbereiten, Seiten erstellen
lib/format.mjs    Textausgabe
        │
        ▼
lib/bridge.mjs    startet bridge.ps1 einmal und hält es am Laufen
        │  JSON-Zeilen über stdin/stdout
        ▼
lib/bridge.ps1    nur die rohen COM-Aufrufe an OneNote.Application
```

JavaScript hat keinen eigenen COM-Zugriff. Die PowerShell-Brücke ist deshalb bewusst minimal gehalten: Sie nimmt eine Anfrage pro Zeile entgegen und gibt das rohe XML base64-kodiert zurück. Nach dem Start dauert ein Aufruf nur wenige Millisekunden.

## Voraussetzungen

- Windows mit OneNote-Desktop (Microsoft 365 / OneNote 2016), Notizbücher darin geöffnet und synchronisiert
- Node.js 18 oder neuer

## Einrichtung

```powershell
npm install
```

### Claude-Desktop-App

In `claude_desktop_config.json` eintragen (Einstellungen → Entwickler → Konfiguration bearbeiten):

```json
{
  "mcpServers": {
    "onenote": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\Eneas\\WebstormProjects\\onenote-mcp\\server.mjs"]
    }
  }
}
```

Danach die App komplett beenden (auch im Infobereich der Taskleiste) und neu starten.

### Claude Code

Den Skill-Ordner nach `~/.claude/skills/onenote` verlinken:

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\onenote" -Target "$PWD\skill\onenote"
```

## Verwendung

### MCP-Werkzeuge

| Werkzeug | Zweck |
|---|---|
| `onenote_tree` | Notizbücher, Gruppen, Abschnitte mit Seitenzahl |
| `onenote_sections` | Abschnitte mit Pfad und ID, optional gefiltert |
| `onenote_pages` | Seiten eines Abschnitts |
| `onenote_read_page` | Seiteninhalt als Text |
| `onenote_search` | Volltextsuche (Windows-Suchindex) |
| `onenote_create_page` | Neue Seite erstellen |

### Kommandozeile

```powershell
node skill\onenote\scripts\onenote.mjs tree
node skill\onenote\scripts\onenote.mjs sections --filter "Steuern" --json
```

### Als Bibliothek

```js
import { listSections, listPages, readPage, close } from "./lib/onenote.mjs";

const [section] = await listSections("Infanger Eneas / Steuern");
for (const page of await listPages(section.id)) {
  const { title, text } = await readPage(page.id);
  console.log(title, text.length);
}
close();
```

## Test

```powershell
npm test -- "Teil eines Abschnittspfads"
```

Startet den Server und ruft die lesenden Werkzeuge auf, inklusive Fehlerfall. Dabei wird nichts geschrieben.

## Grenzen

- Gelesen wird nur, was die Desktop-App lokal synchronisiert hat.
- Text in Bildern, Freihand und angehängten Dateien ist nicht lesbar.
- Gelesene Inhalte gehen zur Verarbeitung an Claude.
