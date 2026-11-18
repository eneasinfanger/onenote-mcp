// OneNote-Zugriff: Hierarchie, Seiten lesen, Suchen, Seiten erstellen.
import { DOMParser } from "@xmldom/xmldom";
import { call, close } from "./bridge.mjs";

export { close };

const NS = "http://schemas.microsoft.com/office/onenote/2013/onenote";
const Scope = { self: 0, children: 1, notebooks: 2, sections: 3, pages: 4 };
const CONTAINERS = new Set(["Notebook", "SectionGroup", "Section", "Page"]);

const parse = (xml) => new DOMParser().parseFromString(xml, "text/xml").documentElement;
const elements = (el, name) =>
  Array.from(el.childNodes).filter((n) => n.nodeType === 1 && n.namespaceURI === NS && (!name || n.localName === name));
const descendants = (el, name) => Array.from(el.getElementsByTagNameNS(NS, name));
const inRecycleBin = (el) => el.getAttribute("isRecycleBin") === "true" || el.getAttribute("isInRecycleBin") === "true";

function pathOf(el) {
  const parts = [];
  for (let n = el; n && n.nodeType === 1 && CONTAINERS.has(n.localName); n = n.parentNode) {
    parts.unshift(n.getAttribute("name"));
  }
  return parts.join(" / ");
}

const hierarchy = async (startId, scope) => parse(await call("GetHierarchy", { start: startId, scope }));

/**
 * Alle Notizbücher als Baum.
 * @returns {Promise<Array<{kind: "notebook"|"group"|"section", name: string, id: string, pages?: number, children?: any[]}>>}
 */
export async function getTree() {
  const toNode = (el) => {
    const base = { name: el.getAttribute("name"), id: el.getAttribute("ID") };
    if (el.localName === "Section") {
      return { kind: "section", ...base, pages: elements(el, "Page").filter((p) => !inRecycleBin(p)).length };
    }
    const children = elements(el)
      .filter((c) => (c.localName === "SectionGroup" || c.localName === "Section") && !inRecycleBin(c))
      .map(toNode);
    return { kind: el.localName === "Notebook" ? "notebook" : "group", ...base, children };
  };
  return elements(await hierarchy("", Scope.pages), "Notebook").map(toNode);
}

/** Abschnitte mit vollem Pfad; `filter` sucht ohne Gross-/Kleinschreibung im Pfad. */
export async function listSections(filter = "") {
  const needle = filter.toLowerCase();
  return descendants(await hierarchy("", Scope.sections), "Section")
    .filter((s) => !inRecycleBin(s))
    .map((s) => ({ path: pathOf(s), id: s.getAttribute("ID") }))
    .filter((s) => !needle || s.path.toLowerCase().includes(needle));
}

/** Seiten eines Abschnitts. `level` > 1 bedeutet Unterseite. */
export async function listPages(sectionId) {
  return descendants(await hierarchy(sectionId, Scope.pages), "Page")
    .filter((p) => !inRecycleBin(p))
    .map((p) => ({
      title: p.getAttribute("name"),
      level: Number(p.getAttribute("pageLevel") || 1),
      created: p.getAttribute("dateTime"),
      modified: p.getAttribute("lastModifiedTime"),
      id: p.getAttribute("ID"),
    }));
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}

const textOf = (el) => elements(el, "T").map((t) => htmlToText(t.textContent)).join("");

function outlineLines(oeChildren, depth, out) {
  const pad = "  ".repeat(depth);
  for (const oe of elements(oeChildren, "OE")) {
    const text = textOf(oe);
    if (text.trim()) out.push(pad + (elements(oe, "List").length ? "- " : "") + text);
    for (const table of elements(oe, "Table")) {
      for (const row of elements(table, "Row")) {
        const cells = elements(row, "Cell").map((c) =>
          descendants(c, "T").map((t) => htmlToText(t.textContent)).join(" ").trim(),
        );
        out.push(`${pad}| ${cells.join(" | ")} |`);
      }
    }
    if (elements(oe, "Image").length) out.push(`${pad}[Bild]`);
    if (["InkDrawing", "InkParagraph", "InkWord"].some((n) => elements(oe, n).length)) out.push(`${pad}[Freihand]`);
    for (const f of elements(oe, "InsertedFile")) out.push(`${pad}[Datei: ${f.getAttribute("preferredName")}]`);
    for (const kids of elements(oe, "OEChildren")) outlineLines(kids, depth + 1, out);
  }
}

/** Seiteninhalt als Text. Tabellen als "| … |", Bilder/Freihand/Dateien als Platzhalter. */
export async function readPage(pageId) {
  const page = parse(await call("GetPageContent", { id: pageId }));
  const blocks = elements(page, "Outline").map((o) => {
    const lines = [];
    for (const kids of elements(o, "OEChildren")) outlineLines(kids, 0, lines);
    return lines.join("\n");
  });
  return {
    title: page.getAttribute("name"),
    modified: page.getAttribute("lastModifiedTime"),
    id: page.getAttribute("ID"),
    text: blocks.filter(Boolean).join("\n\n"),
  };
}

/** Volltextsuche über den Windows-Suchindex, optional begrenzt auf ein Notizbuch oder einen Abschnitt. */
export async function search(query, scopeId = "") {
  return descendants(parse(await call("FindPages", { start: scopeId, query })), "Page")
    .filter((p) => !inRecycleBin(p))
    .map((p) => ({ path: pathOf(p), id: p.getAttribute("ID") }));
}

const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const cdata = (s) => `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

/** Neue Seite; jede Zeile von `body` wird ein Absatz, einfaches HTML wie <b> ist erlaubt. */
export async function createPage(sectionId, title, body = "") {
  const id = await call("CreatePage", { id: sectionId });
  const paragraphs = body
    .split(/\r?\n/)
    .map((line) => `<one:OE><one:T>${cdata(line)}</one:T></one:OE>`)
    .join("");
  await call("UpdatePageContent", {
    xml:
      `<?xml version="1.0"?><one:Page xmlns:one="${NS}" ID="${escapeAttr(id)}">` +
      `<one:Title><one:OE><one:T>${cdata(title)}</one:T></one:OE></one:Title>` +
      `<one:Outline><one:OEChildren>${paragraphs}</one:OEChildren></one:Outline></one:Page>`,
  });
  return { id, title };
}
