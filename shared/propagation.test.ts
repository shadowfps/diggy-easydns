import { describe, expect, it } from 'vitest';
import {
  comparableValue,
  comparePropagation,
  primaryPropagationType,
  propagationTypes,
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
