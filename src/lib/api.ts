import type { DomainCheckReport, IpDetails, LookupReport, PageSpeedReport, PageSpeedStrategy, VirusScanReport } from '@/types/dns';

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

export async function lookupVirusScan(domain: string): Promise<VirusScanReport> {
  const res = await fetch(`/api/virusscan?domain=${encodeURIComponent(domain)}`);

  if (!res.ok) {
    let errorPayload: LookupError = {
      error: 'virusscan_failed',
      message: `VirusTotal-Scan fehlgeschlagen (${res.status})`,
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

export async function lookupIpDetails(ip: string): Promise<IpDetails> {
  const res = await fetch(`/api/ip-details?ip=${encodeURIComponent(ip)}`);

  if (!res.ok) {
    let errorPayload: LookupError = {
      error: 'ip_details_failed',
      message: `IP-Details fehlgeschlagen (${res.status})`,
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

export async function checkDomainAvailability(query: string): Promise<DomainCheckReport> {
  const res = await fetch(`/api/domain-check?q=${encodeURIComponent(query)}`);

  if (!res.ok) {
    let errorPayload: LookupError = {
      error: 'domain_check_failed',
      message: `Verfügbarkeits-Check fehlgeschlagen (${res.status})`,
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

export interface ContactMessagePayload {
  name: string;
  email: string;
  message: string;
  website?: string;
  company?: string;
  token: string;
}

export async function fetchContactChallenge(): Promise<{ token: string; minDelayMs: number }> {
  const res = await fetch('/api/contact/challenge');
  if (!res.ok) {
    throw new Error('Kontaktformular konnte nicht geladen werden.');
  }
  return res.json();
}

export async function sendContactMessage(
  payload: ContactMessagePayload
): Promise<{ sent: boolean }> {
  const res = await fetch('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errorPayload: LookupError = {
      error: 'contact_failed',
      message: `Nachricht konnte nicht gesendet werden (${res.status})`,
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
