// Startet bridge.ps1 einmalig und schickt COM-Aufrufe zeilenweise als JSON hin und her.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./bridge.ps1", import.meta.url));
const DEFAULT_TIMEOUT_MS = 120_000;

let proc = null;
let nextId = 1;
const pending = new Map();

const HINTS = {
  "0x80042014": "Objekt nicht gefunden (ID falsch oder Notizbuch in OneNote nicht synchronisiert)",
};
const explain = (msg) => {
  const code = msg.slice(0, 10);
  return HINTS[code] ? `${HINTS[code]} [${code}]` : msg;
};

function failAll(error) {
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.reject(error);
  }
  pending.clear();
}

function start() {
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));

  createInterface({ input: child.stdout }).on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // keine Antwortzeile
    }
    const p = pending.get(msg.rid);
    if (!p) return;
    pending.delete(msg.rid);
    clearTimeout(p.timer);
    const data = Buffer.from(msg.data ?? "", "base64").toString("utf8");
    if (msg.ok) p.resolve(data);
    else p.reject(new Error(`OneNote ${p.method}: ${explain(data)}`));
  });

  child.on("error", (err) => failAll(err));
  child.on("exit", (code) => {
    if (proc === child) proc = null;
    failAll(new Error(`OneNote-Brücke beendet (Code ${code}). ${stderr.trim()}`.trim()));
  });
  return child;
}

/** Ruft eine COM-Methode von OneNote.Application auf (siehe bridge.ps1) und liefert das Ergebnis als String. */
export function call(method, params = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!proc) proc = start();
  const child = proc;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      child.kill(); // hängender Prozess: beim nächsten Aufruf neu starten
      reject(new Error(`OneNote ${method}: Zeitüberschreitung nach ${timeoutMs / 1000} s`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer, method });
    // Nicht-ASCII als \uXXXX, damit die Konsolen-Codepage keine Rolle spielt
    const json = JSON.stringify({ ...params, rid: id, m: method }).replace(
      /[^\x00-\x7f]/g,
      (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
    );
    child.stdin.write(json + "\n");
  });
}

/** Beendet die Brücke (nötig, damit ein Kommandozeilenaufruf sich beendet). */
export function close() {
  if (proc) {
    proc.stdin.end();
    proc = null;
  }
}
