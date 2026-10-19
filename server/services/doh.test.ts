import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOH_RESOLVERS, dohQuery, negativeCacheTtl, parseDohTxt } from './doh.js';

/**
 * DoH liefert TXT als '"chunk1" "chunk2"'. Der Zusammenbau muss stimmen, weil
 * SPF-, DMARC- und DKIM-Erkennung auf dem Ergebnis-String arbeiten.
 */
describe('parseDohTxt', () => {
  it('entfernt die umschließenden Anführungszeichen', () => {
    expect(parseDohTxt('"v=spf1 -all"')).toBe('v=spf1 -all');
  });

  it('fügt mehrere Chunks ohne Trennzeichen zusammen', () => {
    // 255-Byte-Grenze: lange DKIM-Keys kommen in Stücken.
    expect(parseDohTxt('"v=DKIM1; p=MIIB" "IjANBgkq"')).toBe('v=DKIM1; p=MIIBIjANBgkq');
  });

  it('behandelt escapte Anführungszeichen im Wert', () => {
    expect(parseDohTxt('"sagt \\"hallo\\""')).toBe('sagt "hallo"');
  });

  /**
   * #82: Google liefert den Wert so, wie er im Eintrag steht, die anderen
   * Resolver escaped. Beide müssen danach gleich sein — sonst meldet die
   * Propagation eine Abweichung, die es nicht gibt.
   */
  it('liefert für Google- und Cloudflare-Format denselben Wert', () => {
    const pairs: [google: string, cloudflare: string][] = [
      ['sagt "hallo"', '"sagt \\"hallo\\""'],
      // `\;` aus einer Zonendatei, versehentlich mit Backslash eingetragen.
      ['v=DKIM1\\; k=rsa\\; p=MIIB', '"v=DKIM1\\\\; k=rsa\\\\; p=MIIB"'],
    ];
    for (const [google, cloudflare] of pairs) {
      expect(parseDohTxt(google), google).toBe(parseDohTxt(cloudflare));
    }
  });

  /**
   * Der Fallback ist der Fall, der in der Praxis über Erfolg entscheidet:
   * Resolver liefern TXT nicht einheitlich quotiert. Wird ein unquotierter
   * Wert verschluckt, fehlt anschließend der SPF-/DMARC-Record.
   */
  it('gibt unquotierte Eingaben unverändert zurück', () => {
    for (const raw of [
      'kein-quoting',
      'v=spf1 include:_spf.google.com ~all',
      'v=DMARC1; p=reject; rua=mailto:x@example.com',
      'google-site-verification=abc123',
    ]) {
      expect(parseDohTxt(raw), raw).toBe(raw);
    }
  });

  it('behandelt Sonderfälle ohne zu werfen', () => {
    expect(parseDohTxt('""')).toBe('');
    expect(parseDohTxt('')).toBe('');
    // Halb offenes Quoting: kein Match, also unverändert durchreichen statt
    // einen Teilstring zu erfinden.
    expect(parseDohTxt('"unvollstaendig')).toBe('"unvollstaendig');
    // Quotes mitten im Wert, aber nicht als Chunk-Trenner.
    expect(parseDohTxt('"a" "" "b"')).toBe('ab');
  });
});

/**
 * #131: Wie lange ein Resolver „gibt es nicht“ noch weitergibt. Werte wie
 * echte Antworten: Cloudflare schickt das SOA mit, AdGuard nicht.
 */
describe('negativeCacheTtl', () => {
  const soa = (TTL: number, data: string) => [{ name: 'example.com.', type: 6, TTL, data }];

  it('nimmt das Kleinere aus TTL und MINIMUM des SOA (RFC 2308)', () => {
    // Die TTL zählt im Cache herunter …
    expect(
      negativeCacheTtl(soa(605, 'ns-1707.awsdns-21.co.uk. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400'))
    ).toBe(605);
    // … und ist nie länger als MINIMUM.
    expect(negativeCacheTtl(soa(7200, 'ns1.example. h.example. 1 7200 900 1209600 300'))).toBe(300);
  });

  it('rät nicht, wenn das SOA fehlt oder unlesbar ist', () => {
    expect(negativeCacheTtl(undefined)).toBeUndefined();
    expect(negativeCacheTtl([])).toBeUndefined();
    expect(negativeCacheTtl([{ name: 'example.com.', type: 2, TTL: 60, data: 'ns1.example.' }])).toBeUndefined();
    expect(negativeCacheTtl(soa(60, 'ns1.example. h.example. 1'))).toBeUndefined();
  });
});

describe('dohQuery — Negativ-TTL', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubBody(body: unknown) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body))));
  }

  const authority = [
    { name: 'example.com.', type: 6, TTL: 900, data: 'ns1.example. h.example. 1 7200 900 1209600 3600' },
  ];

  it('meldet sie bei NODATA', async () => {
    stubBody({ Status: 0, Authority: authority });
    const result = await dohQuery(DOH_RESOLVERS[0], 'example.com', 'AAAA');
    expect(result.records).toEqual([]);
    expect(result.negativeTtl).toBe(900);
  });

  it('meldet sie, wenn nur die CNAME-Kette ankommt', async () => {
    stubBody({
      Status: 0,
      Answer: [{ name: 'www.example.com.', type: 5, TTL: 300, data: 'example.net.' }],
      Authority: authority,
    });
    const result = await dohQuery(DOH_RESOLVERS[0], 'www.example.com', 'MX');
    expect(result.negativeTtl).toBe(900);
  });

  it('lässt sie weg, wenn es einen Eintrag gibt oder kein SOA', async () => {
    stubBody({
      Status: 0,
      Answer: [{ name: 'example.com.', type: 1, TTL: 60, data: '192.0.2.1' }],
      Authority: authority,
    });
    expect(await dohQuery(DOH_RESOLVERS[0], 'example.com', 'A')).not.toHaveProperty('negativeTtl');

    // AdGuard: `Answer: null` und kein Authority-Abschnitt.
    stubBody({ Status: 0, Answer: null });
    expect(await dohQuery(DOH_RESOLVERS[0], 'example.com', 'AAAA')).not.toHaveProperty('negativeTtl');
  });
});
