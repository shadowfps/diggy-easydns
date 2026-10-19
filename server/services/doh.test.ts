import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOH_RESOLVERS, dohQuery, parseDohTxt } from './doh.js';
import { QUESTION_NAME, name, parseQuery, pointer, response, txt, u16 } from '../test/dnsMessage.js';

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

describe('DOH_RESOLVERS', () => {
  it('hat eindeutige Ids, Endpunkte und Betreiber', () => {
    const unique = (values: string[]) => expect(new Set(values).size).toBe(values.length);
    unique(DOH_RESOLVERS.map((r) => r.id));
    unique(DOH_RESOLVERS.map((r) => new URL(r.url).host));
    unique(DOH_RESOLVERS.map((r) => r.ip));
    unique(DOH_RESOLVERS.map((r) => r.operator));
  });

  it('spricht nur HTTPS, ohne Parameter im Endpunkt', () => {
    for (const r of DOH_RESOLVERS) {
      const url = new URL(r.url);
      expect(url.protocol, r.id).toBe('https:');
      expect(url.search, r.id).toBe('');
      expect(['json', 'wire'], r.id).toContain(r.format);
    }
  });

  /** Ids und Reihenfolge der ersten fünf hängen in UI, Tests und gespeicherten Reports. */
  it('behält die bisherigen fünf vorn und in ihrer Reihenfolge', () => {
    expect(DOH_RESOLVERS.slice(0, 5).map((r) => r.id)).toEqual([
      'cloudflare',
      'google',
      'adguard',
      'dns-sb',
      'nextdns',
    ]);
    expect(DOH_RESOLVERS.length).toBeGreaterThanOrEqual(9);
  });

  it('zeigt als Flagge den Sitz des Betreibers', () => {
    for (const r of DOH_RESOLVERS) {
      expect(r.country, r.id).toMatch(/^[A-Z]{2}$/);
      const flag = String.fromCodePoint(...[...r.country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
      expect(r.flag, r.id).toBe(flag);
    }
  });

  /**
   * Jeder Anbieter bekommt die abgefragte Domain — er gehört in die
   * Empfänger-Tabelle der Datenschutzhinweise und in die Herleitung in
   * docs/COMPLIANCE.md. Ein neuer Resolver ohne beides fällt hier auf.
   */
  it('steht in den Datenschutzhinweisen und in docs/COMPLIANCE.md', () => {
    const privacy = readFileSync(new URL('../../src/modules/datenschutz/DatenschutzText.tsx', import.meta.url), 'utf8');
    const compliance = readFileSync(new URL('../../docs/COMPLIANCE.md', import.meta.url), 'utf8');
    for (const r of DOH_RESOLVERS) {
      const name = r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(privacy, r.id).toMatch(
        new RegExp(`<Row service="(?:[^"]*\\W)?${name}\\b[^"]*" purpose="[^"]*Propagations-Vergleich`)
      );
      expect(compliance, r.id).toContain(r.url);
    }
  });
});

describe('dohQuery — Wireformat', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const quad9 = DOH_RESOLVERS.find((r) => r.format === 'wire')!;

  /** Antwortet auf die Anfrage im Wireformat mit den angegebenen Einträgen. */
  function stubWire(answers: (question: { name: string; type: number }) => Parameters<typeof response>[0]['answers']) {
    const requests: { url: string; accept: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init: RequestInit) => {
        requests.push({ url: input, accept: new Headers(init.headers).get('accept') });
        const question = parseQuery(Buffer.from(new URL(input).searchParams.get('dns')!, 'base64url'));
        return new Response(response({ question, answers: answers(question) }));
      })
    );
    return requests;
  }

  it('fragt per GET mit ?dns= und application/dns-message', async () => {
    const requests = stubWire(() => []);
    await dohQuery(quad9, 'www.example.com', 'A');

    expect(requests).toHaveLength(1);
    expect(requests[0].accept).toBe('application/dns-message');
    const url = new URL(requests[0].url);
    expect(`${url.origin}${url.pathname}`).toBe(quad9.url);
    expect([...url.searchParams.keys()]).toEqual(['dns']);
    expect(url.searchParams.get('dns')).toBe('AAABAAABAAAAAAAAA3d3dwdleGFtcGxlA2NvbQAAAQAB');
  });

  it('liefert MX, CNAME und TXT wie die JSON-API', async () => {
    stubWire((q) => {
      if (q.type === 15) return [{ name: pointer(QUESTION_NAME), type: 15, rdata: [...u16(10), ...name('mx.example.com')] }];
      return [
        { name: pointer(QUESTION_NAME), type: 5, rdata: name('dkim.provider.net') },
        { name: 'dkim.provider.net', type: 16, rdata: txt('v=DKIM1; p=MIIB', 'IjANBgkq') },
      ];
    });

    const mx = await dohQuery(quad9, 'example.com', 'MX');
    expect(mx.records).toEqual([{ type: 'MX', name: 'example.com', priority: 10, value: 'mx.example.com', ttl: 300 }]);

    const dkim = await dohQuery(quad9, 's1._domainkey.example.com', 'TXT');
    expect(dkim.records.map((r) => `${r.type} ${r.name} ${r.value}`)).toEqual([
      'CNAME s1._domainkey.example.com dkim.provider.net',
      'TXT dkim.provider.net v=DKIM1; p=MIIBIjANBgkq',
    ]);
    expect(dkim.status).toBe(0);
  });
});
