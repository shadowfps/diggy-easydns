import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agedResults,
  MIN_RESOLVER_CACHE_MS,
  propagationSection,
  propagationTypeQuery,
  queryAllResolvers,
  shortestTtl,
} from './propagation.js';
import { propagationFindings } from './reportBuilder.js';
import { DOH_RESOLVERS } from './doh.js';
import { comparePropagation, propagationTypes } from '../../shared/propagation.js';
import type { ResolverResult } from '../types.js';
import { parseQuery, rdataFromJson, response } from '../test/dnsMessage.js';
import { CLOSED_BEFORE_RESPONSE, http2Get, type Http2GetInit } from '../lib/http2Get.js';

/**
 * Die Resolver werden über ihren Transport gemockt (lib/http2Get.ts, Aufruf
 * wie `fetch`): geprüft wird, was wir fragen und wie wir die Antworten
 * zusammensetzen — nicht das Netz. Den Transport selbst prüfen
 * http2Get.test.ts und doh.http2.test.ts gegen einen lokalen HTTP/2-Server.
 */

vi.mock('../lib/http2Get.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/http2Get.js')>()),
  http2Get: vi.fn(),
}));

/** Ersetzt den DoH-Transport (HTTP/2, lib/http2Get.ts) — Aufruf wie `fetch`. */
function stubTransport(fn: (url: string, init: Http2GetInit) => Promise<Response>) {
  vi.mocked(http2Get).mockImplementation(fn);
}

const DKIM = 's1._domainkey.example.com';
const KEY_PART_1 = 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A';
const KEY_PART_2 = 'MIIBCgKCAQEAvWUrrAaQnCEWgPSwxaJ00hO+wIDAQAB';

interface Answer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

/**
 * Antwortet je nach Resolver und Typ — so, wie die echten DoH-Anbieter
 * formatieren. Anbieter ohne JSON-API (`?dns=…`) bekommen dieselben Einträge
 * im Wireformat.
 */
function stubDoh(
  answer: (resolverUrl: string, type: number) => Answer[],
  status: (resolverUrl: string) => number = () => 0,
  authority: (resolverUrl: string, type: number) => Answer[] | undefined = () => undefined
) {
  const calls: { url: string; type: number; format: 'json' | 'wire' }[] = [];
  stubTransport(async (input: string) => {
    const url = new URL(input);
    const base = `${url.origin}${url.pathname}`;
    const dns = url.searchParams.get('dns');
    if (dns) {
      const question = parseQuery(Buffer.from(dns, 'base64url'));
      calls.push({ url: base, type: question.type, format: 'wire' });
      const raw = (a: Answer) => ({ name: a.name, type: a.type, ttl: a.TTL, rdata: rdataFromJson(a.type, a.data) });
      const body = response({
        rcode: status(base),
        question,
        answers: answer(base, question.type).map(raw),
        authority: authority(base, question.type)?.map(raw),
      });
      return new Response(body, { headers: { 'content-type': 'application/dns-message' } });
    }
    const type = Number(url.searchParams.get('type'));
    calls.push({ url: base, type, format: 'json' });
    const soa = authority(base, type);
    return new Response(JSON.stringify({ Status: status(base), Answer: answer(base, type), ...(soa && { Authority: soa }) }), {
      headers: { 'content-type': 'application/dns-json' },
    });
  });
  return calls;
}

afterEach(() => {
  vi.mocked(http2Get).mockReset();
  vi.useRealTimers();
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
    expect(findings[0].description).toContain(`1 von ${DOH_RESOLVERS.length} Resolvern`);
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

  /**
   * Die Anbieter mit Wireformat bekommen den Schlüssel in Stücken ohne
   * Anführungszeichen. Zusammengesetzt muss er derselbe sein wie bei
   * Cloudflare und Google — sonst stünden sie alle als „abweichend“ da.
   */
  it('setzt TXT-Stücke aus dem Wireformat wie die der JSON-API zusammen', async () => {
    stubDoh((url, type) => {
      if (type !== 16) return [];
      const data = url.includes('dns.google')
        ? 'sagt "hallo" ' + KEY_PART_1 + KEY_PART_2
        : `"sagt \\"hallo\\" ${KEY_PART_1}" "${KEY_PART_2}"`;
      return [{ name: `${DKIM}.`, type: 16, TTL: 3600, data }];
    });

    const types = propagationTypes(DKIM);
    const results = await queryAllResolvers(DKIM, { types });
    for (const r of results) {
      expect(r.records.map((rec) => rec.value), r.resolver.id).toEqual([
        `sagt "hallo" ${KEY_PART_1}${KEY_PART_2}`,
      ]);
    }
    expect(propagationFindings(results, types).map((f) => f.id)).toEqual(['propagation-consistent']);
  });
});

describe('queryAllResolvers — Formate', () => {
  /**
   * Quad9, OpenDNS, Control D und DNS4EU haben keine JSON-API. Fragt
   * man sie mit `?name=…`, antworten sie mit HTTP 400 — der Resolver stünde
   * dauerhaft als Fehler da.
   */
  it('fragt jeden Anbieter in seinem Format und jeden genau einmal je Typ', async () => {
    const calls = stubDoh(() => []);
    await queryAllResolvers('www.example.com', { types: ['A'] });

    expect(calls).toHaveLength(DOH_RESOLVERS.length);
    for (const resolver of DOH_RESOLVERS) {
      const endpoint = new URL(resolver.url);
      const own = calls.filter((c) => c.url === `${endpoint.origin}${endpoint.pathname}`);
      expect(own.map((c) => c.format), resolver.id).toEqual([resolver.format]);
    }
  });

  it('bringt Wireformat- und JSON-Antworten auf denselben Stand', async () => {
    stubDoh((_url, type) =>
      type === 28
        ? [{ name: 'www.example.com.', type: 28, TTL: 300, data: '2001:db8::1' }]
        : [{ name: 'www.example.com.', type: 1, TTL: 300, data: '192.0.2.1' }]
    );
    const types = propagationTypes('www.example.com');
    const results = await queryAllResolvers('www.example.com', { types });

    for (const r of results) {
      expect(r.error, r.resolver.id).toBeUndefined();
      expect(r.records.map((rec) => `${rec.type} ${rec.name} ${rec.value}`), r.resolver.id).toEqual([
        'A www.example.com 192.0.2.1',
        'AAAA www.example.com 2001:db8::1',
      ]);
    }
    expect(propagationFindings(results, types).map((f) => f.id)).toEqual(['propagation-consistent']);
  });

  /**
   * #131 vergleicht jeden wählbaren Typ, #132 holt vier Anbieter im
   * Wireformat dazu. Dieselben Records müssen aus beiden Formaten gleich
   * verglichen werden — Schlusspunkt, Anführungszeichen im CAA, SOA-Felder —
   * und jeder Resolver eine TTL nennen. Live für github.com geprüft
   * (A, AAAA, MX, NS, TXT, CAA, SOA über alle neun): gleiche Werte.
   */
  it('vergleicht jeden wählbaren Typ aus beiden Formaten gleich, mit TTL', async () => {
    const HOST = 'example.com';
    const DATA: Record<number, string[]> = {
      1: ['192.0.2.1'],
      28: ['2001:db8::1'],
      5: ['target.example.net.'],
      15: ['10 mx1.example.com.', '20 mx2.example.com.'],
      2: ['ns1.example.com.', 'ns2.example.net.'],
      16: ['"v=spf1 include:_spf.example.com -all"', '"sagt \\"hallo\\"" " in zwei Stücken"'],
      257: ['0 issue "letsencrypt.org"', '0 iodef "mailto:security@example.com"', '128 issuewild ";"'],
      6: ['ns1.example.com. hostmaster.example.com. 2026101901 7200 900 1209600 3600'],
    };
    stubDoh((_url, type) => (DATA[type] ?? []).map((data) => ({ name: `${HOST}.`, type, TTL: 300, data })));

    for (const type of ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'CAA', 'SOA'] as const) {
      const comparison = comparePropagation(await queryAllResolvers(HOST, { types: [type] }), type);
      expect(comparison.compared, type).toBe(DOH_RESOLVERS.length);
      expect(comparison.deviating, type).toBe(0);
      for (const answer of comparison.answers) {
        expect(answer.status, `${type} ${answer.result.resolver.id}`).toBe('match');
        expect(answer.ttl, `${type} ${answer.result.resolver.id}`).toBe(300);
      }
    }
  });
});

describe('queryAllResolvers — ausfallende Resolver', () => {
  const HOST = 'www.example.com';

  /** Antwortet wie ein gesunder Resolver mit 192.0.2.1 — als JSON oder im Wireformat. */
  function healthy(input: string): Response {
    const url = new URL(input);
    const dns = url.searchParams.get('dns');
    if (dns) {
      const question = parseQuery(Buffer.from(dns, 'base64url'));
      return new Response(
        response({
          question,
          answers: question.type === 1 ? [{ name: question.name, type: 1, rdata: [192, 0, 2, 1] }] : [],
        })
      );
    }
    const type = Number(url.searchParams.get('type'));
    return Response.json({
      Status: 0,
      Answer: type === 1 ? [{ name: HOST, type: 1, TTL: 300, data: '192.0.2.1' }] : [],
    });
  }

  const urlOf = (id: string) => DOH_RESOLVERS.find((r) => r.id === id)!.url;

  it('liefert ein Ergebnis je Resolver, auch wenn einzelne scheitern', async () => {
    stubTransport(async (input: string) => {
      if (input.startsWith(urlOf('quad9'))) throw new TypeError('fetch failed');
      if (input.startsWith(urlOf('opendns'))) return new Response('busy', { status: 503 });
      // Abgeschnitten: Kopf ohne Rest
      if (input.startsWith(urlOf('controld'))) {
        return new Response(new Uint8Array([0, 0, 0x81, 0x80, 0, 1, 0, 1, 0, 0, 0, 0, 3]));
      }
      // Antwort auf eine andere Frage
      if (input.startsWith(urlOf('dns4eu'))) {
        return new Response(
          response({
            question: { name: 'andere.example.org', type: 1 },
            answers: [{ name: 'andere.example.org', type: 1, rdata: [198, 51, 100, 7] }],
          })
        );
      }
      return healthy(input);
    });

    const types = propagationTypes(HOST);
    const results = await queryAllResolvers(HOST, { types });

    // Reihenfolge wie DOH_RESOLVERS — die Ansicht verlässt sich darauf.
    expect(results.map((r) => r.resolver.id)).toEqual(DOH_RESOLVERS.map((r) => r.id));
    const errors = Object.fromEntries(
      results.filter((r) => r.error).map((r) => [r.resolver.id, r.error])
    );
    expect(errors).toEqual({
      quad9: 'fetch failed',
      opendns: 'opendns HTTP 503',
      controld: 'Ungültige DNS-Antwort: Nachricht endet vorzeitig',
      dns4eu: 'Ungültige DNS-Antwort: gehört nicht zur Frage',
    });

    // Wer scheitert, zählt nicht mit — die übrigen sind sich einig.
    const findings = propagationFindings(results, types);
    expect(findings.map((f) => f.id)).toEqual(['propagation-consistent']);
    expect(findings[0].params).toEqual({ count: DOH_RESOLVERS.length - 4 });
  });

  it('bricht einen hängenden Resolver nach dem Timeout ab, ohne auf ihn zu warten', async () => {
    stubTransport(async (input: string, init: Http2GetInit) => {
      if (!input.startsWith(urlOf('dns4eu'))) return healthy(input);
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    });

    const start = Date.now();
    const results = await queryAllResolvers(HOST, { types: ['A'], timeoutMs: 100 });

    expect(Date.now() - start).toBeLessThan(2000);
    expect(results.find((r) => r.resolver.id === 'dns4eu')?.error).toBe('Timeout');
    expect(results.filter((r) => !r.error)).toHaveLength(DOH_RESOLVERS.length - 1);
  });

  /** So meldet der Transport (wie fetch) einen Netzwerkfehler: TypeError, Grund in `cause`. */
  function fetchFailed(code: string): TypeError {
    return new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) });
  }

  /**
   * Quad9 setzte im Test rund 40 % der neuen TLS-Verbindungen zurück. Neue
   * Versuche retten die Antwort; ein Resolver, der gar nicht erreichbar ist,
   * bekommt trotzdem nur vier — und keiner, der eine HTTP-Antwort schickt.
   */
  it('versucht es nach Verbindungsabbrüchen bis zu dreimal neu', async () => {
    const attempts = new Map<string, number>();
    stubTransport(async (input: string) => {
      const id = DOH_RESOLVERS.find((r) => input.startsWith(r.url))!.id;
      const n = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, n);
      if (id === 'quad9' && n <= 2) throw fetchFailed('ECONNRESET');
      if (id === 'controld') throw fetchFailed(CLOSED_BEFORE_RESPONSE);
      if (id === 'opendns') return new Response('busy', { status: 503 });
      return healthy(input);
    });

    const results = await queryAllResolvers(HOST, { types: ['A'] });

    const quad9 = results.find((r) => r.resolver.id === 'quad9');
    expect(quad9?.records.map((r) => r.value)).toEqual(['192.0.2.1']);
    expect(attempts.get('quad9')).toBe(3);
    expect(results.find((r) => r.resolver.id === 'controld')?.error).toBe('fetch failed');
    expect(attempts.get('controld')).toBe(4);
    expect(attempts.get('opendns')).toBe(1);
    expect(attempts.get('cloudflare')).toBe(1);
  });

  /**
   * Ein Name, der sich nicht auflösen lässt, oder ein falsches Zertifikat
   * ist beim nächsten Versuch genauso falsch — vier Anläufe kosteten nur
   * Zeit und, beim DNS, Plätze im Threadpool von Node.
   */
  it('wiederholt andere Netzwerkfehler nicht', async () => {
    const attempts = new Map<string, number>();
    stubTransport(async (input: string) => {
      const id = DOH_RESOLVERS.find((r) => input.startsWith(r.url))!.id;
      attempts.set(id, (attempts.get(id) ?? 0) + 1);
      if (id === 'quad9') throw fetchFailed('ENOTFOUND');
      if (id === 'dns4eu') throw fetchFailed('CERT_HAS_EXPIRED');
      if (id === 'controld') throw new TypeError('fetch failed');
      return healthy(input);
    });

    const results = await queryAllResolvers(HOST, { types: ['A'] });

    for (const id of ['quad9', 'dns4eu', 'controld']) {
      expect(results.find((r) => r.resolver.id === id)?.error, id).toBe('fetch failed');
      expect(attempts.get(id), id).toBe(1);
    }
  });

  it('wertet eine gekürzte Antwort (TC) als Fehler statt als anderen Wert', async () => {
    stubTransport(async (input: string) => {
      if (!input.startsWith(urlOf('quad9'))) return healthy(input);
      const dns = new URL(input).searchParams.get('dns')!;
      return new Response(response({ question: parseQuery(Buffer.from(dns, 'base64url')), flags: 0x0200 }));
    });

    const results = await queryAllResolvers(HOST, { types: ['A'] });
    expect(results.find((r) => r.resolver.id === 'quad9')?.error).toBe('quad9: Antwort gekürzt (TC)');
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
  /** Mit #132 auch für die Anbieter im Wireformat — dort steht das SOA im Authority-Abschnitt. */
  it('hängt je Typ ohne Eintrag die Restlaufzeit an, wenn der Resolver ein SOA mitliefert', async () => {
    stubDoh(
      (_url, type) => (type === 1 ? [{ name: 'example.com.', type: 1, TTL: 60, data: '192.0.2.1' }] : []),
      () => 0,
      // AdGuard schickt zu „gibt es nicht“ kein SOA.
      (url, type) =>
        type === 1 || url.includes('adguard')
          ? undefined
          : [{ name: 'example.com.', type: 6, TTL: 1200, data: 'ns1.example. h.example. 9 7200 900 1209600 3600' }]
    );

    const results = await queryAllResolvers('example.com', { types: ['A', 'AAAA'] });
    for (const r of results) {
      expect(r.error, r.resolver.id).toBeUndefined();
      if (r.resolver.id === 'adguard') expect(r).not.toHaveProperty('negativeTtl');
      else expect(r.negativeTtl, r.resolver.id).toEqual({ AAAA: 1200 });
    }
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

/**
 * Die TTL zählt im Resolver weiter, während die Antwort im Cache liegt. Wer
 * nach 42 s erneut prüft, bekommt dieselben Antworten — aber die TTL von
 * jetzt, nicht die von vor 42 s.
 */
describe('propagationSection — TTL aus dem Cache', () => {
  afterEach(() => vi.useRealTimers());

  it('zieht die Zeit im Cache von den TTLs ab', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
    const calls = stubDoh((_url, type) =>
      type === 15 ? [{ name: 'aged.section.example.', type: 15, TTL: 300, data: '10 mx.example.net.' }] : []
    );
    const options = { type: 'MX' as const, ttlMs: 60_000 };

    const first = await propagationSection('aged.section.example', options);
    expect(first.propagation[0].records[0].ttl).toBe(300);

    vi.setSystemTime(new Date('2026-10-19T12:00:42.900Z'));
    const second = await propagationSection('aged.section.example', options);
    expect(calls).toHaveLength(DOH_RESOLVERS.length);
    expect(second.propagation.map((r) => r.records[0].ttl)).toEqual(DOH_RESOLVERS.map(() => 258));
    // Der Eintrag im Cache bleibt, wie er ist.
    expect(first.propagation[0].records[0].ttl).toBe(300);
    expect((await propagationSection('aged.section.example', options)).propagation[0].records[0].ttl).toBe(258);
  });

  /**
   * #133: Eine Antwort mit TTL 20 lag bis zu 60 s im Cache und stand danach
   * als „TTL 0s“ da — obwohl der Resolver längst neu gefragt haben kann.
   */
  it('hält Antworten nicht länger als ihre kürzeste TTL', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
    const calls = stubDoh((_url, type) =>
      type === 1 ? [{ name: 'short.section.example.', type: 1, TTL: 20, data: '192.0.2.1' }] : []
    );
    const options = { type: 'A' as const, ttlMs: 60_000 };

    await propagationSection('short.section.example', options);
    vi.setSystemTime(new Date('2026-10-19T12:00:19.900Z'));
    const cachedAnswer = await propagationSection('short.section.example', options);
    expect(calls).toHaveLength(DOH_RESOLVERS.length);
    expect(cachedAnswer.propagation[0].records[0].ttl).toBe(1);

    vi.setSystemTime(new Date('2026-10-19T12:00:25Z'));
    const fresh = await propagationSection('short.section.example', options);
    expect(calls).toHaveLength(DOH_RESOLVERS.length * 2);
    expect(fresh.propagation[0].records[0].ttl).toBe(20);
  });

  /** Sonst ginge bei TTL 0 jeder Aufruf erneut an alle Resolver — auch ein Reload Sekunden später. */
  it('cached auch bei TTL 0 wenigstens MIN_RESOLVER_CACHE_MS', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
    const calls = stubDoh((_url, type) =>
      type === 1 ? [{ name: 'zero.section.example.', type: 1, TTL: 0, data: '192.0.2.1' }] : []
    );
    const options = { type: 'A' as const, ttlMs: 60_000 };

    await propagationSection('zero.section.example', options);
    vi.setSystemTime(new Date(Date.parse('2026-10-19T12:00:00Z') + MIN_RESOLVER_CACHE_MS - 100));
    const cachedAnswer = await propagationSection('zero.section.example', options);
    expect(calls).toHaveLength(DOH_RESOLVERS.length);
    expect(cachedAnswer.propagation[0].records[0].ttl).toBe(0);

    vi.setSystemTime(new Date(Date.parse('2026-10-19T12:00:00Z') + MIN_RESOLVER_CACHE_MS + 100));
    await propagationSection('zero.section.example', options);
    expect(calls).toHaveLength(DOH_RESOLVERS.length * 2);
  });
});

describe('shortestTtl', () => {
  it('nimmt Records und Negativ-TTLs, ohne beide unbegrenzt', () => {
    const result = (ttl: number | null, negativeTtl?: ResolverResult['negativeTtl']): ResolverResult => ({
      resolver: { id: 'x', name: 'X', ip: '0.0.0.0', country: 'X', flag: '', provider: 'X' },
      records: [{ type: 'A', name: 'example.com', value: '192.0.2.1', ttl }],
      responseTimeMs: 10,
      ...(negativeTtl && { negativeTtl }),
    });
    expect(shortestTtl([result(300), result(60, { AAAA: 30 })])).toBe(30);
    expect(shortestTtl([result(null)])).toBe(Infinity);
    expect(shortestTtl([])).toBe(Infinity);
  });
});

describe('agedResults', () => {
  const result = (ttl: number | null, negativeTtl?: ResolverResult['negativeTtl']): ResolverResult => ({
    resolver: { id: 'x', name: 'X', ip: '0.0.0.0', country: 'X', flag: '', provider: 'X' },
    records: [{ type: 'A', name: 'example.com', value: '192.0.2.1', ttl }],
    responseTimeMs: 10,
    ...(negativeTtl && { negativeTtl }),
  });

  it('zählt auch die Negativ-TTL herunter, nie unter 0', () => {
    const [aged] = agedResults([result(30, { AAAA: 300, MX: 10 })], 20);
    expect(aged.records[0].ttl).toBe(10);
    expect(aged.negativeTtl).toEqual({ AAAA: 280, MX: 0 });
  });

  it('lässt unbekannte TTLs und frische Antworten, wie sie sind', () => {
    const fresh = [result(30)];
    expect(agedResults(fresh, 0)).toBe(fresh);
    expect(agedResults([result(null)], 20)[0].records[0].ttl).toBeNull();
    expect(agedResults([result(30)], 20)[0]).not.toHaveProperty('negativeTtl');
  });
});
