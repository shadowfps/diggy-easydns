import { describe, expect, it } from 'vitest';
import { dnsFindings, propagationFindings, sslFindings, whoisFindings } from './reportBuilder.js';
import { calculateScore } from '../../shared/scoring.js';
import type { DnsRecord, RecordType, ResolverResult, SslInfo, WhoisInfo } from '../types.js';

const ssl = (overrides: Partial<SslInfo> = {}): SslInfo => ({
  valid: true,
  issuer: 'Test CA',
  subject: 'example.com',
  validFrom: new Date(Date.now() - 86_400_000).toISOString(),
  validTo: new Date(Date.now() + 90 * 86_400_000).toISOString(),
  daysUntilExpiry: 90,
  sans: ['example.com'],
  tlsVersion: 'TLSv1.3',
  signatureAlgorithm: 'ECDSA prime256v1',
  isWildcard: false,
  ...overrides,
});

describe('sslFindings', () => {
  it('meldet ein gültiges Zertifikat als success', () => {
    const findings = sslFindings(ssl());
    expect(findings.map((f) => f.id)).toEqual(['ssl-ok']);
  });

  /**
   * Ein abgelaufenes Zertifikat ist per Definition auch nicht
   * vertrauenswürdig. Vorher feuerten ssl-invalid UND ssl-expired, ein
   * einziges Problem kostete damit 50 von 100 Punkten.
   */
  it('bestraft ein abgelaufenes Zertifikat nur einmal', () => {
    const findings = sslFindings(ssl({ valid: false, daysUntilExpiry: -5 }));
    expect(findings.map((f) => f.id)).toEqual(['ssl-expired']);
    expect(calculateScore(findings).score).toBe(75);
  });

  it('meldet ein ungültiges, aber nicht abgelaufenes Zertifikat als ungültig', () => {
    const findings = sslFindings(ssl({ valid: false }));
    expect(findings.map((f) => f.id)).toEqual(['ssl-invalid']);
  });

  it('warnt vor bald ablaufenden Zertifikaten', () => {
    expect(sslFindings(ssl({ daysUntilExpiry: 5 })).map((f) => f.id)).toContain(
      'ssl-expiring-soon'
    );
  });

  it('bemängelt veraltete TLS-Versionen', () => {
    expect(sslFindings(ssl({ tlsVersion: 'TLSv1.1' })).map((f) => f.id)).toContain('ssl-old-tls');
  });

  it('meldet fehlendes TLS', () => {
    expect(sslFindings(null).map((f) => f.id)).toEqual(['no-ssl']);
  });
});

describe('dnsFindings — Zusammenspiel mit WHOIS', () => {
  const noRecords: DnsRecord[] = [];

  it('deklariert no-address und no-ns als Folge von Domain-Ablauf und Hold', () => {
    const findings = dnsFindings(noRecords, 'example.com', 'example.com');
    for (const id of ['no-address', 'no-ns']) {
      const finding = findings.find((f) => f.id === id);
      expect(finding?.causedBy, id).toContain('domain-expired');
      expect(finding?.causedBy, id).toContain('whois-status-clienthold');
    }
  });

  /**
   * Der Gesamt-Score über beide Endpoints: eine abgelaufene, gehaltene Domain
   * ergab vorher drei Criticals aus einer Ursache.
   */
  it('kostet bei abgelaufener Domain nur einmal Punkte', () => {
    const dns = dnsFindings(noRecords, 'example.com', 'example.com');
    const whois = whoisFindings({
      registrar: 'Test',
      nameServers: [],
      status: ['clientHold'],
      source: 'test',
      expiresAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    });

    const all = [...dns, ...whois];
    // Drei Criticals aus einer Ursache: no-address, no-ns, domain-expired.
    expect(all.filter((f) => f.severity === 'critical')).toHaveLength(3);
    // Abgezogen wird nur die Ursache (25) plus die Info-Findings
    // (no-ipv6, no-caa = 4, unter dem Deckel von 6).
    expect(calculateScore(all).score).toBe(71);
  });

  /**
   * Der Fall ohne `expiresAt`: einige Registries liefern das Feld nicht mit.
   * Dann entsteht kein `domain-expired`, der Status-Code steht allein — und
   * `no-address`/`no-ns` deduplizierten gegen nichts. Ergebnis waren drei
   * Criticals für einen Lebenszyklus-Zustand, also genau die
   * Doppelbestrafung, die #41 beseitigen sollte.
   */
  it('kostet bei Redemption Period ohne Ablaufdatum nur einmal Punkte', () => {
    const dns = dnsFindings(noRecords, 'example.com', 'example.com');
    const whois = whoisFindings({
      registrar: 'Test',
      nameServers: [],
      status: ['redemptionPeriod'],
      source: 'test',
    });

    const all = [...dns, ...whois];
    expect(all.filter((f) => f.severity === 'critical')).toHaveLength(3);
    expect(calculateScore(all).score).toBe(71);
  });

  it('behandelt pendingRestore genauso', () => {
    const dns = dnsFindings(noRecords, 'example.com', 'example.com');
    const whois = whoisFindings({
      registrar: 'Test',
      nameServers: [],
      status: ['pendingRestore'],
      source: 'test',
    });
    expect(calculateScore([...dns, ...whois]).score).toBe(71);
  });

  it('zählt no-address voll, wenn die Domain nicht abgelaufen ist', () => {
    const dns = dnsFindings(noRecords, 'example.com', 'example.com');
    const whois = whoisFindings({
      registrar: 'Test',
      nameServers: ['ns1.example.com'],
      status: ['ok'],
      source: 'test',
      expiresAt: new Date(Date.now() + 300 * 86_400_000).toISOString(),
    });
    const all = [...dns, ...whois];
    expect(all.some((f) => f.id === 'no-address')).toBe(true);
    // no-address (25) plus no-ns (25) plus gedeckelte Infos (6).
    expect(calculateScore(all).score).toBeLessThanOrEqual(50);
  });
});

/**
 * #64: Unter `crsend._domainkey.kksn.de` liegt nur ein TXT-Record. Als Host
 * bewertet, kamen dafür ein Critical ("löst zu keiner IP auf") und ein
 * IPv6-Hinweis — für einen Namen, der nie eine Adresse haben soll.
 */
describe('dnsFindings — DNS-Einträge mit Unterstrich', () => {
  const dkim = 'crsend._domainkey.kksn.de';
  const txt: DnsRecord[] = [{ type: 'TXT', name: dkim, value: 'v=DKIM1; k=rsa; p=MIIB', ttl: 300 }];

  it('meldet keine fehlenden Adressen, wenn der Eintrag existiert', () => {
    expect(dnsFindings(txt, dkim, 'kksn.de')).toEqual([]);
  });

  it('meldet es kritisch, wenn unter dem Namen nichts liegt', () => {
    const findings = dnsFindings([], dkim, 'kksn.de');
    expect(findings.map((f) => f.id)).toEqual(['no-records']);
    expect(findings[0].severity).toBe('critical');
    // Läuft die Domain ab, verschwindet auch der Eintrag — dann ist das die
    // Folge, nicht eine zweite Ursache.
    expect(findings[0].causedBy).toContain('domain-expired');
  });

  it('bewertet Hostnamen weiter wie bisher', () => {
    expect(dnsFindings([], 'www.kksn.de', 'kksn.de').map((f) => f.id)).toContain('no-address');
  });
});

describe('propagationFindings', () => {
  const resolverResult = (
    id: string,
    records: [RecordType, string][],
    error?: string
  ): ResolverResult => ({
    resolver: { id, name: id, ip: '0.0.0.0', country: 'X', flag: '', provider: id },
    records: records.map(([type, value]) => ({ type, name: 'x', value, ttl: 300 })),
    responseTimeMs: 10,
    ...(error ? { error } : {}),
  });
  const ids = (findings: { id: string }[]) => findings.map((f) => f.id);

  describe('Hosts (A/AAAA)', () => {
    const types: RecordType[] = ['A', 'AAAA'];

    it('meldet gleiche A-Records als konsistent', () => {
      const results = ['cloudflare', 'google', 'adguard'].map((id) =>
        resolverResult(id, [['A', '192.0.2.1'], ['AAAA', '2001:db8::1']])
      );
      const findings = propagationFindings(results, types);
      expect(ids(findings)).toEqual(['propagation-consistent']);
      expect(findings[0].description).toBe('Alle 3 Resolver liefern dasselbe Ergebnis.');
    });

    it('meldet verschiedene A-Records wie bisher mit GeoDNS als möglicher Ursache', () => {
      const findings = propagationFindings(
        [resolverResult('cloudflare', [['A', '192.0.2.1']]), resolverResult('google', [['A', '192.0.2.2']])],
        types
      );
      expect(ids(findings)).toEqual(['propagation-mismatch']);
      expect(findings[0].description).toContain('GeoDNS');
    });

    it('lässt Resolver ohne Antwort oder mit Fehler außen vor', () => {
      const findings = propagationFindings(
        [
          resolverResult('cloudflare', [['A', '192.0.2.1']]),
          resolverResult('google', []),
          resolverResult('dns-sb', [], 'Timeout'),
        ],
        types
      );
      // Nur ein Resolver mit Antwort — nichts zu vergleichen.
      expect(findings).toEqual([]);
    });
  });

  /**
   * #82: Bei `s1._domainkey.example.com` gibt es keine Adressen. Verglichen
   * wird der TXT-Record — nach einem DKIM-Wechsel genau die Frage, ob der neue
   * Schlüssel überall angekommen ist.
   */
  describe('DNS-Einträge (TXT/CNAME)', () => {
    const types: RecordType[] = ['TXT', 'CNAME'];
    const key = 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAneu';

    it('meldet gleiche TXT-Records als konsistent — auch gestückelt und in anderer Reihenfolge', () => {
      const findings = propagationFindings(
        [
          resolverResult('cloudflare', [['TXT', `"${key.slice(0, 30)}" "${key.slice(30)}"`], ['TXT', 'token']]),
          resolverResult('google', [['TXT', 'token'], ['TXT', key]]),
          resolverResult('adguard', [['TXT', key], ['TXT', '"token"']]),
        ],
        types
      );
      expect(ids(findings)).toEqual(['propagation-consistent']);
      expect(findings[0].description).toBe('Alle 3 Resolver liefern denselben TXT-Record.');
    });

    it('meldet einen abweichenden TXT-Record ohne GeoDNS als Erklärung', () => {
      const findings = propagationFindings(
        [
          resolverResult('cloudflare', [['TXT', key]]),
          resolverResult('google', [['TXT', 'v=DKIM1; k=rsa; p=ALT']]),
          resolverResult('adguard', [['TXT', key]]),
        ],
        types
      );
      expect(ids(findings)).toEqual(['propagation-mismatch']);
      expect(findings[0].severity).toBe('warning');
      expect(findings[0].description).toContain('1 von 3 Resolvern');
      expect(findings[0].description).toContain('TXT-Record');
      expect(findings[0].description).not.toContain('GeoDNS');
    });

    it('zählt einen Resolver, der den neuen Eintrag noch nicht kennt, als Abweichung', () => {
      const findings = propagationFindings(
        [resolverResult('cloudflare', [['TXT', key]]), resolverResult('google', []), resolverResult('adguard', [['TXT', key]])],
        types
      );
      expect(ids(findings)).toEqual(['propagation-mismatch']);
    });

    it('vergleicht den CNAME, wenn unter dem Namen kein TXT liegt', () => {
      const findings = propagationFindings(
        [
          resolverResult('cloudflare', [['CNAME', 'sel1.provider.net']]),
          resolverResult('google', [['CNAME', 'SEL1.provider.net.']]),
        ],
        types
      );
      expect(ids(findings)).toEqual(['propagation-consistent']);
      expect(findings[0].description).toContain('CNAME-Record');
    });

    it('meldet nichts, wenn kein Resolver einen Eintrag liefert', () => {
      // Das sagt schon `no-records` aus dnsFindings — kritisch statt doppelt.
      expect(propagationFindings([resolverResult('cloudflare', []), resolverResult('google', [])], types)).toEqual([]);
    });
  });
});

describe('whoisFindings', () => {
  it('erzeugt kein Finding, wenn RDAP nichts liefert', () => {
    // Dass eine TLD kein RDAP anbietet, ist keine Schwäche der Domain und
    // darf den Score nicht drücken.
    expect(whoisFindings(null)).toEqual([]);
    expect(calculateScore(whoisFindings(null)).score).toBe(100);
  });

  const whois = (overrides: Partial<WhoisInfo> = {}): WhoisInfo => ({
    registrar: 'Test Registrar',
    nameServers: ['ns1.example.com'],
    status: [],
    source: 'test',
    ...overrides,
  });

  it('meldet eine abgelaufene Domain', () => {
    const findings = whoisFindings(
      whois({ expiresAt: new Date(Date.now() - 10 * 86_400_000).toISOString() })
    );
    expect(findings.map((f) => f.id)).toContain('domain-expired');
  });

  it('zählt Redemption Period bei abgelaufener Domain nicht doppelt', () => {
    const findings = whoisFindings(
      whois({
        expiresAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
        status: ['redemptionPeriod'],
      })
    );
    expect(findings.filter((f) => f.severity === 'critical')).toHaveLength(1);
    expect(calculateScore(findings).score).toBe(75);
  });

  /**
   * Der Registrar stellt eine Domain beim Ablauf praktisch immer auf Hold.
   * Ohne Dedup ergaben domain-expired und whois-status-clienthold zusammen
   * 50 Punkte Abzug für eine Ursache.
   */
  it('zählt clientHold bei abgelaufener Domain nicht doppelt', () => {
    const findings = whoisFindings(
      whois({
        expiresAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
        status: ['clientHold', 'redemptionPeriod'],
      })
    );
    expect(findings.filter((f) => f.severity === 'critical')).toHaveLength(1);
    expect(findings[0].id).toBe('domain-expired');
    expect(calculateScore(findings).score).toBe(75);
  });

  it('meldet clientHold auch ohne Ablaufdatum', () => {
    const findings = whoisFindings(whois({ status: ['clientHold'] }));
    expect(findings.map((f) => f.id)).toContain('whois-status-clienthold');
  });

  it('warnt vor bald ablaufenden Domains', () => {
    const findings = whoisFindings(
      whois({ expiresAt: new Date(Date.now() + 20 * 86_400_000).toISOString() })
    );
    expect(findings.map((f) => f.id)).toContain('domain-expiring-soon');
  });
});
