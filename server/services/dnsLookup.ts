import { promises as dnsPromises } from 'node:dns';
import { domainToASCII } from 'node:url';
import { getDomain } from 'tldts';
import type { DnsRecord, RecordType } from '../types.js';
import { isDnsOnlyName } from '../../shared/dnsName.js';
import { DOH_RESOLVERS, dohQuery } from './doh.js';

/**
 * Konfigurierter Resolver — nutzt Cloudflare als Default,
 * weil viele Provider/ISP-Resolver heutzutage cachen oder filtern.
 */
const resolver = new dnsPromises.Resolver({ timeout: 5000, tries: 2 });
resolver.setServers(['1.1.1.1', '8.8.8.8']);

/**
 * Woher die TTL für MX, NS, TXT, CAA, SOA und CNAME kommt (#76).
 *
 * node:dns liefert sie nur für A/AAAA (`{ ttl: true }`); `resolveMx` & Co.
 * geben reine Daten zurück. Die DoH-JSON-API nennt sie für jeden Typ. Wir
 * fragen Cloudflare — denselben Anbieter wie der primäre Resolver oben —,
 * damit die TTL zur selben Cache-Sicht gehört wie die Daten.
 *
 * Die Records selbst kommen weiter aus node:dns: fällt DoH aus, verschwindet
 * kein Record, nur seine TTL ist dann unbekannt (`null`).
 */
const TTL_RESOLVER = DOH_RESOLVERS.find((r) => r.id === 'cloudflare')!;

/**
 * Obergrenze für die TTL-Abfrage. Sie läuft parallel zum node:dns-Lookup und
 * antwortet normalerweise in unter 100 ms. Hängt DoH, soll der schnelle Kern
 * von /api/lookup (meist 0,2–0,8 s) höchstens um diese Zeit warten — die
 * Records sind wichtiger als ihre TTL.
 */
export const TTL_LOOKUP_TIMEOUT_MS = 1500;

/**
 * Welche Record-Typen wir abfragen — für jeden Namen gleich, Apex wie Subdomain.
 * Subdomains führen sehr wohl eigene Records: mail.example.com kann eigene MX
 * haben, abgetrennte Zonen (blog.example.com) eigene NS/SOA, und CAA darf auf
 * jeder Ebene stehen. CNAME wird separat behandelt (kann Apex-A/AAAA "ersetzen").
 */
const QUERY_TYPES: RecordType[] = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CAA', 'SOA'];

/**
 * Zonen-Records, die bei einem CNAME-Alias NICHT dem gefragten Namen gehören.
 * Ein Name mit CNAME darf laut RFC 1034 §3.6.2 keine weiteren Daten führen —
 * der Resolver folgt dem CNAME und antwortet mit der Zone des Ziels. Würden wir
 * das als NS/SOA der Subdomain ausgeben (www.github.com → github.com), täuschte
 * die Anzeige eine eigene Delegation vor, die es nicht gibt.
 */
const CNAME_MASKED_TYPES = new Set<RecordType>(['NS', 'SOA']);

/**
 * Erwartbare Resolver-Fehler: der Name führt diesen Typ einfach nicht.
 * EBADRESP kommt regelmäßig bei SOA-Abfragen auf CNAME-Aliasse.
 */
const EXPECTED_DNS_ERRORS = new Set(['ENODATA', 'ENOTFOUND', 'EBADRESP']);

interface LookupOptions {
  /** Zusätzlich gängige Subdomains probieren (www, mail) */
  includeCommonSubdomains?: boolean;
}

export interface StandardRecords {
  records: DnsRecord[];
  /**
   * Typen, deren Abfrage unerwartet scheiterte (Timeout, SERVFAIL …). Anders
   * als bei ENODATA heißt ihr Fehlen in `records` dann nicht „keine Records“ —
   * der Vergleich mit dem letzten Check (#79) darf sie nicht als entfallen melden.
   */
  failedTypes: RecordType[];
}

/**
 * Holt alle Standard-DNS-Records für eine Domain.
 * Fehler bei einzelnen Record-Typen sind okay — nicht jede Domain hat z.B. MX-Records.
 */
export async function lookupStandardRecords(
  domain: string,
  options: LookupOptions = {}
): Promise<StandardRecords> {
  const records: DnsRecord[] = [];
  const failedTypes: RecordType[] = [];

  // CNAME parallel mitziehen — das Ergebnis entscheidet, ob NS/SOA wirklich dem
  // gefragten Namen gehören oder nur vom CNAME-Ziel durchgereicht wurden.
  const [cnames, results] = await Promise.all([
    lookupCname(domain),
    Promise.allSettled(QUERY_TYPES.map((type) => lookupSingleType(domain, type))),
  ]);

  const isCnameAlias = cnames.length > 0;

  results.forEach((result, idx) => {
    const type = QUERY_TYPES[idx];
    if (result.status === 'fulfilled') {
      if (isCnameAlias && CNAME_MASKED_TYPES.has(type)) return;
      records.push(...result.value);
    } else {
      // Logging für Debugging — fehlende Records sind erwartbar (z.B. keine MX)
      const err = result.reason as NodeJS.ErrnoException;
      if (!EXPECTED_DNS_ERRORS.has(err.code ?? '')) {
        console.warn(`[dns] ${type} lookup failed for ${domain}:`, err.code ?? err.message);
        failedTypes.push(type);
      }
    }
  });

  records.push(...cnames);

  if (options.includeCommonSubdomains) {
    const wwwCnames = await lookupCname(`www.${domain}`);
    records.push(...wwwCnames);
  }

  return { records, failedTypes };
}

/**
 * Lookup für einen spezifischen Record-Typ. Wir nutzen `resolveAny` nicht,
 * weil viele Resolver das nicht mehr unterstützen — typisierte Calls sind verlässlicher.
 *
 * Für alle Typen außer A/AAAA läuft die TTL-Abfrage per DoH parallel mit
 * (lookupRrsetTtl), damit der Lookup nicht auf zwei Runden nacheinander wartet.
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
      const [results, ttl] = await Promise.all([
        resolver.resolveMx(domain),
        lookupRrsetTtl(domain, 'MX'),
      ]);
      return results
        .sort((a, b) => a.priority - b.priority)
        .map((r) => ({
          type: 'MX',
          name: domain,
          value: r.exchange,
          priority: r.priority,
          ttl,
        }));
    }

    case 'NS': {
      const [results, ttl] = await Promise.all([
        resolver.resolveNs(domain),
        lookupRrsetTtl(domain, 'NS'),
      ]);
      return results.map((value) => ({
        type: 'NS',
        name: domain,
        value,
        ttl,
      }));
    }

    case 'TXT': {
      const [results, ttl] = await Promise.all([
        resolver.resolveTxt(domain),
        lookupRrsetTtl(domain, 'TXT'),
      ]);
      // resolveTxt liefert string[][] — chunks pro Record zusammenfügen
      return results.map((chunks) => ({
        type: 'TXT',
        name: domain,
        value: chunks.join(''),
        ttl,
      }));
    }

    case 'CAA': {
      // CAA-Records haben dynamische Felder: { critical, issue?, issuewild?, iodef?, contactemail?, ... }
      const [results, ttl] = await Promise.all([
        resolver.resolveCaa(domain),
        lookupRrsetTtl(domain, 'CAA'),
      ]);
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
          ttl,
        };
      });
    }

    case 'SOA': {
      const [result, ttl] = await Promise.all([
        resolver.resolveSoa(domain),
        lookupRrsetTtl(domain, 'SOA'),
      ]);
      return [{
        type: 'SOA',
        name: domain,
        value: `${result.nsname} ${result.hostmaster} ${result.serial} ${result.refresh} ${result.retry} ${result.expire} ${result.minttl}`,
        // Nicht `minttl`: das ist die TTL für negative Antworten (RFC 2308),
        // nicht die des SOA-Records selbst — bei mittwald.de 3600 statt 300.
        ttl,
      }];
    }

    default:
      return [];
  }
}

async function lookupCname(domain: string): Promise<DnsRecord[]> {
  try {
    const [results, ttl] = await Promise.all([
      resolver.resolveCname(domain),
      lookupRrsetTtl(domain, 'CNAME'),
    ]);
    return results.map((value) => ({
      type: 'CNAME',
      name: domain,
      value,
      ttl,
    }));
  } catch {
    return [];
  }
}

/**
 * Holt die TTL eines RRsets per DoH. Wirft nie: jeder Fehler (Timeout,
 * HTTP-Fehler, kaputtes JSON) heißt nur „TTL unbekannt“ — sonst risse
 * Promise.all im Aufrufer den Record mit, obwohl node:dns ihn geliefert hat.
 */
async function lookupRrsetTtl(domain: string, type: RecordType): Promise<number | null> {
  try {
    const { records } = await dohQuery(TTL_RESOLVER, domain, type, {
      timeoutMs: TTL_LOOKUP_TIMEOUT_MS,
    });
    return rrsetTtl(records, type);
  } catch {
    return null;
  }
}

/**
 * Eine TTL pro RRset: alle Records gleichen Namens und Typs teilen sie
 * (RFC 2181 §5.2). Deshalb ordnen wir über den Typ zu statt Wert für Wert —
 * das spart den fehleranfälligen Abgleich der Darstellungen (TXT-Quoting,
 * Groß-/Kleinschreibung, CAA-Format) zwischen node:dns und DoH.
 *
 * Bei einem Alias steht vor dem RRset des Ziels die CNAME-Kette. Die Antwort
 * für den gefragten Namen gilt nur, solange jedes Glied gilt — läuft ein
 * CNAME ab, kann er danach auf ein anderes Ziel zeigen. Deshalb zählt das
 * Minimum aus Kette und RRset. Genauso rechnet node:dns (c-ares) die TTL für
 * A/AAAA; ein Alias steht so nicht mit zwei Maßstäben in der Liste. Fehlt das
 * RRset in der Antwort, ist die TTL unbekannt: die Kette allein sagt nichts
 * über die Daten, die node:dns geliefert hat.
 *
 * Weichen TTLs im RRset doch voneinander ab, gilt ebenfalls die kleinste:
 * so lange sind alle gültig.
 */
function rrsetTtl(records: DnsRecord[], type: RecordType): number | null {
  if (!records.some((r) => r.type === type)) return null;

  const ttls = records
    .filter((r) => r.type === type || r.type === 'CNAME')
    .map((r) => r.ttl)
    .filter((ttl): ttl is number => typeof ttl === 'number' && Number.isFinite(ttl) && ttl >= 0);
  return ttls.length > 0 ? Math.min(...ttls) : null;
}

/**
 * Validiert einen DNS-Namen. Erlaubt sind:
 * - Subdomains (mehrere Punkte)
 * - Internationalisierte Domains (Punycode/IDN)
 * - TLDs ab 2 Zeichen
 * - Unterstriche in Labels — `_dmarc.example.com`, `s1._domainkey.example.com`
 *   (siehe isDnsOnlyName)
 *
 * Nicht erlaubt:
 * - URLs mit Protokoll/Pfad
 * - IP-Adressen
 */
export function isValidDnsName(input: string): boolean {
  if (!input || input.length > 253) return false;
  // Punycode-fähig, aber keine Protokolle/Pfade/Ports
  return /^(?!-)[a-z0-9_-]{1,63}(?<!-)(\.(?!-)[a-z0-9_-]{1,63}(?<!-))*\.[a-z]{2,63}$/i.test(input);
}

/**
 * Validiert einen Hostnamen: ein DNS-Name ohne Unterstrich. Gilt für alle
 * Checks, die den Namen als Host ansprechen (TLS, HTTP) — und damit auch für
 * die Annahmen in safeTarget.ts.
 */
export function isValidDomain(input: string): boolean {
  return isValidDnsName(input) && !isDnsOnlyName(input);
}

/**
 * Normalisiert eine Eingabe — entfernt Protokoll, Pfad, Port, trailing dot.
 * Subdomains (z. B. www.) bleiben erhalten, damit gezielt geprüft werden kann.
 * IDN-Eingaben (z. B. münsterland.it) werden nach Punycode konvertiert,
 * damit isValidDomain und DNS-Lookups die ASCII-Form sehen.
 */
export function normalizeDomain(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '') // Port entfernen
    .replace(/\.$/, ''); // DNS-Notation example.com.

  // domainToASCII liefert '' bei ungültiger Eingabe — dann roh zurückgeben,
  // damit isValidDomain sauber ablehnen kann.
  const ascii = domainToASCII(cleaned);
  return ascii || cleaned;
}

/**
 * Ermittelt die Apex-Domain (registrierbare Domain) für Zonen-/Mail-Checks.
 *
 * Nutzt die Public Suffix List statt "letzte zwei Labels": bei mehrteiligen
 * Suffixen lag die alte Heuristik falsch und hat echte Apex-Domains als
 * Subdomain behandelt — bbc.co.uk → co.uk, sydney.edu.au → edu.au.
 *
 * allowPrivateDomains, weil bei Hosting-Suffixen die eigene Zone eine Ebene
 * tiefer liegt: für myapp.github.io ist github.io GitHubs Domain, nicht die des
 * Nutzers — ein SPF-/WHOIS-Check dort wäre wertlos.
 */
export function getApexDomain(domain: string): string {
  // null bei Public Suffixes selbst (gov.uk, co.uk) und bei unauflösbaren
  // Namen — dann ist der Name selbst der Anfang der Zone.
  return getDomain(domain, { allowPrivateDomains: true }) ?? domain;
}

/**
 * Reverse-DNS-Lookup (PTR) für eine IP-Adresse.
 * Liefert alle Hostnamen, auf die die IP zeigt — leer, wenn kein PTR gesetzt ist.
 */
export async function lookupPtrRecords(ip: string): Promise<string[]> {
  try {
    const hostnames = await resolver.reverse(ip);
    return hostnames.map((h) => h.replace(/\.$/, ''));
  } catch {
    // ENOTFOUND/ENODATA — kein PTR konfiguriert, das ist kein Fehler.
    return [];
  }
}

/** Holt den SPF-Record von der Apex-Domain (für Mail-Audit bei Subdomain-Lookups). */
export async function lookupSpfRecord(domain: string): Promise<string | undefined> {
  try {
    const results = await resolver.resolveTxt(domain);
    return results
      .map((chunks) => chunks.join(''))
      .find((value) => value.toLowerCase().startsWith('v=spf1'));
  } catch {
    return undefined;
  }
}
