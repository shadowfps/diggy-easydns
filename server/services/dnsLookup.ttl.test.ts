import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DnsRecord, RecordType } from '../types.js';

/**
 * TTL-Zuordnung in lookupStandardRecords (#76).
 *
 * MX, NS und TXT standen in der Liste immer mit `0s`, weil node:dns für diese
 * Typen keine TTL liefert. Jetzt kommt sie per DoH dazu. Geprüft wird hier
 * zweierlei: dass jeder Typ die TTL SEINES RRsets bekommt, und dass ein
 * Ausfall der TTL-Quelle keinen Record kostet.
 *
 * Gemockt sind beide Quellen an ihrer Außengrenze — der node:dns-Resolver und
 * `fetch` —, damit das echte DoH-Parsing aus doh.ts mitläuft.
 */

const dns = vi.hoisted(() => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
  resolveMx: vi.fn(),
  resolveNs: vi.fn(),
  resolveTxt: vi.fn(),
  resolveCaa: vi.fn(),
  resolveSoa: vi.fn(),
  resolveCname: vi.fn(),
}));

vi.mock('node:dns', () => ({
  promises: {
    // dnsLookup.ts legt den Resolver beim Import einmal an — er bekommt die
    // gemeinsamen vi.fn-Instanzen, die jeder Test selbst belegt.
    Resolver: class {
      setServers() {}
      resolve4 = dns.resolve4;
      resolve6 = dns.resolve6;
      resolveMx = dns.resolveMx;
      resolveNs = dns.resolveNs;
      resolveTxt = dns.resolveTxt;
      resolveCaa = dns.resolveCaa;
      resolveSoa = dns.resolveSoa;
      resolveCname = dns.resolveCname;
    },
  },
}));

const { lookupStandardRecords, TTL_LOOKUP_TIMEOUT_MS } = await import('./dnsLookup.js');

interface Answer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

const TYPE_BY_NUMBER: Record<string, RecordType> = {
  '1': 'A',
  '28': 'AAAA',
  '5': 'CNAME',
  '15': 'MX',
  '2': 'NS',
  '16': 'TXT',
  '257': 'CAA',
  '6': 'SOA',
};

function enodata(): NodeJS.ErrnoException {
  return Object.assign(new Error('queryX ENODATA'), { code: 'ENODATA' });
}

/** DoH-Antworten je Typ — absichtlich lauter verschiedene TTLs. */
function apexAnswers(): Partial<Record<RecordType, Answer[]>> {
  return {
    MX: [
      { name: 'example.com.', type: 15, TTL: 3600, data: '10 mx1.example.com.' },
      { name: 'example.com.', type: 15, TTL: 3600, data: '20 mx2.example.com.' },
    ],
    NS: [
      { name: 'example.com.', type: 2, TTL: 86400, data: 'ns1.example.net.' },
      { name: 'example.com.', type: 2, TTL: 86400, data: 'ns2.example.net.' },
    ],
    TXT: [{ name: 'example.com.', type: 16, TTL: 120, data: '"v=spf1 -all"' }],
    CAA: [{ name: 'example.com.', type: 257, TTL: 600, data: '0 issue "letsencrypt.org"' }],
    SOA: [
      {
        name: 'example.com.',
        type: 6,
        TTL: 1800,
        data: 'ns1.example.net. hostmaster.example.com. 1 7200 3600 1209600 3600',
      },
    ],
  };
}

/** Stellt `fetch` auf eine DoH-Attrappe um, die je Typ aus `answers` antwortet. */
function stubDoh(answers: Partial<Record<RecordType, Answer[]>>) {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const type = TYPE_BY_NUMBER[new URL(String(input)).searchParams.get('type') ?? ''];
    const answer = type ? answers[type] : undefined;
    return Response.json(answer ? { Status: 0, Answer: answer } : { Status: 0 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function ttlsByType(records: DnsRecord[]): Partial<Record<RecordType, (number | null)[]>> {
  const result: Partial<Record<RecordType, (number | null)[]>> = {};
  for (const r of records) (result[r.type] ??= []).push(r.ttl);
  return result;
}

beforeEach(() => {
  for (const fn of Object.values(dns)) fn.mockReset();
  dns.resolve4.mockResolvedValue([{ address: '93.184.216.34', ttl: 300 }]);
  dns.resolve6.mockRejectedValue(enodata());
  dns.resolveMx.mockResolvedValue([
    { exchange: 'mx2.example.com', priority: 20 },
    { exchange: 'mx1.example.com', priority: 10 },
  ]);
  dns.resolveNs.mockResolvedValue(['ns1.example.net', 'ns2.example.net']);
  dns.resolveTxt.mockResolvedValue([['v=spf1 -all']]);
  dns.resolveCaa.mockResolvedValue([{ critical: 0, issue: 'letsencrypt.org' }]);
  dns.resolveSoa.mockResolvedValue({
    nsname: 'ns1.example.net',
    hostmaster: 'hostmaster.example.com',
    serial: 1,
    refresh: 7200,
    retry: 3600,
    expire: 1209600,
    minttl: 3600,
  });
  dns.resolveCname.mockRejectedValue(enodata());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('lookupStandardRecords — TTL-Zuordnung', () => {
  it('gibt jedem Typ die TTL seines RRsets', async () => {
    stubDoh(apexAnswers());

    const records = await lookupStandardRecords('example.com');

    expect(ttlsByType(records)).toEqual({
      A: [300], // weiter aus node:dns
      MX: [3600, 3600],
      NS: [86400, 86400],
      TXT: [120],
      CAA: [600],
      // Nicht 3600 aus dem minttl-Feld: das ist die TTL negativer Antworten,
      // nicht die des SOA-Records.
      SOA: [1800],
    });
  });

  it('fragt DoH nur für die Typen, denen node:dns die TTL schuldig bleibt', async () => {
    const fetchMock = stubDoh(apexAnswers());

    await lookupStandardRecords('example.com');

    const queried = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    expect(new Set(queried.map((u) => u.hostname))).toEqual(new Set(['cloudflare-dns.com']));
    expect(queried.map((u) => TYPE_BY_NUMBER[u.searchParams.get('type') ?? '']).sort()).toEqual(
      ['CAA', 'CNAME', 'MX', 'NS', 'SOA', 'TXT']
    );
  });

  it('nimmt bei einem Alias das Minimum aus CNAME-Kette und Ziel-RRset', async () => {
    dns.resolveCname.mockResolvedValue(['edge.example.net']);
    // Wie Cloudflare antwortet: erst die CNAME-Kette des Alias, dann das
    // RRset des Ziels. Das mittlere Glied läuft am frühesten ab — danach kann
    // die Kette woanders hinzeigen, also gilt die Antwort nur so lange. Bei
    // TXT ist dagegen das RRset selbst das kürzeste Glied.
    const chain: Answer[] = [
      { name: 'www.example.com.', type: 5, TTL: 3600, data: 'cdn.example.net.' },
      { name: 'cdn.example.net.', type: 5, TTL: 60, data: 'edge.example.net.' },
    ];
    stubDoh({
      CNAME: [chain[0]],
      TXT: [...chain, { name: 'edge.example.net.', type: 16, TTL: 30, data: '"v=spf1 -all"' }],
      MX: [...chain, { name: 'edge.example.net.', type: 15, TTL: 900, data: '10 mx1.example.com.' }],
      // Nur die Kette, kein RRset des Ziels: daraus lässt sich keine TTL ablesen.
      CAA: [...chain],
    });

    const ttls = ttlsByType(await lookupStandardRecords('www.example.com'));

    expect(ttls.CNAME).toEqual([3600]);
    expect(ttls.MX).toEqual([60, 60]);
    expect(ttls.TXT).toEqual([30]);
    expect(ttls.CAA).toEqual([null]);
  });

  it('nimmt die kleinste TTL, wenn ein RRset uneinheitlich ankommt', async () => {
    stubDoh({
      ...apexAnswers(),
      MX: [
        { name: 'example.com.', type: 15, TTL: 300, data: '10 mx1.example.com.' },
        { name: 'example.com.', type: 15, TTL: 299, data: '20 mx2.example.com.' },
      ],
    });

    const ttls = ttlsByType(await lookupStandardRecords('example.com'));

    expect(ttls.MX).toEqual([299, 299]);
  });
});

describe('lookupStandardRecords — TTL-Quelle fällt aus', () => {
  /** Alles, was node:dns liefert, muss auch ohne DoH da sein. */
  const EXPECTED_TYPES: RecordType[] = ['A', 'MX', 'MX', 'NS', 'NS', 'TXT', 'CAA', 'SOA'];

  it.each([
    ['Netzwerkfehler', () => Promise.reject(new TypeError('fetch failed'))],
    ['HTTP 503', () => Promise.resolve(new Response('', { status: 503 }))],
    ['kaputtes JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
    // DoH antwortet, kennt das RRset aber nicht (andere Cache-Sicht).
    ['Antwort ohne RRset', () => Promise.resolve(Response.json({ Status: 0 }))],
  ])('%s: Records bleiben, TTL ist null statt 0', async (_label, respond) => {
    vi.stubGlobal('fetch', vi.fn(respond));

    const records = await lookupStandardRecords('example.com');

    expect(records.map((r) => r.type)).toEqual(EXPECTED_TYPES);
    expect(ttlsByType(records)).toEqual({
      A: [300],
      MX: [null, null],
      NS: [null, null],
      TXT: [null],
      CAA: [null],
      SOA: [null],
    });
  });

  it(`wartet auf hängendes DoH höchstens ${TTL_LOOKUP_TIMEOUT_MS} ms`, async () => {
    vi.useFakeTimers();
    // Antwortet nie — nur der Abbruch über das AbortSignal beendet die Anfrage.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError'))
            );
          })
      )
    );

    let records: DnsRecord[] | undefined;
    void lookupStandardRecords('example.com').then((r) => (records = r));

    await vi.advanceTimersByTimeAsync(TTL_LOOKUP_TIMEOUT_MS - 1);
    expect(records).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(records?.map((r) => r.type)).toEqual(EXPECTED_TYPES);
    expect(records?.filter((r) => r.type !== 'A').every((r) => r.ttl === null)).toBe(true);
  });
});
