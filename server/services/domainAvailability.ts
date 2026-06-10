import type { DomainAvailabilityResult, DomainAvailabilityStatus, DomainCheckReport } from '../types.js';

/** Gängige TLDs für Alternativ-Vorschläge (Reihenfolge wie im UI). */
const ALT_TLDS = ['de', 'com', 'io', 'net', 'app', 'dev', 'org'] as const;

const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

interface ParsedQuery {
  label: string;
  inputDomain?: string;
}

/**
 * RDAP-Verfügbarkeit: 404 → frei, 200 → vergeben.
 * Verisign für .com/.net, DENIC für .de, sonst rdap.org-Bootstrap.
 */
function getRdapBaseUrl(tld: string): string {
  switch (tld) {
    case 'com':
      return 'https://rdap.verisign.com/com/v1/domain';
    case 'net':
      return 'https://rdap.verisign.com/net/v1/domain';
    case 'de':
      return 'https://rdap.denic.de/domain';
    default:
      return 'https://rdap.org/domain';
  }
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

async function checkSingleDomain(domain: string, timeoutMs = 6000): Promise<DomainAvailabilityResult> {
  const tld = domain.split('.').pop()?.toLowerCase() ?? '';
  const baseUrl = getRdapBaseUrl(tld);
  const url = `${baseUrl}/${encodeURIComponent(domain)}`;
  const source = new URL(baseUrl).hostname;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/rdap+json, application/json' },
    });

    if (res.status === 404) {
      return { domain, status: 'available', source };
    }

    if (res.ok) {
      const data = (await res.json()) as { errorCode?: number; objectClassName?: string };
      if (data.errorCode || data.objectClassName !== 'domain') {
        return { domain, status: 'unknown', source };
      }
      return { domain, status: 'taken', source };
    }

    return { domain, status: 'unknown', source };
  } catch (error) {
    const err = error as Error;
    if (err.name === 'AbortError') {
      return { domain, status: 'unknown', source };
    }
    return { domain, status: 'unknown', source };
  } finally {
    clearTimeout(timer);
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
