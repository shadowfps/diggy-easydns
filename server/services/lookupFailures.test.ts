import { describe, expect, it, vi } from 'vitest';

/**
 * Timeout ist nicht „nichts gefunden“ (#79).
 *
 * Die Services machen aus einer gescheiterten Abfrage ein Negativ-Ergebnis —
 * für die Anzeige gewollt, für den Vergleich mit dem letzten Check fatal:
 * ein Timeout hieße dort „AAAA-Records entfallen“ oder „DNSSEC aus“. Deshalb
 * markieren sie das Scheitern, und diese Tests halten fest, dass „gibt es
 * nicht“ (ENODATA, leere Antwort) dabei unmarkiert bleibt.
 */

const dnsError = (code: string) => Object.assign(new Error(code), { code });

vi.mock('node:dns', () => {
  class Resolver {
    setServers() {}
    resolve4 = async () => [{ address: '198.51.100.7', ttl: 300 }];
    resolve6 = async () => {
      throw dnsError('ETIMEOUT');
    };
    resolveMx = async () => {
      throw dnsError('ENODATA');
    };
    resolveNs = async () => {
      throw dnsError('ESERVFAIL');
    };
    resolveTxt = async () => [];
    resolveCaa = async () => [];
    resolveSoa = async () => {
      throw dnsError('ENODATA');
    };
    resolveCname = async () => {
      throw dnsError('ENODATA');
    };
  }
  return { promises: { Resolver } };
});

vi.mock('./doh.js', () => ({
  DOH_RESOLVERS: [{ id: 'cloudflare' }, { id: 'google' }],
  dohQuery: vi.fn(),
}));

const { lookupStandardRecords } = await import('./dnsLookup.js');
const { checkDnssec } = await import('./dnssec.js');
const { dohQuery } = await import('./doh.js');

describe('lookupStandardRecords', () => {
  it('meldet gescheiterte Typen, aber nicht die ohne Records', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { records, failedTypes } = await lookupStandardRecords('example.com');

    expect(records.map((record) => record.type)).toEqual(['A']);
    expect(failedTypes).toEqual(['AAAA', 'NS']);
  });
});

describe('checkDnssec', () => {
  const answer = { records: [], authenticated: false, status: 0, responseTimeMs: 1 };

  // Mit DNSKEY in der Zone hinge „aktiv“ allein an der DS-Antwort. Ohne
  // DNSKEY wäre DNSSEC sicher aus, auch ohne DS-Antwort (#101).
  it('markiert das Ergebnis, wenn die DS-Abfrage scheitert', async () => {
    const dnskey = { type: 'DNSKEY' as const, name: 'example.com', value: '257 3 13 abcd', ttl: 300 };
    vi.mocked(dohQuery).mockImplementation(async (_resolver, _domain, type) => {
      if (type === 'DS') throw Object.assign(new Error('Timeout'), { name: 'AbortError' });
      return type === 'DNSKEY' ? { ...answer, records: [dnskey] } : answer;
    });

    expect(await checkDnssec('example.com')).toMatchObject({
      enabled: false,
      lookupFailed: 'timeout',
    });
  });

  it('lässt eine unsignierte Zone unmarkiert', async () => {
    vi.mocked(dohQuery).mockResolvedValue(answer);

    expect(await checkDnssec('example.com')).not.toHaveProperty('lookupFailed');
  });
});
