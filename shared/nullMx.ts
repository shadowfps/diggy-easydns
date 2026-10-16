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
import { matchTag } from './mailTags.js';
import { effectiveDmarcPolicy } from './dmarc.js';

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

/** Modifier haben die Form `name=wert` (RFC 7208 §4.6.1), Mechanismen nie. */
const SPF_MODIFIER = /^[a-z][a-z0-9._-]*=/;

/**
 * Die Mechanismen eines SPF-Records, kleingeschrieben, ohne Versions-Tag und
 * Modifier (`exp=`, `redirect=` …). `undefined`, wenn es kein SPF-Record ist.
 */
export function spfMechanisms(record: string): string[] | undefined {
  const [version, ...terms] = record.trim().toLowerCase().split(/\s+/);
  if (version !== 'v=spf1') return undefined;
  return terms.filter((term) => !SPF_MODIFIER.test(term));
}

/**
 * `-all` als einziger Mechanismus: niemand darf im Namen der Domain senden.
 *
 * Bewusst so streng. Ein `~all` markiert Fälschungen nur als verdächtig
 * (Softfail), und jeder weitere Mechanismus (`include:`, `a`, `ip4:` …)
 * erlaubt Absender — beides passt nicht zu einer Domain ohne Mail.
 *
 * Modifier ändern daran nichts: `exp=` liefert nur den Text zur Ablehnung,
 * und `redirect=` wird neben `all` ignoriert (RFC 7208 §6.1). Ohne `all`
 * dagegen gibt `redirect=` die Entscheidung an einen anderen Record ab —
 * `v=spf1 redirect=…` zählt deshalb nicht.
 */
export function spfAllowsNoSender(record?: string): boolean {
  if (!record) return false;
  const mechanisms = spfMechanisms(record);
  return mechanisms?.length === 1 && mechanisms[0] === '-all';
}

/**
 * Anteil der Mails in Prozent, auf den die DMARC-Policy angewendet wird
 * (`pct`, RFC 7489 §6.3); ohne Tag oder bei ungültigem Wert 100. Für den Rest
 * gilt die nächstschwächere Policy (§6.6.4): `p=reject; pct=0` lehnt also
 * nichts ab, sondern stellt Fälschungen nur unter Quarantäne.
 */
export function dmarcPct(record?: string): number {
  const value = matchTag(record, 'pct');
  return value === undefined || !/^\d+$/.test(value) ? 100 : Math.min(Number(value), 100);
}

export interface NoMailProtection {
  /** SPF erlaubt niemanden (`v=spf1 -all`). */
  spfAllowsNoSender: boolean;
  /**
   * DMARC `p=reject` für alle Mails (kein `pct` unter 100): Empfänger weisen
   * Mails ab, die sich als die Domain ausgeben.
   */
  dmarcReject: boolean;
  /** Null-MX, SPF -all und DMARC reject — die vollständige Markierung. */
  complete: boolean;
}

/**
 * Wie gut eine Domain mit Null-MX gegen Fälschungen in ihrem Namen geschützt ist.
 *
 * DMARC zählt mit der wirksamen Policy (shared/dmarc.ts): Ohne gültiges `p=`
 * oder mit ungültigem `sp=` ist sie höchstens `none` (RFC 7489 §6.6.3) —
 * auch neben `sp=reject` bzw. `p=reject`. `reject` kommt also immer aus
 * einem gültigen `p=`, und nur dann ist `pct` überhaupt von Belang.
 */
export function noMailProtection(mail: Pick<MailSecurity, 'spf' | 'dmarc' | 'nullMx'>): NoMailProtection {
  const spf = spfAllowsNoSender(mail.spf.record);
  const dmarc =
    effectiveDmarcPolicy(mail.dmarc).policy === 'reject' && dmarcPct(mail.dmarc.record) === 100;
  return {
    spfAllowsNoSender: spf,
    dmarcReject: dmarc,
    complete: mail.nullMx && spf && dmarc,
  };
}
