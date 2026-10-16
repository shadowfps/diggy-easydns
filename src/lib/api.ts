import type {
  DetectedTech,
  DnsRecord,
  DnssecInfo,
  DomainCheckReport,
  Finding,
  IpDetails,
  TextParams,
  MailSecurity,
  PageSpeedReport,
  PageSpeedStrategy,
  ResolverResult,
  SslInfo,
  VirusScanReport,
  WhoisInfo,
} from '@/types/dns';
import { t } from '@/i18n';

export interface LookupError {
  error: string;
  message: string;
  /** Werte aus `message`, damit der Client sie übersetzen kann (#86). */
  params?: TextParams;
}

/**
 * Fehler mit dem Code des Servers, nicht nur mit der Meldung.
 *
 * Gebraucht vom Kontaktformular: es muss `contact_invalid_input` von den
 * übrigen Fehlern unterscheiden können, weil der Server die Felder VOR der
 * Token-Entwertung prüft. Ohne den Code warf das Formular bei jedem Tippfehler
 * einen noch gültigen Challenge-Token weg.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly params?: TextParams;

  constructor(payload: LookupError) {
    super(payload.message);
    this.name = 'ApiError';
    this.code = payload.error;
    this.params = payload.params;
  }
}

/**
 * GET-Request → JSON, mit einheitlichem Error-Handling.
 * Bei !res.ok wird die Server-Fehlermeldung (falls JSON) geworfen,
 * sonst die übergebene Fallback-Message.
 */
async function getJson<T>(url: string, fallback: LookupError): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let payload: LookupError;
    try {
      payload = await res.json();
    } catch {
      // Keine JSON-Antwort (Fehlerseite eines Proxys, Timeout): die eigene,
      // schon übersetzte Meldung — ohne Code. Der Code steht für die Meldung
      // des Servers, und deren englische Fassung kann enger sein als „ging
      // nicht“: `domain_check_failed` meint eine ungültige Eingabe.
      throw new Error(fallback.message);
    }
    // ApiError statt Error: der Code reist mit, die Oberfläche kann daran
    // übersetzen (#86). `message` bleibt dieselbe wie bisher.
    throw new ApiError(payload);
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
    message: t('Lookup fehlgeschlagen'),
  });
}

export function lookupPropagation(domain: string): Promise<PropagationSection> {
  return getJson(`/api/lookup/propagation?domain=${dq(domain)}`, {
    error: 'propagation_failed',
    message: t('Propagation-Check fehlgeschlagen'),
  });
}

export function lookupDnssec(domain: string): Promise<DnssecSection> {
  return getJson(`/api/lookup/dnssec?domain=${dq(domain)}`, {
    error: 'dnssec_failed',
    message: t('DNSSEC-Check fehlgeschlagen'),
  });
}

export function lookupSsl(domain: string): Promise<SslSection> {
  return getJson(`/api/lookup/ssl?domain=${dq(domain)}`, {
    error: 'ssl_failed',
    message: t('SSL-Check fehlgeschlagen'),
  });
}

export function lookupMail(domain: string): Promise<MailSection> {
  return getJson(`/api/lookup/mail?domain=${dq(domain)}`, {
    error: 'mail_failed',
    message: t('Mail-Audit fehlgeschlagen'),
  });
}

export function lookupWhois(domain: string): Promise<WhoisSection> {
  return getJson(`/api/lookup/whois?domain=${dq(domain)}`, {
    error: 'whois_failed',
    message: t('WHOIS-Lookup fehlgeschlagen'),
  });
}

export function lookupTechStack(domain: string): Promise<TechStackSection> {
  return getJson(`/api/lookup/techstack?domain=${dq(domain)}`, {
    error: 'techstack_failed',
    message: t('Tech-Stack-Erkennung fehlgeschlagen'),
  });
}

/* ─── On-Demand-Checks (PageSpeed / VirusTotal) ────────────────────────── */

export function lookupPageSpeed(
  domain: string,
  strategy: PageSpeedStrategy = 'mobile'
): Promise<PageSpeedReport> {
  return getJson(`/api/pagespeed?domain=${dq(domain)}&strategy=${encodeURIComponent(strategy)}`, {
    error: 'pagespeed_failed',
    message: t('PageSpeed fehlgeschlagen'),
  });
}

export function lookupVirusScan(domain: string): Promise<VirusScanReport> {
  return getJson(`/api/virusscan?domain=${dq(domain)}`, {
    error: 'virusscan_failed',
    message: t('VirusTotal-Scan fehlgeschlagen'),
  });
}

export function lookupIpDetails(ip: string): Promise<IpDetails> {
  return getJson(`/api/ip-details?ip=${encodeURIComponent(ip)}`, {
    error: 'ip_details_failed',
    message: t('IP-Details fehlgeschlagen'),
  });
}

export function checkDomainAvailability(query: string): Promise<DomainCheckReport> {
  return getJson(`/api/domain-check?q=${encodeURIComponent(query)}`, {
    error: 'domain_check_failed',
    message: t('Verfügbarkeits-Check fehlgeschlagen'),
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
    throw new Error(t('Kontaktformular konnte nicht geladen werden.'));
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
      message: t('Nachricht konnte nicht gesendet werden ({status})', { status: res.status }),
    };
    try {
      errorPayload = await res.json();
    } catch {
      // JSON-parse fehlgeschlagen — Default-Message reicht
    }
    throw new ApiError(errorPayload);
  }

  return res.json();
}
