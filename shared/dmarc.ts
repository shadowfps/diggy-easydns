/**
 * Die DMARC-Policy, nach der Empfänger tatsächlich handeln (#107) — geteilt
 * zwischen Server (Findings) und Client (Mail-Tab, Schnellübersicht), damit
 * alle dieselbe Regel anwenden.
 *
 * Maßgeblich ist RFC 7489 §6.6.3:
 *
 * - **Schritt 5:** Stehen unter `_dmarc.<domain>` mehrere Records mit
 *   `v=DMARC1`, wenden Empfänger DMARC gar nicht an — egal, was darin steht.
 * - **Schritt 6:** `p=` ist Pflicht (§6.3). Fehlt es, steht dort etwas
 *   anderes als none, quarantine oder reject, oder ist ein vorhandenes `sp=`
 *   ungültig, dann gilt:
 *   - **Mit gültiger Report-Adresse in `rua=`** handeln Empfänger, als
 *     stünde dort nur `p=none`: Sie schicken Berichte, lehnen aber nichts ab
 *     — auch nicht bei `p=reject; sp=foo`.
 *   - **Ohne** wenden sie DMARC gar nicht an — der Record wirkt wie keiner.
 *
 * Ein gültiges `sp=` springt dabei nicht für `p=` ein: Es regelt nur
 * Subdomains und ergänzt `p=`, statt es zu ersetzen (§6.3). Auch `pct=`
 * zählt nur neben einem gültigen `p=` — beim Ersatz-`none` gibt es nichts,
 * das anteilig gelten könnte.
 *
 * Vorher galt jeder Record mit `v=DMARC1` als „Policy gesetzt“, auch
 * `v=DMARC1; sp=reject` — den Empfänger schlicht ignorieren.
 */

import type { MailSecurity } from './types/dns.js';
import { matchTag } from './mailTags.js';

export type DmarcPolicy = NonNullable<MailSecurity['dmarc']['policy']>;

/**
 * Warum Empfänger den Record nicht so anwenden, wie er dasteht: `p=` fehlt
 * oder ist ungültig, `sp=` ist ungültig (dann mit dem `p=`, das deshalb
 * nicht gilt), oder es gibt mehr als einen Record.
 */
export type DmarcPolicyFlaw =
  | { kind: 'p-missing' }
  | { kind: 'p-invalid'; value: string }
  | { kind: 'sp-invalid'; value: string; declared: DmarcPolicy }
  | { kind: 'multiple'; count: number };

export interface EffectiveDmarcPolicy {
  /**
   * Die Policy, nach der Empfänger handeln. `null`: Sie wenden DMARC nicht
   * an — weil es keinen Record gibt oder weil sie ihn ignorieren.
   */
  policy: DmarcPolicy | null;
  /** Nur bei einem Record, der nicht wie geschrieben gilt: was damit nicht stimmt. */
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
 * Die wirksame Policy, so wie der Lookup DMARC liefert. Alle Bewertungen —
 * Findings, Null-MX, BIMI, Mail-Tab, Verlauf — fragen hier, nicht nach
 * `MailSecurity['dmarc'].policy`: Das ist nur das gültige `p=` und fehlt
 * auch dort, wo Empfänger ersatzweise `none` anwenden.
 */
export function effectiveDmarcPolicy(dmarc: MailSecurity['dmarc'] | undefined): EffectiveDmarcPolicy {
  if (!dmarc?.present || dmarc.record === undefined) return { policy: null };

  // Schritt 5: Bei mehreren Records zählt keiner, auch kein p=reject.
  const count = dmarc.records?.length ?? 1;
  if (count > 1) return { policy: null, flaw: { kind: 'multiple', count } };

  const flaw = recordFlaw(dmarc.record);
  if (!flaw) return { policy: declaredDmarcPolicy(dmarc.record) ?? null };
  return { policy: hasDmarcReportUri(dmarc.record) ? 'none' : null, flaw };
}

/** Was nach §6.6.3 Schritt 6 an `p=` oder `sp=` nicht stimmt — `undefined`: nichts. */
function recordFlaw(record: string): DmarcPolicyFlaw | undefined {
  const declared = declaredDmarcPolicy(record);
  if (!declared) {
    const value = matchTag(record, 'p');
    return value === undefined ? { kind: 'p-missing' } : { kind: 'p-invalid', value };
  }
  // sp= ist optional (ohne gilt p= auch für Subdomains), aber wenn, dann gültig.
  const sp = matchTag(record, 'sp');
  if (sp !== undefined && !isDmarcPolicy(sp.toLowerCase())) {
    return { kind: 'sp-invalid', value: sp, declared };
  }
  return undefined;
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

/** Ein ungültiger Tag-Wert als Satzteil: „p=foo ist ungültig“, „sp= ist leer“. */
function invalidTagText(tag: 'p' | 'sp', value: string): string {
  if (value === '') return `${tag}= ist leer`;
  const shown = value.length > MAX_SHOWN_VALUE ? `${value.slice(0, MAX_SHOWN_VALUE)}…` : value;
  return `${tag}=${shown} ist ungültig`;
}

/** Der Mangel als Satzteil, mit dem ungültigen Wert: „p=foo ist ungültig“. */
export function dmarcPolicyFlawText(flaw: DmarcPolicyFlaw): string {
  switch (flaw.kind) {
    case 'p-missing':
      return 'p= fehlt';
    case 'p-invalid':
      return invalidTagText('p', flaw.value);
    case 'sp-invalid':
      return invalidTagText('sp', flaw.value);
    case 'multiple':
      return `${flaw.count} DMARC-Records statt einem`;
  }
}

/** Der Mangel in zwei Wörtern, für Badges und knappe Statuswerte. */
export function dmarcPolicyFlawLabel(flaw: DmarcPolicyFlaw): string {
  switch (flaw.kind) {
    case 'p-missing':
      return 'p= fehlt';
    case 'p-invalid':
      return 'p= ungültig';
    case 'sp-invalid':
      return 'sp= ungültig';
    case 'multiple':
      return `${flaw.count} Records`;
  }
}

/**
 * Was der Mangel bewirkt, als ganzer Satz ohne Fachwissen — für Mail-Tab
 * und Findings, damit beide dasselbe sagen. `policy` ist die wirksame
 * Policy aus `effectiveDmarcPolicy`: `none` oder `null`.
 */
export function dmarcFlawEffect(policy: DmarcPolicy | null, flaw: DmarcPolicyFlaw): string {
  if (flaw.kind === 'multiple') {
    return 'Bei mehr als einem DMARC-Record wenden Empfänger DMARC gar nicht an (RFC 7489 §6.6.3) — als gäbe es keins.';
  }
  if (flaw.kind === 'sp-invalid') {
    const spoiled = `Ein ungültiges sp= macht den ganzen Record ungültig, auch p=${flaw.declared}.`;
    return policy
      ? `${spoiled} Weil rua= eine Report-Adresse nennt, werten Empfänger ihn wie p=none (RFC 7489 §6.6.3): Fälschungen werden gemeldet, aber nicht abgelehnt.`
      : `${spoiled} Ohne gültige Report-Adresse in rua= ignorieren Empfänger ihn (RFC 7489 §6.6.3) — als gäbe es kein DMARC.`;
  }
  return policy
    ? 'Ohne gültiges p= werten Empfänger den Record wie p=none, weil rua= eine Report-Adresse nennt (RFC 7489 §6.6.3): Fälschungen werden gemeldet, aber nicht abgelehnt.'
    : 'Ohne gültiges p= und ohne gültige Report-Adresse in rua= ignorieren Empfänger den Record (RFC 7489 §6.6.3) — als gäbe es kein DMARC.';
}
