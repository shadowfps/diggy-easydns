/**
 * WHOIS-/RDAP-Lookup.
 *
 * Wen der Server fragt, bestimmt services/registry.ts (#105): die Registry
 * laut IANA-Bootstrap per RDAP, für Endungen ohne Eintrag eine feste
 * Registry — DENIC (.de) und Identity Digital (.io) per RDAP, nic.at, Registro
 * .it und EURid per WHOIS auf Port 43, .io dort als Rückfall. rdap.org nur,
 * solange der Bootstrap nicht ladbar ist. Für .ch und Endungen ohne bekannten
 * Dienst gibt es null, die UI zeigt „nicht verfügbar“.
 *
 * RDAP ist JSON und braucht keinen Parser je Registry; WHOIS-Klartext lesen
 * die Parser in whoisText.ts, ohne Kontaktdaten auszuwerten.
 */

import type { WhoisInfo } from '../types.js';
import { fetchRdap, warnRdapError } from '../lib/rdap.js';
import { queryPort43, warnWhoisError } from '../lib/whoisPort43.js';
import { resolveRegistry, type RegistryStep } from './registry.js';

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
 * Ergebnis eines Schritts: die Daten, `null` für „die Registry kennt die
 * Domain nicht“ (endgültig) oder `undefined` für „gescheitert“ — dann ist
 * der nächste Schritt dran (.io: WHOIS nach RDAP).
 */
type StepResult = WhoisInfo | null | undefined;

export async function lookupWhois(domain: string, timeoutMs = 5000): Promise<WhoisInfo | null> {
  const route = await resolveRegistry(domain);
  if (route.kind !== 'query') return null;

  for (const step of route.steps) {
    const result =
      step.kind === 'rdap'
        ? await queryRdap(step, domain, route.allowHost, timeoutMs)
        : await queryWhoisServer(step, domain, timeoutMs);
    if (result !== undefined) return result;
  }
  return null;
}

async function queryWhoisServer(
  step: Extract<RegistryStep, { kind: 'port43' }>,
  domain: string,
  timeoutMs: number
): Promise<StepResult> {
  try {
    const parsed = step.parse(await queryPort43(step.host, domain, { timeoutMs }), domain);
    if (!parsed.found) return null;
    const { registrar, createdAt, expiresAt, updatedAt, nameServers, status, dnssecDelegated } = parsed.fields;
    return { domain, registrar, createdAt, expiresAt, updatedAt, nameServers, status, dnssecDelegated, source: step.source };
  } catch (error) {
    warnWhoisError(step.host, domain, error);
    return undefined;
  }
}

async function queryRdap(
  step: Extract<RegistryStep, { kind: 'rdap' }>,
  domain: string,
  allowHost: (host: string) => boolean | Promise<boolean>,
  timeoutMs: number
): Promise<StepResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const url = step.url;

  try {
    const { response: res, url: finalUrl } = await fetchRdap(url, { signal: ctrl.signal, allowHost });

    if (!res.ok) {
      // 404 = Domain unbekannt im RDAP oder rdap.org kennt für die TLD keinen
      // Dienst. Beides ist erwartbar und kein Betriebsfehler, also keine
      // Warnung — und endgültig, ein WHOIS-Rückfall wüsste nicht mehr.
      if (res.status === 404) return null;
      warnRdapError(url, new Error(`HTTP ${res.status}`));
      return undefined;
    }

    const data = (await res.json()) as RdapResponse;
    if (data.errorCode) {
      warnRdapError(url, new Error(`RDAP ${data.errorCode}`));
      return undefined;
    }

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
    const source = data.port43 ?? new URL(finalUrl).hostname;

    return {
      // Der Server fragt die Apex-Domain ab, nicht den eingegebenen Namen. Ohne
      // dieses Feld wüsste das Frontend nicht, wessen Ablauf es anzeigt.
      domain,
      registrar,
      createdAt,
      expiresAt,
      updatedAt,
      nameServers,
      status,
      dnssecDelegated,
      source,
    };
  } catch (error) {
    warnRdapError(url, error, ctrl.signal);
    return undefined;
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
