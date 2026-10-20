#!/usr/bin/env node
/**
 * Live-Check: Erreicht dieser Server die Registries — per RDAP und über
 * WHOIS auf Port 43? (#105)
 *
 * Seit #105 fragt diggy die Registry der Endung direkt: RDAP laut
 * IANA-Bootstrap, .io bei Identity Digital, .at, .it und .eu über Port 43.
 * Ob ausgehend Port 43 aus dem Rechenzentrum offen ist, zeigen die Tests
 * nicht (sie mocken das Netz) — und lokal ist es offen. Fragt man den
 * laufenden Container, sieht man das Netz, aus dem er wirklich fragt.
 *
 * Nicht Teil von `verify`: Das Ergebnis hängt an fremden Registries und am
 * Netz, aus dem gefragt wird. Was offline prüfbar ist, prüfen
 * server/lib/whoisPort43.test.ts, server/services/whoisText.test.ts und
 * server/services/registry.test.ts.
 *
 * Aufruf, gegen das lokal gebaute Image oder nach dem Deploy:
 *   node scripts/check-whois-live.mjs http://127.0.0.1:3781
 *   node scripts/check-whois-live.mjs https://diggydns.cloud
 *
 * Die API hält WHOIS-Ergebnisse 60 s im Cache, auch „nicht verfügbar“. Wer
 * nach einem Fehler erneut prüft, wartet eine Minute.
 */

/** Domain, erwarteter Weg, Quellen, die diesen Weg belegen. */
const WHOIS_CASES = [
  ['example.com', 'RDAP (Bootstrap)', ['rdap.verisign.com', 'whois.verisign-grs.com']],
  ['google.dev', 'RDAP (Bootstrap)', ['pubapi.registry.google']],
  ['bbc.co.uk', 'RDAP (Bootstrap)', ['rdap.nominet.uk', 'whois.nic.uk']],
  ['denic.de', 'RDAP (DENIC)', ['rdap.denic.de']],
  ['github.io', 'RDAP (Identity Digital)', ['rdap.identitydigital.services', 'whois.nic.io']],
  ['orf.at', 'Port 43', ['whois.nic.at']],
  ['repubblica.it', 'Port 43', ['whois.nic.it']],
  ['europa.eu', 'Port 43', ['whois.eu']],
  // nic.ch sperrt automatisierte Abfragen: diggy fragt bewusst nicht.
  ['switch.ch', 'keine Abfrage', []],
];

const base = (process.argv[2] ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const failures = [];
const rows = [];

async function getJson(path) {
  const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(30_000) });
  const body = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body?.message ?? ''}`);
  return body;
}

// Wie die WHOIS-Ansicht in Deutschland: .it meldet „Expire Date: 2027-01-16“,
// gespeichert als Mitternacht in Rom — in UTC wäre das noch der 15.
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }) : '—');

for (const [domain, route, sources] of WHOIS_CASES) {
  const started = Date.now();
  let whois;
  try {
    ({ whois } = await getJson(`/api/lookup/whois?domain=${encodeURIComponent(domain)}`));
  } catch (error) {
    failures.push(`${domain}: ${error.message}`);
    rows.push([domain, route, 'FEHLER', error.message, '', '', '', '']);
    continue;
  }
  const ms = `${Date.now() - started} ms`;

  if (sources.length === 0) {
    if (whois) failures.push(`${domain}: erwartet keine Daten, bekam ${whois.source}`);
    rows.push([domain, route, whois ? `unerwartet ${whois.source}` : 'ok (nicht verfügbar)', '—', '—', '—', '—', ms]);
    continue;
  }
  if (!whois) {
    failures.push(`${domain}: keine Daten (${route})`);
    rows.push([domain, route, 'FEHLER keine Daten', '—', '—', '—', '—', ms]);
    continue;
  }
  const expected = sources.includes(whois.source);
  if (!expected) failures.push(`${domain}: Quelle ${whois.source}, erwartet ${sources.join(' oder ')}`);
  rows.push([
    domain,
    route,
    `${expected ? 'ok' : 'ANDERE QUELLE'} ${whois.source}`,
    whois.registrar ?? '—',
    day(whois.createdAt),
    day(whois.expiresAt),
    String(whois.nameServers?.length ?? 0),
    ms,
  ]);
}

console.log(`WHOIS über ${base}\n`);
console.log(['Domain', 'Weg', 'Ergebnis', 'Registrar', 'Erstellt', 'Ablauf', 'NS', 'Dauer'].join(' | '));
for (const row of rows) console.log(row.join(' | '));

// Verfügbarkeit: eine sicher freie und eine vergebene .io-Domain — die
// Endung, die vor #105 immer „Unklar“ war.
const free = `diggy-frei-${Math.random().toString(36).slice(2, 10)}.io`;
const availability = [
  [free, 'available'],
  ['github.io', 'taken'],
];
console.log(`\nVerfügbarkeit über ${base}\n`);
console.log(['Domain', 'erwartet', 'Ergebnis', 'Quelle'].join(' | '));
for (const [domain, expected] of availability) {
  try {
    const report = await getJson(`/api/domain-check?q=${encodeURIComponent(domain)}`);
    const result = report.results.find((r) => r.domain === domain);
    if (result?.status !== expected) failures.push(`${domain}: ${result?.status ?? 'fehlt'}, erwartet ${expected}`);
    console.log([domain, expected, result?.status ?? 'fehlt', result?.source ?? '—'].join(' | '));
  } catch (error) {
    failures.push(`${domain}: ${error.message}`);
    console.log([domain, expected, 'FEHLER', error.message].join(' | '));
  }
}

const port43 = rows.filter(([, route]) => route === 'Port 43');
if (port43.length > 0 && port43.every(([, , result]) => result.startsWith('FEHLER'))) {
  console.error('\nKeine Antwort über Port 43: ausgehend vermutlich gesperrt (Server-Log: „[whois] … Timeout“).');
}

if (failures.length > 0) {
  console.error(`\n${failures.length} Fehler:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`\nAlle ${WHOIS_CASES.length} WHOIS-Abfragen und ${availability.length} Verfügbarkeits-Checks wie erwartet.`);
