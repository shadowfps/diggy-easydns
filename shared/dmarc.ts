/**
 * Die DMARC-Policy, nach der Empfänger tatsächlich handeln (#107) — geteilt
 * zwischen Server (Findings) und Client (Mail-Tab, Schnellübersicht), damit
 * alle dieselbe Regel anwenden.
 *
 * `p=` ist Pflicht: RFC 7489 §6.3 verlangt `v=` und `p=` in jedem
 * Policy-Record. Fehlt es oder steht dort etwas anderes als none, quarantine
 * oder reject, gilt §6.6.3 (Schritt 6):
 *
 * - **Mit gültiger Report-Adresse in `rua=`** handeln Empfänger, als stünde
 *   dort `p=none`: Sie schicken Berichte, lehnen aber nichts ab.
 * - **Ohne** wenden sie DMARC gar nicht an — der Record wirkt wie keiner.
 *
 * Ein gültiges `sp=` springt dabei nicht ein: Es regelt nur Subdomains und
 * ergänzt `p=`, statt es zu ersetzen (§6.3). Auch `pct=` zählt nur neben
 * einem gültigen `p=` — beim Ersatz-`none` gibt es nichts, das anteilig
 * gelten könnte.
 *
 * Vorher galt jeder Record mit `v=DMARC1` als „Policy gesetzt“, auch
 * `v=DMARC1; sp=reject` — den Empfänger schlicht ignorieren.
 */

import type { MailSecurity } from './types/dns.js';
import { matchTag } from './mailTags.js';

export type DmarcPolicy = NonNullable<MailSecurity['dmarc']['policy']>;

/** Warum `p=` nicht zählt: Es fehlt, oder sein Wert ist keine der drei Policies. */
export type DmarcPolicyFlaw = { kind: 'p-missing' } | { kind: 'p-invalid'; value: string };

export interface EffectiveDmarcPolicy {
  /**
   * Die Policy, nach der Empfänger handeln. `null`: Sie wenden DMARC nicht
   * an — weil es keinen Record gibt oder weil sie ihn ignorieren.
   */
  policy: DmarcPolicy | null;
  /** Nur bei einem Record ohne gültiges `p=`: was damit nicht stimmt. */
  flaw?: DmarcPolicyFlaw;
}

export function isDmarcPolicy(value: string | undefined): value is DmarcPolicy {
  return value === 'none' || value === 'quarantine' || value === 'reject';
}

/**
 * `p=` aus dem Record, aber nur, wenn der Wert gültig ist. Policy-Werte sind
 * unabhängig von der Schreibweise; normalisiert wird erst hier (mailTags.ts
 * lässt Werte unverändert).
 */
export function declaredDmarcPolicy(record: string | undefined): DmarcPolicy | undefined {
  const value = matchTag(record, 'p')?.toLowerCase();
  return isDmarcPolicy(value) ? value : undefined;
}

/**
 * Die wirksame Policy eines DMARC-Records (`undefined`: kein Record). Alle
 * Bewertungen — Findings, Null-MX, BIMI, Mail-Tab — fragen hier, nicht nach
 * `MailSecurity['dmarc'].policy`: Das ist nur das gültige `p=` und fehlt
 * auch dort, wo Empfänger ersatzweise `none` anwenden.
 */
export function effectiveDmarcPolicy(record: string | undefined): EffectiveDmarcPolicy {
  if (record === undefined) return { policy: null };

  const declared = declaredDmarcPolicy(record);
  if (declared) return { policy: declared };

  const value = matchTag(record, 'p');
  const flaw: DmarcPolicyFlaw = value === undefined ? { kind: 'p-missing' } : { kind: 'p-invalid', value };
  return { policy: hasDmarcReportUri(record) ? 'none' : null, flaw };
}

/**
 * Ein URI nach RFC 3986 beginnt mit Schema und Doppelpunkt; dahinter muss
 * etwas stehen, sonst ist es kein Ziel. Ein angehängtes Größenlimit
 * (`!10m`) gehört zur DMARC-Syntax (RFC 7489 §6.2), Leerraum und `!` im
 * URI selbst nicht.
 */
const DMARC_URI = /^[a-z][a-z0-9+.-]*:[^\s!]+(?:!\d+[kmgt]?)?$/i;

/**
 * `rua=` mit mindestens einem syntaktisch gültigen URI — die Bedingung aus
 * RFC 7489 §6.6.3, unter der ein Record ohne gültiges `p=` als `p=none`
 * weiterlebt. Ein `rua=dmarc@example.com` ohne `mailto:` reicht dafür nicht.
 */
export function hasDmarcReportUri(record: string | undefined): boolean {
  const rua = matchTag(record, 'rua');
  return rua?.split(',').some((uri) => DMARC_URI.test(uri.trim())) ?? false;
}

/** Werte aus fremdem DNS können beliebig lang sein — im Text nur der Anfang. */
const MAX_SHOWN_VALUE = 20;

/** Der Mangel als Satzteil, mit dem ungültigen Wert: „p=foo ist ungültig“. */
export function dmarcPolicyFlawText(flaw: DmarcPolicyFlaw): string {
  if (flaw.kind === 'p-missing') return 'p= fehlt';
  if (flaw.value === '') return 'p= ist leer';
  const shown =
    flaw.value.length > MAX_SHOWN_VALUE ? `${flaw.value.slice(0, MAX_SHOWN_VALUE)}…` : flaw.value;
  return `p=${shown} ist ungültig`;
}

/** Der Mangel in zwei Wörtern, für Badges und knappe Statuswerte. */
export function dmarcPolicyFlawLabel(flaw: DmarcPolicyFlaw): string {
  return flaw.kind === 'p-missing' ? 'p= fehlt' : 'p= ungültig';
}
