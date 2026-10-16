/**
 * Kurzer Grund für einen gescheiterten Check (#101) — geteilt, damit Finding
 * (Server) und Karte (Client) dasselbe Wort benutzen.
 */

import type { LookupFailure, MailSecurity } from './types/dns.js';

const LABEL: Record<LookupFailure, string> = {
  timeout: 'Zeitüberschreitung',
  servfail: 'SERVFAIL',
  network: 'Netzwerkfehler',
};

/**
 * Nimmt `unknown`, weil der Wert aus einer API-Antwort kommt: ein Server mit
 * dem Stand von #79 meldete nur `lookupFailed: true`.
 */
export function lookupFailureLabel(reason: unknown): string {
  return typeof reason === 'string' && Object.hasOwn(LABEL, reason)
    ? LABEL[reason as LookupFailure]
    : 'Abfrage gescheitert';
}

/** Ob ein Teil des Mail-Audits unbeantwortet blieb (SPF, DMARC, DKIM, MTA-STS). */
export function hasMailLookupFailure(mail: MailSecurity): boolean {
  return Boolean(
    mail.spf.lookupFailed ||
      mail.dmarc.lookupFailed ||
      mail.dkim.lookupFailed ||
      mail.mtaSts.lookupFailed
  );
}
