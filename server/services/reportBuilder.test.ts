import { describe, expect, it } from 'vitest';
import {
  dnsFindings,
  dnssecFindings,
  mailFindings,
  propagationFindings,
  sslFindings,
  whoisFindings,
} from './reportBuilder.js';
import { calculateScore } from '../../shared/scoring.js';
import type {
  DnsRecord,
  DnssecInfo,
  LookupFailure,
  MailSecurity,
  SslInfo,
  WhoisInfo,
} from '../types.js';

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

/**
 * Score vor und nach #101.
 *
 * Die Werte stammen aus einem Lauf mit dem Stand VOR der Änderung (gleiche
 * Fixtures). Für Domains ohne Ausfall darf sich nichts verschieben — weder
 * der Score noch, welche Findings entstehen. Nur ein gescheiterter Check
 * ändert etwas: dann fällt sein Abzug weg.
 */
describe('Score einer normalen Domain bleibt wie vor #101', () => {
  const D = 'example.com';
  const records: DnsRecord[] = [
    { type: 'A', name: D, value: '203.0.113.5', ttl: 300 },
    { type: 'AAAA', name: D, value: '2001:db8::5', ttl: 300 },
    { type: 'NS', name: D, value: 'ns1.example.net', ttl: 0 },
    { type: 'MX', name: D, value: 'mx.example.net', priority: 10, ttl: 0 },
  ];
  const mail: MailSecurity = {
    spf: { present: true, record: 'v=spf1 mx -all', lookupCount: 1, valid: true, issues: [] },
    dmarc: { present: true, record: 'v=DMARC1; p=reject', policy: 'reject' },
    dkim: { selectors: [{ selector: 'default', present: true }] },
    mtaSts: { present: false },
    hasMx: true,
  };
  const noMail: MailSecurity = {
    spf: { present: false, valid: false, issues: [] },
    dmarc: { present: false },
    dkim: { selectors: [] },
    mtaSts: { present: false },
    hasMx: false,
  };
  const dnssecOff: DnssecInfo = { enabled: false, valid: false, chainOfTrust: 'none' };

  function report(over: {
    records?: DnsRecord[];
    ssl?: SslInfo | null;
    sslFailed?: LookupFailure;
    mail?: MailSecurity;
    dnssec?: DnssecInfo;
  } = {}) {
    const findings = [
      ...dnsFindings(over.records ?? records, D, D),
      ...propagationFindings([]),
      ...dnssecFindings(over.dnssec ?? dnssecOff),
      ...sslFindings(
        over.ssl === undefined ? ssl({ daysUntilExpiry: 60 }) : over.ssl,
        over.sslFailed
      ),
      ...mailFindings(over.mail ?? mail, D),
      ...whoisFindings(null),
    ];
    return { score: calculateScore(findings).score, ids: findings.map((f) => f.id).join(',') };
  }

  it.each([
    ['normal', {}, 94, 'no-caa,dnssec-off,ssl-ok,spf-ok,dmarc-present,dkim-present,no-mta-sts'],
    [
      'ohne TLS',
      { ssl: null },
      86,
      'no-caa,dnssec-off,no-ssl,spf-ok,dmarc-present,dkim-present,no-mta-sts',
    ],
    [
      'ohne DMARC',
      { mail: { ...mail, dmarc: { present: false } } },
      86,
      'no-caa,dnssec-off,ssl-ok,spf-ok,no-dmarc,dkim-present,no-mta-sts',
    ],
    [
      'ohne SPF',
      { mail: { ...mail, spf: { present: false, valid: false, issues: [] } } },
      86,
      'no-caa,dnssec-off,ssl-ok,no-spf,dmarc-present,dkim-present,no-mta-sts',
    ],
    [
      'mit DNSSEC',
      {
        dnssec: {
          enabled: true,
          valid: true,
          chainOfTrust: 'valid',
          algorithm: 'ECDSAP256SHA256',
        },
      },
      96,
      'no-caa,dnssec-valid,ssl-ok,spf-ok,dmarc-present,dkim-present,no-mta-sts',
    ],
    [
      'nur A und NS, ohne Mail',
      { records: [records[0], records[2]], mail: noMail },
      94,
      'no-ipv6,no-caa,dnssec-off,ssl-ok,no-spf,no-dmarc',
    ],
  ] as const)('%s', (_label, over, score, ids) => {
    expect(report(over)).toEqual({ score, ids });
  });

  it('ein gescheiterter Check kostet nichts: Timeout bei SSL, DMARC und DNSSEC', () => {
    const failed = report({
      ssl: null,
      sslFailed: 'timeout',
      mail: { ...mail, dmarc: { present: false, lookupFailed: 'timeout' } },
      dnssec: { ...dnssecOff, lookupFailed: 'timeout' },
    });

    // dnssec-off (−2) entfällt mit dem Ausfall — der Score kann nur steigen.
    expect(failed.score).toBe(96);
    expect(failed.ids).toBe(
      'no-caa,dnssec-unchecked,ssl-unchecked,spf-ok,dmarc-unchecked,dkim-present,no-mta-sts'
    );
  });
});
