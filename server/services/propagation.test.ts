import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryAllResolvers } from './propagation.js';
import { propagationFindings } from './reportBuilder.js';
import { DOH_RESOLVERS } from './doh.js';
import { propagationTypes } from '../../shared/propagation.js';

/**
 * Die Resolver werden über `fetch` gemockt: geprüft wird, was wir fragen und
 * wie wir die Antworten zusammensetzen — nicht das Netz.
 */

const DKIM = 's1._domainkey.example.com';
const KEY_PART_1 = 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A';
const KEY_PART_2 = 'MIIBCgKCAQEAvWUrrAaQnCEWgPSwxaJ00hO+wIDAQAB';

interface Answer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

/** Antwortet je nach Resolver und Typ — so, wie die echten DoH-Anbieter formatieren. */
function stubDoh(answer: (resolverUrl: string, type: number) => Answer[]) {
  const calls: { url: string; type: number }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input);
      const type = Number(url.searchParams.get('type'));
      const base = `${url.origin}${url.pathname}`;
      calls.push({ url: base, type });
      return new Response(JSON.stringify({ Status: 0, Answer: answer(base, type) }), {
        headers: { 'content-type': 'application/dns-json' },
      });
    })
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('queryAllResolvers — Typauswahl', () => {
  it('fragt bei einem DNS-Eintrag TXT und CNAME statt A/AAAA', async () => {
    const calls = stubDoh(() => []);
    await queryAllResolvers(DKIM, { types: propagationTypes(DKIM) });

    const types = new Set(calls.map((c) => c.type));
    expect(types).toEqual(new Set([16, 5])); // TXT, CNAME
    expect(calls).toHaveLength(DOH_RESOLVERS.length * 2);
  });

  it('fragt bei einem Host weiter A und AAAA', async () => {
    const calls = stubDoh(() => []);
    await queryAllResolvers('www.example.com', { types: propagationTypes('www.example.com') });
    expect(new Set(calls.map((c) => c.type))).toEqual(new Set([1, 28]));
  });
});

describe('queryAllResolvers — TXT über alle Resolver', () => {
  /**
   * Google liefert den Schlüssel zusammengesetzt und ohne Anführungszeichen,
   * die anderen in Stücken zu 255 Zeichen. Inhaltlich ist es derselbe Record —
   * der Befund muss „konsistent“ sagen.
   */
  it('wertet unterschiedlich formatierte, gleiche Schlüssel als konsistent', async () => {
    stubDoh((url, type) => {
      if (type !== 16) return [];
      const data = url.includes('dns.google')
        ? KEY_PART_1 + KEY_PART_2
        : `"${KEY_PART_1}" "${KEY_PART_2}"`;
      return [{ name: `${DKIM}.`, type: 16, TTL: 3600, data }];
    });

    const types = propagationTypes(DKIM);
    const results = await queryAllResolvers(DKIM, { types });
    for (const r of results) {
      expect(r.records.map((rec) => rec.value), r.resolver.id).toEqual([KEY_PART_1 + KEY_PART_2]);
    }
    expect(propagationFindings(results, types).map((f) => f.id)).toEqual(['propagation-consistent']);
  });

  it('meldet einen Resolver, der noch den alten Schlüssel liefert', async () => {
    stubDoh((url, type) => {
      if (type !== 16) return [];
      const key = url.includes('adguard') ? 'v=DKIM1; p=ALT' : 'v=DKIM1; p=NEU';
      return [{ name: DKIM, type: 16, TTL: 3600, data: `"${key}"` }];
    });

    const types = propagationTypes(DKIM);
    const findings = propagationFindings(await queryAllResolvers(DKIM, { types }), types);
    expect(findings.map((f) => f.id)).toEqual(['propagation-mismatch']);
    expect(findings[0].description).toContain('1 von 5 Resolvern');
    expect(findings[0].description).toContain('TXT-Record');
  });

  /**
   * Folgt ein DKIM-Eintrag per CNAME zum Anbieter, steht der CNAME in der
   * Antwort auf TXT UND auf CNAME. Doppelt soll er weder in der Ansicht
   * noch im Export stehen.
   */
  it('führt einen CNAME aus beiden Abfragen nur einmal', async () => {
    const cname = { name: `${DKIM}.`, type: 5, TTL: 3600, data: 'sel1.dkim.provider.net.' };
    stubDoh((_url, type) =>
      type === 16
        ? [cname, { name: 'sel1.dkim.provider.net.', type: 16, TTL: 300, data: '"v=DKIM1; p=X"' }]
        : [cname]
    );

    const [first] = await queryAllResolvers(DKIM, { types: propagationTypes(DKIM) });
    expect(first.records.map((r) => `${r.type} ${r.value}`)).toEqual([
      'CNAME sel1.dkim.provider.net',
      'TXT v=DKIM1; p=X',
    ]);
  });
});
