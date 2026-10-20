/**
 * Autoritative Nameserver als Referenz und erwarteter Wert (#133) — geteilt
 * zwischen Server (API) und Client (Propagation-Tab).
 *
 * Wie shared/propagation.ts: Beide Seiten müssen dieselben Nameserver als
 * „uneinig“ und denselben Resolver als „abweichend“ werten.
 *
 * Ein eigenes Modul statt einer Erweiterung von shared/propagation.ts: Das
 * lädt die App für Link und Voreinstellung schon im kritischen Pfad
 * (index.js), und mit ihm alles, was darin steht. Diese Auswertung braucht
 * erst der Propagation-Tab — so bleibt sie in dessen nachgeladenem Chunk.
 */

import {
  comparableValue,
  comparePropagation,
  propagationValue,
  type PropagationComparison,
  type ResolverStatus,
} from './propagation.js';
import type { AuthoritativeResult, AuthoritativeServer, DnsRecord, RecordType, ResolverResult } from './types/dns.js';

/* ─── Vergleichsbasis der Resolver ─────────────────────────────────────── */

/**
 * Wogegen die Resolver verglichen werden, vom stärksten Anhaltspunkt abwärts:
 *
 * - `expected`: der Wert, den jemand im Tab einträgt — ein Resolver stimmt,
 *   wenn seine Antwort ihn enthält (`matchesExpected`)
 * - `authoritative`: die Antwort der autoritativen Nameserver, wenn sie sich
 *   einig sind; `keys` wie `ResolverAnswer.key` — mehrere nur beim SOA
 *   einer Zone bei mehreren Anbietern (`providers`)
 * - `majority`: die Mehrheit der Resolver — ohne die beiden anderen, und
 *   immer für den Befund (Score und Findings hängen nicht an Port 53)
 */
export type PropagationBasis =
  | { kind: 'majority' }
  | { kind: 'authoritative'; keys: string[] }
  | { kind: 'expected'; value: string };

export interface BasisComparison extends PropagationComparison {
  basis: PropagationBasis['kind'];
}

/**
 * Vergleicht die Resolver gegen eine Basis. Ohne Nameserver und erwarteten
 * Wert genau `comparePropagation` (Mehrheit).
 *
 * Gegen die Nameserver oder den erwarteten Wert zählt jeder Resolver ohne
 * Fehler, auch bei Adressen ohne Eintrag: Wer eine neue Subdomain anlegt,
 * will genau den Resolver sehen, der noch „gibt es nicht“ im Cache hat. Die
 * Mehrheit kann das nicht leisten — dort bleibt es beim bisherigen
 * Vergleich.
 */
export function compareWithBasis(results: ResolverResult[], type: RecordType, basis: PropagationBasis): BasisComparison {
  const majority = comparePropagation(results, type);
  if (basis.kind === 'majority') return { ...majority, basis: 'majority' };

  const answers = majority.answers.map((answer) => {
    let status: ResolverStatus;
    if (answer.result.error) status = 'error';
    else if (basis.kind === 'expected') {
      status = matchesExpected(type, answerValues(answer.result.records, type).comparables, basis.value)
        ? 'match'
        : 'mismatch';
    } else status = basis.keys.includes(answer.key) ? 'match' : 'mismatch';
    return { ...answer, status };
  });

  return {
    ...majority,
    basis: basis.kind,
    answers,
    compared: answers.filter((a) => a.status !== 'error').length,
    deviating: answers.filter((a) => a.status === 'mismatch').length,
  };
}

/**
 * Die Basis: der erwartete Wert, wenn einer eingetragen ist, sonst die
 * autoritativen Nameserver, wenn sie sich einig sind (`agreed`, beim SOA
 * auch `providers`), sonst die Mehrheit.
 */
export function propagationBasis(
  expected: string,
  reference: AuthoritativeReference | undefined
): PropagationBasis {
  if (expected.trim()) return { kind: 'expected', value: expected };
  if (reference?.keys) return { kind: 'authoritative', keys: reference.keys };
  return { kind: 'majority' };
}

/* ─── Erwarteter Wert ──────────────────────────────────────────────────── */

/**
 * Ob eine Antwort den erwarteten Wert enthält — in derselben Vergleichsform
 * wie zwischen den Resolvern (`comparableValue`): `"v=spf1 -all"` mit
 * Anführungszeichen, `Mail.Example.com.` oder `2001:DB8:0::1` treffen also
 * auch.
 *
 * „Enthält“ statt „ist gleich“: Am Apex liegen meist mehrere TXT-Records
 * (SPF, Verifizierungen), gefragt ist, ob der neue darunter ist. Beim MX
 * reicht das Ziel ohne Priorität.
 */
export function matchesExpected(type: RecordType, comparables: string[], expected: string): boolean {
  const input = expected.trim();
  if (!input) return false;
  if (type === 'AAAA') {
    const wanted = canonicalIpv6(input);
    return comparables.some((c) => canonicalIpv6(c) === wanted);
  }
  const wanted = comparableValue(type, input);
  if (comparables.includes(wanted)) return true;
  return type === 'MX' && !/^\d+\s/.test(input) && comparables.some((c) => c.split(' ')[1] === wanted);
}

/**
 * IPv6 in der Kurzform nach RFC 5952, wie die Resolver sie liefern: Gruppen
 * ohne führende Nullen, die längste Folge aus mindestens zwei Null-Gruppen
 * als `::`, Kleinbuchstaben. Wer `2001:DB8:0:0::1` einträgt, meint
 * `2001:db8::1`. Unlesbares bleibt bis auf die Kleinschreibung, wie es ist.
 */
export function canonicalIpv6(value: string): string {
  const text = value.trim().toLowerCase();
  const halves = text.split('::');
  if (halves.length > 2) return text;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return text;
  const groups = [...head, ...Array<string>(fill).fill('0'), ...tail];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return text;

  const numbers = groups.map((g) => parseInt(g, 16));
  let start = -1;
  let length = 1;
  for (let i = 0; i < 8; ) {
    let j = i;
    while (j < 8 && numbers[j] === 0) j++;
    if (j - i > length) {
      start = i;
      length = j - i;
    }
    i = Math.max(j, i + 1);
  }
  const hex = (from: number, to: number) => numbers.slice(from, to).map((n) => n.toString(16)).join(':');
  return start < 0 ? hex(0, 8) : `${hex(0, start)}::${hex(start + length, 8)}`;
}

/* ─── Die autoritativen Nameserver ─────────────────────────────────────── */

/**
 * Wie die autoritativen Nameserver zueinander stehen.
 *
 * - `agreed`: Alle, die geantwortet haben, liefern dieselbe Antwort, und die
 *   Seriennummern passen. Das ist der Stand der Zone — die Resolver werden
 *   gegen ihn verglichen.
 * - `serial`: Nameserver mit demselben Primary melden verschiedene
 *   Seriennummern: Eine Änderung ist noch nicht auf allen angekommen
 *   (Zonentransfer läuft, oder ein Secondary hängt).
 * - `providers`: nur beim SOA — die Zone liegt bei mehreren Anbietern, jeder
 *   zählt seine Seriennummer selbst, und jeder ist in sich einig. Aktuell ist
 *   ein Resolver, wenn er die Seriennummer eines der Anbieter liefert; die
 *   Mehrheit hielte sonst die Resolver des kleineren Anbieters für veraltet.
 * - `values`: Die Antworten unterscheiden sich bei passender Seriennummer.
 *   Bei Adressen meist Absicht (GeoDNS, Lastverteilung — github.com liefert
 *   je Nameserver eine andere). Sonst sind die Anbieter nicht im Gleichstand.
 * - `cname`: Der Name ist ein CNAME in eine andere Zone; den Wert des
 *   gefragten Typs liefern deren Nameserver, nicht diese.
 * - `unavailable`: Keiner hat brauchbar geantwortet.
 *
 * Außer bei `agreed` und `providers` gibt es keine Referenz, und die
 * Resolver werden wie bisher gegen ihre Mehrheit verglichen.
 */
export type AuthoritativeState = 'agreed' | 'providers' | 'serial' | 'values' | 'cname' | 'unavailable';

export interface AuthoritativeAnswer {
  server: AuthoritativeServer;
  /** Werte des gefragten Typs wie bei den Resolvern. */
  values: string[];
  /** Vergleichsform der Werte — für `matchesExpected`. */
  comparables: string[];
  /** Wie `ResolverAnswer.key`; bei einem CNAME aus der Zone `→<ziel>`. */
  key: string;
  /** Ziel, wenn der Name ein CNAME ist und der gefragte Typ deshalb fehlt. */
  cname?: string;
  /** Seriennummer weicht von Servern desselben Primary ab. */
  serialDeviates: boolean;
  /** Antwort weicht von der der meisten Nameserver ab (nicht beim SOA, siehe unten). */
  valueDeviates: boolean;
}

export interface AuthoritativeReference {
  state: AuthoritativeState;
  /** Eine Antwort je Nameserver, in der Reihenfolge des Ergebnisses. */
  answers: AuthoritativeAnswer[];
  /**
   * Die Antworten, gegen die die Resolver verglichen werden: bei `agreed`
   * eine, bei `providers` eine je Anbieter. Fehlt sonst.
   */
  keys?: string[];
  /** Die Werte dazu; leer heißt „gibt es nicht“. */
  values: string[];
  /** Nur bei `cname`: das Ziel. */
  cname?: string;
  /** Nameserver, die brauchbar geantwortet haben. */
  answered: number;
  /**
   * Verschiedene Primaries (SOA-MNAME) unter ihnen — mehr als einer heißt:
   * mehrere Anbieter, jeder mit eigener Seriennummer. Kein Fehler.
   */
  primaries: number;
}

/**
 * Wertet die Antworten der autoritativen Nameserver aus — Server und Client
 * mit derselben Funktion, damit API und Ansicht dasselbe sagen.
 *
 * Seriennummern werden nur unter Servern desselben Primary (SOA-MNAME)
 * verglichen: github.com liegt bei NS1 und bei Route 53, und jeder Anbieter
 * zählt selbst (NS1 1656468023, Route 53 immer 1). Über alle Server hinweg
 * stünden solche Zonen dauerhaft als „uneinig“ da.
 */
export function authoritativeReference(result: AuthoritativeResult): AuthoritativeReference {
  const { type } = result;
  const answers: AuthoritativeAnswer[] = result.nameservers.map((server) => {
    const flags = { serialDeviates: false, valueDeviates: false };
    if (server.error) return { server, values: [], comparables: [], key: '', ...flags };
    const { values, comparables, key } = answerValues(server.records, type);
    const cname = key === '' && type !== 'CNAME' ? cnameTarget(server.records, result.domain) : undefined;
    return { server, values, comparables, key: cname ? `→${hostName(cname)}` : key, cname, ...flags };
  });

  const ok = answers.filter((a) => !a.server.error);
  if (ok.length === 0) return { state: 'unavailable', answers, values: [], answered: 0, primaries: 0 };

  let serialDeviates = false;
  const byPrimary = new Map<string, AuthoritativeAnswer[]>();
  for (const a of ok) {
    const primary = hostName(a.server.primary ?? '');
    byPrimary.set(primary, [...(byPrimary.get(primary) ?? []), a]);
  }
  for (const group of byPrimary.values()) {
    const common = mostCommon(group.map((a) => a.server.serial ?? ''));
    for (const a of group) {
      if ((a.server.serial ?? '') === common) continue;
      a.serialDeviates = true;
      serialDeviates = true;
    }
  }

  // Beim SOA ist der Wert die Seriennummer — die ist oben schon je Primary
  // verglichen. Über Anbieter hinweg darf sie abweichen.
  const commonKey = mostCommon(ok.map((a) => a.key));
  if (type !== 'SOA') {
    for (const a of ok) a.valueDeviates = a.key !== commonKey;
  }
  const distinct = new Set(ok.map((a) => a.key)).size;
  const common = ok.find((a) => a.key === commonKey)!;

  const state: AuthoritativeState = serialDeviates
    ? 'serial'
    : distinct > 1
    ? type === 'SOA'
      ? 'providers'
      : 'values'
    : common.cname
    ? 'cname'
    : 'agreed';

  return {
    state,
    answers,
    ...(state === 'agreed' && { keys: [commonKey] }),
    ...(state === 'providers' && { keys: [...new Set(ok.map((a) => a.key))] }),
    values: state === 'agreed' ? common.values : [],
    ...(state === 'cname' && { cname: common.cname }),
    answered: ok.length,
    primaries: byPrimary.size,
  };
}

/**
 * Ob die Nameserver im eigentlichen Sinn uneinig sind — eine Warnung, kein
 * bloßer Hinweis: verschiedene Seriennummern beim selben Primary, oder
 * verschiedene Werte, wo es keine harmlose Erklärung gibt. Adressen dürfen
 * je Nameserver verschieden sein (GeoDNS, Lastverteilung).
 */
export function authoritativeDisagrees(state: AuthoritativeState, type: RecordType): boolean {
  return state === 'serial' || (state === 'values' && type !== 'A' && type !== 'AAAA');
}

/**
 * Die Werte eines Typs aus einer Antwort, wie `comparePropagation` sie
 * vergleicht: Anzeigeform, sortiert nach Vergleichsform, ohne Dubletten;
 * `key` wie `ResolverAnswer.key` (`''` heißt „kein Eintrag“).
 */
function answerValues(records: DnsRecord[], type: RecordType): { values: string[]; comparables: string[]; key: string } {
  const byComparable = new Map<string, string>();
  for (const rec of records) {
    if (rec.type !== type) continue;
    const value = propagationValue(rec);
    const comparable = comparableValue(type, value);
    if (!byComparable.has(comparable)) byComparable.set(comparable, value);
  }
  const comparables = [...byComparable.keys()].sort();
  return {
    values: comparables.map((c) => byComparable.get(c)!),
    comparables,
    key: comparables.length > 0 ? JSON.stringify(comparables) : '',
  };
}

/** Häufigster Wert, bei Gleichstand der zuerst gesehene. */
function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[0];
  for (const [value, count] of counts) if (count > counts.get(best)!) best = value;
  return best;
}

/**
 * Wohin der Name per CNAME zeigt — das letzte Glied der Kette, die der
 * Nameserver mitliefert. Liegt das Ziel in seiner Zone, steht der gefragte
 * Typ mit in der Antwort; sonst endet sie beim CNAME.
 */
function cnameTarget(records: DnsRecord[], name: string): string | undefined {
  let current = hostName(name);
  let target: string | undefined;
  for (let hop = 0; hop < 8; hop++) {
    const next = records.find((r) => r.type === 'CNAME' && hostName(r.name) === current);
    if (!next) break;
    target = next.value;
    current = hostName(next.value);
  }
  return target;
}

function hostName(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}
