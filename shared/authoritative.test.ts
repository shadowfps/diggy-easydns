import { describe, expect, it } from 'vitest';
import {
  authoritativeDisagrees,
  authoritativeReference,
  canonicalIpv6,
  compareWithBasis,
  matchesExpected,
  propagationBasis,
} from './authoritative.js';
import { comparePropagation } from './propagation.js';
import type {
  AuthoritativeResult,
  AuthoritativeServer,
  DnsRecord,
  RecordType,
  ResolverResult,
} from './types/dns.js';

/**
 * #133: Die autoritativen Nameserver als Referenz. Die Beispiele folgen
 * echten Zonen — github.com liegt bei NS1 und Route 53, example.com bei
 * Cloudflare (zwei Namen, je vier Adressen).
 */

const NS1 = 'dns1.p08.nsone.net';
const R53 = 'ns-1707.awsdns-21.co.uk';

function server(
  host: string,
  records: [RecordType, string][],
  { serial = '2026101901', primary = 'ns1.example.net', ip = '192.0.2.53', error }: Partial<AuthoritativeServer> = {}
): AuthoritativeServer {
  if (error) return { host, ip, records: [], responseTimeMs: 2500, error };
  return {
    host,
    ip,
    records: records.map(([type, value]): DnsRecord => ({ type, name: 'example.com', value, ttl: 300 })),
    serial,
    primary,
    responseTimeMs: 20,
  };
}

function result(type: RecordType, nameservers: AuthoritativeServer[], domain = 'example.com'): AuthoritativeResult {
  return { domain, type, zone: 'example.com', nameservers };
}

function resolver(id: string, records: [RecordType, string][], error?: string): ResolverResult {
  return {
    resolver: { id, name: id, ip: '0.0.0.0', country: 'X', flag: '', provider: id },
    records: records.map(([type, value]): DnsRecord => ({ type, name: 'example.com', value, ttl: 300 })),
    responseTimeMs: 10,
    ...(error ? { error } : {}),
  };
}

describe('authoritativeReference', () => {
  it('ist einig bei gleicher Antwort und gleicher Seriennummer — gleich in welcher Schreibweise', () => {
    const ref = authoritativeReference(
      result('MX', [
        server('ns1.example.net', [['MX', '10 mx.example.net']]),
        server('ns2.example.net', [['MX', '10 MX.example.net.']]),
      ])
    );
    expect(ref.state).toBe('agreed');
    expect(ref.values).toEqual(['10 mx.example.net']);
    expect(ref.keys).toHaveLength(1);
    expect(ref.answered).toBe(2);
    expect(ref.answers.every((a) => !a.serialDeviates && !a.valueDeviates)).toBe(true);
  });

  it('meldet eine abweichende Seriennummer beim selben Primary: Die Zone wird noch übertragen', () => {
    const ref = authoritativeReference(
      result('TXT', [
        server('ns1.example.net', [['TXT', 'v=spf1 -all']], { serial: '2026101902' }),
        server('ns2.example.net', [['TXT', 'v=spf1 -all']], { serial: '2026101902' }),
        server('ns3.example.net', [['TXT', 'v=spf1 ~all']], { serial: '2026101901' }),
      ])
    );
    expect(ref.state).toBe('serial');
    expect(ref.keys).toBeUndefined();
    expect(ref.answers.map((a) => [a.serialDeviates, a.valueDeviates])).toEqual([
      [false, false],
      [false, false],
      [true, true],
    ]);
    expect(authoritativeDisagrees(ref.state, 'TXT')).toBe(true);
  });

  /** github.com: NS1 zählt 1656468023, Route 53 immer 1 — das ist kein Fehler. */
  it('vergleicht Seriennummern nur unter Servern desselben Primary', () => {
    const ref = authoritativeReference(
      result('TXT', [
        server('dns1.p08.nsone.net', [['TXT', 'v=DMARC1; p=quarantine']], { serial: '1656468023', primary: NS1 }),
        server('dns2.p08.nsone.net', [['TXT', 'v=DMARC1; p=quarantine']], { serial: '1656468023', primary: NS1 }),
        server('ns-421.awsdns-52.com', [['TXT', 'v=DMARC1; p=quarantine']], { serial: '1', primary: `${R53}.` }),
        server('ns-1707.awsdns-21.co.uk', [['TXT', 'v=DMARC1; p=quarantine']], { serial: '1', primary: R53 }),
      ])
    );
    expect(ref.state).toBe('agreed');
    expect(ref.primaries).toBe(2);
    expect(ref.answers.some((a) => a.serialDeviates)).toBe(false);
  });

  it('nimmt beim SOA mehrerer Anbieter jede Seriennummer als aktuell (`providers`)', () => {
    const ref = authoritativeReference(
      result('SOA', [
        server('dns1.p08.nsone.net', [['SOA', `${NS1}. hostmaster.nsone.net. 1656468023 43200 7200 1209600 3600`]], {
          serial: '1656468023',
          primary: NS1,
        }),
        server('ns-421.awsdns-52.com', [['SOA', `${R53}. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400`]], {
          serial: '1',
          primary: R53,
        }),
      ])
    );
    expect(ref.state).toBe('providers');
    expect(ref.keys).toEqual(['["1656468023"]', '["1"]']);
    expect(authoritativeDisagrees(ref.state, 'SOA')).toBe(false);
  });

  it('wertet verschiedene Adressen als Hinweis, verschiedene Einträge als Uneinigkeit', () => {
    const addresses = authoritativeReference(
      result('A', [server('a', [['A', '140.82.121.3']]), server('b', [['A', '140.82.121.4']]), server('c', [['A', '140.82.121.3']])])
    );
    expect(addresses.state).toBe('values');
    expect(addresses.answers.map((a) => a.valueDeviates)).toEqual([false, true, false]);
    expect(authoritativeDisagrees(addresses.state, 'A')).toBe(false);

    const entries = authoritativeReference(
      result('CAA', [server('a', [['CAA', '0 issue "letsencrypt.org"']]), server('b', [['CAA', '0 issue "pki.goog"']])])
    );
    expect(entries.state).toBe('values');
    expect(authoritativeDisagrees(entries.state, 'CAA')).toBe(true);
  });

  it('lässt Nameserver ohne Antwort aus dem Vergleich', () => {
    const ref = authoritativeReference(
      result('A', [
        server('ns1.example.net', [['A', '192.0.2.1']]),
        server('ns2.example.net', [], { error: 'timeout' }),
        server('ns3.example.net', [], { error: 'not_authoritative' }),
      ])
    );
    expect(ref.state).toBe('agreed');
    expect(ref.answered).toBe(1);
    expect(ref.values).toEqual(['192.0.2.1']);
  });

  it('ist „nicht prüfbar“, wenn keiner brauchbar antwortet', () => {
    const ref = authoritativeReference(
      result('A', [server('ns1', [], { error: 'timeout' }), server('ns2', [], { error: 'refused' })])
    );
    expect(ref).toMatchObject({ state: 'unavailable', answered: 0, values: [] });
    expect(propagationBasis('', ref)).toEqual({ kind: 'majority' });
    expect(authoritativeReference({ domain: 'x.example', type: 'A', nameservers: [], error: 'no_zone' }).state).toBe(
      'unavailable'
    );
  });

  it('ist sich auch über „gibt es nicht“ einig', () => {
    const ref = authoritativeReference(result('AAAA', [server('ns1', []), server('ns2', [])]));
    expect(ref.state).toBe('agreed');
    expect(ref.keys).toEqual(['']);
    expect(ref.values).toEqual([]);
  });

  it('erkennt einen CNAME aus der Zone hinaus — den Wert liefern andere Nameserver', () => {
    const cname = (host: string): AuthoritativeServer => ({
      ...server(host, []),
      records: [{ type: 'CNAME', name: 's1._domainkey.example.com', value: 's1.dkim.example.net', ttl: 300 }],
    });
    const ref = authoritativeReference(result('TXT', [cname('ns1'), cname('ns2')], 's1._domainkey.example.com'));
    expect(ref).toMatchObject({ state: 'cname', cname: 's1.dkim.example.net' });
    expect(ref.keys).toBeUndefined();
  });

  it('nimmt bei einem CNAME in der Zone die mitgelieferten Adressen', () => {
    const chained: AuthoritativeServer = {
      ...server('ns1', []),
      records: [
        { type: 'CNAME', name: 'www.example.com', value: 'example.com', ttl: 300 },
        { type: 'A', name: 'example.com', value: '192.0.2.1', ttl: 300 },
      ],
    };
    const ref = authoritativeReference(result('A', [chained], 'www.example.com'));
    expect(ref).toMatchObject({ state: 'agreed', values: ['192.0.2.1'] });
  });
});

describe('compareWithBasis', () => {
  const OLD = 'v=DKIM1; p=ALT';
  const NEW = 'v=DKIM1; p=NEU';
  /** Drei Resolver haben noch den alten Schlüssel im Cache, zwei schon den neuen. */
  const results = [
    resolver('cloudflare', [['TXT', OLD]]),
    resolver('google', [['TXT', OLD]]),
    resolver('adguard', [['TXT', NEW]]),
    resolver('dns-sb', [['TXT', OLD]]),
    resolver('nextdns', [['TXT', NEW]]),
  ];

  it('ohne Referenz wie bisher: gegen die Mehrheit', () => {
    const comparison = compareWithBasis(results, 'TXT', { kind: 'majority' });
    expect(comparison).toEqual({ ...comparePropagation(results, 'TXT'), basis: 'majority' });
    expect(comparison.answers.map((a) => a.status)).toEqual(['match', 'match', 'mismatch', 'match', 'mismatch']);
  });

  it('gegen die autoritativen Nameserver statt gegen die Mehrheit', () => {
    const ref = authoritativeReference(result('TXT', [server('ns1', [['TXT', NEW]]), server('ns2', [['TXT', NEW]])]));
    const comparison = compareWithBasis(results, 'TXT', propagationBasis('', ref));
    expect(comparison.basis).toBe('authoritative');
    expect(comparison.answers.map((a) => a.status)).toEqual(['mismatch', 'mismatch', 'match', 'mismatch', 'match']);
    expect(comparison).toMatchObject({ compared: 5, deviating: 3 });
  });

  it('nimmt uneinige Nameserver nicht als Referenz', () => {
    const ref = authoritativeReference(
      result('TXT', [server('ns1', [['TXT', NEW]], { serial: '2' }), server('ns2', [['TXT', OLD]], { serial: '1' })])
    );
    expect(ref.state).toBe('serial');
    expect(propagationBasis('', ref)).toEqual({ kind: 'majority' });
  });

  it('zählt gegen die Nameserver auch Resolver ohne Adresse — etwa mit „gibt es nicht“ im Cache', () => {
    const fresh = [
      resolver('cloudflare', [['A', '192.0.2.1']]),
      resolver('google', []),
      resolver('adguard', [], 'Timeout'),
    ];
    // Gegen die Mehrheit fiele Google bei Adressen still heraus …
    expect(comparePropagation(fresh, 'A').answers.map((a) => a.status)).toEqual(['match', 'empty', 'error']);
    // … gegen die Nameserver nicht.
    const comparison = compareWithBasis(fresh, 'A', { kind: 'authoritative', keys: ['["192.0.2.1"]'] });
    expect(comparison.answers.map((a) => a.status)).toEqual(['match', 'mismatch', 'error']);
    expect(comparison).toMatchObject({ compared: 2, deviating: 1 });
  });

  it('wertet beim SOA mehrerer Anbieter jede ihrer Seriennummern als aktuell', () => {
    const soa = (serial: string, primary: string) => `${primary}. hostmaster.example. ${serial} 7200 900 1209600 300`;
    const comparison = compareWithBasis(
      [
        resolver('cloudflare', [['SOA', soa('1656468023', NS1)]]),
        resolver('google', [['SOA', soa('1', R53)]]),
        resolver('adguard', [['SOA', soa('1656468000', NS1)]]),
      ],
      'SOA',
      { kind: 'authoritative', keys: ['["1656468023"]', '["1"]'] }
    );
    expect(comparison.answers.map((a) => a.status)).toEqual(['match', 'match', 'mismatch']);
  });

  it('gegen den erwarteten Wert: Er muss in der Antwort stehen', () => {
    const comparison = compareWithBasis(results, 'TXT', propagationBasis(`"${NEW}"`, undefined));
    expect(comparison.basis).toBe('expected');
    expect(comparison.answers.map((a) => a.status)).toEqual(['mismatch', 'mismatch', 'match', 'mismatch', 'match']);
  });

  it('der erwartete Wert geht den Nameservern vor', () => {
    const ref = authoritativeReference(result('TXT', [server('ns1', [['TXT', NEW]])]));
    expect(propagationBasis('v=x', ref)).toEqual({ kind: 'expected', value: 'v=x' });
    expect(propagationBasis('  ', ref)).toEqual({ kind: 'authoritative', keys: ['["v=DKIM1; p=NEU"]'] });
  });
});

describe('matchesExpected', () => {
  it('normalisiert wie beim Vergleich je Typ', () => {
    expect(matchesExpected('CNAME', ['target.example.net'], 'Target.Example.NET.')).toBe(true);
    expect(matchesExpected('TXT', ['v=spf1 -all'], '"v=spf1 -all"')).toBe(true);
    expect(matchesExpected('TXT', ['v=spf1 -all'], 'v=spf1 ~all')).toBe(false);
    expect(matchesExpected('CAA', ['0 issue letsencrypt.org'], '0 ISSUE "letsencrypt.org"')).toBe(true);
    expect(matchesExpected('SOA', ['2026101901'], '2026101901')).toBe(true);
    expect(matchesExpected('A', ['192.0.2.1'], ' 192.0.2.1 ')).toBe(true);
  });

  it('enthält statt gleicht: ein neuer TXT neben anderen zählt', () => {
    expect(matchesExpected('TXT', ['google-site-verification=abc', 'v=spf1 -all'], 'v=spf1 -all')).toBe(true);
  });

  it('nimmt beim MX auch das Ziel ohne Priorität', () => {
    expect(matchesExpected('MX', ['10 mx.example.net'], 'mx.example.net')).toBe(true);
    expect(matchesExpected('MX', ['10 mx.example.net'], '10 MX.example.net.')).toBe(true);
    expect(matchesExpected('MX', ['10 mx.example.net'], '20 mx.example.net')).toBe(false);
  });

  it('IPv6 in jeder Schreibweise', () => {
    expect(matchesExpected('AAAA', ['2001:db8::1'], '2001:DB8:0:0:0:0:0:1')).toBe(true);
    expect(matchesExpected('AAAA', ['2001:db8::1'], '2001:db8::2')).toBe(false);
  });

  it('ein leerer Wert passt auf nichts', () => {
    expect(matchesExpected('A', ['192.0.2.1'], '   ')).toBe(false);
  });
});

describe('canonicalIpv6', () => {
  it('schreibt nach RFC 5952', () => {
    expect(canonicalIpv6('2001:0DB8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
    expect(canonicalIpv6('2001:db8:0:0:1:0:0:1')).toBe('2001:db8::1:0:0:1');
    expect(canonicalIpv6('2001:db8:0:1:1:1:1:1')).toBe('2001:db8:0:1:1:1:1:1');
    expect(canonicalIpv6('::')).toBe('::');
    expect(canonicalIpv6('::1')).toBe('::1');
  });

  it('lässt Unlesbares bis auf die Kleinschreibung stehen', () => {
    expect(canonicalIpv6('nicht:IPv6')).toBe('nicht:ipv6');
    expect(canonicalIpv6('1:2:3:4:5:6:7:8:9')).toBe('1:2:3:4:5:6:7:8:9');
    expect(canonicalIpv6('1::2::3')).toBe('1::2::3');
  });
});
