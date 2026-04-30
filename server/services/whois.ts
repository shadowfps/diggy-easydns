/**
 * WHOIS-/RDAP-Lookup.
 *
 * Wir nutzen RDAP statt klassisches WHOIS:
 *   - JSON-Format (kein Parsing-Albtraum)
 *   - https://rdap.org/domain/<domain> bootstraped automatisch zum richtigen
 *     Registry-Server (Verisign für .com, DENIC für .de, …)
 *   - Manche ccTLDs unterstützen RDAP nicht — dann gibt's null und die UI
 *     zeigt "nicht verfügbar".
 *
 * Wenn rdap.org nicht erreichbar ist, fallback auf rdap.iana.org. Das
 * deckt seltene Edge-Cases ab.
 */

import type { WhoisInfo } from '../types.js';

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

interface RdapEntity {
  handle?: string;
  roles?: string[];
  vcardArray?: unknown[];
}

interface RdapNameserver {
  ldhName?: string;
  unicodeName?: string;
}

interface RdapResponse {
  handle?: string;
  ldhName?: string;
  unicodeName?: string;
  status?: string[];
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: RdapNameserver[];
  secureDNS?: { delegationSigned?: boolean };
  port43?: string;
  errorCode?: number;
  title?: string;
}

/**
 * Bootstrap-Aggregator. rdap.org folgt der IANA-Service-Map und routet
 * automatisch zum richtigen Registry-RDAP — Standard für die meisten gTLDs
 * (.com, .net, .org, .io, .app, …) und viele ccTLDs.
 */
const PRIMARY_ENDPOINT = 'https://rdap.org/domain';

/**
 * TLD-spezifische Fallbacks. Wir gehen diese durch, falls rdap.org keinen
 * Bootstrap-Eintrag für eine TLD hat (z.B. DENIC für .de — nicht in der
 * IANA-Map, hat aber einen eigenen öffentlichen Endpoint).
 */
const TLD_FALLBACKS: Record<string, string> = {
  de: 'https://rdap.denic.de/domain',
};

export async function lookupWhois(domain: string, timeoutMs = 6000): Promise<WhoisInfo | null> {
  // 1. Primary: rdap.org Bootstrap
  try {
    const result = await tryEndpoint(PRIMARY_ENDPOINT, domain, timeoutMs);
    if (result) return result;
  } catch {
    // ignore — fallback unten
  }

  // 2. TLD-spezifischer Fallback
  const tld = domain.split('.').pop()?.toLowerCase();
  if (tld && TLD_FALLBACKS[tld]) {
    try {
      const result = await tryEndpoint(TLD_FALLBACKS[tld], domain, timeoutMs);
      if (result) return result;
    } catch {
      // ignore
    }
  }

  return null;
}

async function tryEndpoint(
  baseUrl: string,
  domain: string,
  timeoutMs: number
): Promise<WhoisInfo | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const url = `${baseUrl}/${encodeURIComponent(domain)}`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: 'application/rdap+json, application/json' },
    });

    if (!res.ok) {
      // 404 = Domain unbekannt im RDAP, 501 = TLD unterstützt kein RDAP
      return null;
    }

    const data = (await res.json()) as RdapResponse;
    if (data.errorCode) return null;

    const registrarEntity = data.entities?.find((e) => e.roles?.includes('registrar'));
    const registrar = extractFnFromVcard(registrarEntity?.vcardArray);

    const createdAt = findEventDate(data.events, 'registration');
    const expiresAt = findEventDate(data.events, 'expiration');
    const updatedAt =
      findEventDate(data.events, 'last changed') ?? findEventDate(data.events, 'last update');

    const nameServers = (data.nameservers ?? [])
      .map((ns) => (ns.ldhName ?? ns.unicodeName ?? '').toLowerCase())
      // RDAP liefert NS oft mit trailing dot (FQDN-Form) — wegnormalisieren
      .map((ns) => ns.replace(/\.$/, ''))
      .filter(Boolean);

    const status = data.status ?? [];
    const dnssecDelegated = data.secureDNS?.delegationSigned;

    // Source kommt aus port43 (klassischer WHOIS-Server) als grober Hinweis
    const source = data.port43 ?? new URL(res.url).hostname;

    return {
      registrar,
      createdAt,
      expiresAt,
      updatedAt,
      nameServers,
      status,
      dnssecDelegated,
      source,
    };
  } finally {
    clearTimeout(timer);
  }
}

function findEventDate(events: RdapEvent[] | undefined, action: string): string | undefined {
  return events?.find((e) => e.eventAction === action)?.eventDate;
}

/**
 * RDAP nutzt jCard (RFC 7095) für Kontakt-Infos. Format:
 *   ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "Registrar Name"], ...]]
 *
 * Wir wollen das "fn" (formatted name) Feld.
 */
function extractFnFromVcard(vcard: unknown[] | undefined): string | undefined {
  if (!vcard || vcard.length < 2) return undefined;
  const props = vcard[1];
  if (!Array.isArray(props)) return undefined;

  for (const prop of props) {
    if (Array.isArray(prop) && prop[0] === 'fn' && typeof prop[3] === 'string') {
      return prop[3];
    }
  }
  return undefined;
}
