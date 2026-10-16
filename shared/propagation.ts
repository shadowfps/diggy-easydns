/**
 * Propagation-Vergleich — geteilt zwischen Server (Befund) und Client (Ansicht).
 *
 * Beide müssen dieselbe Antwort als „abweichend“ werten. Würde der Befund
 * „konsistent“ sagen, während die Ansicht einen Resolver als abweichend
 * markiert, wüsste niemand, wem er glauben soll. Deshalb liegen Typauswahl,
 * Normalisierung und Mehrheitsentscheid hier an einer Stelle.
 */

import { isDnsOnlyName } from './dnsName.js';
import type { RecordType, ResolverResult } from './types/dns.js';

/**
 * Welche Record-Typen die Propagation für einen Namen abfragt, wichtigster zuerst.
 *
 * Hosts vergleichen ihre Adressen. DNS-Einträge (`_dmarc`,
 * `<selector>._domainkey`, `_acme-challenge` …) haben keine; dort liegt ein
 * TXT-Record — oder ein CNAME, über den Anbieter wie Microsoft 365 den
 * DKIM-Schlüssel selbst verwalten. Die TXT-Abfrage folgt dem CNAME, vergleicht
 * also auch dann den Schlüssel; der CNAME zeigt zusätzlich, wohin delegiert ist.
 */
export function propagationTypes(name: string): RecordType[] {
  return isDnsOnlyName(name) ? ['TXT', 'CNAME'] : ['A', 'AAAA'];
}

/**
 * Typen, bei denen ein Resolver ohne Antwort als Abweichung zählt.
 *
 * Bei DNS-Einträgen ist das Vorhandensein selbst die Frage: Wer einen neuen
 * DKIM-Selector veröffentlicht, will wissen, ob ihn schon jeder Resolver
 * sieht. Hat ein Resolver den Namen vorher abgefragt, hält er das „gibt es
 * nicht“ bis zum Ablauf des Negativ-Caches — genau dieser Resolver wäre sonst
 * stillschweigend aus dem Vergleich gefallen. Bei Adressen bleibt es beim
 * bisherigen Vergleich der Resolver, die überhaupt antworten.
 */
const PRESENCE_TYPES = new Set<RecordType>(['TXT', 'CNAME']);

/** Eine TXT-Antwort, die nur aus Zeichenketten in Anführungszeichen besteht: `"…" "…"`. */
const QUOTED_TXT = /^\s*"(?:[^"\\]|\\.)*"(?:\s+"(?:[^"\\]|\\.)*")*\s*$/;
const QUOTED_CHUNK = /"((?:[^"\\]|\\.)*)"/g;

/**
 * Vergleichsform eines Werts.
 *
 * Resolver liefern denselben TXT-Record unterschiedlich aus: Google setzt die
 * Stücke zu höchstens 255 Zeichen schon zusammen und lässt die
 * Anführungszeichen weg, Cloudflare, AdGuard und NextDNS liefern
 * `"v=DKIM1; … p=MIIB…" "…IDAQAB"`. Der Server setzt das beim Parsen zusammen;
 * der Vergleich tut es hier noch einmal, damit eine anders gestückelte, aber
 * inhaltlich gleiche Antwort nie als Abweichung zählt — auch nicht, wenn ein
 * Wert ungeparst ankommt oder der Eintrag nur neu gestückelt wurde.
 *
 * Hostnamen (CNAME) sind unabhängig von Groß-/Kleinschreibung und dem
 * abschließenden Punkt, IPv6-Adressen von der Schreibweise der Hex-Ziffern.
 */
export function comparableValue(type: RecordType, value: string): string {
  if (type === 'TXT') {
    if (!QUOTED_TXT.test(value)) return value;
    return [...value.matchAll(QUOTED_CHUNK)]
      .map((m) => m[1].replace(/\\(["\\])/g, '$1'))
      .join('');
  }
  if (type === 'CNAME') return value.toLowerCase().replace(/\.$/, '');
  if (type === 'AAAA') return value.toLowerCase();
  return value;
}

/**
 * - `match`: liefert die Mehrheitsantwort
 * - `mismatch`: weicht ab — bei TXT/CNAME auch „kein Eintrag“, während die
 *   Mehrheit einen hat (oder umgekehrt)
 * - `empty`: kein Eintrag, zählt nicht mit (Adressen, oder niemand hat einen)
 * - `error`: Resolver nicht erreichbar, zählt nie mit
 */
export type ResolverStatus = 'match' | 'mismatch' | 'empty' | 'error';

export interface ResolverAnswer {
  result: ResolverResult;
  /** Werte des verglichenen Typs, sortiert und ohne Dubletten. */
  values: string[];
  /** Gleiche Antworten haben denselben Schlüssel; `''` heißt „kein Eintrag“. */
  key: string;
  status: ResolverStatus;
}

export interface PropagationComparison {
  type: RecordType;
  /** Eine Antwort je Resolver, in der Reihenfolge der Ergebnisse. */
  answers: ResolverAnswer[];
  /** Schlüssel der Mehrheitsantwort; `undefined`, wenn kein Resolver einen Wert liefert. */
  consensusKey: string | undefined;
  /** Resolver, die in den Vergleich eingehen. */
  compared: number;
  /** Davon abweichend. */
  deviating: number;
}

/**
 * Vergleicht die Antworten aller Resolver für einen Record-Typ.
 *
 * Mehrheit statt „alle gleich“: So lässt sich zeigen, WELCHER Resolver
 * abweicht. Bei Gleichstand gewinnt eine Antwort mit Wert vor „kein Eintrag“,
 * sonst die zuerst gesehene — Cloudflare steht vorn und antwortet am
 * aktuellsten.
 */
export function comparePropagation(
  results: ResolverResult[],
  type: RecordType
): PropagationComparison {
  const presenceCounts = PRESENCE_TYPES.has(type);

  const raw = results.map((result) => {
    const byComparable = new Map<string, string>();
    for (const rec of result.records) {
      if (rec.type !== type) continue;
      const comparable = comparableValue(type, rec.value);
      if (!byComparable.has(comparable)) byComparable.set(comparable, rec.value);
    }
    // Sortiert nach Vergleichsform: dieselben Records in anderer Reihenfolge
    // sind dieselbe Antwort.
    const comparables = [...byComparable.keys()].sort();
    return {
      result,
      values: comparables.map((c) => byComparable.get(c)!),
      // JSON statt join(','): TXT-Werte enthalten selbst Kommas.
      key: comparables.length > 0 ? JSON.stringify(comparables) : '',
    };
  });

  const candidates = raw.filter(
    (a) => !a.result.error && (a.key !== '' || presenceCounts)
  );
  const hasValue = candidates.some((a) => a.key !== '');

  let consensusKey: string | undefined;
  if (hasValue) {
    const counts = new Map<string, number>();
    for (const a of candidates) counts.set(a.key, (counts.get(a.key) ?? 0) + 1);
    let best = -1;
    for (const [key, count] of counts) {
      const better =
        count > best || (count === best && consensusKey === '' && key !== '');
      if (better) {
        best = count;
        consensusKey = key;
      }
    }
  }

  const answers: ResolverAnswer[] = raw.map((a) => {
    let status: ResolverStatus;
    if (a.result.error) status = 'error';
    else if (consensusKey === undefined || (a.key === '' && !presenceCounts)) status = 'empty';
    else status = a.key === consensusKey ? 'match' : 'mismatch';
    return { ...a, status };
  });

  return {
    type,
    answers,
    consensusKey,
    compared: consensusKey === undefined ? 0 : candidates.length,
    deviating: answers.filter((a) => a.status === 'mismatch').length,
  };
}

/**
 * Der Typ, den der Befund vergleicht: der erste aus `types`, für den
 * mindestens ein Resolver einen Wert liefert. Bei einem DKIM-Eintrag ist das
 * TXT; liegt dort nur ein CNAME (etwa auf einen noch leeren Anbieter-Eintrag),
 * eben der CNAME.
 */
export function primaryPropagationType(
  results: ResolverResult[],
  types: RecordType[]
): RecordType | undefined {
  return types.find((type) =>
    results.some((r) => !r.error && r.records.some((rec) => rec.type === type))
  );
}

/** Ob bei diesem Typ ein Resolver ohne Antwort als Abweichung zählt. */
export function countsMissingAnswers(type: RecordType): boolean {
  return PRESENCE_TYPES.has(type);
}
