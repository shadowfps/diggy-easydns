#!/usr/bin/env node
/**
 * Smoke-Test: startet den gebauten Server so wie der Container und fragt die
 * wichtigsten Routen ab.
 *
 * Anlass war Express 5 (#70). Dependabots PR war grün — und der Server wäre
 * in Produktion nicht mehr hochgekommen: die SPA-Fallback-Route `app.get('*')`
 * wirft unter path-to-regexp 8 schon beim Registrieren. Die Tests sahen das
 * nicht, weil die Route nur angelegt wird, wenn `dist/index.html` existiert,
 * und das ist erst nach dem Build der Fall. Das Image baut die CI nur auf
 * main, aufgefallen wäre es also erst als unhealthy Container.
 *
 * Aufruf: `npm run smoke` (setzt `npm run build` voraus).
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = path.join(ROOT, 'dist-server/server/index.js');
const INDEX = path.join(ROOT, 'dist/index.html');
const STARTUP_TIMEOUT_MS = 15_000;

if (!existsSync(ENTRY) || !existsSync(INDEX)) {
  console.error('Kein Build gefunden — vorher `npm run build` ausführen.');
  process.exit(1);
}

/** Freien Port vom Betriebssystem holen, damit ein laufender Dev-Server nicht stört. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;

/*
 * Der Server startet über einen Symlink in einem Punkt-Ordner (#89). Ohne
 * `root` prüft sendFile jedes Segment des absoluten Pfads auf Dotfiles; unter
 * `.claude/worktrees/…` antworteten die SPA-Routen deshalb mit 404. Der
 * CI-Checkout liegt ohne Punkt-Ordner, ein Rückfall fiele dort sonst nicht
 * auf. `--preserve-symlinks-main` sorgt dafür, dass der Server den
 * Symlink-Pfad sieht und nicht den aufgelösten.
 */
const linkDir = mkdtempSync(path.join(tmpdir(), 'diggy-smoke-'));
const dotRoot = path.join(linkDir, '.punkt');
symlinkSync(ROOT, dotRoot, 'dir');
process.on('exit', () => {
  unlinkSync(dotRoot);
  rmdirSync(linkDir);
});

const entryViaDot = path.join(dotRoot, path.relative(ROOT, ENTRY));
const server = spawn(process.execPath, ['--preserve-symlinks-main', entryViaDot], {
  cwd: ROOT,
  // PUBLIC_ORIGIN bewusst leer (dotenv überschreibt gesetzte Werte nicht):
  // die Link-Vorschau bildet ihre absoluten URLs dann aus dem Request-Host,
  // und die Erwartung unten hängt nicht an einer lokalen .env.
  env: { ...process.env, NODE_ENV: 'production', PORT: String(port), PUBLIC_ORIGIN: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', (chunk) => (output += chunk));
server.stderr.on('data', (chunk) => (output += chunk));
const exited = new Promise((resolve) => server.once('exit', resolve));

function fail(message) {
  console.error(`\n✗ ${message}\n\nServer-Ausgabe:\n${output || '(leer)'}`);
  server.kill();
  process.exit(1);
}

/** Wartet, bis /api/health antwortet — oder der Prozess vorher stirbt. */
async function waitUntilUp() {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let dead = false;
  exited.then(() => (dead = true));
  while (Date.now() < deadline) {
    if (dead) fail('Server hat sich beim Start beendet.');
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // Port noch nicht offen
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  fail(`Server antwortet nach ${STARTUP_TIMEOUT_MS / 1000}s nicht auf /api/health.`);
}

await waitUntilUp();

const indexHtml = readFileSync(INDEX, 'utf8');
const stylesheet = indexHtml.match(/href="\/(assets\/[^"]+\.css)"/)?.[1];

/** Liest `content` eines Meta-Tags — `attr` ist `name` oder `property`. */
function meta(body, attr, key) {
  return body.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)" />`))?.[1];
}

/*
 * Link-Vorschau (#81): Permalinks bekommen eigene Tags, alles andere das
 * unveränderte index.html. Der Pfad mit Sonderzeichen ergibt keine gültige
 * Domain — er muss die Standard-Tags bekommen und darf nirgends im HTML
 * auftauchen, auch nicht escaped.
 */
const hostilePath = '/lookup/%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E';

function hasPreviewTags(res, body) {
  return (
    res.status === 200 &&
    res.headers.get('content-type')?.startsWith('text/html') &&
    res.headers.get('cache-control') === 'no-cache' &&
    body.includes('id="root"') &&
    body.match(/<title>/g)?.length === 1 &&
    body.includes('<title>example.com — diggy</title>') &&
    meta(body, 'property', 'og:title') === 'example.com — diggy' &&
    meta(body, 'property', 'og:description') ===
      'DNS, Mail-Schutz, SSL und Propagation von example.com auf einen Blick.' &&
    meta(body, 'property', 'og:url') === `${base}/lookup/example.com` &&
    meta(body, 'property', 'og:image') === `${base}/og-image.png` &&
    meta(body, 'property', 'og:type') === 'website' &&
    meta(body, 'property', 'og:site_name') === 'diggy' &&
    meta(body, 'name', 'twitter:card') === 'summary_large_image'
  );
}

const checks = [
  ['/api/health', (res, body) => res.status === 200 && JSON.parse(body).status === 'ok'],
  // Die SPA-Routen gehen alle an index.html — das ist der Fallback, an dem
  // Express 5 gescheitert wäre. Außer Permalinks bekommen sie Byte für Byte
  // das gebaute HTML, ungültige Permalinks eingeschlossen.
  ['/', (res, body) => res.status === 200 && body === indexHtml],
  ['/lookup/example.com', hasPreviewTags],
  ['/lookup/Example.COM/', hasPreviewTags],
  // Zwei Pfadsegmente nach dem Präfix — der Wildcard muss auch die tragen.
  // Der Vergleich hat (noch) keine eigene Vorschau: das gebaute HTML.
  ['/compare/example.com/github.com', (res, body) => res.status === 200 && body === indexHtml],
  ['/impressum', (res, body) => res.status === 200 && body === indexHtml],
  [
    hostilePath,
    (res, body) =>
      res.status === 200 &&
      body === indexHtml &&
      !body.includes('og:') &&
      !/alert\(1\)/.test(body),
  ],
  ['/og-image.png', (res) => res.status === 200 && res.headers.get('content-type') === 'image/png'],
  // Unbekannte API-Pfade dürfen NICHT im Fallback landen.
  ['/api/gibt-es-nicht', (res) => res.status === 404],
  [`/${stylesheet}`, (res) => res.status === 200 && res.headers.get('content-type')?.startsWith('text/css')],
];

let failed = false;
for (const [route, ok] of checks) {
  const res = await fetch(base + route);
  const body = await res.text();
  const passed = ok(res, body);
  failed ||= !passed;
  console.log(`  ${passed ? '✓' : '✗'} ${route.padEnd(36)} ${res.status}`);
}

// Der CSP-Hash des Theme-Scripts wird beim Start aus dem gebauten HTML
// abgeleitet. Fehlt er, blockiert der Browser das Script, und die Seite
// flackert beim Laden im falschen Theme.
const csp = (await fetch(`${base}/`)).headers.get('content-security-policy') ?? '';
const hasHash = /script-src[^;]*'sha256-/.test(csp);
failed ||= !hasHash;
console.log(`  ${hasHash ? '✓' : '✗'} ${'CSP mit Script-Hash'.padEnd(36)}`);

// Die Vorschau-Tags verändern das HTML. Der Hash muss trotzdem auf das
// Theme-Script passen, das diese Antwort tatsächlich enthält.
const permalink = await fetch(`${base}/lookup/example.com`);
const permalinkCsp = permalink.headers.get('content-security-policy') ?? '';
const inlineScripts = [
  ...(await permalink.text()).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi),
].map((match) => match[1]);
const hashesMatch =
  inlineScripts.length > 0 &&
  inlineScripts.every((code) =>
    permalinkCsp.includes(`'sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}'`)
  );
failed ||= !hashesMatch;
console.log(`  ${hashesMatch ? '✓' : '✗'} ${'CSP-Hash passt zum Permalink-HTML'.padEnd(36)}`);

server.kill();
await exited;

if (failed) fail('Smoke-Test fehlgeschlagen.');
console.log('\nSmoke-Test bestanden.');
