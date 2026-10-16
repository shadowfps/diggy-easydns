/**
 * BIMI und TLS-RPT lesen (#83) — geteilt zwischen Server (Lookup, Findings)
 * und Client (Mail-Tab), damit beide dieselbe Regel anwenden.
 *
 * Beide sind ein TXT-Record unter einem festen Namen, der mit einem
 * Versions-Tag beginnt, und von beiden darf es nur einen geben:
 *
 * - **BIMI** (draft-brand-indicators-for-message-identification, §4.3/§7):
 *   `default._bimi.<domain>`, `v=BIMI1; l=<Logo>; a=<Zertifikat>`. Das
 *   Markenlogo, das Postfächer neben authentifizierten Mails zeigen.
 * - **TLS-RPT** (RFC 8460 §3): `_smtp._tls.<domain>`,
 *   `v=TLSRPTv1; rua=<Ziel>[,<Ziel>…]`. Wohin Absender Berichte schicken,
 *   wenn die verschlüsselte Zustellung scheitert — die Rückmeldung zu MTA-STS.
 *
 * Die Tags liest der Parser aus #97 (mailTags.ts), mit dessen Nachsicht bei
 * Leerzeichen um `=` und `;` und bei der Schreibweise der Tag-Namen. Die
 * Version muss dagegen exakt stimmen: RFC 8460 schreibt sie als
 * `%s"v=TLSRPTv1"` (RFC 7405: mit Groß-/Kleinschreibung), und der
 * BIMI-Draft verbietet Empfängern, Schreibfehler zu korrigieren (§4.3). Ein
 * `v=bimi1` werten Empfänger also nicht aus — wir melden es als ungültig
 * statt als fehlend, damit man den Fehler auch findet.
 */

import type { MailBimi, MailSecurity, MailTlsRpt } from './types/dns.js';
import { leadingVersion, matchTag } from './mailTags.js';
import { dmarcPct } from './nullMx.js';
import { dmarcPolicyFlawText, effectiveDmarcPolicy } from './dmarc.js';

type Discovery =
  | { kind: 'none' }
  | { kind: 'one'; record: string }
  | { kind: 'many'; records: string[] }
  | { kind: 'malformed'; record: string; reason: string };

/**
 * Den einen Record mit Versions-Tag finden, so wie Empfänger es tun (BIMI
 * §7.2, RFC 8460 §3): Records, die nicht mit der Version beginnen, fallen
 * weg; was übrig bleibt, muss genau einer sein. Bei zweien werten Empfänger
 * keinen aus.
 *
 * Fällt alles weg, sehen wir noch einmal hin: Ein Record, der die Version an
 * falscher Stelle oder in falscher Schreibweise trägt oder statt ihrer nur das
 * typische Tag (`l=`, `rua=`), war offensichtlich so gemeint. Ihn als „fehlt“
 * zu melden, ließe den Fehler unsichtbar. Andere TXT-Records unter dem Namen
 * (Verifizierungs-Token o. ä.) übergehen wir wie die Empfänger.
 */
function discover(txt: readonly string[], version: string, typicalTag: string): Discovery {
  const matching = txt.filter((record) => leadingVersion(record) === version);
  if (matching.length === 1) return { kind: 'one', record: matching[0] };
  if (matching.length > 1) return { kind: 'many', records: matching };

  const wanted = version.toLowerCase();
  for (const record of txt) {
    const leading = leadingVersion(record);
    if (leading?.toLowerCase() === wanted) {
      return { kind: 'malformed', record, reason: `Die Version muss genau v=${version} lauten, nicht v=${leading}` };
    }
    if (matchTag(record, 'v')?.toLowerCase() === wanted) {
      return { kind: 'malformed', record, reason: `v=${version} muss als erstes Tag stehen` };
    }
    if (leading === undefined && matchTag(record, typicalTag) !== undefined) {
      return { kind: 'malformed', record, reason: `v=${version} fehlt am Anfang` };
    }
  }
  return { kind: 'none' };
}

/* ─── BIMI ────────────────────────────────────────────────────────────── */

/**
 * Pixelformate, die als Logo nicht taugen: BIMI verlangt SVG (Profil „SVG
 * Tiny PS“), und eine URL mit anderer Bild-Endung ist laut §4.3.2 ein
 * dauerhafter Fehler. Prüfen lässt sich ohne Laden nur die Endung — das Logo
 * selbst holen wir bewusst nicht (keine Anfragen an fremde Server).
 */
const RASTER_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'tif', 'tiff']);

/** BIMI-Record aus den TXT-Records von `default._bimi.<domain>`. */
export function parseBimi(txt: readonly string[]): MailBimi {
  const found = discover(txt, 'BIMI1', 'l');
  if (found.kind === 'none') return { present: false };
  if (found.kind === 'malformed') {
    return { present: true, records: [found.record], invalid: found.reason };
  }
  if (found.kind === 'many') {
    return {
      present: true,
      records: found.records,
      invalid: `${found.records.length} BIMI-Records — es darf nur einen geben`,
    };
  }

  const { record } = found;
  const logo = matchTag(record, 'l');
  // Ein fehlendes a= gilt als leer (§4.3).
  const evidence = matchTag(record, 'a') ?? '';
  const bimi: MailBimi = { present: true, records: [record] };
  if (isHttpsUrl(logo)) bimi.logoUrl = logo;
  if (isHttpsUrl(evidence)) bimi.evidenceUrl = evidence;

  const invalid = bimiProblem(logo, evidence);
  if (invalid) bimi.invalid = invalid;
  // Beide leer: ausdrücklicher Verzicht, kein Fehler (§4.3.1).
  else if (logo === '' && evidence === '') bimi.declined = true;
  return bimi;
}

function bimiProblem(logo: string | undefined, evidence: string): string | undefined {
  if (logo === undefined) return 'l= fehlt — das Tag ist Pflicht, zum Verzichten leer';
  if (logo === '') {
    // §7.3: Ohne gültige l=-URL gibt es kein Logo, auch nicht mit Zertifikat.
    return evidence === '' ? undefined : 'l= ist leer, a= aber gesetzt — ohne Logo-URL zeigen Empfänger kein Logo';
  }
  if (!isHttpsUrl(logo)) return 'Die Logo-URL in l= muss mit https:// beginnen';
  if (RASTER_EXTENSIONS.has(extensionOf(logo))) return 'Das Logo muss ein SVG sein (SVG Tiny PS), kein Pixelbild';
  if (evidence !== '' && !isHttpsUrl(evidence)) return 'Die Zertifikats-URL in a= muss mit https:// beginnen';
  return undefined;
}

/**
 * Was an DMARC fehlt, damit Empfänger ein BIMI-Logo zeigen — `undefined`,
 * wenn nichts fehlt. BIMI baut darauf, dass Fälschungen abgewiesen werden:
 * kein Logo bei p=none, bei sp=none und bei p=quarantine mit pct unter 100
 * (§7.1). Für reject nennt der Draft kein pct, denn der Rest landet dort
 * ohnehin in Quarantäne (RFC 7489 §6.6.4).
 *
 * Maßgeblich ist die wirksame Policy (shared/dmarc.ts): Ohne gültiges `p=`
 * gilt höchstens `none` (RFC 7489 §6.6.3), ein `sp=reject` ändert daran
 * nichts. Den Mangel nennen wir mit, sonst stünde dort „p=none“ für einen
 * Record, in dem gar kein `p=` steht.
 */
export function bimiDmarcGap(dmarc: MailSecurity['dmarc']): string | undefined {
  if (!dmarc.present) return 'kein DMARC-Record';
  const { policy, flaw } = effectiveDmarcPolicy(dmarc);
  if (flaw) {
    const problem = dmarcPolicyFlawText(flaw);
    return policy ? `DMARC wirkt wie p=none (${problem})` : `DMARC wirkt nicht (${problem})`;
  }
  if (!policy) return 'kein DMARC-Record';
  if (policy === 'none') return 'DMARC p=none';
  const pct = dmarcPct(dmarc.record);
  if (policy === 'quarantine' && pct < 100) return `DMARC p=quarantine mit pct=${pct}`;
  if (matchTag(dmarc.record, 'sp')?.toLowerCase() === 'none') return 'DMARC sp=none';
  return undefined;
}

/* ─── TLS-RPT ─────────────────────────────────────────────────────────── */

/** TLS-RPT-Record aus den TXT-Records von `_smtp._tls.<domain>`. */
export function parseTlsRpt(txt: readonly string[]): MailTlsRpt {
  const found = discover(txt, 'TLSRPTv1', 'rua');
  if (found.kind === 'none') return { present: false };
  if (found.kind === 'malformed') {
    return { present: true, records: [found.record], invalid: found.reason };
  }
  if (found.kind === 'many') {
    return {
      present: true,
      records: found.records,
      invalid: `${found.records.length} TLS-RPT-Records — RFC 8460 verlangt genau einen`,
    };
  }

  const { record } = found;
  // Mehrere Ziele stehen kommagetrennt in einem rua= (RFC 8460 §3).
  const rua = matchTag(record, 'rua')?.split(',').map((uri) => uri.trim()).filter(Boolean) ?? [];
  const tlsRpt: MailTlsRpt = { present: true, records: [record] };
  if (rua.length === 0) {
    tlsRpt.invalid = 'rua= fehlt — ohne Ziel verschickt niemand Berichte';
    return tlsRpt;
  }
  tlsRpt.rua = rua;
  const unsupported = rua.find((uri) => !isReportUri(uri));
  if (unsupported) tlsRpt.invalid = `„${unsupported}“ ist kein Berichtsziel — erlaubt sind mailto: und https:`;
  return tlsRpt;
}

/** RFC 8460 §3 kennt genau zwei Wege: Mail an eine Adresse oder POST an https. */
function isReportUri(uri: string): boolean {
  if (uri.toLowerCase().startsWith('mailto:')) return uri.includes('@');
  return isHttpsUrl(uri);
}

/* ─── Helfer ──────────────────────────────────────────────────────────── */

/** Beide Standards erlauben nur https — eine `http:`- oder `javascript:`-URL fällt hier raus. */
export function isHttpsUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function extensionOf(url: string): string {
  const path = new URL(url).pathname.toLowerCase();
  const dot = path.lastIndexOf('.');
  return dot > path.lastIndexOf('/') ? path.slice(dot + 1) : '';
}
