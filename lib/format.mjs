// Textausgabe der Ergebnisse aus onenote.mjs (für MCP-Server und Kommandozeile).

const day = (iso) => (iso ? iso.slice(0, 10) : "");
const dateTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function formatTree(tree) {
  const lines = [];
  const walk = (nodes, indent) => {
    for (const n of nodes) {
      if (n.kind === "section") lines.push(`${indent}- ${n.name} (${n.pages} Seiten)`);
      else {
        lines.push(`${indent}[${n.kind === "notebook" ? "Notizbuch" : "Gruppe"}] ${n.name}`);
        walk(n.children, indent + "    ");
      }
    }
  };
  walk(tree, "");
  return lines.join("\n");
}

export const formatSections = (sections) =>
  sections.length ? sections.map((s) => `${s.path} | ${s.id}`).join("\n") : "Keine Abschnitte gefunden.";

export const formatPages = (pages) =>
  pages.length
    ? pages.map((p) => `${"  ".repeat(p.level - 1)}${p.title} | ${day(p.modified)} | ${p.id}`).join("\n")
    : "Keine Seiten.";

export const formatPage = (page) =>
  `# ${page.title}\n(zuletzt geändert: ${dateTime(page.modified)})\n\n${page.text || "(kein Text)"}`;

export const formatSearch = (hits) =>
  hits.length ? hits.map((h) => `${h.path} | ${h.id}`).join("\n") : "Keine Treffer.";

export const formatCreated = (p) => `Seite erstellt: ${p.title} | ${p.id}`;
