/**
 * Multi-Resolver-Propagation.
 *
 * Wir fragen mehrere DoH-Resolver parallel und vergleichen die Antworten.
 * Damit kann man sehen ob ein DNS-Wechsel weltweit angekommen ist —
 * oder ob ein einzelner Resolver noch eine alte IP oder einen alten
 * DKIM-Schlüssel cached. Welche Typen abgefragt werden, entscheidet
 * `propagationTypes` (shared/propagation.ts).
 */

import { DOH_RESOLVERS, dohQuery, type DohResolver } from './doh.js';
import type { DnsRecord, RecordType, ResolverResult } from '../types.js';

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
    // ein Fehler des Resolvers, kein „gibt es nicht“ — bei TXT/CNAME zählt
    // ein fehlender Eintrag als Abweichung, ein Fehler dagegen nie.
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
