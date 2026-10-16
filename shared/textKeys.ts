/**
 * Kennungen für Texte, die der Server liefert (#86).
 *
 * Der Server schreibt seine Findings und Fehlermeldungen weiter auf Deutsch —
 * alte Clients und die API bleiben damit unverändert. Zusätzlich trägt jedes
 * Finding eine Text-Kennung und die Werte, die im Satz stehen (Tage, Domain,
 * Version). Der Client setzt daraus die englische Fassung zusammen; kennt er
 * eine Kennung nicht oder fehlt ein Wert, zeigt er den deutschen Text.
 *
 * Nur Typen: der Client importiert nichts davon zur Laufzeit. Die Listen hier
 * sind der Vertrag — eine neue Kennung im Server scheitert am Compiler, bis
 * sie hier steht, und dann am englischen Wörterbuch, bis sie übersetzt ist.
 */

/**
 * Werte, die in einen Text eingesetzt werden: `{count}` → `params.count`.
 * Ein Wert kann selbst ein Satzbaustein sein (siehe `Phrase`).
 */
export type TextParams = Record<string, string | number | Phrase>;

/**
 * Ein Satzbaustein aus shared/ oder dem Server: „p=foo ist ungültig“,
 * „Zeitüberschreitung“. Server und Client setzen ihn in längere Sätze ein
 * (Findings, Mail-Tab), deshalb reist er als Text plus Werte statt fertig.
 *
 * `text` ist der deutsche Satz mit Platzhaltern und zugleich sein Schlüssel
 * im Wörterbuch der Oberfläche (src/i18n/de.ts), wie bei `t()`. Auf Deutsch
 * setzt `germanText()` (shared/phrase.ts) die Werte ein, im Client
 * übersetzt `phraseText()`.
 */
export interface Phrase {
  text: string;
  params?: TextParams;
}

/**
 * Text-Kennung eines Findings. Meist gleich der `id`; abweichend, wenn eine
 * `id` mehrere Sätze kennt (Apex oder Host, mit oder ohne MX) oder selbst
 * dynamisch ist (`spf-issue-…`).
 */
export type FindingKey =
  // Gescheiterte Checks (#101), für alle Bereiche gleich
  | 'unchecked'
  // DNS-Basics
  | 'no-records'
  | 'no-address'
  | 'no-address-host'
  | 'no-ipv6'
  | 'no-ipv6-host'
  | 'no-ns'
  | 'no-caa'
  | 'caa-present'
  // Mail
  | 'no-spf'
  | 'no-spf-no-mx'
  | SpfIssueKey
  | 'spf-issue'
  | 'spf-ok'
  | 'no-dmarc'
  | 'no-dmarc-null-mx'
  | 'dmarc-ignored'
  | 'dmarc-policy-none'
  | 'dmarc-as-none'
  | 'dmarc-sp-invalid'
  | 'dmarc-present'
  | 'no-dkim-found'
  | 'dkim-present'
  | 'no-mta-sts'
  | 'no-tls-rpt'
  | 'no-tls-rpt-mta-sts'
  | 'tls-rpt-invalid'
  | 'tls-rpt-present'
  | 'bimi-needs-dmarc'
  | 'no-bimi'
  | 'bimi-invalid'
  | 'bimi-dmarc-weak'
  | 'bimi-present'
  | 'bimi-present-no-vmc'
  | 'null-mx'
  | 'null-mx-complete'
  | 'null-mx-incomplete'
  // DNSSEC
  | 'dnssec-off'
  | 'dnssec-incomplete'
  | 'dnssec-invalid'
  | 'dnssec-valid'
  | 'dnssec-valid-no-algorithm'
  // SSL
  | 'no-ssl'
  | 'ssl-invalid'
  | 'ssl-expired'
  | 'ssl-expiring-soon'
  | 'ssl-ok'
  | 'ssl-old-tls'
  // Propagation
  | 'propagation-mismatch'
  | 'propagation-mismatch-entry'
  | 'propagation-consistent'
  | 'propagation-consistent-entry'
  // WHOIS
  | 'domain-expired'
  | 'domain-expiring-critical'
  | 'domain-expiring-soon'
  | 'whois-status-clienthold'
  | 'whois-status-serverhold'
  | 'whois-status-pendingdelete'
  | 'whois-status-pendingrestore'
  | 'whois-status-redemptionperiod'
  | 'domain-young';

/** Probleme eines SPF-Records — als Finding und in der Mail-Ansicht. */
export type SpfIssueKey =
  | 'spf-lookups-over-limit'
  | 'spf-lookups-near-limit'
  | 'spf-plus-all'
  | 'spf-no-all';

/** Kennung plus Werte — die übersetzbare Form eines deutschen Satzes. */
export interface TextRef<K extends string = string> {
  key: K;
  params?: TextParams;
}

/**
 * Fehlercodes im JSON-Body (`{ error, message }`). Der Client übersetzt
 * nach Code; `params` liefert der Server, wo die Meldung Werte enthält.
 */
export type ApiErrorCode =
  | 'cross_site_denied'
  | 'cross_origin_denied'
  | 'rate_limited'
  | 'quota_rate_limited'
  | 'server_busy'
  | 'not_a_hostname'
  | 'invalid_domain'
  | 'blocked_target'
  | 'invalid_ip'
  | 'domain_not_found'
  | 'invalid_query'
  | 'lookup_failed'
  | 'propagation_failed'
  | 'dnssec_failed'
  | 'ssl_failed'
  | 'mail_failed'
  | 'whois_failed'
  | 'techstack_failed'
  | 'ip_details_failed'
  | 'pagespeed_failed'
  | 'virusscan_failed'
  | 'domain_check_failed'
  | 'contact_not_configured'
  | 'contact_rate_limited'
  | 'contact_challenge_failed'
  | 'contact_invalid_input'
  | 'contact_failed';
