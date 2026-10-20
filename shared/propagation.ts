/**
 * Propagation-Vergleich — geteilt zwischen Server (Befund) und Client (Ansicht).
 *
 * Beide müssen dieselbe Antwort als „abweichend“ werten. Würde der Befund
 * „konsistent“ sagen, während die Ansicht einen Resolver als abweichend
 * markiert, wüsste niemand, wem er glauben soll. Deshalb liegen Typauswahl,
 * Normalisierung und Mehrheitsentscheid hier an einer Stelle.
 */

import { isDnsOnlyName } from './dnsName.js';
import type { DnsRecord, RecordType, ResolverResult } from './types/dns.js';

/**
 * Die Record-Typen, die sich im Propagation-Tab wählen lassen (#131), in der
 * Reihenfolge der Auswahl. Die API prüft `?type=` gegen genau diese Liste, der
 * Link (`?propagation=MX`) ebenso.
 */
export const PROPAGATION_RECORD_TYPES = [
  'A',
  'AAAA',
  'CNAME',
  'MX',
  'NS',
  'TXT',
  'CAA',
  'SOA',
] as const satisfies readonly RecordType[];

export type PropagationRecordType = (typeof PROPAGATION_RECORD_TYPES)[number];

/**
 * Ein Typ aus URL oder Query, ohne Rücksicht auf Groß-/Kleinschreibung
 * (`mx` → `MX`). `null` für alles andere, auch für einen mehrfach
 * angegebenen Parameter (kommt als Array an).
 */
export function parsePropagationType(value: unknown): PropagationRecordType | null {
  if (typeof value !== 'string') return null;
  const type = value.trim().toUpperCase();
  return PROPAGATION_RECORD_TYPES.find((known) => known === type) ?? null;
}

/**
 * Welche Record-Typen die Propagation für einen Namen abfragt, wichtigster zuerst.
 *
 * Hosts vergleichen ihre Adressen. DNS-Einträge (`_dmarc`,
 * `<selector>._domainkey`, `_acme-challenge` …) haben keine; dort liegt ein
 * TXT-Record — oder ein CNAME, über den Anbieter wie Microsoft 365 den
 * DKIM-Schlüssel selbst verwalten. Die TXT-Abfrage folgt dem CNAME, vergleicht
 * also auch dann den Schlüssel; der CNAME zeigt zusätzlich, wohin delegiert ist.
 *
 * Das sind die Standard-Typen: Der Report lädt nur sie, und nur sie gehen in
 * Befund und Score ein. Andere Typen fragt der Tab erst ab, wenn jemand sie
 * wählt.
 */
export function propagationTypes(name: string): PropagationRecordType[] {
  return isDnsOnlyName(name) ? ['TXT', 'CNAME'] : ['A', 'AAAA'];
}

/**
 * Typen, bei denen ein Resolver ohne Antwort als Abweichung zählt.
 *
 * Bei DNS-Einträgen ist das Vorhandensein selbst die Frage: Wer einen neuen
 * DKIM-Selector veröffentlicht, will wissen, ob ihn schon jeder Resolver
 * sieht. Hat ein Resolver den Namen vorher abgefragt, hält er das „gibt es
 * nicht“ bis zum Ablauf des Negativ-Caches — genau dieser Resolver wäre sonst
 * stillschweigend aus dem Vergleich gefallen. Dasselbe gilt für einen neuen
 * MX, NS oder CAA und für das SOA. Bei Adressen bleibt es beim bisherigen
 * Vergleich der Resolver, die überhaupt antworten.
 */
const PRESENCE_TYPES = new Set<RecordType>(['TXT', 'CNAME', 'MX', 'NS', 'CAA', 'SOA']);

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
 * Der zweite Durchgang ist Absicht: Steht ein Wert selbst in Anführungszeichen
 * (ein häufiger Fehler in DNS-Panels), ist Googles Antwort `"v=spf1 -all"`
 * nicht von einer gestückelten zu unterscheiden und verliert sie beim Parsen,
 * die der anderen behält sie. Ohne zweiten Durchgang stünde Google dauerhaft
 * als abweichend da. Preis: Wer nur diese Anführungszeichen entfernt, sieht
 * die Änderung hier nicht als Abweichung.
 *
 * Hostnamen (CNAME, NS, das Ziel eines MX) sind unabhängig von
 * Groß-/Kleinschreibung und dem abschließenden Punkt, IPv6-Adressen von der
 * Schreibweise der Hex-Ziffern. Ein MX vergleicht Priorität und Ziel, ein CAA
 * Flags, Tag (klein) und Wert, ein SOA nur die Seriennummer (#131).
 */
export function comparableValue(type: RecordType, value: string): string {
  switch (type) {
    case 'TXT':
      return unquote(value);
    case 'CNAME':
    case 'NS':
      return comparableHost(value);
    case 'MX': {
      // Priorität und Ziel: `10 mx.example.com.` (Anzeigeform, propagationValue).
      const mx = /^\s*(\d+)\s+(\S*)\s*$/.exec(value);
      return mx ? `${Number(mx[1])} ${comparableHost(mx[2])}` : comparableHost(value);
    }
    case 'CAA': {
      // `0 issue "letsencrypt.org"`: Flags als Zahl, Tag klein, der Wert ohne
      // die Anführungszeichen — und sonst unverändert.
      const caa = /^\s*(\d+)\s+(\S+)\s+(.*?)\s*$/.exec(value);
      return caa ? `${Number(caa[1])} ${caa[2].toLowerCase()} ${unquote(caa[3])}` : value.trim();
    }
    case 'SOA':
      return soaSerial(value) ?? value;
    case 'AAAA':
      return value.toLowerCase();
    default:
      return value;
  }
}

/** Fügt `"…" "…"` zusammen — nur, wenn der Wert ganz aus solchen Stücken besteht. */
function unquote(value: string): string {
  if (!QUOTED_TXT.test(value)) return value;
  return [...value.matchAll(QUOTED_CHUNK)]
    .map((m) => m[1].replace(/\\(["\\])/g, '$1'))
    .join('');
}

function comparableHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * Seriennummer eines SOA (`mname rname serial refresh retry expire minimum`).
 *
 * Das SOA wird nur über sie verglichen: Sie steigt mit jeder Änderung der
 * Zone, und an ihr sieht man, welchen Stand ein Resolver hat. Die übrigen
 * Felder bleiben in der Anzeige stehen.
 */
export function soaSerial(value: string): string | undefined {
  const serial = value.trim().split(/\s+/)[2];
  return serial && /^\d+$/.test(serial) ? serial : undefined;
}

/**
 * Der Wert eines Records, wie die Propagation ihn zeigt und vergleicht: beim
 * MX mit der Priorität davor, wie im Zonefile (`10 mx.example.com`). Ein
 * Null-MX (RFC 7505) zeigt sein Ziel als `.`.
 */
export function propagationValue(record: DnsRecord): string {
  if (record.type !== 'MX' || record.priority === undefined) return record.value;
  return `${record.priority} ${record.value || '.'}`;
}

/**
 * - `match`: liefert die Mehrheitsantwort
 * - `mismatch`: weicht ab — außer bei Adressen auch „kein Eintrag“, während
 *   die Mehrheit einen hat (oder umgekehrt)
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
  /**
   * Verbleibende TTL in Sekunden, wie der Resolver sie meldet: die kleinste
   * der verglichenen Records — nach ihr fragt er sie neu. Bei „kein Eintrag“
   * die des Negativ-Caches, sofern der Resolver das SOA dazu mitliefert
   * (`negativeTtl`). `null`: unbekannt, und immer bei einem Fehler. Ein CNAME
   * davor zählt hier nicht mit, wohl aber in `requeryWithin`.
   */
  ttl: number | null;
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
  /**
   * Nur beim SOA und nur, wenn es mehr als einer ist: wie viele Primaries
   * (MNAME) die Resolver nennen — mehrere Anbieter, jeder mit eigener
   * Seriennummer (siehe `comparePropagation`).
   */
  soaPrimaries?: number;
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
    const ttls: number[] = [];
    for (const rec of result.records) {
      if (rec.type !== type) continue;
      const value = propagationValue(rec);
      const comparable = comparableValue(type, value);
      if (!byComparable.has(comparable)) byComparable.set(comparable, value);
      if (rec.ttl !== null) ttls.push(rec.ttl);
    }
    // Sortiert nach Vergleichsform: dieselben Records in anderer Reihenfolge
    // sind dieselbe Antwort.
    const comparables = [...byComparable.keys()].sort();
    return {
      result,
      values: comparables.map((c) => byComparable.get(c)!),
      // JSON statt join(','): TXT-Werte enthalten selbst Kommas.
      key: comparables.length > 0 ? JSON.stringify(comparables) : '',
      ttl: remainingTtl(result, type, ttls, comparables.length > 0),
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

  // Beim SOA zählt jeder Anbieter seine Seriennummer selbst: github.com
  // liegt bei NS1 (1656468023) und Route 53 (immer 1), und welche ein
  // Resolver liefert, hängt davon ab, wen er gefragt hat. Verglichen wird
  // deshalb nur unter Resolvern mit demselben Primary (MNAME) — sonst stünde
  // jede Zone bei zwei Anbietern dauerhaft als „abweichend“ da.
  const byPrimary = new Map<string, string>();
  if (type === 'SOA' && consensusKey !== undefined && consensusKey !== '') {
    const counts = new Map<string, Map<string, number>>();
    for (const a of candidates) {
      if (a.key === '') continue;
      const primary = soaPrimary(a.values[0]);
      const keys = counts.get(primary) ?? new Map<string, number>();
      keys.set(a.key, (keys.get(a.key) ?? 0) + 1);
      counts.set(primary, keys);
    }
    for (const [primary, keys] of counts) {
      let best = -1;
      for (const [key, count] of keys) {
        if (count > best) {
          best = count;
          byPrimary.set(primary, key);
        }
      }
    }
  }

  const answers: ResolverAnswer[] = raw.map((a) => {
    let status: ResolverStatus;
    if (a.result.error) status = 'error';
    else if (consensusKey === undefined || (a.key === '' && !presenceCounts)) status = 'empty';
    else if (byPrimary.size > 0 && a.key !== '') {
      status = a.key === byPrimary.get(soaPrimary(a.values[0])) ? 'match' : 'mismatch';
    } else status = a.key === consensusKey ? 'match' : 'mismatch';
    return { ...a, status };
  });

  return {
    type,
    answers,
    consensusKey,
    compared: consensusKey === undefined ? 0 : candidates.length,
    deviating: answers.filter((a) => a.status === 'mismatch').length,
    ...(byPrimary.size > 1 && { soaPrimaries: byPrimary.size }),
  };
}

/** Primary (MNAME) eines SOA in Anzeigeform — das erste Feld, normalisiert. */
function soaPrimary(value: string | undefined): string {
  return comparableHost(value?.trim().split(/\s+/)[0] ?? '');
}

/** Siehe `ResolverAnswer.ttl`. */
function remainingTtl(
  result: ResolverResult,
  type: RecordType,
  recordTtls: number[],
  hasRecords: boolean
): number | null {
  if (result.error) return null;
  if (!hasRecords) return result.negativeTtl?.[type] ?? null;
  return recordTtls.length > 0 ? Math.min(...recordTtls) : null;
}

/**
 * Der Typ, den der Befund vergleicht: der erste aus `types`, für den
 * mindestens ein Resolver einen Wert liefert. Bei einem DKIM-Eintrag ist das
 * TXT; liegt dort nur ein CNAME (etwa auf einen noch leeren Anbieter-Eintrag),
 * eben der CNAME.
 */
export function primaryPropagationType<T extends RecordType>(
  results: ResolverResult[],
  types: T[]
): T | undefined {
  return types.find((type) =>
    results.some((r) => !r.error && r.records.some((rec) => rec.type === type))
  );
}

/**
 * Der Typ, den der Tab ohne Auswahl zeigt: wie der Befund der erste
 * Standard-Typ mit Antwort, sonst der erste Standard-Typ.
 */
export function defaultPropagationType<T extends RecordType>(results: ResolverResult[], types: T[]): T {
  return primaryPropagationType(results, types) ?? types[0];
}

/**
 * In wie vielen Sekunden die abweichenden Resolver spätestens neu fragen: die
 * größte verbleibende TTL unter ihnen.
 *
 * Folgt der Name einem CNAME, zählt dessen TTL mit (`answerExpiresIn`). Ist
 * der CNAME das, was sich geändert hat, liefert der Resolver bis zu seinem
 * Ablauf die Records des alten Ziels — auch wenn die selbst nur kurz gelten.
 *
 * `undefined`, wenn keiner abweicht — oder einer keine TTL nennt: Dann ließe
 * sich „spätestens“ nicht sagen. Ob sie danach den neuen Stand liefern, sagt
 * die Zahl nicht; manche Resolver kappen TTLs oder liefern bei Störungen
 * abgelaufene Antworten weiter (RFC 8767). Die Ansicht formuliert entsprechend
 * vorsichtig.
 */
export function requeryWithin(comparison: PropagationComparison): number | undefined {
  const deviating = comparison.answers.filter((a) => a.status === 'mismatch');
  let latest = -1;
  for (const answer of deviating) {
    const expiresIn = answerExpiresIn(answer, comparison.type);
    if (expiresIn === null) return undefined;
    latest = Math.max(latest, expiresIn);
  }
  return latest < 0 ? undefined : latest;
}

/**
 * Bis die ganze Antwort eines Resolvers abgelaufen ist: ihre TTL, und die
 * des längsten CNAMEs davor. Beim Typ CNAME selbst gibt es keine Kette — die
 * Abfrage folgt ihm nicht.
 */
function answerExpiresIn(answer: ResolverAnswer, type: RecordType): number | null {
  if (answer.ttl === null) return null;
  if (type === 'CNAME') return answer.ttl;
  let latest = answer.ttl;
  for (const rec of answer.result.records) {
    if (rec.type !== 'CNAME') continue;
    if (rec.ttl === null) return null;
    latest = Math.max(latest, rec.ttl);
  }
  return latest;
}

/** Ob bei diesem Typ ein Resolver ohne Antwort als Abweichung zählt. */
export function countsMissingAnswers(type: RecordType): boolean {
  return PRESENCE_TYPES.has(type);
}
