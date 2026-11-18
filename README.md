# onenote-mcp

Zugriff von Claude auf die lokal installierte **OneNote-Desktop-App** über deren COM-Schnittstelle. Es braucht kein Microsoft Graph und keine App-Freigabe im Microsoft-365-Konto.

Enthält zwei Wege, die dasselbe PowerShell-Skript nutzen:

| Teil | Für | Ort |
|---|---|---|
| MCP-Server | Claude-Desktop-App (Chat und Projekte) | `server.mjs` |
| Skill | Claude Code (Terminal, Code-Tab) | `skill/onenote/` |

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

## Werkzeuge

| Werkzeug | Zweck |
|---|---|
| `onenote_tree` | Notizbücher, Gruppen, Abschnitte mit Seitenzahl |
| `onenote_sections` | Abschnitte mit Pfad und ID, optional gefiltert |
| `onenote_pages` | Seiten eines Abschnitts |
| `onenote_read_page` | Seiteninhalt als Text |
| `onenote_search` | Volltextsuche (Windows-Suchindex) |
| `onenote_create_page` | Neue Seite erstellen |

Das Skript lässt sich auch direkt aufrufen:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File skill\onenote\scripts\onenote.ps1 tree
```

## Test

```powershell
node test/smoke.mjs "Teil eines Abschnittspfads"
```

Startet den Server und ruft die lesenden Werkzeuge auf. Dabei wird nichts geschrieben.

## Grenzen

- Gelesen wird nur, was die Desktop-App lokal synchronisiert hat.
- Text in Bildern, Freihand und angehängten Dateien ist nicht lesbar.
- Gelesene Inhalte gehen zur Verarbeitung an Claude.
