#!/usr/bin/env node
/**
 * Nimmt die API-Antworten auf, mit denen die E2E-Tests den Server ersetzen.
 *
 * Die Tests laufen bewusst NICHT gegen Live-DNS: Round-Robin-IPs, TTLs und
 * Antwortzeiten ändern sich bei jedem Aufruf, ein Pixelvergleich wäre damit
 * nie stabil. Stattdessen bedient `e2e/test.ts` jedes `/api/...` aus den hier
 * erzeugten Dateien.
 *
 * Neu aufnehmen ist nur nötig, wenn sich das API-Format ändert oder neue
 * Ansichten Daten brauchen. Danach ändern sich die Referenzbilder — die also
 * im selben Zug neu erzeugen (siehe docs/E2E.md).
 *
 * Aufruf (gegen einen laufenden Server, z. B. `npm run dev:server`):
 *   node e2e/record-api-data.mjs http://127.0.0.1:3001
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'api-data');

/**
 * example.com ist der Hauptfall (Report, alle Tabs, Pixelvergleich).
 * github.com kommt dazu, weil es lange TXT-Werte, viele Records und echte
 * WHOIS-Daten hat — genau das, was auf 390 px seitlich überläuft.
 */
const DOMAINS = ['example.com', 'github.com'];
const SECTIONS = ['propagation', 'dnssec', 'ssl', 'mail', 'whois', 'techstack'];
const IP_QUERY = '1.1.1.1';
const AVAILABILITY_QUERY = 'diggy';

const base = process.argv[2]?.replace(/\/+$/, '');
if (!base) {
  console.error('Aufruf: node e2e/record-api-data.mjs <basis-url des laufenden Servers>');
  process.exit(1);
}

async function get(pathAndQuery) {
  const res = await fetch(base + pathAndQuery);
  const body = await res.json();
  if (!res.ok) throw new Error(`${pathAndQuery}: ${res.status} ${JSON.stringify(body)}`);
  return body;
}

function save(name, data) {
  writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2) + '\n');
  console.log(`  ✓ ${name}`);
}

mkdirSync(OUT, { recursive: true });

const ips = new Set([IP_QUERY]);

for (const domain of DOMAINS) {
  const q = encodeURIComponent(domain);
  const data = { lookup: await get(`/api/lookup?domain=${q}`) };
  for (const section of SECTIONS) {
    data[section] = await get(`/api/lookup/${section}?domain=${q}`);
  }
  // Die autoritativen Nameserver fragt erst der Propagation-Tab (#133), für
  // den Typ, den er zeigt — bei beiden Domains A. Braucht ausgehendes DNS
  // über Port 53; ohne steht in den Testdaten „nicht prüfbar“.
  data.authoritative = await get(`/api/lookup/authoritative?domain=${q}&type=A`);

  // Jede angezeigte IP lädt ihren Besitzer nach (IpOwnerLabel).
  const records = [
    ...data.lookup.records,
    ...data.propagation.propagation.flatMap((result) => result.records),
  ];
  for (const record of records) {
    if (record.type === 'A' || record.type === 'AAAA') ips.add(record.value);
  }

  // Stand 10/2026 antwortet rdap.org dem Server mit 403 (Node-fetch ohne
  // eigenen User-Agent), WHOIS kommt dann leer. Leer aufgenommen zeigt der
  // WHOIS-Tab nur „nicht verfügbar“ und der Test prüft dessen Layout nicht.
  if (!data.whois.whois) console.warn(`  ! ${domain}: WHOIS leer — Testdaten so nicht übernehmen.`);

  save(`${domain}.json`, data);
}

const ipDetails = {};
for (const ip of [...ips].sort()) {
  try {
    ipDetails[ip] = await get(`/api/ip-details?ip=${encodeURIComponent(ip)}`);
  } catch (error) {
    console.warn(`  ! IP ${ip} übersprungen: ${error.message}`);
  }
}
save('ip-details.json', ipDetails);

save('domain-check.json', {
  [AVAILABILITY_QUERY]: await get(`/api/domain-check?q=${encodeURIComponent(AVAILABILITY_QUERY)}`),
});
