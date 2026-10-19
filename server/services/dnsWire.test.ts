import { describe, expect, it } from 'vitest';
import { DnsWireError, decodeResponse, encodeQuery, formatIpv6 } from './dnsWire.js';
import { parseDohTxt } from './doh.js';
import {
  QUESTION_NAME,
  ipv4,
  ipv6,
  name,
  parseQuery,
  pointer,
  response,
  txt,
  u16,
} from '../test/dnsMessage.js';

/**
 * Wireformat nach RFC 1035 für die Anbieter ohne JSON-API (#132). Die
 * Antworten kommen von außen: Neben den Typen zählt hier vor allem, dass
 * eine kaputte Nachricht sauber scheitert, statt Werte zu erfinden.
 */

const Q = { name: 'example.com', type: 1 };

/** Liest eine Antwort mit genau einem Eintrag und gibt dessen `data` zurück. */
function decodeOne(type: number, rdata: number[]): string {
  const msg = decodeResponse(
    response({ question: { name: 'example.com', type }, answers: [{ name: pointer(QUESTION_NAME), type, rdata }] })
  );
  expect(msg.Answer).toHaveLength(1);
  return msg.Answer![0].data;
}

function expectWireError(bytes: Uint8Array, message: RegExp) {
  expect(() => decodeResponse(bytes)).toThrow(DnsWireError);
  expect(() => decodeResponse(bytes)).toThrow(message);
}

describe('encodeQuery', () => {
  /** Beispiel aus RFC 8484, Abschnitt 4.1.1: www.example.com, Typ A, ID 0, RD. */
  it('erzeugt die Anfrage aus dem Beispiel von RFC 8484', () => {
    const query = Buffer.from(encodeQuery('www.example.com', 1)).toString('base64url');
    expect(query).toBe('AAABAAABAAAAAAAAA3d3dwdleGFtcGxlA2NvbQAAAQAB');
  });

  it('behandelt einen abschließenden Punkt wie keinen', () => {
    expect(encodeQuery('www.example.com.', 1)).toEqual(encodeQuery('www.example.com', 1));
  });

  it('kodiert Typ und Unterstriche in DNS-Einträgen', () => {
    expect(parseQuery(encodeQuery('s1._domainkey.example.com', 16))).toEqual({
      name: 's1._domainkey.example.com',
      type: 16,
      arcount: 0,
    });
    expect(parseQuery(encodeQuery('example.com', 257)).type).toBe(257);
  });

  it('setzt mit dnssec einen OPT-Record mit DO-Bit', () => {
    const query = encodeQuery('example.com', 48, { dnssec: true });
    expect(parseQuery(query).arcount).toBe(1);
    const opt = [...query.slice(-11)];
    // Root, Typ 41, UDP-Größe 4096, erweiterter RCODE 0, Version 0, DO, RDLEN 0
    expect(opt).toEqual([0, ...u16(41), ...u16(4096), 0, 0, 0x80, 0, ...u16(0)]);
  });

  it('lehnt Namen ab, die es im DNS nicht geben kann', () => {
    expect(() => encodeQuery(`${'a'.repeat(64)}.example.com`, 1)).toThrow(/Label länger als 63/);
    expect(() => encodeQuery(Array(64).fill('abc').join('.'), 1)).toThrow(/Name länger als 255/);
    expect(() => encodeQuery('a..example.com', 1)).toThrow(/leeres Label/);
    expect(() => encodeQuery('bücher.example', 1)).toThrow(/außerhalb von ASCII/);
  });
});

describe('decodeResponse — Typen', () => {
  it('liest A mit Kompressionszeiger auf die Frage', () => {
    const msg = decodeResponse(
      response({ question: Q, answers: [{ name: pointer(QUESTION_NAME), type: 1, ttl: 120, rdata: ipv4('192.0.2.1') }] }),
      Q
    );
    expect(msg).toMatchObject({ Status: 0, TC: false, AD: false });
    expect(msg.Answer).toEqual([{ name: 'example.com.', type: 1, TTL: 120, data: '192.0.2.1' }]);
  });

  it('liest AAAA in der Kurzform der JSON-API', () => {
    expect(decodeOne(28, ipv6('2606:4700:0:0:0:0:6810:84e5'))).toBe('2606:4700::6810:84e5');
  });

  it('liest MX mit Priorität und Namen', () => {
    expect(decodeOne(15, [...u16(10), ...name('mail.example.com')])).toBe('10 mail.example.com.');
  });

  it('liest CNAME, NS und PTR als Namen mit Punkt', () => {
    expect(decodeOne(5, name('target.example.net'))).toBe('target.example.net.');
    expect(decodeOne(2, name('ns1.example.net'))).toBe('ns1.example.net.');
    expect(decodeOne(12, name('host.example.net'))).toBe('host.example.net.');
  });

  /**
   * Lange TXT-Werte (DKIM) kommen in Stücken zu höchstens 255 Bytes. Die
   * Form `"a" "b"` ist die von Cloudflare — parseDohTxt setzt sie für alle
   * Anbieter gleich zusammen.
   */
  it('liest TXT mit mehreren Stücken in der Form der JSON-API', () => {
    const data = decodeOne(16, txt('v=DKIM1; p=MIIB', 'IjANBgkq'));
    expect(data).toBe('"v=DKIM1; p=MIIB" "IjANBgkq"');
    expect(parseDohTxt(data)).toBe('v=DKIM1; p=MIIBIjANBgkq');
  });

  it('maskiert Anführungszeichen und Backslash, damit der Wert unverändert ankommt', () => {
    for (const value of ['sagt "hallo"', 'v=DKIM1\\; k=rsa', '"v=spf1 -all"', 'grüße', '']) {
      expect(parseDohTxt(decodeOne(16, txt(value))), value).toBe(value);
    }
  });

  it('liest eine echte Antwort mit CNAME-Kette und Zeiger mitten in einen Namen', () => {
    // DNS4EU, www.github.com A, aufgenommen am 19.10.2026
    const bytes = Buffer.from(
      '000081800001000200000000037777770667697468756203636f6d0000010001' +
        'c00c00050001000003a60002c010c010000100010000002700048c527904',
      'hex'
    );
    expect(decodeResponse(bytes, { name: 'www.github.com', type: 1 }).Answer).toEqual([
      { name: 'www.github.com.', type: 5, TTL: 934, data: 'github.com.' },
      { name: 'github.com.', type: 1, TTL: 39, data: '140.82.121.4' },
    ]);
  });

  it('liest SOA, SRV, CAA, DS und DNSKEY', () => {
    expect(
      decodeOne(6, [
        ...name('ns1.example.com'),
        ...name('hostmaster.example.com'),
        ...[2026101901, 7200, 900, 1209600, 86400].flatMap((n) => [...u16(n >>> 16), ...u16(n & 0xffff)]),
      ])
    ).toBe('ns1.example.com. hostmaster.example.com. 2026101901 7200 900 1209600 86400');
    expect(decodeOne(33, [...u16(10), ...u16(5), ...u16(5269), ...name('xmpp.example.com')])).toBe(
      '10 5 5269 xmpp.example.com.'
    );
    expect(decodeOne(257, [0, 5, ...Buffer.from('issueletsencrypt.org')])).toBe('0 issue "letsencrypt.org"');
    expect(decodeOne(43, [...u16(2371), 13, 2, 0xab, 0xcd])).toBe('2371 13 2 abcd');
    expect(decodeOne(48, [...u16(257), 3, 13, 1, 2, 3])).toBe('257 3 13 AQID');
  });

  it('gibt unbekannte Typen in der generischen Form aus', () => {
    expect(decodeOne(99, [1, 2, 3])).toBe('\\# 3 010203');
    expect(decodeOne(99, [])).toBe('\\# 0');
  });

  it('überspringt Einträge einer anderen Klasse als IN', () => {
    const msg = decodeResponse(
      response({
        question: Q,
        answers: [
          { name: pointer(QUESTION_NAME), type: 16, cls: 3, rdata: txt('chaos') },
          { name: pointer(QUESTION_NAME), type: 1, rdata: ipv4('192.0.2.1') },
        ],
      })
    );
    expect(msg.Answer!.map((a) => a.data)).toEqual(['192.0.2.1']);
  });
});

describe('decodeResponse — Status und Flags', () => {
  it('meldet NXDOMAIN als Status 3 ohne Einträge', () => {
    expect(decodeResponse(response({ question: Q, rcode: 3 }), Q)).toMatchObject({ Status: 3, Answer: [] });
  });

  it('meldet SERVFAIL als Status 2', () => {
    expect(decodeResponse(response({ question: Q, rcode: 2 }), Q)).toMatchObject({ Status: 2, Answer: [] });
  });

  it('liest TC und AD aus dem Kopf', () => {
    expect(decodeResponse(response({ question: Q, flags: 0x0200 }))).toMatchObject({ TC: true, AD: false });
    expect(decodeResponse(response({ question: Q, flags: 0x0020 }))).toMatchObject({ TC: false, AD: true });
  });
});

describe('decodeResponse — kaputte Antworten', () => {
  const valid = response({
    question: Q,
    answers: [{ name: pointer(QUESTION_NAME), type: 1, rdata: ipv4('192.0.2.1') }],
  });

  it('scheitert an einer Nachricht, die kürzer als der Kopf ist', () => {
    expectWireError(new Uint8Array([0, 0, 0x81]), /kürzer als der Kopf/);
    expectWireError(new Uint8Array(), /kürzer als der Kopf/);
  });

  it('scheitert an jeder abgeschnittenen Fassung einer gültigen Antwort', () => {
    for (let length = 12; length < valid.length; length++) {
      expect(() => decodeResponse(valid.slice(0, length)), `${length} Bytes`).toThrow(DnsWireError);
    }
    expect(decodeResponse(valid).Answer).toHaveLength(1);
  });

  it('scheitert an einer Anfrage statt einer Antwort', () => {
    expectWireError(response({ question: Q, query: true }), /QR-Bit fehlt/);
  });

  it('scheitert an einer Antwort auf eine andere Frage', () => {
    expect(() => decodeResponse(valid, { name: 'example.org', type: 1 })).toThrow(/gehört nicht zur Frage/);
    expect(() => decodeResponse(valid, { name: 'example.com', type: 28 })).toThrow(/gehört nicht zur Frage/);
    // Groß-/Kleinschreibung und Punkt am Ende ändern die Frage nicht.
    expect(decodeResponse(valid, { name: 'Example.COM.', type: 1 }).Answer).toHaveLength(1);
  });

  it('scheitert an Kompressionszeigern, die nicht zurück zeigen', () => {
    // Zeiger auf sich selbst
    expectWireError(response({ question: Q, answers: [{ name: pointer(29), type: 1, rdata: ipv4('192.0.2.1') }] }), /zeigt nicht zurück/);
    // Zeiger hinter das Ende
    expectWireError(response({ question: Q, answers: [{ name: pointer(500), type: 1, rdata: ipv4('192.0.2.1') }] }), /zeigt nicht zurück/);
  });

  it('scheitert an Kompressionszeigern in den Kopf', () => {
    // Der Kopf ist kein Name — als Labels gelesen, entstünde ein erfundener.
    expectWireError(response({ question: Q, answers: [{ name: pointer(0), type: 1, rdata: ipv4('192.0.2.1') }] }), /zeigt in den Kopf/);
    expectWireError(response({ question: Q, answers: [{ name: pointer(11), type: 1, rdata: ipv4('192.0.2.1') }] }), /zeigt in den Kopf/);
  });

  it('scheitert an einer Zeiger-Schleife über Labels', () => {
    // Antwort-Name: Label „a“, dann Zeiger zurück auf dieses Label — endlos „a.a.a…“
    const loop = response({ question: Q, answers: [{ name: [1, 0x61, ...pointer(29)], type: 1, rdata: ipv4('192.0.2.1') }] });
    expectWireError(loop, /zu viele Kompressionszeiger/);
    // Mit längeren Labels greift vorher die Höchstlänge eines Namens.
    const longLoop = response({
      question: Q,
      answers: [{ name: [20, ...Buffer.from('a'.repeat(20)), ...pointer(29)], type: 1, rdata: ipv4('192.0.2.1') }],
    });
    expectWireError(longLoop, /länger als 255 Bytes/);
  });

  it('scheitert an RDATA mit falscher Länge oder über das Ende hinaus', () => {
    expectWireError(
      response({ question: Q, answers: [{ name: pointer(QUESTION_NAME), type: 1, rdata: [192, 0, 2, 1, 9] }] }),
      /Typ 1 mit 5 statt 4 Bytes/
    );
    expectWireError(
      response({ question: Q, answers: [{ name: pointer(QUESTION_NAME), type: 16, rdata: [10, 0x61, 0x62] }] }),
      /TXT-Stück ragt über den Datensatz hinaus/
    );
    expectWireError(
      response({ question: Q, answers: [{ name: pointer(QUESTION_NAME), type: 15, rdata: [0, 10, 3, 0x61, 0x62] }] }),
      /Nachricht endet vorzeitig|ragt über den Datensatz hinaus/
    );
  });

  it('scheitert an unbekannten Label-Typen und zu großen Nachrichten', () => {
    expectWireError(
      response({ question: Q, answers: [{ name: [0x40, 0x61, 0], type: 1, rdata: ipv4('192.0.2.1') }] }),
      /unbekannter Label-Typ/
    );
    expectWireError(new Uint8Array(70_000), /länger als 65535 Bytes/);
  });

  /**
   * Fuzz-Test mit festem Seed: gültige Antworten mit einzelnen kaputten
   * Bytes, abgeschnitten oder verlängert, dazu reiner Zufall. Erlaubt ist
   * eine Antwort oder `DnsWireError` — ein RangeError oder TypeError hieße,
   * dass ein Lesezugriff ungeprüft war. Ein Lauf mit 500 000 Nachrichten
   * fand vor dem Einchecken nichts; hier reichen wenige Tausend als Wächter.
   */
  it('wirft bei beliebigen Bytes nur DnsWireError', () => {
    let seed = 132;
    // mulberry32: klein, deterministisch, gut genug verteilt
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (n: number) => Math.floor(random() * n);

    const at = pointer(QUESTION_NAME);
    const seeds = [
      valid,
      response({ question: { name: 'example.com', type: 16 }, answers: [{ name: at, type: 16, rdata: txt('v=DKIM1; p=MIIB', 'abc') }] }),
      response({
        question: { name: 'example.com', type: 6 },
        answers: [{ name: at, type: 6, rdata: [...name('ns1.example.com'), ...at, ...Array<number>(20).fill(1)] }],
      }),
      response({ question: { name: 'example.com', type: 257 }, answers: [{ name: at, type: 257, rdata: [0, 5, ...Buffer.from('issuex')] }] }),
      response({ question: { name: 'example.com', type: 15 }, answers: [{ name: at, type: 15, rdata: [...u16(10), 4, ...Buffer.from('mail'), ...at] }] }),
      response({ question: { name: 'example.com', type: 33 }, answers: [{ name: at, type: 33, rdata: [...u16(1), ...u16(2), ...u16(3), ...at] }] }),
      response({ question: { name: 'example.com', type: 28 }, answers: [{ name: at, type: 28, rdata: ipv6('2001:db8::1') }] }),
    ];

    const outcomes = { ok: 0, wireError: 0 };
    for (let i = 0; i < 5000; i++) {
      let bytes: Uint8Array;
      const mode = int(4);
      if (mode === 0) {
        bytes = Uint8Array.from({ length: int(200) }, () => int(256));
      } else {
        bytes = Uint8Array.from(seeds[int(seeds.length)]);
        for (let flips = 1 + int(4); flips > 0; flips--) {
          // Gezielt Zeiger, Längen und Grenzwerte, sonst ein beliebiges Byte
          const values = [int(256), 0xc0 | int(64), 0, 1, 63, 64, 0xff];
          bytes[int(bytes.length)] = values[int(values.length)];
        }
        if (mode === 2) bytes = bytes.slice(0, int(bytes.length + 1));
        if (mode === 3) bytes = Uint8Array.from([...bytes, ...Array.from({ length: int(30) }, () => int(256))]);
      }

      try {
        decodeResponse(bytes, int(2) ? Q : undefined);
        outcomes.ok++;
      } catch (error) {
        if (!(error instanceof DnsWireError)) {
          throw new Error(`${String(error)} bei ${Buffer.from(bytes).toString('hex')}`, { cause: error });
        }
        outcomes.wireError++;
      }
    }
    // Beide Ausgänge kommen vor — sonst prüfte der Test nur eine Seite.
    expect(outcomes.ok).toBeGreaterThan(100);
    expect(outcomes.wireError).toBeGreaterThan(1000);
  });
});

describe('formatIpv6', () => {
  it('kürzt nach RFC 5952', () => {
    const cases: [string, string][] = [
      ['2001:db8:0:0:0:0:0:1', '2001:db8::1'],
      ['0:0:0:0:0:0:0:1', '::1'],
      ['0:0:0:0:0:0:0:0', '::'],
      ['fe80:0:0:0:0:0:0:0', 'fe80::'],
      // Bei gleich langen Null-Folgen die erste
      ['2001:db8:0:0:1:0:0:1', '2001:db8::1:0:0:1'],
      // Die längere gewinnt, auch wenn sie später kommt
      ['2001:0:0:1:0:0:0:1', '2001:0:0:1::1'],
      // Eine einzelne Null-Gruppe bleibt stehen
      ['2001:db8:0:1:1:1:1:1', '2001:db8:0:1:1:1:1:1'],
      ['2001:DB8:00AB:0:0:0:0:0', '2001:db8:ab::'],
    ];
    for (const [input, expected] of cases) {
      expect(formatIpv6(Uint8Array.from(ipv6(input))), input).toBe(expected);
    }
  });
});
