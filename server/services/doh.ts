/**
 * DNS-over-HTTPS-Client.
 *
 * Wir sprechen mit den großen DoH-Anbietern via JSON-API (RFC 8484 hat auch
 * binär; JSON ist für unseren Use-Case angenehmer und alle drei großen
 * Provider sprechen es).
 *
 * Wichtig: Jeder Resolver bekommt seinen eigenen Timeout — ein langsamer
 * Quad9 darf den Cloudflare-Vergleich nicht blockieren.
 */

import type { DnsRecord, RecordType } from '../types.js';

export interface DohResolver {
  id: string;
  name: string;
  url: string; // Endpoint inkl. Pfad
  ip: string; // Public IP des klassischen Resolvers (für Anzeige)
  country: string;
  flag: string;
  provider: string;
}

/**
 * RFC 1035 Numerical Codes für die wichtigsten Record-Typen.
 * Manche DoH-Anbieter akzeptieren auch String-Namen, aber die Numbers
 * sind universell.
 */
const RECORD_TYPE_NUMBERS: Record<RecordType, number> = {
  A: 1,
  AAAA: 28,
  CNAME: 5,
  MX: 15,
  NS: 2,
  TXT: 16,
  SOA: 6,
  CAA: 257,
  SRV: 33,
  PTR: 12,
  DNSKEY: 48,
  DS: 43,
};

const NUMBER_TO_TYPE: Record<number, RecordType> = Object.fromEntries(
  Object.entries(RECORD_TYPE_NUMBERS).map(([k, v]) => [v, k as RecordType])
) as Record<number, RecordType>;

/**
 * Die DoH-Provider mit zuverlässiger JSON-API.
 *
 * Ausgewählt nach: a) JSON-API verfügbar, b) öffentlich nutzbar, c) regionale
 * Diversität, damit der Propagation-Vergleich aussagekräftig ist.
 *
 * Bewusst nicht dabei:
 *  - Quad9 (:5053-Endpoint zu unzuverlässig erreichbar; Standard-443 spricht nur Binär-DoH)
 *  - OpenDNS (DoH-Endpoint spricht nur Binär-DoH)
 */
export const DOH_RESOLVERS: DohResolver[] = [
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    url: 'https://cloudflare-dns.com/dns-query',
    ip: '1.1.1.1',
    country: 'Global',
    flag: '🌐',
    provider: 'Cloudflare',
  },
  {
    id: 'google',
    name: 'Google',
    url: 'https://dns.google/resolve',
    ip: '8.8.8.8',
    country: 'US',
    flag: '🇺🇸',
    provider: 'Google',
  },
  {
    id: 'adguard',
    name: 'AdGuard',
    url: 'https://dns.adguard-dns.com/resolve',
    ip: '94.140.14.14',
    country: 'CY',
    flag: '🇨🇾',
    provider: 'AdGuard',
  },
  {
    id: 'dns-sb',
    name: 'DNS.SB',
    url: 'https://doh.dns.sb/dns-query',
    ip: '185.222.222.222',
    country: 'HK',
    flag: '🇭🇰',
    provider: 'DNS.SB',
  },
  {
    id: 'nextdns',
    name: 'NextDNS',
    url: 'https://dns.nextdns.io',
    ip: '45.90.28.0',
    country: 'US',
    flag: '🇺🇸',
    provider: 'NextDNS',
  },
];

/**
 * Roh-Antwort einer DoH-JSON-Query.
 * Status: 0 = NOERROR, 3 = NXDOMAIN, 2 = SERVFAIL, …
 */
interface DohResponse {
  Status: number;
  TC?: boolean;
  RD?: boolean;
  RA?: boolean;
  AD?: boolean; // Authenticated Data — DNSSEC-validiert
  CD?: boolean; // Checking Disabled
  Question?: { name: string; type: number }[];
  Answer?: { name: string; type: number; TTL: number; data: string }[];
  Authority?: { name: string; type: number; TTL: number; data: string }[];
}

export interface DohQueryResult {
  records: DnsRecord[];
  /** AD-Flag — DNSSEC-validiert vom Resolver */
  authenticated: boolean;
  /** Roh-Status der DoH-Antwort */
  status: number;
  /** Antwortzeit in ms */
  responseTimeMs: number;
}

interface QueryOptions {
  timeoutMs?: number;
  /** DNSSEC-Validierung anfordern (DO-Bit) */
  dnssec?: boolean;
}

/**
 * Führt eine DoH-Query gegen einen Resolver durch.
 * Wirft NICHT bei NXDOMAIN — gibt einfach leeres records[] zurück.
 * Wirft NUR bei Netzwerk- oder Parse-Fehlern.
 */
export async function dohQuery(
  resolver: DohResolver,
  domain: string,
  type: RecordType,
  options: QueryOptions = {}
): Promise<DohQueryResult> {
  const { timeoutMs = 5000, dnssec = false } = options;
  const typeNumber = RECORD_TYPE_NUMBERS[type];

  const params = new URLSearchParams({
    name: domain,
    type: String(typeNumber),
  });
  if (dnssec) params.set('do', '1');

  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${resolver.url}?${params}`, {
      headers: { accept: 'application/dns-json' },
      signal: ctrl.signal,
    });

    if (!res.ok) {
      throw new Error(`${resolver.id} HTTP ${res.status}`);
    }

    const body = (await res.json()) as DohResponse;
    const records = (body.Answer ?? [])
      .filter((a) => NUMBER_TO_TYPE[a.type] !== undefined)
      .map((a) => mapAnswerToRecord(a, type));

    return {
      records,
      authenticated: body.AD ?? false,
      status: body.Status,
      responseTimeMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Konvertiert einen DoH-Answer-Record in unser DnsRecord-Format.
 * MX kommt als "10 mail.example.com" — Priority extrahieren.
 * TXT kommt mit umschließenden Anführungszeichen — strippen.
 * CAA kommt als "0 issue \"letsencrypt.org\"" — direkt verwendbar.
 */
function mapAnswerToRecord(
  answer: { name: string; type: number; TTL: number; data: string },
  expectedType: RecordType
): DnsRecord {
  const recordType = NUMBER_TO_TYPE[answer.type] ?? expectedType;
  const name = stripTrailingDot(answer.name);

  if (recordType === 'MX') {
    const [prioStr, ...rest] = answer.data.trim().split(/\s+/);
    return {
      type: 'MX',
      name,
      priority: Number(prioStr),
      value: stripTrailingDot(rest.join(' ')),
      ttl: answer.TTL,
    };
  }

  if (recordType === 'TXT') {
    // DoH packt jedes TXT-Chunk in Anführungszeichen und joint sie mit Space
    return {
      type: 'TXT',
      name,
      value: parseDohTxt(answer.data),
      ttl: answer.TTL,
    };
  }

  if (recordType === 'NS' || recordType === 'CNAME') {
    return {
      type: recordType,
      name,
      value: stripTrailingDot(answer.data),
      ttl: answer.TTL,
    };
  }

  return {
    type: recordType,
    name,
    value: answer.data,
    ttl: answer.TTL,
  };
}

/**
 * DoH liefert TXT als '"chunk1" "chunk2"'. Wir wollen den reinen String.
 */
export function parseDohTxt(raw: string): string {
  const matches = raw.match(/"((?:[^"\\]|\\.)*)"/g);
  if (!matches) return raw;
  return matches.map((m) => m.slice(1, -1).replace(/\\"/g, '"')).join('');
}

function stripTrailingDot(s: string): string {
  return s.endsWith('.') ? s.slice(0, -1) : s;
}
