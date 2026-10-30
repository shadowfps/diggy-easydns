import type { DomainAvailabilityResult, DomainAvailabilityStatus, DomainCheckReport } from '../types.js';
import { warnRdapError } from '../lib/rdap.js';
import { warnWhoisError } from '../lib/whoisPort43.js';
import { resolveRegistry } from './registry.js';
import { requestRdap, requestWhois, type Port43Step, type RdapStep } from './registryQuery.js';

/** Gängige TLDs für Alternativ-Vorschläge (Reihenfolge wie im UI). */
const ALT_TLDS = ['de', 'com', 'io', 'net', 'app', 'dev', 'org'] as const;

/** Mehr Zeilen zeigt die Ansicht nicht. */
const MAX_CANDIDATES = 10;

/** Sind diese Endungen beide vergeben, lohnt eine Abwandlung des Namens. */
const PRIMARY_TLDS = ['com', 'de'] as const;

/**
 * Abwandlungen des Namens, immer auf .com (#147). Vorher stand `my<name>.com`
 * bei jeder Suche an zweiter Stelle — auch wenn der Name selbst frei war. Das
 * wirkte wie ein starres Muster statt wie ein Vorschlag.
 */
const NAME_VARIANTS: readonly ((label: string) => string)[] = [
  (label) => `get${label}`,
  (label) => `try${label}`,
  (label) => `${label}hq`,
  (label) => `${label}app`,
  (label) => `my${label}`,
];
const VARIANT_COUNT = 2;

const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

interface ParsedQuery {
  label: string;
  inputDomain?: string;
}

export function isValidDomainLabel(label: string): boolean {
  return LABEL_PATTERN.test(label);
}

export function parseDomainQuery(rawInput: string): ParsedQuery {
  const normalized = rawInput
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');

  if (!normalized) {
    throw new Error('Bitte einen Domain-Namen eingeben.');
  }

  const parts = normalized.split('.').filter(Boolean);

  if (parts.length === 1) {
    if (!isValidDomainLabel(parts[0])) {
      throw new Error('Der Domain-Name enthält ungültige Zeichen.');
    }
    return { label: parts[0] };
  }

  if (parts[0] === 'www' && parts.length === 3) {
    if (!isValidDomainLabel(parts[1])) {
      throw new Error('Der Domain-Name enthält ungültige Zeichen.');
    }
    return {
      label: parts[1],
      inputDomain: `${parts[1]}.${parts[2]}`,
    };
  }

  if (parts.length === 2) {
    if (!isValidDomainLabel(parts[0])) {
      throw new Error('Der Domain-Name enthält ungültige Zeichen.');
    }
    return {
      label: parts[0],
      inputDomain: `${parts[0]}.${parts[1]}`,
    };
  }

  throw new Error('Bitte nur einen Domain-Namen oder Label eingeben (z. B. meinprojekt oder meinprojekt.de).');
}

export function buildDomainCandidates(label: string, inputDomain?: string): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  const add = (domain: string) => {
    const key = domain.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(key);
  };

  if (inputDomain) add(inputDomain);
  for (const tld of ALT_TLDS) {
    add(`${label}.${tld}`);
  }

  return candidates.slice(0, MAX_CANDIDATES);
}

/**
 * Nur wenn der Name auf .com und .de nachweislich vergeben ist. „Unklar“ zählt
 * nicht: Dann wissen wir nicht, ob der Name selbst noch zu haben ist.
 */
export function shouldSuggestVariants(label: string, results: readonly DomainAvailabilityResult[]): boolean {
  return PRIMARY_TLDS.every(
    (tld) => results.find((result) => result.domain === `${label}.${tld}`)?.status === 'taken'
  );
}

/**
 * Zwei Abwandlungen je Name. Welche, hängt am Namen: Dieselbe Suche liefert
 * dieselben Vorschläge, verschiedene Namen bekommen verschiedene. Zu lange
 * Labels (über 63 Zeichen) fallen weg.
 */
export function buildNameVariants(label: string): string[] {
  const start = [...label].reduce((sum, char) => sum + char.charCodeAt(0), 0) % NAME_VARIANTS.length;
  const rotated = [...NAME_VARIANTS.slice(start), ...NAME_VARIANTS.slice(0, start)];
  return rotated
    .map((variant) => variant(label))
    .filter(isValidDomainLabel)
    .slice(0, VARIANT_COUNT)
    .map((variant) => `${variant}.com`);
}

export async function checkDomainsAvailability(rawInput: string): Promise<DomainCheckReport> {
  const { label, inputDomain } = parseDomainQuery(rawInput);
  const candidates = buildDomainCandidates(label, inputDomain);

  const results = await Promise.all(candidates.map((domain) => checkSingleDomain(domain)));

  // Zweite Runde nur, wenn der Name selbst auf den wichtigsten Endungen weg ist.
  if (shouldSuggestVariants(label, results)) {
    const variants = buildNameVariants(label)
      .filter((domain) => !candidates.includes(domain))
      .slice(0, MAX_CANDIDATES - results.length);
    results.push(...(await Promise.all(variants.map((domain) => checkSingleDomain(domain)))));
  }

  return {
    query: rawInput.trim(),
    label,
    checkedAt: new Date().toISOString(),
    results,
  };
}

/**
 * Verfügbarkeit bei der zuständigen Registry (services/registry.ts, #105):
 * RDAP 404 → frei, 200 → vergeben; WHOIS „nicht gefunden“ → frei, ein
 * Domain-Block → vergeben. Alles andere — Timeout, Sperre, unbekannte
 * Antwort, kein bekannter Dienst — ist „unklar“, nie „frei“.
 */
async function checkSingleDomain(domain: string, timeoutMs = 6000): Promise<DomainAvailabilityResult> {
  const route = await resolveRegistry(domain);
  if (route.kind !== 'query') return { domain, status: 'unknown' };

  let source: string | undefined;
  for (const step of route.steps) {
    source = step.source;
    const status =
      step.kind === 'rdap'
        ? await rdapAvailability(step, route.allowHost, timeoutMs)
        : await whoisAvailability(step, domain, timeoutMs);
    if (status) return { domain, status, source };
  }
  return { domain, status: 'unknown', source };
}

/** `undefined` heißt: gescheitert, der nächste Schritt ist dran. */
async function rdapAvailability(
  step: RdapStep,
  allowHost: (host: string) => boolean | Promise<boolean>,
  timeoutMs: number
): Promise<DomainAvailabilityStatus | undefined> {
  const { url } = step;

  try {
    const answer = await requestRdap(step, allowHost, timeoutMs);

    if (answer.status === 404) {
      // rdap.org leitet nur weiter; ein 404 ohne Weiterleitung heißt „kein
      // RDAP-Dienst für diese TLD“, nicht „Domain frei“.
      return step.viaRdapOrg && !answer.redirected ? 'unknown' : 'available';
    }

    if (answer.status >= 200 && answer.status <= 299) {
      const data = (answer.data ?? {}) as { errorCode?: number; objectClassName?: string };
      if (data.errorCode || data.objectClassName !== 'domain') {
        if (data.errorCode) warnRdapError(url, new Error(`RDAP ${data.errorCode}`));
        return undefined;
      }
      return 'taken';
    }

    warnRdapError(url, new Error(`HTTP ${answer.status}`));
    return undefined;
  } catch (error) {
    // Timeout, Netz und Drosselung — „unklar“, nie „frei“.
    warnRdapError(url, error);
    return undefined;
  }
}

async function whoisAvailability(
  step: Port43Step,
  domain: string,
  timeoutMs: number
): Promise<DomainAvailabilityStatus | undefined> {
  try {
    const parsed = await requestWhois(step, domain, timeoutMs);
    return parsed.found ? 'taken' : 'available';
  } catch (error) {
    // Sperre, Rate-Limit und Drosselung landen hier — „unklar“, nie „frei“.
    warnWhoisError(step.host, domain, error);
    return undefined;
  }
}

export function availabilityStatusLabel(status: DomainAvailabilityStatus): string {
  switch (status) {
    case 'available':
      return 'Verfügbar';
    case 'taken':
      return 'Vergeben';
    default:
      return 'Unklar';
  }
}
