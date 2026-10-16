/**
 * Kurzer Grund für einen gescheiterten Check (#101) — geteilt, damit Finding
 * (Server) und Karte (Client) dasselbe Wort benutzen.
 */

import type { LookupFailure, MailSecurity, Phrase } from './types/dns.js';
import { phrase } from './phrase.js';

const LABEL: Record<LookupFailure, string> = {
  timeout: 'Zeitüberschreitung',
  servfail: 'SERVFAIL',
  network: 'Netzwerkfehler',
};

/**
 * Nimmt `unknown`, weil der Wert aus einer API-Antwort kommt: ein Server mit
 * dem Stand von #79 meldete nur `lookupFailed: true`. Als Satzbaustein (#86),
 * damit der Client ihn übersetzen kann.
 */
export function lookupFailurePhrase(reason: unknown): Phrase {
  return phrase(
    typeof reason === 'string' && Object.hasOwn(LABEL, reason)
      ? LABEL[reason as LookupFailure]
      : 'Abfrage gescheitert'
  );
}

/** Der Grund auf Deutsch — für die Findings des Servers. */
export function lookupFailureLabel(reason: unknown): string {
  return lookupFailurePhrase(reason).text;
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
