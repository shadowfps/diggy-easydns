import { afterEach, describe, expect, it, vi } from 'vitest';
import { propagationSection, propagationTypeQuery, queryAllResolvers } from './propagation.js';
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
function stubDoh(
  answer: (resolverUrl: string, type: number) => Answer[],
  status: (resolverUrl: string) => number = () => 0
) {
  const calls: { url: string; type: number }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input);
      const type = Number(url.searchParams.get('type'));
      const base = `${url.origin}${url.pathname}`;
      calls.push({ url: base, type });
      return new Response(JSON.stringify({ Status: status(base), Answer: answer(base, type) }), {
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
   * SERVFAIL kommt als HTTP 200 mit leerer Antwort. Als „kein Eintrag“
   * gewertet, meldete die Propagation eine Abweichung, die nur ein Fehler des
   * Resolvers ist.
   */
  it('wertet SERVFAIL als Fehler, nicht als fehlenden Eintrag', async () => {
    stubDoh(
      (url, type) =>
        type === 16 && !url.includes('adguard')
          ? [{ name: DKIM, type: 16, TTL: 3600, data: '"v=DKIM1; p=NEU"' }]
          : [],
      (url) => (url.includes('adguard') ? 2 : 0)
    );

    const types = propagationTypes(DKIM);
    const results = await queryAllResolvers(DKIM, { types });
    expect(results.find((r) => r.resolver.id === 'adguard')?.error).toBe('SERVFAIL');
    expect(propagationFindings(results, types).map((f) => f.id)).toEqual(['propagation-consistent']);
  });

  it('wertet NXDOMAIN als fehlenden Eintrag', async () => {
    stubDoh(
      (url, type) =>
        type === 16 && !url.includes('adguard')
          ? [{ name: DKIM, type: 16, TTL: 3600, data: '"v=DKIM1; p=NEU"' }]
          : [],
      (url) => (url.includes('adguard') ? 3 : 0)
    );

    const types = propagationTypes(DKIM);
    const results = await queryAllResolvers(DKIM, { types });
    expect(results.find((r) => r.resolver.id === 'adguard')?.error).toBeUndefined();
    expect(propagationFindings(results, types).map((f) => f.id)).toEqual(['propagation-mismatch']);
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

/* ─── #131: wählbarer Typ ───────────────────────────────────────────── */

describe('propagationTypeQuery', () => {
  it('lässt einen fehlenden oder leeren Parameter beim Standard', () => {
    expect(propagationTypeQuery(undefined)).toBeUndefined();
    expect(propagationTypeQuery('')).toBeUndefined();
  });

  it('nimmt nur Typen aus der festen Liste, ohne Rücksicht auf Groß-/Kleinschreibung', () => {
    expect(propagationTypeQuery('MX')).toBe('MX');
    expect(propagationTypeQuery('caa')).toBe('CAA');
    for (const raw of ['SRV', 'PTR', 'DS', 'ANY', '15', 'A;AAAA', ['A', 'MX'], { type: 'A' }]) {
      expect(propagationTypeQuery(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe('queryAllResolvers — Negativ-TTL', () => {
  it('hängt je Typ ohne Eintrag die Restlaufzeit an, wenn der Resolver ein SOA mitliefert', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = new URL(input);
        const type = Number(url.searchParams.get('type'));
        // AdGuard schickt zu „gibt es nicht“ kein SOA.
        const soa = url.hostname.includes('adguard')
          ? undefined
          : [{ name: 'example.com.', type: 6, TTL: 1200, data: 'ns1.example. h.example. 9 7200 900 1209600 3600' }];
        const body =
          type === 1
            ? { Status: 0, Answer: [{ name: 'example.com.', type: 1, TTL: 60, data: '192.0.2.1' }] }
            : { Status: 0, Authority: soa };
        return new Response(JSON.stringify(body));
      })
    );

    const results = await queryAllResolvers('example.com', { types: ['A', 'AAAA'] });
    const cloudflare = results.find((r) => r.resolver.id === 'cloudflare')!;
    expect(cloudflare.negativeTtl).toEqual({ AAAA: 1200 });
    expect(results.find((r) => r.resolver.id === 'adguard')).not.toHaveProperty('negativeTtl');
  });
});

describe('propagationSection', () => {
  const TTL_MS = 60_000;
  /** A für alle, sonst MX — genug, um zu sehen, welche Typen gefragt werden. */
  const answers = (_url: string, type: number): Answer[] =>
    type === 1
      ? [{ name: 'section.example.', type: 1, TTL: 60, data: '192.0.2.1' }]
      : type === 15
        ? [{ name: 'section.example.', type: 15, TTL: 300, data: '10 mx.example.net.' }]
        : [];

  /**
   * Ohne `type` genau wie vor #131: A und AAAA für einen Host, der Befund
   * dazu — Report und Score hängen daran.
   */
  it('liefert ohne Typ unverändert die Standard-Typen samt Befund', async () => {
    const calls = stubDoh(answers);
    const section = await propagationSection('compat.section.example', { ttlMs: TTL_MS });

    expect(new Set(calls.map((c) => c.type))).toEqual(new Set([1, 28]));
    expect(Object.keys(section)).toEqual(['propagation', 'findings']);
    expect(section.findings).toEqual(propagationFindings(section.propagation, ['A', 'AAAA']));
    expect(section.findings.map((f) => f.id)).toEqual(['propagation-consistent']);
  });

  it('fragt mit Typ nur diesen ab und liefert keinen Befund', async () => {
    const calls = stubDoh(answers);
    const section = await propagationSection('typed.section.example', { type: 'MX', ttlMs: TTL_MS });

    expect(calls.map((c) => c.type)).toEqual(DOH_RESOLVERS.map(() => 15));
    expect(section.type).toBe('MX');
    // Score und Findings bleiben bei den Standard-Typen.
    expect(section.findings).toEqual([]);
    expect(section.propagation[0].records).toEqual([
      { type: 'MX', name: 'section.example', priority: 10, value: 'mx.example.net', ttl: 300 },
    ]);
  });

  it('cached je Typ getrennt', async () => {
    const domain = 'cache.section.example';
    const calls = stubDoh(answers);

    await propagationSection(domain, { ttlMs: TTL_MS });
    expect(calls).toHaveLength(DOH_RESOLVERS.length * 2);

    // Ein anderer Typ ist ein eigener Eintrag …
    await propagationSection(domain, { type: 'MX', ttlMs: TTL_MS });
    expect(calls).toHaveLength(DOH_RESOLVERS.length * 3);

    // … auch einer der Standard-Typen allein.
    await propagationSection(domain, { type: 'A', ttlMs: TTL_MS });
    expect(calls).toHaveLength(DOH_RESOLVERS.length * 4);

    // Wiederholt: alles aus dem Cache.
    await propagationSection(domain, { ttlMs: TTL_MS });
    await propagationSection(domain, { type: 'MX', ttlMs: TTL_MS });
    await propagationSection(domain, { type: 'A', ttlMs: TTL_MS });
    expect(calls).toHaveLength(DOH_RESOLVERS.length * 4);
  });
});
