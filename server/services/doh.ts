/**
 * DNS-over-HTTPS-Client.
 *
 * Zwei Formate: die JSON-API (`application/dns-json`), die Cloudflare,
 * Google, AdGuard, DNS.SB und NextDNS sprechen, und das Wireformat nach
 * RFC 8484 (`application/dns-message`) für alle übrigen — Quad9, OpenDNS,
 * Control D und DNS4EU haben keine JSON-API. dnsWire.ts bringt
 * Wireformat-Antworten in die Form der JSON-API; ab dort ist der Weg gleich.
 *
 * Wichtig: Jeder Resolver bekommt seinen eigenen Timeout — ein langsamer
 * Anbieter darf den Cloudflare-Vergleich nicht blockieren.
 */

import type { DnsRecord, RecordType } from '../types.js';
import { decodeResponse, encodeQuery, type DnsAnswer, type DnsResponse } from './dnsWire.js';

export interface DohResolver {
  id: string;
  name: string;
  url: string; // Endpoint inkl. Pfad
  /**
   * `json`: JSON-API mit `?name=…&type=…`. `wire`: RFC 8484, GET mit
   * `?dns=<base64url>` — für Anbieter ohne JSON-API.
   */
  format: 'json' | 'wire';
  ip: string; // Public IP des klassischen Resolvers (für Anzeige)
  /**
   * Sitz des Betreibers (ISO 3166), nicht der Standort des Servers: Die
   * Anfragen gehen per Anycast an das nächstgelegene Rechenzentrum, von
   * diggy aus also meist nach Frankfurt.
   */
  country: string;
  flag: string;
  provider: string;
  /** Betreiber laut Datenschutzerklärung bzw. Impressum des Anbieters. */
  operator: string;
  /**
   * Anycast: dieselbe Adresse an vielen Standorten, es antwortet der
   * nächstgelegene. Ohne Anycast (NextDNS) lenkt der Anbieter per DNS zum
   * nächsten Standort — für den Vergleich läuft es aufs selbe hinaus.
   */
  anycast: boolean;
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
 * Die DoH-Anbieter für den Propagation-Vergleich.
 *
 * Ausgewählt nach: a) öffentlich, kostenlos und ohne Konto nutzbar,
 * b) ohne Filter — eine Variante, die Werbe- oder Malware-Domains blockt,
 * antwortet für diese mit 0.0.0.0, einer Sperrseite oder NXDOMAIN und stünde
 * dann als „abweichend“ da, c) verschiedene Betreiber, damit verschiedene
 * Caches im Vergleich stehen. Alle antworten aus dem Rechenzentrum, das
 * diggy am nächsten liegt (Anycast) — mehr Anbieter heißt mehr Caches, nicht
 * mehr Weltregionen.
 *
 * Reihenfolge und Ids der ersten fünf bleiben: UI, Tests und gespeicherte
 * Reports hängen daran, und Cloudflare vorn entscheidet einen Gleichstand.
 * DNSSEC und TTL fragen nur Cloudflare und Google (dnssec.ts, dnsLookup.ts).
 *
 * Bewusst nicht dabei (Stand Oktober 2026, Quellen in docs/COMPLIANCE.md):
 *  - Mullvad: stellt den öffentlichen DoH-Dienst am 2. November 2026 ein.
 *  - Wikimedia DNS: laut Betreiber Beta ohne Zusage für Verfügbarkeit.
 *  - Hurricane Electric: validiert kein DNSSEC, DoH nicht offiziell beschrieben.
 *  - CIRA Canadian Shield: antwortet aus Kanada (rund 400 ms) und schwankt.
 *  - CZ.NIC ODVR: fragt als einziger nicht aus Deutschland, sondern aus Prag.
 *    GeoDNS-Domains bekommen dort andere Adressen — wikipedia.org stand
 *    dadurch als „abweichend“ da, obwohl nichts zu propagieren war.
 */
export const DOH_RESOLVERS: DohResolver[] = [
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    url: 'https://cloudflare-dns.com/dns-query',
    format: 'json',
    ip: '1.1.1.1',
    country: 'US',
    flag: '🇺🇸',
    provider: 'Cloudflare',
    operator: 'Cloudflare, Inc.',
    anycast: true,
  },
  {
    id: 'google',
    name: 'Google',
    url: 'https://dns.google/resolve',
    format: 'json',
    ip: '8.8.8.8',
    country: 'US',
    flag: '🇺🇸',
    provider: 'Google',
    operator: 'Google LLC',
    anycast: true,
  },
  {
    // „Non-filtering“. Der Standard-Endpoint dns.adguard-dns.com blockt
    // Werbung: doubleclick.net kam dort als 0.0.0.0 zurück.
    id: 'adguard',
    name: 'AdGuard',
    url: 'https://unfiltered.adguard-dns.com/resolve',
    format: 'json',
    ip: '94.140.14.140',
    country: 'CY',
    flag: '🇨🇾',
    provider: 'AdGuard',
    operator: 'AdGuard Software Ltd.',
    anycast: true,
  },
  {
    id: 'dns-sb',
    name: 'DNS.SB',
    url: 'https://doh.dns.sb/dns-query',
    format: 'json',
    ip: '185.222.222.222',
    country: 'DE',
    flag: '🇩🇪',
    provider: 'DNS.SB',
    operator: 'xTom GmbH',
    anycast: true,
  },
  {
    // Ohne Konfigurations-Id filtert NextDNS nichts. dns.nextdns.io zeigt per
    // DNS auf den nächsten Standort (steering.nextdns.io), nicht per Anycast.
    id: 'nextdns',
    name: 'NextDNS',
    url: 'https://dns.nextdns.io',
    format: 'json',
    ip: '45.90.28.0',
    country: 'US',
    flag: '🇺🇸',
    provider: 'NextDNS',
    operator: 'NextDNS Inc.',
    anycast: false,
  },
  {
    // „Unsecured“ (9.9.9.10): ohne Blockliste, validiert DNSSEC trotzdem.
    // Der Standard 9.9.9.9 beantwortet Domains auf der Bedrohungsliste mit
    // NXDOMAIN — die Propagation zeigte dort „kein Eintrag“.
    id: 'quad9',
    name: 'Quad9',
    url: 'https://dns10.quad9.net/dns-query',
    format: 'wire',
    ip: '9.9.9.10',
    country: 'CH',
    flag: '🇨🇭',
    provider: 'Quad9',
    operator: 'Quad9 (Stiftung)',
    anycast: true,
  },
  {
    // „Sandbox“ ohne Filter. Der Standard doh.opendns.com antwortet für
    // Phishing-Domains mit der Adresse einer Sperrseite (146.112.61.x).
    id: 'opendns',
    name: 'OpenDNS',
    url: 'https://doh.sandbox.opendns.com/dns-query',
    format: 'wire',
    ip: '208.67.222.2',
    country: 'US',
    flag: '🇺🇸',
    provider: 'Cisco',
    operator: 'Cisco Systems, Inc.',
    anycast: true,
  },
  {
    // Free DNS, Profil p0 „Unfiltered“.
    id: 'controld',
    name: 'Control D',
    url: 'https://freedns.controld.com/p0',
    format: 'wire',
    ip: '76.76.2.0',
    country: 'CA',
    flag: '🇨🇦',
    provider: 'Control D',
    operator: 'ControlD Inc.',
    anycast: true,
  },
  {
    // „Unfiltered“; die übrigen DNS4EU-Varianten blocken mindestens Malware.
    id: 'dns4eu',
    name: 'DNS4EU',
    url: 'https://unfiltered.joindns4.eu/dns-query',
    format: 'wire',
    ip: '86.54.11.100',
    country: 'CZ',
    flag: '🇨🇿',
    provider: 'Whalebone',
    operator: 'Whalebone, s.r.o.',
    anycast: true,
  },
];

export interface DohQueryResult {
  records: DnsRecord[];
  /** AD-Flag — DNSSEC-validiert vom Resolver */
  authenticated: boolean;
  /** Roh-Status der DoH-Antwort */
  status: number;
  /** Antwortzeit in ms */
  responseTimeMs: number;
  /**
   * Ohne Eintrag des abgefragten Typs: Restlaufzeit des Negativ-Caches in
   * Sekunden (siehe negativeCacheTtl). Fehlt, wenn der Resolver kein SOA
   * mitliefert.
   */
  negativeTtl?: number;
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
  const wire = resolver.format === 'wire';

  let url: string;
  if (wire) {
    const message = Buffer.from(encodeQuery(domain, typeNumber, { dnssec }));
    url = `${resolver.url}?dns=${message.toString('base64url')}`;
  } else {
    const params = new URLSearchParams({
      name: domain,
      type: String(typeNumber),
    });
    if (dnssec) params.set('do', '1');
    url = `${resolver.url}?${params}`;
  }

  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetchWithRetry(url, {
      headers: { accept: wire ? 'application/dns-message' : 'application/dns-json' },
      signal: ctrl.signal,
    });

    if (!res.ok) {
      throw new Error(`${resolver.id} HTTP ${res.status}`);
    }

    const body: DnsResponse = wire
      ? decodeResponse(new Uint8Array(await res.arrayBuffer()), { name: domain, type: typeNumber })
      : ((await res.json()) as DnsResponse);
    // Über HTTPS gibt es keinen Grund zu kürzen. Kommt es trotzdem vor, fehlen
    // Records — im Vergleich sähe das wie ein anderer Wert aus.
    if (wire && body.TC) throw new Error(`${resolver.id}: Antwort gekürzt (TC)`);

    const records = (body.Answer ?? [])
      .filter((a) => NUMBER_TO_TYPE[a.type] !== undefined)
      .map((a) => mapAnswerToRecord(a, type));
    const negativeTtl = records.some((r) => r.type === type)
      ? undefined
      : negativeCacheTtl(body.Authority);

    return {
      records,
      authenticated: body.AD ?? false,
      status: body.Status,
      responseTimeMs: Date.now() - start,
      ...(negativeTtl !== undefined && { negativeTtl }),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verbindungsversuche je Abfrage. Quad9 setzte im Test aus einem Büronetz
 * rund 40 % der neuen TLS-Verbindungen direkt nach dem ClientHello zurück
 * (ECONNRESET), andere Anbieter keine; eine Pause vor dem nächsten Versuch
 * half nicht. Erfolgreich nach einem Versuch 60 %, nach zwei 77 %, nach drei
 * 88 %, nach vier 92 % (60 frische Verbindungen, Oktober 2026).
 */
const CONNECT_ATTEMPTS = 4;

/**
 * Fehlercodes (`cause.code` von fetch), bei denen die Gegenseite die
 * Verbindung abgebrochen hat: zurückgesetzt (auch mitten im TLS-Handshake)
 * oder geschlossen, bevor eine Antwort kam. Ein Name, der sich nicht
 * auflösen lässt, ein falsches Zertifikat oder eine kaputte HTTP-Antwort
 * ändern sich beim nächsten Versuch nicht und werden nicht wiederholt.
 */
const CONNECTION_DROPPED = new Set(['ECONNRESET', 'EPIPE', 'ECONNABORTED', 'UND_ERR_SOCKET']);

function connectionDropped(error: unknown): boolean {
  const code = (error as { cause?: { code?: unknown } } | undefined)?.cause?.code;
  return typeof code === 'string' && CONNECTION_DROPPED.has(code);
}

/**
 * `fetch` mit neuem Versuch, wenn die Verbindung abbricht, bevor eine
 * Antwort da ist. Ein Abbruch kommt nach wenigen Millisekunden, die Versuche
 * laufen im selben Zeitbudget — ein Timeout wird nicht wiederholt, eine
 * HTTP-Antwort (auch ein Fehlerstatus) ebenso wenig, andere Netzwerkfehler
 * auch nicht.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (init.signal?.aborted || attempt >= CONNECT_ATTEMPTS || !connectionDropped(error)) throw error;
    }
  }
}

/**
 * Wie lange ein Resolver „gibt es nicht“ (NXDOMAIN/NODATA) noch weitergibt.
 *
 * Zur negativen Antwort gehört das SOA der Zone im Authority-Abschnitt. Nach
 * RFC 2308 gilt sie das Kleinere aus seiner TTL und seinem MINIMUM-Feld; die
 * TTL zählt im Cache des Resolvers herunter wie bei jedem Record. Ohne SOA
 * (AdGuard schickt keins) oder mit unlesbarem SOA: `undefined` — geraten wird
 * nicht.
 */
export function negativeCacheTtl(
  authority: { type: number; TTL: number; data: string }[] | undefined
): number | undefined {
  const soa = authority?.find((record) => record.type === RECORD_TYPE_NUMBERS.SOA);
  const minimum = Number(soa?.data.trim().split(/\s+/)[6]);
  if (!soa || !Number.isFinite(soa.TTL) || !Number.isFinite(minimum)) return undefined;
  return Math.min(soa.TTL, minimum);
}

/**
 * Konvertiert einen DoH-Answer-Record in unser DnsRecord-Format.
 * MX kommt als "10 mail.example.com" — Priority extrahieren.
 * TXT kommt mit umschließenden Anführungszeichen — strippen.
 * CAA kommt als "0 issue \"letsencrypt.org\"" — direkt verwendbar.
 */
function mapAnswerToRecord(answer: DnsAnswer, expectedType: RecordType): DnsRecord {
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

/** Ein TXT-Wert, der nur aus Zeichenketten in Anführungszeichen besteht: `"…" "…"`. */
const QUOTED_TXT = /^\s*"(?:[^"\\]|\\.)*"(?:\s+"(?:[^"\\]|\\.)*")*\s*$/;
const QUOTED_CHUNK = /"((?:[^"\\]|\\.)*)"/g;

/**
 * DoH liefert TXT als '"chunk1" "chunk2"'. Wir wollen den reinen String.
 *
 * Google liefert ihn schon zusammengesetzt und ohne Anführungszeichen. Ein
 * solcher Wert wird nur zerlegt, wenn er ganz aus Stücken besteht — sonst
 * bliebe von `sagt "hallo"` nur `hallo`, und die Propagation meldete Google
 * als abweichend. Aus demselben Grund werden `\"` und `\\` beide aufgelöst:
 * Ein versehentlich eingetragener Backslash (`v=DKIM1\; …`) kommt bei Google
 * als `\;` an, bei den anderen als `\\;`.
 */
export function parseDohTxt(raw: string): string {
  if (!QUOTED_TXT.test(raw)) return raw;
  return [...raw.matchAll(QUOTED_CHUNK)]
    .map((m) => m[1].replace(/\\(["\\])/g, '$1'))
    .join('');
}

function stripTrailingDot(s: string): string {
  return s.endsWith('.') ? s.slice(0, -1) : s;
}
