import type { LookupReport } from '@/types/dns';

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
