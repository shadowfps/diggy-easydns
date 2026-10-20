import type { DomainAvailabilityResult, DomainAvailabilityStatus, DomainCheckReport } from '../types.js';
import { fetchRdap, warnRdapError } from '../lib/rdap.js';
import { queryPort43, warnWhoisError } from '../lib/whoisPort43.js';
import { resolveRegistry, type RegistryStep } from './registry.js';

/** Gängige TLDs für Alternativ-Vorschläge (Reihenfolge wie im UI). */
const ALT_TLDS = ['de', 'com', 'io', 'net', 'app', 'dev', 'org'] as const;

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
  add(`my${label}.com`);
  for (const tld of ALT_TLDS) {
    add(`${label}.${tld}`);
  }

  return candidates.slice(0, 10);
}

export async function checkDomainsAvailability(rawInput: string): Promise<DomainCheckReport> {
  const { label, inputDomain } = parseDomainQuery(rawInput);
  const candidates = buildDomainCandidates(label, inputDomain);

  const results = await Promise.all(candidates.map((domain) => checkSingleDomain(domain)));

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
        ? await rdapAvailability(step, domain, route.allowHost, timeoutMs)
        : await whoisAvailability(step, domain, timeoutMs);
    if (status) return { domain, status, source };
  }
  return { domain, status: 'unknown', source };
}

/** `undefined` heißt: gescheitert, der nächste Schritt ist dran. */
async function rdapAvailability(
  step: Extract<RegistryStep, { kind: 'rdap' }>,
  domain: string,
  allowHost: (host: string) => boolean,
  timeoutMs: number
): Promise<DomainAvailabilityStatus | undefined> {
  const { url } = step;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { response: res, redirected } = await fetchRdap(url, { signal: controller.signal, allowHost });

    if (res.status === 404) {
      // rdap.org leitet nur weiter; ein 404 ohne Weiterleitung heißt „kein
      // RDAP-Dienst für diese TLD“, nicht „Domain frei“.
      return step.viaRdapOrg && !redirected ? 'unknown' : 'available';
    }

    if (res.ok) {
      const data = (await res.json()) as { errorCode?: number; objectClassName?: string };
      if (data.errorCode || data.objectClassName !== 'domain') {
        if (data.errorCode) warnRdapError(url, new Error(`RDAP ${data.errorCode}`));
        return undefined;
      }
      return 'taken';
    }

    warnRdapError(url, new Error(`HTTP ${res.status}`));
    return undefined;
  } catch (error) {
    warnRdapError(url, error, controller.signal);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function whoisAvailability(
  step: Extract<RegistryStep, { kind: 'port43' }>,
  domain: string,
  timeoutMs: number
): Promise<DomainAvailabilityStatus | undefined> {
  try {
    const parsed = step.parse(await queryPort43(step.host, domain, { timeoutMs }), domain);
    return parsed.found ? 'taken' : 'available';
  } catch (error) {
    // Sperre und Rate-Limit landen hier — „unklar“, nie „frei“.
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
