import { describe, expect, it } from 'vitest';
import {
  comparableValue,
  comparePropagation,
  defaultPropagationType,
  parsePropagationType,
  primaryPropagationType,
  PROPAGATION_RECORD_TYPES,
  propagationTypes,
  propagationValue,
  requeryWithin,
  soaSerial,
} from './propagation.js';
import type { DnsRecord, RecordType, ResolverResult } from './types/dns.js';

const DKIM_A = 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAalt';
const DKIM_B = 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAneu';

function resolver(
  id: string,
  records: [RecordType, string][],
  error?: string
): ResolverResult {
  return {
    resolver: { id, name: id, ip: '0.0.0.0', country: 'X', flag: '', provider: id },
    records: records.map(
      ([type, value]): DnsRecord => ({ type, name: 's1._domainkey.example.com', value, ttl: 300 })
    ),
    responseTimeMs: 10,
    ...(error ? { error } : {}),
  };
}

const statuses = (results: ResolverResult[], type: RecordType) =>
  comparePropagation(results, type).answers.map((a) => a.status);

describe('propagationTypes', () => {
  it('fragt bei Hosts die Adressen ab', () => {
    expect(propagationTypes('example.com')).toEqual(['A', 'AAAA']);
    expect(propagationTypes('www.example.com')).toEqual(['A', 'AAAA']);
  });

  // #82: Nach einem DKIM-Wechsel will man wissen, ob der neue Schlüssel
  // überall angekommen ist — dafür muss TXT verglichen werden.
  it('fragt bei DNS-Einträgen TXT und CNAME ab', () => {
    for (const name of ['s1._domainkey.example.com', '_dmarc.example.com', '_acme-challenge.example.com']) {
      expect(propagationTypes(name), name).toEqual(['TXT', 'CNAME']);
    }
  });
});

describe('comparableValue', () => {
  it('behandelt gestückelte und zusammengesetzte TXT-Werte gleich', () => {
    // Cloudflare/AdGuard/NextDNS liefern Stücke in Anführungszeichen, Google
    // den fertigen String.
    expect(comparableValue('TXT', '"v=DKIM1; p=MIIB" "IjAN"')).toBe('v=DKIM1; p=MIIBIjAN');
    expect(comparableValue('TXT', '"v=DKIM1; p=MI" "IBIjAN"')).toBe('v=DKIM1; p=MIIBIjAN');
    expect(comparableValue('TXT', 'v=DKIM1; p=MIIBIjAN')).toBe('v=DKIM1; p=MIIBIjAN');
  });

  it('lässt Anführungszeichen mitten im Wert stehen', () => {
    // Nur eine Antwort, die ausschließlich aus Stücken besteht, wird
    // zusammengesetzt — sonst würden zwei verschiedene Werte gleich.
    expect(comparableValue('TXT', 'sagt "hallo"')).toBe('sagt "hallo"');
    expect(comparableValue('TXT', '"sagt \\"hallo\\""')).toBe('sagt "hallo"');
  });

  it('vergleicht Hostnamen ohne Groß-/Kleinschreibung und Schlusspunkt', () => {
    expect(comparableValue('CNAME', 'Sel1.DKIM.Provider.net.')).toBe('sel1.dkim.provider.net');
  });
});

describe('comparePropagation', () => {
  it('wertet gleiche TXT-Records in anderer Reihenfolge als gleich', () => {
    const results = [
      resolver('cloudflare', [['TXT', 'token-1'], ['TXT', 'token-2']]),
      resolver('google', [['TXT', 'token-2'], ['TXT', 'token-1']]),
    ];
    const c = comparePropagation(results, 'TXT');
    expect(c.deviating).toBe(0);
    expect(c.compared).toBe(2);
  });

  /**
   * Ein Wert, der selbst in Anführungszeichen steht: Google liefert ihn so,
   * wie er eingetragen ist, und der Server parst ihn wie eine gestückelte
   * Antwort; bei den anderen bleiben die Anführungszeichen stehen.
   */
  it('wertet einen Wert in eigenen Anführungszeichen bei allen Resolvern gleich', () => {
    const results = [
      resolver('cloudflare', [['TXT', '"v=spf1 -all"']]),
      resolver('google', [['TXT', 'v=spf1 -all']]),
    ];
    expect(comparePropagation(results, 'TXT').deviating).toBe(0);
  });

  it('trennt Werte mit Komma nicht in mehrere', () => {
    // Mit join(',') wären ["a,b"] und ["a", "b"] derselbe Schlüssel.
    const results = [
      resolver('cloudflare', [['TXT', 'a,b']]),
      resolver('google', [['TXT', 'a'], ['TXT', 'b']]),
    ];
    expect(comparePropagation(results, 'TXT').deviating).toBe(1);
  });

  it('markiert den Resolver mit dem alten Schlüssel', () => {
    const results = [
      resolver('cloudflare', [['TXT', DKIM_B]]),
      resolver('google', [['TXT', DKIM_A]]),
      resolver('adguard', [['TXT', DKIM_B]]),
    ];
    expect(statuses(results, 'TXT')).toEqual(['match', 'mismatch', 'match']);
  });

  /**
   * Hat ein Resolver den Namen vor der Veröffentlichung abgefragt, liefert er
   * bis zum Ablauf des Negativ-Caches nichts. Fiele er aus dem Vergleich,
   * stünde dort „konsistent“, obwohl der Schlüssel bei ihm fehlt.
   */
  it('zählt bei TXT einen Resolver ohne Eintrag als Abweichung', () => {
    const results = [
      resolver('cloudflare', [['TXT', DKIM_A]]),
      resolver('google', []),
      resolver('adguard', [['TXT', DKIM_A]]),
    ];
    const c = comparePropagation(results, 'TXT');
    expect(c.answers.map((a) => a.status)).toEqual(['match', 'mismatch', 'match']);
    expect(c.compared).toBe(3);
  });

  it('erkennt einen gelöschten Eintrag, den ein Resolver noch cached', () => {
    const results = [
      resolver('cloudflare', []),
      resolver('google', [['TXT', DKIM_A]]),
      resolver('adguard', []),
    ];
    expect(statuses(results, 'TXT')).toEqual(['match', 'mismatch', 'match']);
  });

  it('bevorzugt bei Gleichstand die Antwort mit Wert', () => {
    const results = [resolver('cloudflare', []), resolver('google', [['TXT', DKIM_A]])];
    expect(statuses(results, 'TXT')).toEqual(['mismatch', 'match']);
  });

  it('lässt bei Adressen Resolver ohne Antwort wie bisher außen vor', () => {
    const results = [
      resolver('cloudflare', [['A', '192.0.2.1']]),
      resolver('google', []),
      resolver('adguard', [['A', '192.0.2.1']]),
    ];
    const c = comparePropagation(results, 'A');
    expect(c.answers.map((a) => a.status)).toEqual(['match', 'empty', 'match']);
    expect(c.compared).toBe(2);
    expect(c.deviating).toBe(0);
  });

  it('nimmt Resolver mit Fehler nie in den Vergleich', () => {
    const results = [
      resolver('cloudflare', [['TXT', DKIM_A]]),
      resolver('dns-sb', [], 'Timeout'),
      resolver('google', [['TXT', DKIM_A]]),
    ];
    const c = comparePropagation(results, 'TXT');
    expect(c.answers.map((a) => a.status)).toEqual(['match', 'error', 'match']);
    expect(c.compared).toBe(2);
  });

  it('hat keine Mehrheit, wenn niemand einen Wert liefert', () => {
    const c = comparePropagation([resolver('cloudflare', []), resolver('google', [])], 'TXT');
    expect(c.consensusKey).toBeUndefined();
    expect(c.answers.map((a) => a.status)).toEqual(['empty', 'empty']);
  });
});

describe('primaryPropagationType', () => {
  it('nimmt den ersten Typ, für den ein Resolver antwortet', () => {
    const cnameOnly = [resolver('cloudflare', [['CNAME', 'sel1.provider.net']])];
    expect(primaryPropagationType(cnameOnly, ['TXT', 'CNAME'])).toBe('CNAME');

    const both = [resolver('cloudflare', [['CNAME', 'sel1.provider.net'], ['TXT', DKIM_A]])];
    expect(primaryPropagationType(both, ['TXT', 'CNAME'])).toBe('TXT');
  });

  it('ignoriert Antworten von Resolvern mit Fehler', () => {
    expect(primaryPropagationType([resolver('x', [['TXT', 'a']], 'HTTP 500')], ['TXT'])).toBeUndefined();
  });
});

/* ─── #131: wählbare Typen ──────────────────────────────────────────── */

/** Ein Resolver mit vollständigen Records (Priorität, TTL) und optional Negativ-TTL. */
function full(
  id: string,
  records: Omit<DnsRecord, 'name'>[],
  extra: Partial<ResolverResult> = {}
): ResolverResult {
  return {
    resolver: { id, name: id, ip: '0.0.0.0', country: 'X', flag: '', provider: id },
    records: records.map((r) => ({ name: 'example.com', ...r })),
    responseTimeMs: 10,
    ...extra,
  };
}

describe('parsePropagationType', () => {
  it('kennt genau die wählbaren Typen, ohne Rücksicht auf Groß-/Kleinschreibung', () => {
    expect(PROPAGATION_RECORD_TYPES).toEqual(['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'CAA', 'SOA']);
    expect(parsePropagationType('mx')).toBe('MX');
    expect(parsePropagationType(' Soa ')).toBe('SOA');
  });

  it('lehnt alles andere ab', () => {
    for (const value of ['', 'SRV', 'PTR', 'DNSKEY', 'A,MX', '1', undefined, null, ['A'], 15]) {
      expect(parsePropagationType(value), String(value)).toBeNull();
    }
  });
});

describe('comparableValue je Typ', () => {
  it('MX: Priorität und Ziel, das Ziel ohne Groß-/Kleinschreibung und Schlusspunkt', () => {
    expect(comparableValue('MX', '10 MX1.Example.NET.')).toBe(comparableValue('MX', '10 mx1.example.net'));
    expect(comparableValue('MX', '10 mx1.example.net')).not.toBe(comparableValue('MX', '20 mx1.example.net'));
    expect(comparableValue('MX', '10 mx1.example.net')).not.toBe(comparableValue('MX', '10 mx2.example.net'));
  });

  it('NS: Hostname ohne Groß-/Kleinschreibung und Schlusspunkt', () => {
    expect(comparableValue('NS', 'NS1.P08.nsone.net.')).toBe('ns1.p08.nsone.net');
  });

  it('CAA: Flags als Zahl, Tag klein, Wert ohne Anführungszeichen', () => {
    expect(comparableValue('CAA', '0 issue "letsencrypt.org"')).toBe('0 issue letsencrypt.org');
    expect(comparableValue('CAA', '0 ISSUE "letsencrypt.org"')).toBe('0 issue letsencrypt.org');
    expect(comparableValue('CAA', '0 issue letsencrypt.org')).toBe('0 issue letsencrypt.org');
    // Kritisch markiert oder ein anderer Tag ist ein anderer Record.
    expect(comparableValue('CAA', '128 issue "letsencrypt.org"')).toBe('128 issue letsencrypt.org');
    expect(comparableValue('CAA', '0 issuewild "letsencrypt.org"')).toBe('0 issuewild letsencrypt.org');
    // Den Wert selbst fasst der Vergleich nicht an.
    expect(comparableValue('CAA', '0 iodef "mailto:Security@Example.com"')).toBe(
      '0 iodef mailto:Security@Example.com'
    );
  });

  it('SOA: nur die Seriennummer', () => {
    const ns1 = 'dns1.p08.nsone.net. hostmaster.nsone.net. 1656468023 43200 7200 1209600 3600';
    const aws = 'ns-1707.awsdns-21.co.uk. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400';
    expect(soaSerial(ns1)).toBe('1656468023');
    expect(comparableValue('SOA', ns1)).toBe('1656468023');
    expect(comparableValue('SOA', aws)).toBe('1');
    expect(comparableValue('SOA', 'ns2.example. x. 1656468023 1 1 1 1')).toBe('1656468023');
    // Unlesbar: der ganze Wert, damit er nicht mit einem anderen zusammenfällt.
    expect(soaSerial('kaputt')).toBeUndefined();
    expect(comparableValue('SOA', 'kaputt')).toBe('kaputt');
  });

  it('A und TXT wie bisher', () => {
    expect(comparableValue('A', '192.0.2.1')).toBe('192.0.2.1');
    expect(comparableValue('TXT', '"v=spf1" " -all"')).toBe('v=spf1 -all');
  });
});

describe('propagationValue', () => {
  it('stellt beim MX die Priorität vor das Ziel, wie im Zonefile', () => {
    expect(propagationValue({ type: 'MX', name: 'x', value: 'mx.example.net', priority: 10, ttl: 1 })).toBe(
      '10 mx.example.net'
    );
    // Null-MX (RFC 7505): Ziel ist die Wurzel.
    expect(propagationValue({ type: 'MX', name: 'x', value: '', priority: 0, ttl: 1 })).toBe('0 .');
    expect(propagationValue({ type: 'NS', name: 'x', value: 'ns1.example.net', ttl: 1 })).toBe('ns1.example.net');
  });
});

describe('comparePropagation je Typ (#131)', () => {
  it('MX: gleiche Records in anderer Reihenfolge und Schreibweise sind eine Antwort', () => {
    const results = [
      full('cloudflare', [
        { type: 'MX', value: 'mx1.example.net', priority: 10, ttl: 300 },
        { type: 'MX', value: 'mx2.example.net', priority: 20, ttl: 300 },
      ]),
      full('google', [
        { type: 'MX', value: 'MX2.example.net.', priority: 20, ttl: 200 },
        { type: 'MX', value: 'mx1.example.net', priority: 10, ttl: 200 },
      ]),
      // Andere Priorität: ein anderer MX-Satz.
      full('adguard', [
        { type: 'MX', value: 'mx1.example.net', priority: 20, ttl: 100 },
        { type: 'MX', value: 'mx2.example.net', priority: 20, ttl: 100 },
      ]),
    ];
    const c = comparePropagation(results, 'MX');
    expect(c.answers.map((a) => a.status)).toEqual(['match', 'match', 'mismatch']);
    expect(c.answers[0].values).toEqual(['10 mx1.example.net', '20 mx2.example.net']);
  });

  it('NS: Mengenvergleich, unabhängig von Reihenfolge und Schreibweise', () => {
    const results = [
      full('cloudflare', [
        { type: 'NS', value: 'ns1.example.net', ttl: 3600 },
        { type: 'NS', value: 'ns2.example.net', ttl: 3600 },
      ]),
      full('google', [
        { type: 'NS', value: 'NS2.example.net.', ttl: 3600 },
        { type: 'NS', value: 'ns1.example.net', ttl: 3600 },
      ]),
      full('adguard', [{ type: 'NS', value: 'ns1.example.net', ttl: 3600 }]),
    ];
    expect(statuses(results, 'NS')).toEqual(['match', 'match', 'mismatch']);
  });

  it('CAA: Groß-/Kleinschreibung des Tags zählt nicht, der Wert schon', () => {
    const results = [
      full('cloudflare', [{ type: 'CAA', value: '0 issue "letsencrypt.org"', ttl: 300 }]),
      full('google', [{ type: 'CAA', value: '0 ISSUE "letsencrypt.org"', ttl: 300 }]),
      full('adguard', [{ type: 'CAA', value: '0 issue "pki.goog"', ttl: 300 }]),
    ];
    expect(statuses(results, 'CAA')).toEqual(['match', 'match', 'mismatch']);
  });

  it('SOA: verschiedene Primaries mit gleicher Seriennummer sind derselbe Stand', () => {
    const results = [
      full('cloudflare', [{ type: 'SOA', value: 'ns1.example. h.example. 7 1 1 1 300', ttl: 60 }]),
      full('google', [{ type: 'SOA', value: 'ns2.example. h.example. 7 1 1 1 300', ttl: 60 }]),
      full('adguard', [{ type: 'SOA', value: 'ns1.example. h.example. 6 1 1 1 300', ttl: 60 }]),
    ];
    const c = comparePropagation(results, 'SOA');
    expect(c.answers.map((a) => a.status)).toEqual(['match', 'match', 'mismatch']);
    // Angezeigt wird das ganze SOA, nicht nur die Nummer.
    expect(c.answers[2].values).toEqual(['ns1.example. h.example. 6 1 1 1 300']);
  });

  it('zählt bei MX, NS, CAA und SOA einen Resolver ohne Eintrag als Abweichung', () => {
    for (const type of ['MX', 'NS', 'CAA', 'SOA'] as const) {
      const value = type === 'SOA' ? 'a. b. 1 1 1 1 1' : type === 'CAA' ? '0 issue "x"' : 'ns.example.net';
      const record = { type, value, ttl: 60, ...(type === 'MX' && { priority: 10 }) };
      const results = [full('cloudflare', [record]), full('google', []), full('adguard', [record])];
      expect(statuses(results, type), type).toEqual(['match', 'mismatch', 'match']);
    }
  });
});

describe('TTL je Resolver (#131)', () => {
  it('nimmt die kleinste TTL der verglichenen Records', () => {
    const c = comparePropagation(
      [
        full('cloudflare', [
          { type: 'CNAME', value: 'cdn.example.net', ttl: 3600 },
          { type: 'A', value: '192.0.2.1', ttl: 60 },
          { type: 'A', value: '192.0.2.2', ttl: 45 },
        ]),
      ],
      'A'
    );
    // Der CNAME der Antwortkette zählt nicht mit.
    expect(c.answers[0].ttl).toBe(45);
  });

  it('nimmt bei „kein Eintrag“ die Negativ-TTL des Typs, sonst unbekannt', () => {
    const c = comparePropagation(
      [
        full('cloudflare', [{ type: 'TXT', value: 'neu', ttl: 300 }]),
        full('google', [], { negativeTtl: { TXT: 40, AAAA: 900 } }),
        full('adguard', []),
        full('dns-sb', [], { error: 'Timeout', negativeTtl: { TXT: 5 } }),
      ],
      'TXT'
    );
    expect(c.answers.map((a) => a.ttl)).toEqual([300, 40, null, null]);
  });

  it('kennt keine TTL, wenn der Resolver keine meldet', () => {
    const c = comparePropagation([full('cloudflare', [{ type: 'A', value: '192.0.2.1', ttl: null }])], 'A');
    expect(c.answers[0].ttl).toBeNull();
  });
});

describe('requeryWithin', () => {
  const txt = (ttl: number | null) => ({ type: 'TXT' as const, value: 'neu', ttl });

  it('nennt die größte TTL unter den abweichenden Resolvern', () => {
    const c = comparePropagation(
      [
        full('cloudflare', [txt(3600)]),
        full('google', [txt(3600)]),
        full('adguard', [], { negativeTtl: { TXT: 240 } }),
        full('dns-sb', [{ type: 'TXT', value: 'alt', ttl: 90 }]),
      ],
      'TXT'
    );
    expect(c.deviating).toBe(2);
    expect(requeryWithin(c)).toBe(240);
  });

  /*
   * `www` zeigt per CNAME (1 h) auf einen Host, dessen A-Record nur eine
   * Minute gilt. Hat sich der CNAME geändert, liefert der abweichende
   * Resolver die alte Adresse bis zu einer Stunde lang weiter — „spätestens
   * in 60 s“ wäre falsch.
   */
  it('zählt die TTL eines CNAMEs vor dem Record mit', () => {
    const viaCname = (target: string, address: string, cnameTtl: number) => [
      { type: 'CNAME' as const, value: target, ttl: cnameTtl },
      { type: 'A' as const, value: address, ttl: 60 },
    ];
    const c = comparePropagation(
      [
        full('cloudflare', viaCname('new.example.net', '192.0.2.1', 3600)),
        full('google', viaCname('new.example.net', '192.0.2.1', 3600)),
        full('adguard', viaCname('old.example.net', '198.51.100.7', 2400)),
      ],
      'A'
    );
    expect(c.answers.map((a) => a.ttl)).toEqual([60, 60, 60]);
    expect(requeryWithin(c)).toBe(2400);

    // Auch bei „kein Eintrag“ am Ende der Kette.
    const empty = comparePropagation(
      [
        full('cloudflare', [{ type: 'MX', value: 'mx.example.net', priority: 10, ttl: 300 }]),
        full('google', [{ type: 'MX', value: 'mx.example.net', priority: 10, ttl: 300 }]),
        full('adguard', [{ type: 'CNAME', value: 'old.example.net', ttl: 900 }], { negativeTtl: { MX: 120 } }),
      ],
      'MX'
    );
    expect(requeryWithin(empty)).toBe(900);

    // Beim Typ CNAME ist er selbst der Record.
    const cname = comparePropagation(
      [
        full('cloudflare', [{ type: 'CNAME', value: 'new.example.net', ttl: 300 }]),
        full('google', [{ type: 'CNAME', value: 'new.example.net', ttl: 300 }]),
        full('adguard', [{ type: 'CNAME', value: 'old.example.net', ttl: 200 }]),
      ],
      'CNAME'
    );
    expect(requeryWithin(cname)).toBe(200);
  });

  it('sagt nichts, wenn keiner abweicht', () => {
    const c = comparePropagation([full('cloudflare', [txt(60)]), full('google', [txt(30)])], 'TXT');
    expect(requeryWithin(c)).toBeUndefined();
  });

  it('sagt nichts, wenn ein abweichender Resolver keine TTL nennt', () => {
    const c = comparePropagation(
      [
        full('cloudflare', [txt(3600)]),
        full('google', [txt(3600)]),
        full('adguard', []),
        full('dns-sb', [{ type: 'TXT', value: 'alt', ttl: 90 }]),
      ],
      'TXT'
    );
    expect(requeryWithin(c)).toBeUndefined();
  });
});

describe('defaultPropagationType', () => {
  it('ist wie bisher der erste Standard-Typ mit Antwort, sonst der erste', () => {
    const ipv6Only = [full('cloudflare', [{ type: 'AAAA', value: '2001:db8::1', ttl: 60 }])];
    expect(defaultPropagationType(ipv6Only, propagationTypes('example.com'))).toBe('AAAA');
    expect(defaultPropagationType([full('cloudflare', [])], propagationTypes('example.com'))).toBe('A');
    expect(defaultPropagationType([], propagationTypes('_dmarc.example.com'))).toBe('TXT');
  });
});
