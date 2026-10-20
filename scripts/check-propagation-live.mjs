#!/usr/bin/env node
/**
 * Live-Check: Antworten alle Resolver der Propagation — aus genau diesem
 * Server heraus?
 *
 * Anlass war #137: Quad9 und DNS4EU antworteten in Produktion nie, weil
 * `fetch` in Node 24 nur HTTP/1.1 spricht. Lokal (Node 26) lief alles, die
 * Tests mockten das Netz. Fragt man den laufenden Container, sieht man das
 * Netz, die Node-Version und den TLS-Stack, mit denen er wirklich fragt.
 *
 * Nicht Teil von `verify`: Das Ergebnis hängt an neun fremden Diensten und am
 * Netz, aus dem gefragt wird — ein Ausfall bei einem Anbieter soll keinen PR
 * rot machen. Was offline prüfbar ist, prüfen server/lib/http2Get.test.ts und
 * server/services/doh.http2.test.ts.
 *
 * Aufruf, gegen das lokal gebaute Image oder nach dem Deploy:
 *   node scripts/check-propagation-live.mjs http://127.0.0.1:3781
 *   node scripts/check-propagation-live.mjs https://diggydns.cloud
 *
 * Die API hält jede Antwort bis zu 60 s im Cache (nicht länger als ihre
 * kürzeste TTL, mindestens 5 s). Wer mehrere Läufe will, wartet dazwischen
 * eine Minute — sonst kommt womöglich dieselbe Antwort noch einmal.
 */

const CASES = [
  ['example.com', 'TXT'],
  ['example.com', 'MX'],
  ['github.com', 'A'],
  ['github.com', 'NS'],
  ['_dmarc.github.com', 'TXT'],
];

const base = (process.argv[2] ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const failures = [];
const rows = new Map();

for (const [domain, type] of CASES) {
  const label = `${domain} ${type}`;
  const url = `${base}/api/lookup/propagation?domain=${encodeURIComponent(domain)}&type=${type}`;
  let body;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    body = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${body?.message ?? ''}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    continue;
  }
  for (const result of body.propagation) {
    const row = rows.get(result.resolver.name) ?? new Map();
    rows.set(result.resolver.name, row);
    if (result.error) {
      row.set(label, `FEHLER ${result.error}`);
      failures.push(`${label} · ${result.resolver.name}: ${result.error}`);
    } else {
      row.set(label, `ok ${result.records.length} · ${result.responseTimeMs} ms`);
    }
  }
}

const labels = CASES.map(([domain, type]) => `${domain} ${type}`);
console.log(`Propagation über ${base}\n`);
console.log(['Resolver', ...labels].join(' | '));
for (const [name, row] of rows) {
  console.log([name, ...labels.map((label) => row.get(label) ?? '—')].join(' | '));
}

if (failures.length > 0) {
  console.error(`\n${failures.length} Fehler:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`\nAlle ${rows.size} Resolver haben in ${CASES.length} Abfragen geantwortet.`);
