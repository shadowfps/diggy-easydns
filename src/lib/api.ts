import type { LookupReport, PageSpeedReport, PageSpeedStrategy } from '@/types/dns';

export interface LookupError {
  error: string;
  message: string;
}

/**
 * Führt einen vollständigen DNS-Lookup für eine Domain durch.
 * Nutzt das Diggy-Backend unter /api/lookup.
 */
export async function lookupDomain(domain: string): Promise<LookupReport> {
  const res = await fetch(`/api/lookup?domain=${encodeURIComponent(domain)}`);

  if (!res.ok) {
    let errorPayload: LookupError = {
      error: 'lookup_failed',
      message: `Lookup fehlgeschlagen (${res.status})`,
    };
    try {
      errorPayload = await res.json();
    } catch {
      // JSON-parse fehlgeschlagen — Default-Message reicht
    }
    throw new Error(errorPayload.message);
  }

  return res.json();
}

export async function lookupPageSpeed(
  domain: string,
  strategy: PageSpeedStrategy = 'mobile'
): Promise<PageSpeedReport> {
  const res = await fetch(
    `/api/pagespeed?domain=${encodeURIComponent(domain)}&strategy=${encodeURIComponent(strategy)}`
  );

  if (!res.ok) {
    let errorPayload: LookupError = {
      error: 'pagespeed_failed',
      message: `PageSpeed fehlgeschlagen (${res.status})`,
    };
    try {
      errorPayload = await res.json();
    } catch {
      // JSON-parse fehlgeschlagen — Default-Message reicht
    }
    throw new Error(errorPayload.message);
  }

  return res.json();
}
