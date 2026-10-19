/**
 * Multi-Resolver-Propagation.
 *
 * Wir fragen mehrere DoH-Resolver parallel und vergleichen die Antworten.
 * Damit kann man sehen ob ein DNS-Wechsel weltweit angekommen ist —
 * oder ob ein einzelner Resolver noch eine alte IP oder einen alten
 * DKIM-Schlüssel cached. Welche Typen abgefragt werden, entscheidet
 * `propagationTypes` (shared/propagation.ts) — oder wer im Tab einen anderen
 * wählt (`?type=`, #131).
 */

import { DOH_RESOLVERS, dohQuery, type DohResolver } from './doh.js';
import { propagationFindings } from './reportBuilder.js';
import { cached } from '../lib/cache.js';
import {
  parsePropagationType,
  propagationTypes,
  type PropagationRecordType,
} from '../../shared/propagation.js';
import type { DnsRecord, Finding, RecordType, ResolverResult } from '../types.js';

/** NOERROR und NXDOMAIN: Der Resolver hat geantwortet — mit Eintrag oder ohne. */
const ANSWER_STATUSES = new Set([0, 3]);

const DNS_STATUS_NAMES: Record<number, string> = {
  1: 'FORMERR',
  2: 'SERVFAIL',
  4: 'NOTIMP',
  5: 'REFUSED',
};

export interface PropagationOptions {
  /** Welche Record-Typen abgefragt werden sollen. Default: A */
  types?: RecordType[];
  /** Per-Resolver-Timeout in ms */
  timeoutMs?: number;
}

/**
 * Fragt alle Resolver parallel ab und sammelt die Antworten.
 * Reihenfolge im Output entspricht DOH_RESOLVERS — UI kann sich darauf verlassen.
 */
export async function queryAllResolvers(
  domain: string,
  options: PropagationOptions = {}
): Promise<ResolverResult[]> {
  const types = options.types ?? ['A'];

  const results = await Promise.all(
    DOH_RESOLVERS.map((resolver) =>
      queryResolverSafe(resolver, domain, types, options.timeoutMs ?? 5000)
    )
  );

  return results;
}

/**
 * Einzelner Resolver mit allen angefragten Record-Typen.
 * Fängt Fehler ab — ein toter Resolver darf nicht das Gesamt-Ergebnis killen.
 */
async function queryResolverSafe(
  resolver: DohResolver,
  domain: string,
  types: RecordType[],
  timeoutMs: number
): Promise<ResolverResult> {
  try {
    const start = Date.now();
    const responses = await Promise.all(
      types.map((type) => dohQuery(resolver, domain, type, { timeoutMs }))
    );

    // SERVFAIL oder REFUSED kommen als HTTP 200 mit leerer Antwort. Das ist
    // ein Fehler des Resolvers, kein „gibt es nicht“ — außer bei Adressen
    // zählt ein fehlender Eintrag als Abweichung, ein Fehler dagegen nie.
    const failed = responses.find((r) => !ANSWER_STATUSES.has(r.status));
    if (failed) throw new Error(DNS_STATUS_NAMES[failed.status] ?? `DNS-Status ${failed.status}`);

    // Folgt ein Name einem CNAME, steht der in der Antwort jeder Abfrage —
    // bei TXT + CNAME also doppelt, und so landete er auch im Export.
    const records: DnsRecord[] = [];
    const seen = new Set<string>();
    for (const rec of responses.flatMap((r) => r.records)) {
      const id = `${rec.type}|${rec.name.toLowerCase()}|${rec.value}`;
      if (seen.has(id)) continue;
      seen.add(id);
      records.push(rec);
    }

    // Je Typ ohne Eintrag: wie lange der Resolver das noch so weitergibt.
    const negativeTtl: Partial<Record<RecordType, number>> = {};
    responses.forEach((response, i) => {
      if (response.negativeTtl !== undefined) negativeTtl[types[i]] = response.negativeTtl;
    });

    return {
      resolver: {
        id: resolver.id,
        name: resolver.name,
        ip: resolver.ip,
        country: resolver.country,
        flag: resolver.flag,
        provider: resolver.provider,
      },
      records,
      responseTimeMs: Date.now() - start,
      ...(Object.keys(negativeTtl).length > 0 && { negativeTtl }),
    };
  } catch (error) {
    const err = error as Error;
    return {
      resolver: {
        id: resolver.id,
        name: resolver.name,
        ip: resolver.ip,
        country: resolver.country,
        flag: resolver.flag,
        provider: resolver.provider,
      },
      records: [],
      responseTimeMs: timeoutMs,
      error: err.name === 'AbortError' ? 'Timeout' : err.message,
    };
  }
}

/** Antwort von `/api/lookup/propagation`. */
export interface PropagationSectionResult {
  propagation: ResolverResult[];
  findings: Finding[];
  /** Nur bei `?type=`: der abgefragte Typ. */
  type?: PropagationRecordType;
}

/**
 * Liest `?type=` (#131).
 *
 * - `undefined`: nicht angegeben (oder leer) — die Standard-Typen wie bisher
 * - `null`: kein Typ aus PROPAGATION_RECORD_TYPES, oder mehrfach angegeben
 */
export function propagationTypeQuery(raw: unknown): PropagationRecordType | null | undefined {
  if (raw === undefined || raw === '') return undefined;
  return parsePropagationType(raw);
}

/**
 * Inhalt von `/api/lookup/propagation`.
 *
 * Ohne `type` genau wie vor #131: die Standard-Typen des Namens
 * (`propagationTypes`), derselbe Cache-Key und der Befund dazu. Davon hängen
 * Report und Score ab.
 *
 * Mit `type` nur dieser Typ, unter eigenem Cache-Key — und ohne Befund: Score
 * und Findings bleiben bei den Standard-Typen. Sonst hinge der Score davon ab,
 * welchen Typ jemand gerade ansieht.
 */
export async function propagationSection(
  domain: string,
  { type, ttlMs }: { type?: PropagationRecordType; ttlMs: number }
): Promise<PropagationSectionResult> {
  if (!type) {
    const types = propagationTypes(domain);
    const propagation = await cachedResolvers(`propagation:${domain}`, ttlMs, domain, types);
    return { propagation, findings: propagationFindings(propagation, types) };
  }

  const propagation = await cachedResolvers(`propagation:${type}:${domain}`, ttlMs, domain, [type]);
  return { propagation, findings: [], type };
}

/**
 * Die Antworten aus dem Cache — mit den TTLs von jetzt.
 *
 * Die TTL zählt im Resolver weiter herunter, während die Antwort hier bis zu
 * `ttlMs` liegt. Unverändert ausgeliefert hieße „verbleibende TTL“ bis zu eine
 * Minute zu viel, und wer nach 30 s erneut prüft, sähe dieselben Zahlen.
 *
 * Länger als die kürzeste TTL der Antworten bleibt der Eintrag nicht
 * (#133): Danach hat der Resolver womöglich schon neu gefragt, die Antwort
 * im Cache zeigte einen Stand, den es dort nicht mehr gibt — und die
 * heruntergezählte TTL stand als „TTL 0s“ da.
 *
 * Kürzer als `MIN_RESOLVER_CACHE_MS` aber auch nicht: Bei TTL 0 oder 1 — bei
 * Lastverteilern üblich, und ein Resolver kurz vor dem Ablauf meldet so
 * etwas für jeden Record — ginge sonst jeder Aufruf erneut an alle neun
 * Resolver, auch ein Reload oder ein geteilter Link Sekunden später. Ein
 * „TTL 0s“ aus dem Cache kann es so nur in diesen ersten Sekunden geben.
 */
async function cachedResolvers(
  key: string,
  ttlMs: number,
  domain: string,
  types: RecordType[]
): Promise<ResolverResult[]> {
  const { results, at } = await cached(
    key,
    ttlMs,
    async () => {
      const results = await queryAllResolvers(domain, { types });
      return { results, at: Date.now() };
    },
    { maxTtlMs: ({ results }) => Math.max(MIN_RESOLVER_CACHE_MS, shortestTtl(results) * 1000) }
  );
  return agedResults(results, Math.floor((Date.now() - at) / 1000));
}

/** Untergrenze für `cachedResolvers` — fängt Bursts ab wie `FAILED_TTL_MS` im Cache. */
export const MIN_RESOLVER_CACHE_MS = 5_000;

/** Die kürzeste TTL in Sekunden über alle Records und Negativ-TTLs — ohne eine: unbegrenzt. */
export function shortestTtl(results: ResolverResult[]): number {
  let shortest = Infinity;
  for (const result of results) {
    for (const rec of result.records) if (rec.ttl !== null) shortest = Math.min(shortest, rec.ttl);
    for (const ttl of Object.values(result.negativeTtl ?? {})) shortest = Math.min(shortest, ttl);
  }
  return shortest;
}

/** Zieht `seconds` von jeder TTL ab, nicht unter 0. Das Original bleibt unverändert. */
export function agedResults(results: ResolverResult[], seconds: number): ResolverResult[] {
  if (seconds <= 0) return results;
  const age = (ttl: number) => Math.max(0, ttl - seconds);
  return results.map((result) => {
    const records = result.records.map((rec) => (rec.ttl === null ? rec : { ...rec, ttl: age(rec.ttl) }));
    if (!result.negativeTtl) return { ...result, records };
    const negativeTtl: Partial<Record<RecordType, number>> = {};
    for (const [recordType, ttl] of Object.entries(result.negativeTtl) as [RecordType, number][]) {
      negativeTtl[recordType] = age(ttl);
    }
    return { ...result, records, negativeTtl };
  });
}
