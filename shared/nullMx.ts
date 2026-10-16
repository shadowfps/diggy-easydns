/**
 * Domains ohne Mailverkehr erkennen (#77) — geteilt zwischen Server
 * (Findings) und Client (Schnellübersicht, Mail-Tab), damit beide dieselbe
 * Regel anwenden.
 *
 * Die Regel:
 *
 * - **Entscheidend ist allein der Null-MX** nach RFC 7505: genau ein MX mit
 *   Präferenz 0 und leerem Ziel (`MX 0 .`). Er sagt jedem Absender
 *   verbindlich, dass hier niemand Mail annimmt, und die Domain soll auch
 *   nicht als Absender auftreten — sie könnte ja keine Bounces empfangen
 *   (RFC 7505 §4.2). DKIM (signiert ausgehende Mail) und MTA-STS (schützt
 *   eingehende) haben dort nichts zu tun; die Hinweise darauf wären sinnlos.
 * - **`SPF -all` allein macht eine Domain nicht mail-frei.** Hat sie gar keinen
 *   MX, stellen Absender per A-/AAAA-Fallback (RFC 5321 §5.1) trotzdem an den
 *   Host zu; sie empfängt also weiter. SPF regelt nur, wer senden darf.
 * - **Zusammen mit dem Null-MX bestätigt `SPF -all` die Absicht** auch für
 *   den Versand, und DMARC `p=reject` lässt Empfänger Mails abweisen, die sich
 *   als diese Domain ausgeben. Erst alle drei zusammen sind die vollständige
 *   Markierung „keine Mail“, wie sie z. B. die M3AAWG für geparkte Domains
 *   empfiehlt. Fehlt SPF oder DMARC, bleibt die Domain mail-frei — nur der
 *   Schutz vor Fälschungen in ihrem Namen ist dann unvollständig.
 */

import type { MailSecurity } from './types/dns.js';

/** Ein MX-Eintrag, wie ihn `resolveMx` (exchange) oder ein DnsRecord (value) liefert. */
export interface MxEntry {
  priority?: number;
  value: string;
}

/**
 * Null-MX nach RFC 7505 §3: genau ein MX mit Präferenz 0 und leerem Ziel.
 *
 * Das Ziel kommt je nach Quelle verschieden an: `resolveMx` und unser
 * DoH-Parser (der den Punkt am Ende abschneidet) liefern `""`, die
 * Zonendatei-Schreibweise ist `"."`. Beides ist die Wurzel, also leer.
 *
 * „Genau ein“, weil RFC 7505 neben dem Null-MX keine weiteren MX erlaubt.
 * Steht doch noch ein echter daneben, stellen Absender dorthin zu — die
 * Domain empfängt dann Mail und wird wie jede andere bewertet.
 */
export function isNullMx(mx: readonly MxEntry[]): boolean {
  if (mx.length !== 1) return false;
  const [only] = mx;
  return only.priority === 0 && (only.value === '' || only.value === '.');
}

/**
 * `v=spf1 -all` und sonst nichts: niemand darf im Namen der Domain senden.
 *
 * Bewusst so streng. Ein `~all` markiert Fälschungen nur als verdächtig
 * (Softfail), und jeder weitere Mechanismus (`include:`, `a`, `ip4:` …)
 * erlaubt Absender — beides passt nicht zu einer Domain ohne Mail.
 */
export function spfAllowsNoSender(record?: string): boolean {
  if (!record) return false;
  const terms = record.trim().toLowerCase().split(/\s+/);
  return terms.length === 2 && terms[0] === 'v=spf1' && terms[1] === '-all';
}

export interface NoMailProtection {
  /** SPF erlaubt niemanden (`v=spf1 -all`). */
  spfAllowsNoSender: boolean;
  /** DMARC `p=reject`: Empfänger weisen Mails ab, die sich als die Domain ausgeben. */
  dmarcReject: boolean;
  /** Null-MX, SPF -all und DMARC reject — die vollständige Markierung. */
  complete: boolean;
}

/** Wie gut eine Domain mit Null-MX gegen Fälschungen in ihrem Namen geschützt ist. */
export function noMailProtection(mail: Pick<MailSecurity, 'spf' | 'dmarc' | 'nullMx'>): NoMailProtection {
  const spf = spfAllowsNoSender(mail.spf.record);
  const dmarc = mail.dmarc.present && mail.dmarc.policy === 'reject';
  return {
    spfAllowsNoSender: spf,
    dmarcReject: dmarc,
    complete: mail.nullMx && spf && dmarc,
  };
}
