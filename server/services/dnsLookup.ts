import { promises as dnsPromises } from 'node:dns';
import type { DnsRecord, RecordType } from '../types.js';

/**
 * Konfigurierter Resolver — nutzt Cloudflare als Default,
 * weil viele Provider/ISP-Resolver heutzutage cachen oder filtern.
 */
const resolver = new dnsPromises.Resolver({ timeout: 5000, tries: 2 });
resolver.setServers(['1.1.1.1', '8.8.8.8']);

/**
 * Welche Record-Typen wir standardmäßig abfragen.
 * CNAME wird separat behandelt (kann Apex-A/AAAA "ersetzen").
 */
const STANDARD_TYPES: RecordType[] = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CAA', 'SOA'];

interface LookupOptions {
  /** Zusätzlich gängige Subdomains probieren (www, mail) */
  includeCommonSubdomains?: boolean;
}

/**
 * Holt alle Standard-DNS-Records für eine Domain.
 * Fehler bei einzelnen Record-Typen sind okay — nicht jede Domain hat z.B. MX-Records.
 */
export async function lookupStandardRecords(
  domain: string,
  options: LookupOptions = {}
): Promise<DnsRecord[]> {
  const records: DnsRecord[] = [];

  // Alle Record-Typen parallel abfragen
  const results = await Promise.allSettled(
    STANDARD_TYPES.map((type) => lookupSingleType(domain, type))
  );

  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      records.push(...result.value);
    } else {
      // Logging für Debugging — fehlende Records sind erwartbar (z.B. keine MX)
      const type = STANDARD_TYPES[idx];
      const err = result.reason as NodeJS.ErrnoException;
      if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
        console.warn(`[dns] ${type} lookup failed for ${domain}:`, err.code ?? err.message);
      }
    }
  });

  // CNAME für Apex und/oder www separat
  const cnames = await lookupCname(domain);
  records.push(...cnames);

  if (options.includeCommonSubdomains) {
    const wwwCnames = await lookupCname(`www.${domain}`);
    records.push(...wwwCnames);
  }

  return records;
}

/**
 * Lookup für einen spezifischen Record-Typ. Wir nutzen `resolveAny` nicht,
 * weil viele Resolver das nicht mehr unterstützen — typisierte Calls sind verlässlicher.
 */
async function lookupSingleType(domain: string, type: RecordType): Promise<DnsRecord[]> {
  switch (type) {
    case 'A': {
      // resolve4 mit TTL liefert {address, ttl}
      const results = await resolver.resolve4(domain, { ttl: true });
      return results.map((r) => ({
        type: 'A',
        name: domain,
        value: r.address,
        ttl: r.ttl,
      }));
    }

    case 'AAAA': {
      const results = await resolver.resolve6(domain, { ttl: true });
      return results.map((r) => ({
        type: 'AAAA',
        name: domain,
        value: r.address,
        ttl: r.ttl,
      }));
    }

    case 'MX': {
      const results = await resolver.resolveMx(domain);
      return results
        .sort((a, b) => a.priority - b.priority)
        .map((r) => ({
          type: 'MX',
          name: domain,
          value: r.exchange,
          priority: r.priority,
          ttl: 0, // resolveMx liefert keine TTL — wir setzen 0 als "unbekannt"
        }));
    }

    case 'NS': {
      const results = await resolver.resolveNs(domain);
      return results.map((value) => ({
        type: 'NS',
        name: domain,
        value,
        ttl: 0,
      }));
    }

    case 'TXT': {
      const results = await resolver.resolveTxt(domain);
      // resolveTxt liefert string[][] — chunks pro Record zusammenfügen
      return results.map((chunks) => ({
        type: 'TXT',
        name: domain,
        value: chunks.join(''),
        ttl: 0,
      }));
    }

    case 'CAA': {
      // CAA-Records haben dynamische Felder: { critical, issue?, issuewild?, iodef?, contactemail?, ... }
      const results = await resolver.resolveCaa(domain);
      return results.map((record) => {
        const r = record as unknown as Record<string, string | number | undefined>;
        const flags = (r.critical as number | undefined) ?? 0;
        let tag = 'unknown';
        let value: string | number = '';
        for (const candidate of ['issue', 'issuewild', 'iodef', 'contactemail', 'contactphone'] as const) {
          if (r[candidate] !== undefined) {
            tag = candidate;
            value = r[candidate]!;
            break;
          }
        }
        return {
          type: 'CAA' as const,
          name: domain,
          value: `${flags} ${tag} "${value}"`,
          ttl: 0,
        };
      });
    }

    case 'SOA': {
      const result = await resolver.resolveSoa(domain);
      return [{
        type: 'SOA',
        name: domain,
        value: `${result.nsname} ${result.hostmaster} ${result.serial} ${result.refresh} ${result.retry} ${result.expire} ${result.minttl}`,
        ttl: result.minttl,
      }];
    }

    default:
      return [];
  }
}

async function lookupCname(domain: string): Promise<DnsRecord[]> {
  try {
    const results = await resolver.resolveCname(domain);
    return results.map((value) => ({
      type: 'CNAME',
      name: domain,
      value,
      ttl: 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Validiert eine Domain. Erlaubt sind:
 * - Subdomains (mehrere Punkte)
 * - Internationalisierte Domains (Punycode/IDN)
 * - TLDs ab 2 Zeichen
 *
 * Nicht erlaubt:
 * - URLs mit Protokoll/Pfad
 * - IP-Adressen
 * - Underscores im Hostnamen-Bereich
 */
export function isValidDomain(input: string): boolean {
  if (!input || input.length > 253) return false;
  // Punycode-fähig, aber keine Protokolle/Pfade/Ports
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*\.[a-z]{2,63}$/i.test(input);
}

/**
 * Normalisiert eine Eingabe — entfernt Protokoll, www., trailing slash, etc.
 * Damit der User auch "https://example.com/" eingeben kann.
 */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, ''); // Port entfernen
}
