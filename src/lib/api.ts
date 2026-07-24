import type {
  DetectedTech,
  DnsRecord,
  DnssecInfo,
  DomainCheckReport,
  Finding,
  IpDetails,
  MailSecurity,
  PageSpeedReport,
  PageSpeedStrategy,
  ResolverResult,
  SslInfo,
  VirusScanReport,
  WhoisInfo,
} from '@/types/dns';

export interface LookupError {
  error: string;
  message: string;
}

/**
 * GET-Request → JSON, mit einheitlichem Error-Handling.
 * Bei !res.ok wird die Server-Fehlermeldung (falls JSON) geworfen,
 * sonst die übergebene Fallback-Message.
 */
async function getJson<T>(url: string, fallback: LookupError): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let payload = fallback;
    try {
      payload = await res.json();
    } catch {
      // JSON-parse fehlgeschlagen — Fallback-Message reicht
    }
    throw new Error(payload.message);
  }
  return res.json() as Promise<T>;
}

const dq = (domain: string) => encodeURIComponent(domain);

/* ─── Lookup: Primär (Records) + Sektionen ─────────────────────────────── */

/** Schneller Kern-Endpoint: nur DNS-Records + die daraus abgeleiteten Findings. */
export interface LookupCore {
  domain: string;
  timestamp: string;
  records: DnsRecord[];
  findings: Finding[];
}

export interface SslSection {
  ssl: SslInfo | null;
  findings: Finding[];
}
export interface DnssecSection {
  dnssec: DnssecInfo;
  findings: Finding[];
}
export interface MailSection {
  mail: MailSecurity;
  findings: Finding[];
}
export interface WhoisSection {
  whois: WhoisInfo | null;
  findings: Finding[];
}
export interface PropagationSection {
  propagation: ResolverResult[];
  findings: Finding[];
}
export interface TechStackSection {
  techStack: DetectedTech[];
}

/**
 * Holt den schnellen Kern (Records). Die langsamen Sub-Checks werden separat
 * über die lookup*-Funktionen unten nachgeladen.
 */
export function lookupRecords(domain: string): Promise<LookupCore> {
  return getJson(`/api/lookup?domain=${dq(domain)}`, {
    error: 'lookup_failed',
    message: 'Lookup fehlgeschlagen',
  });
}

export function lookupPropagation(domain: string): Promise<PropagationSection> {
  return getJson(`/api/lookup/propagation?domain=${dq(domain)}`, {
    error: 'propagation_failed',
    message: 'Propagation-Check fehlgeschlagen',
  });
}

export function lookupDnssec(domain: string): Promise<DnssecSection> {
  return getJson(`/api/lookup/dnssec?domain=${dq(domain)}`, {
    error: 'dnssec_failed',
    message: 'DNSSEC-Check fehlgeschlagen',
  });
}

export function lookupSsl(domain: string): Promise<SslSection> {
  return getJson(`/api/lookup/ssl?domain=${dq(domain)}`, {
    error: 'ssl_failed',
    message: 'SSL-Check fehlgeschlagen',
  });
}

export function lookupMail(domain: string): Promise<MailSection> {
  return getJson(`/api/lookup/mail?domain=${dq(domain)}`, {
    error: 'mail_failed',
    message: 'Mail-Audit fehlgeschlagen',
  });
}

export function lookupWhois(domain: string): Promise<WhoisSection> {
  return getJson(`/api/lookup/whois?domain=${dq(domain)}`, {
    error: 'whois_failed',
    message: 'WHOIS-Lookup fehlgeschlagen',
  });
}

export function lookupTechStack(domain: string): Promise<TechStackSection> {
  return getJson(`/api/lookup/techstack?domain=${dq(domain)}`, {
    error: 'techstack_failed',
    message: 'Tech-Stack-Erkennung fehlgeschlagen',
  });
}

/* ─── On-Demand-Checks (PageSpeed / VirusTotal) ────────────────────────── */

export function lookupPageSpeed(
  domain: string,
  strategy: PageSpeedStrategy = 'mobile'
): Promise<PageSpeedReport> {
  return getJson(`/api/pagespeed?domain=${dq(domain)}&strategy=${encodeURIComponent(strategy)}`, {
    error: 'pagespeed_failed',
    message: 'PageSpeed fehlgeschlagen',
  });
}

export function lookupVirusScan(domain: string): Promise<VirusScanReport> {
  return getJson(`/api/virusscan?domain=${dq(domain)}`, {
    error: 'virusscan_failed',
    message: 'VirusTotal-Scan fehlgeschlagen',
  });
}

export function lookupIpDetails(ip: string): Promise<IpDetails> {
  return getJson(`/api/ip-details?ip=${encodeURIComponent(ip)}`, {
    error: 'ip_details_failed',
    message: 'IP-Details fehlgeschlagen',
  });
}

export function checkDomainAvailability(query: string): Promise<DomainCheckReport> {
  return getJson(`/api/domain-check?q=${encodeURIComponent(query)}`, {
    error: 'domain_check_failed',
    message: 'Verfügbarkeits-Check fehlgeschlagen',
  });
}

/* ─── Kontaktformular ──────────────────────────────────────────────────── */

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
