#!/usr/bin/env node
// Lokaler MCP-Server für OneNote: stellt das PowerShell-Skript des Skills als Werkzeuge bereit.
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "skill", "onenote", "scripts", "onenote.ps1");

function runScript(args) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, ...args],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true, timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ isError: true, content: [{ type: "text", text: (stderr || err.message).trim() }] });
        } else {
          resolve({ content: [{ type: "text", text: stdout.trim() || "(leer)" }] });
        }
      },
    );
  });
}

const server = new McpServer(
  { name: "onenote", version: "1.0.0" },
  {
    instructions:
      "Zugriff auf die lokal installierte OneNote-Desktop-App. Vorgehen: onenote_sections (Abschnitt per Pfad finden) → " +
      "onenote_pages → onenote_read_page. Abschnittsnamen kommen oft mehrfach vor, deshalb am vollen Pfad orientieren. " +
      "Nur in OneNote schreiben, wenn der Nutzer das ausdrücklich will, und bevorzugt in eigenen Bereichen " +
      "(persönliches Notizbuch oder eigene Schülergruppe; die _Inhaltsbibliothek ist für Schüler meist schreibgeschützt). " +
      "Gruppen anderer Schüler in Kursnotizbüchern nur auf ausdrücklichen Wunsch lesen.",
  },
);

const readOnly = { readOnlyHint: true, openWorldHint: false };

server.registerTool(
  "onenote_tree",
  {
    title: "OneNote-Übersicht",
    description: "Alle Notizbücher mit Abschnittsgruppen und Abschnitten samt Seitenzahl (ohne IDs).",
    inputSchema: {},
    annotations: readOnly,
  },
  async () => runScript(["tree"]),
);

server.registerTool(
  "onenote_sections",
  {
    title: "Abschnitte suchen",
    description: "Abschnitte mit vollem Pfad (Notizbuch / Gruppe / Abschnitt) und ID. Optional nach Pfadteil filtern.",
    inputSchema: { filter: z.string().optional().describe("Teil des Pfads, z. B. 'Infanger Eneas / Steuern'") },
    annotations: readOnly,
  },
  async ({ filter }) => runScript(filter ? ["sections", "-Filter", filter] : ["sections"]),
);

server.registerTool(
  "onenote_pages",
  {
    title: "Seiten eines Abschnitts",
    description: "Seiten eines Abschnitts als 'Titel | Datum | ID'. Einrückung bedeutet Unterseite.",
    inputSchema: { section_id: z.string().describe("Abschnitts-ID aus onenote_sections") },
    annotations: readOnly,
  },
  async ({ section_id }) => runScript(["pages", "-Id", section_id]),
);

server.registerTool(
  "onenote_read_page",
  {
    title: "Seite lesen",
    description:
      "Inhalt einer Seite als Text. Tabellen erscheinen als '| … |', Bilder, Freihand und Dateien als Platzhalter.",
    inputSchema: { page_id: z.string().describe("Seiten-ID aus onenote_pages oder onenote_search") },
    annotations: readOnly,
  },
  async ({ page_id }) => runScript(["read", "-Id", page_id]),
);

server.registerTool(
  "onenote_search",
  {
    title: "Seiten durchsuchen",
    description: "Seiten, die den Suchtext enthalten (Windows-Suchindex), mit Pfad und ID.",
    inputSchema: {
      query: z.string().describe("Suchtext"),
      scope_id: z.string().optional().describe("Optional: Notizbuch- oder Abschnitts-ID, um die Suche einzugrenzen"),
    },
    annotations: readOnly,
  },
  async ({ query, scope_id }) => runScript(["search", "-Query", query, ...(scope_id ? ["-Id", scope_id] : [])]),
);

server.registerTool(
  "onenote_create_page",
  {
    title: "Seite erstellen",
    description:
      "Erstellt eine neue Seite in einem Abschnitt. Jede Zeile im Text wird ein Absatz; einfaches HTML wie <b> ist erlaubt.",
    inputSchema: {
      section_id: z.string().describe("Abschnitts-ID aus onenote_sections"),
      title: z.string().describe("Seitentitel"),
      body: z.string().optional().describe("Seiteninhalt"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ section_id, title, body }) => {
    const dir = await mkdtemp(join(tmpdir(), "onenote-mcp-"));
    const file = join(dir, "body.txt");
    try {
      await writeFile(file, body ?? "", "utf8");
      return await runScript(["create", "-Id", section_id, "-Title", title, "-BodyFile", file]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

await server.connect(new StdioServerTransport());
