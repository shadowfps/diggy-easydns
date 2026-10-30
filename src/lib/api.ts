import type {
  AuthoritativeResult,
  DetectedTech,
  DnsRecord,
  DnssecInfo,
  DomainCheckReport,
  Finding,
  IpDetails,
  LookupFailure,
  MailSecurity,
  PageSpeedReport,
  PageSpeedStrategy,
  RecordType,
  ResolverResult,
  SslInfo,
  TextParams,
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
async function getJson<T>(
  url: string,
  fallback: LookupError,
  byStatus: Partial<Record<number, string>> = {}
): Promise<T> {
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
      //
      // Cloudflare ersetzt 502 und 504 des Servers durch eine eigene Seite
      // (#147) — dann sagt wenigstens der Status, was passiert ist.
      throw new Error(byStatus[res.status] ?? fallback.message);
    }
    // Testumgebung: Die Sitzung ist abgelaufen (siehe SiteGate.tsx). Neu
    // laden zeigt wieder die Anmeldung, statt jeden Check scheitern zu lassen.
    if (res.status === 401 && payload.error === 'site_locked') window.location.reload();
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
  /** Nur gesetzt, wenn einzelne Typen scheiterten (siehe LookupReport). */
  failedRecordTypes?: RecordType[];
}

export interface SslSection {
  ssl: SslInfo | null;
  findings: Finding[];
  /** Nur wenn der Check scheiterte: `ssl: null` heißt dann „unbekannt“, nicht „kein TLS“. */
  lookupFailed?: LookupFailure;
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
  /** Mit `type` immer leer: der Befund gehört zu den Standard-Typen (#131). */
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

/**
 * Ohne `type` die Standard-Typen des Namens — so lädt der Report. Mit `type`
 * nur dieser, auf Wunsch im Propagation-Tab (#131).
 */
export function lookupPropagation(domain: string, type?: RecordType): Promise<PropagationSection> {
  const typeParam = type ? `&type=${encodeURIComponent(type)}` : '';
  return getJson(`/api/lookup/propagation?domain=${dq(domain)}${typeParam}`, {
    error: 'propagation_failed',
    message: t('Propagation-Check fehlgeschlagen'),
  });
}

/** Die autoritativen Nameserver der Zone, direkt gefragt — nur im Propagation-Tab (#133). */
export function lookupAuthoritative(domain: string, type: RecordType): Promise<AuthoritativeResult> {
  return getJson(`/api/lookup/authoritative?domain=${dq(domain)}&type=${encodeURIComponent(type)}`, {
    error: 'authoritative_failed',
    message: t('Abfrage der autoritativen Nameserver fehlgeschlagen'),
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
  // 504: unser Server hat abgebrochen, 524: Cloudflare nach 100 s.
  const tooSlow = t('Google braucht für die Analyse dieser Seite zu lange. Große Seiten schafft PageSpeed nicht immer — versuch es in ein paar Minuten noch einmal.');
  return getJson(
    `/api/pagespeed?domain=${dq(domain)}&strategy=${encodeURIComponent(strategy)}`,
    { error: 'pagespeed_failed', message: t('PageSpeed fehlgeschlagen') },
    { 504: tooSlow, 524: tooSlow }
  );
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

/* ─── Testumgebung (server/lib/siteGate.ts) ───────────────────────────── */

/** Ist dieser Browser auf der Testumgebung angemeldet? */
export async function fetchSiteGateStatus(): Promise<{ open: boolean }> {
  const res = await fetch('/api/site-gate');
  if (!res.ok) throw new Error(t('Anmeldung fehlgeschlagen.'));
  return res.json();
}

/** Meldet mit dem Passwort an; der Server setzt das Sitzungs-Cookie. */
export async function signInToSite(password: string): Promise<void> {
  const res = await fetch('/api/site-gate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.ok) return;
  let payload: LookupError = { error: 'site_password_wrong', message: t('Anmeldung fehlgeschlagen.') };
  try {
    payload = await res.json();
  } catch {
    // Keine JSON-Antwort — die eigene Meldung reicht.
  }
  throw new ApiError(payload);
}
