/**
 * Wen fragen wir nach einer Domain? (#105)
 *
 * WHOIS-Report und Verfügbarkeits-Check teilen sich diese Auflösung:
 *
 *  1. Die Endung steht im IANA-Bootstrap → RDAP direkt bei der Registry
 *     (Verisign für .com, Google für .app/.dev, Nominet für .uk …).
 *  2. Kein Eintrag, aber eine feste Registry → DENIC für .de, Identity
 *     Digital für .io (RDAP, Rückfall WHOIS), nic.at, Registro .it und EURid
 *     über WHOIS auf Port 43. Geprüft am 20.10.2026: Keine dieser Endungen
 *     steht im Bootstrap, alle antworten direkt.
 *  3. Die Registry sperrt automatisierte Abfragen (.ch) → keine Abfrage, die
 *     Oberfläche verweist auf deren Web-Abfrage.
 *  4. Sonst, mit geladenem Bootstrap → kein bekannter Dienst, keine Abfrage.
 *     rdap.org kennt nur die Dienste aus dem Bootstrap und antwortet dort mit
 *     404 (geprüft für .co, .me, .ch, .at).
 *  5. Ohne Bootstrap (IANA nicht erreichbar) → rdap.org, für .com und .net
 *     direkt Verisign wie vor #105.
 *
 * Hosts kommen nur aus dem Bootstrap und aus den festen Listen hier, die
 * Domain steht nur kodiert im Pfad bzw. als geprüfte Zeile auf Port 43.
 */

import { isIP } from 'node:net';
import { registryWebLookup } from '../../shared/registryWebLookup.js';
import { findRdapBase, getRdapBootstrap, rdapDomainUrl } from '../lib/rdapBootstrap.js';
import { resolvePublicHost } from '../lib/safeTarget.js';
import { parseEurid, parseIcannWhois, parseNicAt, parseNicIt, type WhoisTextParser } from './whoisText.js';

export const RDAP_ORG_BASE = 'https://rdap.org/';

export interface FixedRegistry {
  /** Betreiber — so steht er in den Datenschutzhinweisen. */
  operator: string;
  /** RDAP-Basis-URL (RFC 9224), falls die Registry RDAP anbietet. */
  rdap?: string;
  /** WHOIS-Server auf Port 43: allein oder als Rückfall nach RDAP. */
  whois?: { host: string; parse: WhoisTextParser };
}

/** Feste Registries für Endungen ohne Eintrag im IANA-Bootstrap. */
export const FIXED_REGISTRIES: Readonly<Record<string, FixedRegistry>> = {
  de: { operator: 'DENIC', rdap: 'https://rdap.denic.de/' },
  io: {
    operator: 'Identity Digital',
    rdap: 'https://rdap.identitydigital.services/rdap/',
    whois: { host: 'whois.nic.io', parse: parseIcannWhois },
  },
  at: { operator: 'nic.at', whois: { host: 'whois.nic.at', parse: parseNicAt } },
  it: { operator: 'Registro .it', whois: { host: 'whois.nic.it', parse: parseNicIt } },
  eu: { operator: 'EURid', whois: { host: 'whois.eu', parse: parseEurid } },
};

/** Was der Verfügbarkeits-Check vor #105 fest kannte — nur ohne Bootstrap. */
const WITHOUT_BOOTSTRAP: Readonly<Record<string, string>> = {
  com: 'https://rdap.verisign.com/com/v1/',
  net: 'https://rdap.verisign.com/net/v1/',
};

const FIXED_HOSTS = new Set(
  [...Object.values(FIXED_REGISTRIES).map((r) => r.rdap), ...Object.values(WITHOUT_BOOTSTRAP)]
    .filter((url): url is string => !!url)
    .map((url) => new URL(url).hostname)
);

export type RegistryStep =
  | {
      kind: 'rdap';
      url: string;
      /** Host des Dienstes — Quelle in der Antwort. */
      source: string;
      /** rdap.org: ein 404 ohne Weiterleitung heißt „kein Dienst“, nicht „frei“. */
      viaRdapOrg: boolean;
    }
  | { kind: 'port43'; host: string; source: string; parse: WhoisTextParser };

export type RegistryRoute =
  | {
      kind: 'query';
      /** Der Reihe nach; der nächste nur, wenn der vorige scheiterte. */
      steps: RegistryStep[];
      /** Erlaubte Ziele für RDAP-Weiterleitungen. */
      allowHost: (host: string) => boolean | Promise<boolean>;
    }
  | { kind: 'web-only'; url: string }
  | { kind: 'none' };

/** LDH-Labels, mindestens zwei — alles andere wird nicht abgefragt. */
const DOMAIN_PATTERN = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export async function resolveRegistry(input: string): Promise<RegistryRoute> {
  const domain = input.toLowerCase().replace(/\.$/, '');
  if (!DOMAIN_PATTERN.test(domain)) return { kind: 'none' };
  const tld = domain.slice(domain.lastIndexOf('.') + 1);

  const bootstrap = await getRdapBootstrap();
  // Mit Bootstrap nur bekannte Registries. Ohne ihn leitet rdap.org nach
  // seiner eigenen Liste weiter, die hier niemand kennt — dann wenigstens
  // ein Name, der nur auf öffentliche Adressen zeigt (fetchRdap verlangt
  // zusätzlich https auf dem Standard-Port).
  const allowHost = (host: string) =>
    FIXED_HOSTS.has(host) || (bootstrap ? bootstrap.hosts.has(host) : isPublicName(host));
  const query = (steps: RegistryStep[]): RegistryRoute => ({ kind: 'query', steps, allowHost });

  const base = bootstrap && findRdapBase(bootstrap, domain);
  if (base) return query([rdapStep(base, domain)]);

  const fixed = Object.hasOwn(FIXED_REGISTRIES, tld) ? FIXED_REGISTRIES[tld] : undefined;
  if (fixed) {
    const steps: RegistryStep[] = [];
    if (fixed.rdap) steps.push(rdapStep(fixed.rdap, domain));
    if (fixed.whois) steps.push({ kind: 'port43', host: fixed.whois.host, source: fixed.whois.host, parse: fixed.whois.parse });
    return query(steps);
  }

  const web = registryWebLookup(domain);
  if (web) return { kind: 'web-only', url: web.url };

  if (bootstrap) return { kind: 'none' };
  return query([rdapStep(Object.hasOwn(WITHOUT_BOOTSTRAP, tld) ? WITHOUT_BOOTSTRAP[tld] : RDAP_ORG_BASE, domain)]);
}

/** Kein IP-Literal, kein einzelnes Label, und alle Adressen öffentlich. */
async function isPublicName(host: string): Promise<boolean> {
  if (host.startsWith('[') || isIP(host) !== 0 || !host.includes('.')) return false;
  try {
    await resolvePublicHost(host);
    return true;
  } catch {
    return false;
  }
}

function rdapStep(base: string, domain: string): RegistryStep {
  return {
    kind: 'rdap',
    url: rdapDomainUrl(base, domain),
    source: new URL(base).hostname,
    viaRdapOrg: base === RDAP_ORG_BASE,
  };
}
