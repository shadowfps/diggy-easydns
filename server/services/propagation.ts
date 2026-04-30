/**
 * Multi-Resolver-Propagation.
 *
 * Wir fragen mehrere DoH-Resolver parallel und vergleichen die Antworten.
 * Damit kann man sehen ob ein DNS-Wechsel weltweit angekommen ist —
 * oder ob ein einzelner Resolver noch eine alte IP cached.
 */

import { DOH_RESOLVERS, dohQuery, type DohResolver } from './doh.js';
import type { DnsRecord, RecordType, ResolverResult } from '../types.js';

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

    const records: DnsRecord[] = [];
    for (const r of responses) records.push(...r.records);

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
