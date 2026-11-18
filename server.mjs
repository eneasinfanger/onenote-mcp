#!/usr/bin/env node
// Lokaler MCP-Server (stdio) für die OneNote-Desktop-App.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as onenote from "./lib/onenote.mjs";
import * as fmt from "./lib/format.mjs";

const server = new McpServer(
  { name: "onenote", version: "2.0.0" },
  {
    instructions:
      "Zugriff auf die lokal installierte OneNote-Desktop-App. Vorgehen: onenote_sections (Abschnitt per Pfad finden) → " +
      "onenote_pages → onenote_read_page. Abschnittsnamen kommen oft mehrfach vor, deshalb am vollen Pfad orientieren. " +
      "Nur in OneNote schreiben, wenn der Nutzer das ausdrücklich will, und bevorzugt in eigenen Bereichen " +
      "(persönliches Notizbuch oder eigene Schülergruppe; die _Inhaltsbibliothek ist für Schüler meist schreibgeschützt). " +
      "Gruppen anderer Schüler in Kursnotizbüchern nur auf ausdrücklichen Wunsch lesen.",
  },
);

/** Führt fn aus und verpackt das Ergebnis (oder den Fehler) als MCP-Textantwort. */
const tool = (fn) => async (args) => {
  try {
    return { content: [{ type: "text", text: await fn(args) }] };
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: err.message }] };
  }
};

const readOnly = { readOnlyHint: true, openWorldHint: false };

server.registerTool(
  "onenote_tree",
  {
    title: "OneNote-Übersicht",
    description: "Alle Notizbücher mit Abschnittsgruppen und Abschnitten samt Seitenzahl (ohne IDs).",
    inputSchema: {},
    annotations: readOnly,
  },
  tool(async () => fmt.formatTree(await onenote.getTree())),
);

server.registerTool(
  "onenote_sections",
  {
    title: "Abschnitte suchen",
    description: "Abschnitte mit vollem Pfad (Notizbuch / Gruppe / Abschnitt) und ID. Optional nach Pfadteil filtern.",
    inputSchema: { filter: z.string().optional().describe("Teil des Pfads, z. B. 'Infanger Eneas / Steuern'") },
    annotations: readOnly,
  },
  tool(async ({ filter }) => fmt.formatSections(await onenote.listSections(filter))),
);

server.registerTool(
  "onenote_pages",
  {
    title: "Seiten eines Abschnitts",
    description: "Seiten eines Abschnitts als 'Titel | Datum | ID'. Einrückung bedeutet Unterseite.",
    inputSchema: { section_id: z.string().describe("Abschnitts-ID aus onenote_sections") },
    annotations: readOnly,
  },
  tool(async ({ section_id }) => fmt.formatPages(await onenote.listPages(section_id))),
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
  tool(async ({ page_id }) => fmt.formatPage(await onenote.readPage(page_id))),
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
  tool(async ({ query, scope_id }) => fmt.formatSearch(await onenote.search(query, scope_id))),
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
  tool(async ({ section_id, title, body }) => fmt.formatCreated(await onenote.createPage(section_id, title, body))),
);

await server.connect(new StdioServerTransport());
