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
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
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

const server = spawn(process.execPath, [ENTRY], {
  cwd: ROOT,
  env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
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

const html = readFileSync(INDEX, 'utf8');
const stylesheet = html.match(/href="\/(assets\/[^"]+\.css)"/)?.[1];
// Das Inline-Script lädt das englische Wörterbuch vor (#86). Ein Pfad ins
// Leere bricht nichts sichtbar — englische Besucher warteten nur wieder eine
// Runde länger auf die erste Ansicht.
const englishChunk = html.match(/link\.href = '\/(assets\/en-[^']+\.js)'/)?.[1] ?? 'englisches-woerterbuch-fehlt';

const checks = [
  ['/api/health', (res, body) => res.status === 200 && JSON.parse(body).status === 'ok'],
  // Die SPA-Routen gehen alle an index.html — das ist der Fallback, an dem
  // Express 5 gescheitert wäre.
  ['/', (res, body) => res.status === 200 && body.includes('id="root"')],
  ['/lookup/example.com', (res, body) => res.status === 200 && body.includes('id="root"')],
  ['/impressum', (res, body) => res.status === 200 && body.includes('id="root"')],
  // Unbekannte API-Pfade dürfen NICHT im Fallback landen.
  ['/api/gibt-es-nicht', (res) => res.status === 404],
  [`/${stylesheet}`, (res) => res.status === 200 && res.headers.get('content-type')?.startsWith('text/css')],
  [`/${englishChunk}`, (res) => res.status === 200 && /javascript/.test(res.headers.get('content-type') ?? '')],
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

server.kill();
await exited;

if (failed) fail('Smoke-Test fehlgeschlagen.');
console.log('\nSmoke-Test bestanden.');
