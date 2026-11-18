#!/usr/bin/env node
// Kommandozeile für den Claude-Code-Skill. Nutzt dieselbe Bibliothek wie der MCP-Server.
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import * as onenote from "../../../lib/onenote.mjs";
import * as fmt from "../../../lib/format.mjs";

const USAGE = `Aufruf: node onenote.mjs <befehl> [optionen] [--json]
  tree
  sections [--filter <pfadteil>]
  pages    --id <abschnittId>
  read     --id <seitenId>
  search   --query <text> [--id <notizbuch-/abschnittId>]
  create   --id <abschnittId> --title <text> [--body <text> | --body-file <pfad>]`;

const { positionals, values: o } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: "string", default: "" },
    filter: { type: "string", default: "" },
    query: { type: "string", default: "" },
    title: { type: "string", default: "" },
    body: { type: "string", default: "" },
    "body-file": { type: "string" },
    json: { type: "boolean", default: false },
  },
});

const need = (value, name) => {
  if (!value) throw new Error(`--${name} fehlt\n\n${USAGE}`);
  return value;
};

const commands = {
  tree: async () => [await onenote.getTree(), fmt.formatTree],
  sections: async () => [await onenote.listSections(o.filter), fmt.formatSections],
  pages: async () => [await onenote.listPages(need(o.id, "id")), fmt.formatPages],
  read: async () => [await onenote.readPage(need(o.id, "id")), fmt.formatPage],
  search: async () => [await onenote.search(need(o.query, "query"), o.id), fmt.formatSearch],
  create: async () => {
    const body = o["body-file"] ? await readFile(o["body-file"], "utf8") : o.body;
    return [await onenote.createPage(need(o.id, "id"), need(o.title, "title"), body), fmt.formatCreated];
  },
};

const command = commands[positionals[0]];
try {
  if (!command) throw new Error(USAGE);
  const [data, format] = await command();
  console.log(o.json ? JSON.stringify(data, null, 2) : format(data));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  onenote.close();
}
