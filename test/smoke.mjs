// Rauchtest: startet den Server per stdio und ruft die lesenden Werkzeuge auf (schreibt nichts).
// Aufruf: node test/smoke.mjs [abschnitts-filter]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const filter = process.argv[2] ?? "";
const client = new Client({ name: "smoke-test", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ["server.mjs"] }));

const call = async (name, args = {}, { expectError = false } = {}) => {
  const t0 = performance.now();
  const res = await client.callTool({ name, arguments: args });
  const ms = Math.round(performance.now() - t0);
  const text = res.content.map((c) => c.text).join("\n");
  const ok = Boolean(res.isError) === expectError;
  console.log(`\n=== ${ok ? "OK " : "FEHLER"} ${name} ${JSON.stringify(args)} (${ms} ms)`);
  console.log(text.split("\n").slice(0, 8).join("\n"));
  if (!ok) process.exitCode = 1;
  return text;
};

console.log("Werkzeuge:", (await client.listTools()).tools.map((t) => t.name).join(", "));
await call("onenote_tree");
const sections = await call("onenote_sections", filter ? { filter } : {});
const sectionId = sections.split("\n")[0]?.split("|").pop().trim();
if (sectionId) {
  const pages = await call("onenote_pages", { section_id: sectionId });
  const pageId = pages.split("\n").find((l) => l.includes("|"))?.split("|").pop().trim();
  if (pageId) await call("onenote_read_page", { page_id: pageId });
}
await call("onenote_search", { query: "Steuer" });
await call("onenote_read_page", { page_id: "{00000000-0000-0000-0000-000000000000}{1}{B0}" }, { expectError: true });
await client.close();
