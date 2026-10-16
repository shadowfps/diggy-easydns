import { describe, expect, it } from 'vitest';
import {
  dnsFindings,
  dnssecFindings,
  mailFindings,
  propagationFindings,
  sslFindings,
  whoisFindings,
} from './reportBuilder.js';
import { analyzeSpf } from './mailAudit.js';
import { calculateScore } from '../../shared/scoring.js';
import type {
  DnsRecord,
  DnssecInfo,
  Finding,
  LookupFailure,
  MailSecurity,
  RecordType,
  ResolverResult,
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

    /**
     * Direkt nach einem DKIM-Wechsel hat oft erst EIN Resolver den neuen
     * Schlüssel. Die Mehrheit sagt nicht, wer den alten Stand hat — der Befund
     * darf den abweichenden Resolver deshalb nicht „veraltet“ nennen.
     */
    it('sagt nicht, welche Seite den alten Stand hat', () => {
      const findings = propagationFindings(
        [
          resolverResult('cloudflare', [['TXT', 'v=DKIM1; k=rsa; p=NEU']]),
          resolverResult('google', [['TXT', key]]),
          resolverResult('adguard', [['TXT', key]]),
        ],
        types
      );
      expect(findings[0].description).toContain('noch nicht überall angekommen');
      expect(findings[0].description).not.toMatch(/dort noch nicht/);
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
    nullMx: false,
  };
  const noMail: MailSecurity = {
    spf: { present: false, valid: false, issues: [] },
    dmarc: { present: false },
    dkim: { selectors: [] },
    mtaSts: { present: false },
    hasMx: false,
    nullMx: false,
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
      ...propagationFindings([], ['A']),
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

/* ─── Mail ────────────────────────────────────────────────────────────── */

const spf = (record?: string): MailSecurity['spf'] =>
  record
    ? { present: true, record, lookupCount: 0, valid: true, issues: [] }
    : { present: false, valid: false, issues: [] };

const dmarc = (policy?: 'none' | 'quarantine' | 'reject'): MailSecurity['dmarc'] =>
  policy ? { present: true, record: `v=DMARC1; p=${policy}`, policy } : { present: false };

/** example.com, wie es tatsächlich konfiguriert ist: Null-MX, SPF -all, DMARC reject. */
const mail = (overrides: Partial<MailSecurity> = {}): MailSecurity => ({
  spf: spf('v=spf1 -all'),
  dmarc: dmarc('reject'),
  dkim: { selectors: [] },
  mtaSts: { present: false },
  hasMx: true,
  nullMx: true,
  ...overrides,
});

const summary = (findings: Finding[]) => findings.map((f) => `${f.severity} ${f.id}`);

/**
 * #77: example.com nimmt bewusst keine Mails an. diggy empfahl trotzdem DKIM
 * und MTA-STS und zog dafür Punkte ab.
 */
describe('mailFindings — Domain ohne Mail (Null-MX)', () => {
  it('meldet für example.com keine DKIM-/MTA-STS-Hinweise, sondern die saubere Markierung', () => {
    const findings = mailFindings(mail(), 'example.com');
    expect(summary(findings)).toEqual([
      'success spf-ok',
      'success dmarc-present',
      'success null-mx',
    ]);
    expect(findings.find((f) => f.id === 'null-mx')?.title).toContain('sauber');
    expect(calculateScore(findings).score).toBe(100);
  });

  /**
   * Der ganze Report von example.com (Stand Oktober 2026): vorher drei
   * info-Findings — no-caa, no-dkim-found, no-mta-sts — am Deckel von 6,
   * also 94. Übrig bleibt no-caa.
   */
  it('hebt den Score einer example.com-artigen Konfiguration von 94 auf 98', () => {
    const records: DnsRecord[] = [
      { type: 'A', name: 'example.com', value: '93.184.215.14', ttl: 300 },
      { type: 'AAAA', name: 'example.com', value: '2606:2800:21f:cb07:6820:80da:af6b:8b2c', ttl: 300 },
      { type: 'MX', name: 'example.com', value: '', priority: 0, ttl: 0 },
      { type: 'NS', name: 'example.com', value: 'a.iana-servers.net', ttl: 0 },
      { type: 'TXT', name: 'example.com', value: 'v=spf1 -all', ttl: 0 },
    ];
    const all = [
      ...dnsFindings(records, 'example.com', 'example.com'),
      ...dnssecFindings({ enabled: true, valid: true, chainOfTrust: 'valid' }),
      ...sslFindings(ssl()),
      ...mailFindings(mail(), 'example.com'),
    ];
    expect(all.filter((f) => f.severity !== 'success').map((f) => f.id)).toEqual(['no-caa']);
    expect(calculateScore(all).score).toBe(98);
  });

  it('meldet ohne SPF den Null-MX positiv und weist auf die Lücke hin — ohne doppelten Abzug', () => {
    const findings = mailFindings(mail({ spf: spf(undefined) }), 'example.com');
    expect(summary(findings)).toEqual([
      'info no-spf',
      'success dmarc-present',
      'success null-mx',
      'info null-mx-incomplete',
    ]);

    // Wie bei einer Domain ohne MX: Empfehlung, kein Mangel — und der
    // Vorschlag ist das SPF für eine Domain ohne Mail, nicht `mx ~all`.
    const noSpf = findings.find((f) => f.id === 'no-spf');
    expect(noSpf?.fix?.snippet).toBe('example.com  TXT  "v=spf1 -all"');

    const hint = findings.find((f) => f.id === 'null-mx-incomplete');
    expect(hint?.description).toContain('v=spf1 -all');
    expect(hint?.description).not.toContain('DMARC');
    expect(hint?.causedBy).toContain('no-spf');
    // Abgezogen wird nur no-spf (2), der Hinweis ist dessen Folge.
    expect(calculateScore(findings).score).toBe(98);
  });

  /** ~all geht als spf-ok durch — für eine Domain ohne Mail reicht es nicht. */
  it('weist auf SPF ~all hin, das sonst als OK durchginge', () => {
    const findings = mailFindings(mail({ spf: spf('v=spf1 ~all') }), 'example.com');
    expect(summary(findings)).toEqual([
      'success spf-ok',
      'success dmarc-present',
      'success null-mx',
      'info null-mx-incomplete',
    ]);
    expect(findings.find((f) => f.id === 'null-mx')?.title).not.toContain('sauber');
    expect(findings.find((f) => f.id === 'null-mx-incomplete')?.fix?.snippet).toBe(
      'example.com  TXT  "v=spf1 -all"'
    );
    expect(calculateScore(findings).score).toBe(98);
  });

  it('nennt eine zu schwache DMARC-Policy', () => {
    const findings = mailFindings(mail({ dmarc: dmarc('quarantine') }), 'example.com');
    const hint = findings.find((f) => f.id === 'null-mx-incomplete');
    expect(hint?.description).toContain('p=reject (jetzt p=quarantine)');
    expect(hint?.fix?.snippet).toBe('_dmarc.example.com  TXT  "v=DMARC1; p=reject"');
  });

  /** pct=0: Fälschungen landen nur in Quarantäne — kein „sauber markiert“. */
  it('nennt DMARC p=reject, das nur für einen Teil der Mails gilt', () => {
    const findings = mailFindings(
      mail({ dmarc: { present: true, record: 'v=DMARC1; p=reject; pct=0', policy: 'reject' } }),
      'example.com'
    );
    expect(findings.find((f) => f.id === 'null-mx')?.title).not.toContain('sauber');
    const hint = findings.find((f) => f.id === 'null-mx-incomplete');
    expect(hint?.description).toContain('p=reject für alle Mails (jetzt pct=0)');
    expect(hint?.fix?.snippet).toBe('_dmarc.example.com  TXT  "v=DMARC1; p=reject"');
    expect(calculateScore(findings).score).toBe(98);
  });

  it('zieht für DMARC p=none weiter die Warnung ab, aber nur einmal', () => {
    const findings = mailFindings(mail({ dmarc: dmarc('none') }), 'example.com');
    expect(summary(findings)).toContain('warning dmarc-policy-none');
    expect(calculateScore(findings).score).toBe(92);
  });

  /** Kein Umweg über quarantine: Ohne echte Mails kann nichts verloren gehen. */
  it('rät bei DMARC p=none direkt zu p=reject', () => {
    const findings = mailFindings(mail({ dmarc: dmarc('none') }), 'example.com');
    const policyNone = findings.find((f) => f.id === 'dmarc-policy-none');
    expect(policyNone?.description).toContain('direkt auf p=reject');
    expect(policyNone?.description).not.toContain('quarantine');
  });

  /** +all ist schon critical — dass SPF -all fehlt, kostet nicht noch einmal. */
  it('zieht für ein problematisches SPF nicht doppelt ab', () => {
    const findings = mailFindings(mail({ spf: analyzeSpf('v=spf1 +all') }), 'example.com');
    expect(summary(findings)).toEqual([
      expect.stringMatching(/^critical spf-issue-/),
      'success dmarc-present',
      'success null-mx',
      'info null-mx-incomplete',
    ]);
    expect(calculateScore(findings).score).toBe(75);
  });

  /** rua an die eigene Domain liefe ins Leere — sie nimmt keine Mails an. */
  it('schlägt ohne DMARC p=reject ohne Report-Adresse auf der Domain vor', () => {
    const findings = mailFindings(mail({ dmarc: dmarc(undefined) }), 'example.com');
    const noDmarc = findings.find((f) => f.id === 'no-dmarc');
    expect(noDmarc?.severity).toBe('info');
    expect(noDmarc?.fix?.snippet).toBe('_dmarc.example.com  TXT  "v=DMARC1; p=reject"');
  });

  /**
   * Scheiterte die Abfrage (#101), ist offen, ob SPF oder DMARC fehlen — der
   * Hinweis auf die Lücke darf sie dann nicht als fehlend nennen.
   */
  it('nennt eine nicht prüfbare SPF- oder DMARC-Abfrage nicht als Lücke', () => {
    const spfFailed = mailFindings(
      mail({ spf: { present: false, valid: false, issues: [], lookupFailed: 'timeout' } }),
      'example.com'
    );
    expect(summary(spfFailed)).toEqual([
      'info spf-unchecked',
      'success dmarc-present',
      'success null-mx',
    ]);
    expect(spfFailed.find((f) => f.id === 'null-mx')?.title).not.toContain('sauber');

    const bothFailed = mailFindings(
      mail({
        spf: spf('v=spf1 ~all'),
        dmarc: { present: false, lookupFailed: 'servfail' },
      }),
      'example.com'
    );
    expect(summary(bothFailed)).toEqual([
      'success spf-ok',
      'info dmarc-unchecked',
      'success null-mx',
      'info null-mx-incomplete',
    ]);
    const hint = bothFailed.find((f) => f.id === 'null-mx-incomplete');
    expect(hint?.description).toContain('v=spf1 -all');
    expect(hint?.description).not.toContain('DMARC');
  });

  it('zeigt gefundene DKIM-Selectors weiter an', () => {
    const findings = mailFindings(
      mail({ dkim: { selectors: [{ selector: 'default', present: true }] } }),
      'example.com'
    );
    expect(summary(findings)).toContain('success dkim-present');
  });
});

describe('mailFindings — Domains mit echtem MX unverändert', () => {
  const real = (overrides: Partial<MailSecurity> = {}) => mail({ nullMx: false, ...overrides });

  it('empfiehlt ohne alles weiter SPF, DMARC, DKIM und MTA-STS wie bisher', () => {
    const findings = mailFindings(
      real({ spf: spf(undefined), dmarc: dmarc(undefined) }),
      'example.de'
    );
    expect(summary(findings)).toEqual([
      'warning no-spf',
      'warning no-dmarc',
      'info no-dkim-found',
      'info no-mta-sts',
    ]);
    expect(findings[0].fix?.snippet).toBe('example.de  TXT  "v=spf1 mx ~all"');
    expect(findings[1].fix?.snippet).toBe(
      '_dmarc.example.de  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.de"'
    );
    expect(calculateScore(findings).score).toBe(100 - 8 - 8 - 4);
  });

  it('meldet ein vollständiges Setup wie bisher', () => {
    const findings = mailFindings(
      real({
        spf: spf('v=spf1 include:_spf.google.com ~all'),
        dkim: { selectors: [{ selector: 'google', present: true }] },
        mtaSts: { present: true },
      }),
      'example.de'
    );
    expect(summary(findings)).toEqual([
      'success spf-ok',
      'success dmarc-present',
      'success dkim-present',
    ]);
  });

  it('rät bei DMARC p=none weiter zum Schritt über quarantine', () => {
    const findings = mailFindings(real({ dmarc: dmarc('none') }), 'example.de');
    expect(findings.find((f) => f.id === 'dmarc-policy-none')?.description).toContain(
      'auf quarantine wechseln'
    );
  });

  /**
   * SPF -all allein macht eine Domain nicht mail-frei: ohne MX stellen
   * Absender per A-Fallback an den Host zu.
   */
  it('markiert eine Domain ohne MX trotz SPF -all nicht als mail-frei', () => {
    const findings = mailFindings(real({ hasMx: false }), 'example.de');
    expect(summary(findings)).toEqual(['success spf-ok', 'success dmarc-present']);
  });
});

/**
 * #83: BIMI und TLS-RPT sind Empfehlungen. Fehlen sie, gibt es einen Hinweis
 * ohne Abzug; eine Domain ohne Mail bekommt gar keinen.
 */
describe('mailFindings — BIMI und TLS-RPT', () => {
  const missing = { bimi: { present: false }, tlsRpt: { present: false } };
  const real = (overrides: Partial<MailSecurity> = {}) =>
    mail({ nullMx: false, ...missing, ...overrides });
  const newIds = (findings: Finding[]) =>
    summary(findings).filter((s) => /bimi|tls-rpt/.test(s));

  it('weist auf fehlendes BIMI und TLS-RPT hin — ohne Score-Abzug', () => {
    const findings = mailFindings(real(), 'example.de');
    expect(newIds(findings)).toEqual(['info no-tls-rpt', 'info no-bimi']);
    expect(
      findings.filter((f) => /bimi|tls-rpt/.test(f.id)).every((f) => f.advisory)
    ).toBe(true);
    expect(findings.find((f) => f.id === 'no-tls-rpt')?.fix?.snippet).toBe(
      '_smtp._tls.example.de  TXT  "v=TLSRPTv1; rua=mailto:tls-reports@example.de"'
    );
    expect(findings.find((f) => f.id === 'no-bimi')?.fix?.snippet).toBe(
      'default._bimi.example.de  TXT  "v=BIMI1; l=https://example.de/bimi/logo.svg"'
    );
  });

  /** Gegenprobe: Mit den neuen Feldern bleibt der Score, wo er war. */
  it.each<[string, Partial<MailSecurity>]>([
    ['vollständiges Setup', { mtaSts: { present: true } }],
    ['ohne SPF und DMARC', { spf: spf(undefined), dmarc: dmarc(undefined) }],
    ['DMARC p=none', { dmarc: dmarc('none') }],
    ['ohne MX', { hasMx: false }],
  ])('ändert den Score nicht: %s', (_, overrides) => {
    const before = mailFindings(mail({ nullMx: false, ...overrides }), 'example.de');
    const after = mailFindings(real(overrides), 'example.de');
    expect(calculateScore(after).score).toBe(calculateScore(before).score);
  });

  it('meldet bei einer Domain ohne Mail (Null-MX) nichts zu BIMI und TLS-RPT', () => {
    expect(newIds(mailFindings(mail(missing), 'example.com'))).toEqual([]);
    // Auch nicht, wenn dort doch Records stehen — sie hätten nichts zu tun.
    const withRecords = mail({
      bimi: { present: true, invalid: 'v=BIMI1 fehlt am Anfang' },
      tlsRpt: { present: true, rua: ['mailto:tls@example.com'] },
    });
    expect(newIds(mailFindings(withRecords, 'example.com'))).toEqual([]);
  });

  it('meldet bei einer Domain ohne MX kein Fehlen — wie bei DKIM und MTA-STS', () => {
    expect(newIds(mailFindings(real({ hasMx: false }), 'example.de'))).toEqual([]);
  });

  it('empfiehlt BIMI bei DMARC p=none nicht, sondern nennt erst DMARC', () => {
    const findings = mailFindings(real({ dmarc: dmarc('none') }), 'example.de');
    expect(newIds(findings)).toEqual(['info no-tls-rpt', 'info bimi-needs-dmarc']);
    const hint = findings.find((f) => f.id === 'bimi-needs-dmarc');
    expect(hint?.description).toContain('Jetzt: DMARC p=none');
    expect(hint?.fix).toBeUndefined();
    expect(hint?.advisory).toBe(true);
  });

  it('nennt auch ein fehlendes DMARC als Voraussetzung', () => {
    const findings = mailFindings(real({ dmarc: dmarc(undefined) }), 'example.de');
    expect(findings.find((f) => f.id === 'bimi-needs-dmarc')?.description).toContain(
      'Jetzt: kein DMARC-Record'
    );
  });

  it('meldet einen BIMI-Record, der an DMARC p=none scheitert', () => {
    const findings = mailFindings(
      real({
        dmarc: dmarc('none'),
        bimi: { present: true, logoUrl: 'https://example.de/l.svg' },
      }),
      'example.de'
    );
    expect(newIds(findings)).toContain('info bimi-dmarc-weak');
    expect(findings.find((f) => f.id === 'bimi-dmarc-weak')?.advisory).toBe(true);
  });

  it('meldet vorhandene Records positiv', () => {
    const findings = mailFindings(
      real({
        bimi: {
          present: true,
          logoUrl: 'https://example.de/l.svg',
          evidenceUrl: 'https://example.de/vmc.pem',
        },
        tlsRpt: { present: true, rua: ['mailto:tls@example.de', 'https://r.example.net/'] },
      }),
      'example.de'
    );
    expect(newIds(findings)).toEqual(['success tls-rpt-present', 'success bimi-present']);
    expect(findings.find((f) => f.id === 'tls-rpt-present')?.description).toContain(
      'mailto:tls@example.de, https://r.example.net/'
    );
    expect(findings.find((f) => f.id === 'bimi-present')?.description).toContain('mit Zertifikat');
  });

  it('nennt bei ungültigen Records den Grund — ohne Abzug', () => {
    const findings = mailFindings(
      real({
        bimi: { present: true, invalid: 'Die Logo-URL in l= muss mit https:// beginnen' },
        tlsRpt: { present: true, invalid: '2 TLS-RPT-Records — RFC 8460 verlangt genau einen' },
      }),
      'example.de'
    );
    expect(newIds(findings)).toEqual(['info tls-rpt-invalid', 'info bimi-invalid']);
    expect(findings.find((f) => f.id === 'bimi-invalid')?.description).toContain('https://');
    expect(findings.find((f) => f.id === 'tls-rpt-invalid')?.description).toContain(
      '2 TLS-RPT-Records'
    );
    expect(calculateScore(findings).score).toBe(
      calculateScore(mailFindings(mail({ nullMx: false }), 'example.de')).score
    );
  });

  it('übergeht den bewussten BIMI-Verzicht', () => {
    const findings = mailFindings(real({ bimi: { present: true, declined: true } }), 'example.de');
    expect(newIds(findings)).toEqual(['info no-tls-rpt']);
  });

  /** Ausfall ≠ fehlt: ohne Antwort kein „fehlt“-Hinweis. */
  it('sagt nichts, wenn die Abfrage gescheitert ist', () => {
    const findings = mailFindings(
      real({
        bimi: { present: false, lookupFailed: 'timeout' },
        tlsRpt: { present: false, lookupFailed: 'servfail' },
      }),
      'example.de'
    );
    expect(newIds(findings)).toEqual([]);
  });

  /**
   * Ob BIMI wirkt, hängt an DMARC. Ist DMARC nicht prüfbar (#101), darf der
   * Hinweis weder „kein DMARC-Record“ behaupten noch „wirkt“.
   */
  it('sagt zu BIMI nichts über DMARC, wenn dessen Abfrage scheiterte', () => {
    const dmarcFailed: MailSecurity['dmarc'] = { present: false, lookupFailed: 'timeout' };
    expect(newIds(mailFindings(real({ dmarc: dmarcFailed }), 'example.de'))).toEqual([
      'info no-tls-rpt',
    ]);

    const withRecord = mailFindings(
      real({
        dmarc: dmarcFailed,
        bimi: { present: true, records: ['v=BIMI1; l=https://example.de/l.svg'], logoUrl: 'https://example.de/l.svg' },
      }),
      'example.de'
    );
    expect(newIds(withRecord)).toEqual(['info no-tls-rpt']);
    expect(withRecord.map((f) => f.description).join(' ')).not.toContain('kein DMARC-Record');
  });

  it('verweist bei vorhandenem MTA-STS auf die fehlenden Berichte', () => {
    const findings = mailFindings(real({ mtaSts: { present: true } }), 'example.de');
    expect(findings.find((f) => f.id === 'no-tls-rpt')?.description).toContain('Zu MTA-STS');
  });
});

/**
 * #107: Ein DMARC-Record ohne gültiges p= galt als „DMARC-Policy: gesetzt“.
 * RFC 7489 §6.6.3: Mit Report-Adresse in rua= wirkt er wie p=none, ohne
 * ignorieren ihn Empfänger — als gäbe es kein DMARC. Bewertet wird deshalb
 * genau wie in diesen beiden Fällen; nur Titel und Text nennen den Mangel.
 */
describe('mailFindings — DMARC ohne gültiges p=', () => {
  const record = (value: string): MailSecurity['dmarc'] => ({ present: true, record: value });
  const real = (overrides: Partial<MailSecurity> = {}) => mail({ nullMx: false, ...overrides });

  /** Gleiche Findings (ID und Severity) und gleicher Score wie das Gegenstück. */
  const expectSameRating = (actual: Finding[], expected: Finding[]) => {
    expect(summary(actual)).toEqual(summary(expected));
    expect(calculateScore(actual).score).toBe(calculateScore(expected).score);
  };

  it('wertet v=DMARC1; rua=… wie p=none und nennt das fehlende p=', () => {
    const findings = mailFindings(real({ dmarc: record('v=DMARC1; rua=mailto:x@y') }), 'example.de');
    expectSameRating(findings, mailFindings(real({ dmarc: dmarc('none') }), 'example.de'));

    const finding = findings.find((f) => f.id === 'dmarc-policy-none');
    expect(finding?.title).toBe('DMARC wirkt wie p=none: p= fehlt');
    expect(finding?.description).toContain('RFC 7489 §6.6.3');
    expect(finding?.description).toContain('auf quarantine wechseln');
    // Der Vorschlag behält rua= und schreibt p= an seinen Platz.
    expect(finding?.fix?.snippet).toBe('_dmarc.example.de  TXT  "v=DMARC1; p=none; rua=mailto:x@y"');
  });

  it('wertet v=DMARC1 allein wie keinen DMARC-Record', () => {
    const findings = mailFindings(real({ dmarc: record('v=DMARC1') }), 'example.de');
    const without = mailFindings(real({ dmarc: dmarc(undefined) }), 'example.de');
    expectSameRating(findings, without);

    const finding = findings.find((f) => f.id === 'no-dmarc');
    expect(finding?.title).toBe('DMARC wirkt nicht: p= fehlt');
    expect(finding?.description).toContain('als gäbe es kein DMARC');
    expect(finding?.fix?.snippet).toBe(without.find((f) => f.id === 'no-dmarc')?.fix?.snippet);
  });

  it('wertet ein ungültiges p= mit rua= wie p=none', () => {
    const findings = mailFindings(
      real({ dmarc: record('v=DMARC1; p=foo; rua=mailto:dmarc@example.de') }),
      'example.de'
    );
    expectSameRating(findings, mailFindings(real({ dmarc: dmarc('none') }), 'example.de'));
    const finding = findings.find((f) => f.id === 'dmarc-policy-none');
    expect(finding?.title).toBe('DMARC wirkt wie p=none: p=foo ist ungültig');
    expect(finding?.fix?.snippet).toBe(
      '_dmarc.example.de  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@example.de"'
    );
  });

  /** sp= gilt nur für Subdomains und ersetzt kein fehlendes p= (RFC 7489 §6.3). */
  it('wertet v=DMARC1; sp=reject ohne rua= wie keinen DMARC-Record', () => {
    const findings = mailFindings(real({ dmarc: record('v=DMARC1; sp=reject') }), 'example.de');
    expectSameRating(findings, mailFindings(real({ dmarc: dmarc(undefined) }), 'example.de'));
    expect(summary(findings)).not.toContain('success dmarc-present');
  });

  /** Ohne mailto: ist rua= kein URI — es rettet den Record nicht. */
  it('zählt eine ungültige Report-Adresse nicht als rua=', () => {
    const findings = mailFindings(
      real({ dmarc: record('v=DMARC1; rua=dmarc@example.de') }),
      'example.de'
    );
    expectSameRating(findings, mailFindings(real({ dmarc: dmarc(undefined) }), 'example.de'));
  });

  it.each([
    ['v=DMARC1; p=reject', 'DMARC-Policy: reject'],
    ['v=DMARC1; p=quarantine; rua=mailto:x@y', 'DMARC-Policy: quarantine'],
    ['v=DMARC1; sp=none; p=reject; pct=50', 'DMARC-Policy: reject'],
  ])('lässt korrekte Records unverändert: %s', (value, title) => {
    const findings = mailFindings(real({ dmarc: record(value) }), 'example.de');
    expect(findings.filter((f) => /dmarc/.test(f.id)).map((f) => f.id)).toEqual(['dmarc-present']);
    expect(findings.find((f) => f.id === 'dmarc-present')?.title).toBe(title);
  });

  it('lässt p=none unverändert', () => {
    const finding = mailFindings(real({ dmarc: dmarc('none') }), 'example.de').find(
      (f) => f.id === 'dmarc-policy-none'
    );
    expect(finding?.title).toBe('DMARC-Policy ist p=none (nur Reporting)');
    expect(finding?.fix).toBeUndefined();
  });

  /** §6.6.3 Schritt 6 gilt auch für ein ungültiges sp= — dann zählt p=reject nicht. */
  describe('mit ungültigem sp=', () => {
    it('wertet p=reject; sp=foo mit rua= wie p=none und schlägt den Record ohne sp= vor', () => {
      const findings = mailFindings(
        real({ dmarc: { ...record('v=DMARC1; p=reject; sp=foo; rua=mailto:x@y'), policy: 'reject' } }),
        'example.de'
      );
      expectSameRating(findings, mailFindings(real({ dmarc: dmarc('none') }), 'example.de'));
      const finding = findings.find((f) => f.id === 'dmarc-policy-none');
      expect(finding?.title).toBe('DMARC wirkt wie p=none: sp=foo ist ungültig');
      expect(finding?.description).toContain('auch p=reject');
      // Die gewollte Policy steht schon in p=: kein „auf quarantine wechseln“.
      expect(finding?.description).not.toContain('quarantine wechseln');
      expect(finding?.fix?.snippet).toBe('_dmarc.example.de  TXT  "v=DMARC1; p=reject; rua=mailto:x@y"');
    });

    it('wertet ein leeres sp= ohne rua= wie keinen DMARC-Record und behält p=', () => {
      const findings = mailFindings(real({ dmarc: record('v=DMARC1; p=quarantine; sp=; adkim=s') }), 'example.de');
      expectSameRating(findings, mailFindings(real({ dmarc: dmarc(undefined) }), 'example.de'));
      const finding = findings.find((f) => f.id === 'no-dmarc');
      expect(finding?.title).toBe('DMARC wirkt nicht: sp= ist leer');
      expect(finding?.fix?.snippet).toBe('_dmarc.example.de  TXT  "v=DMARC1; p=quarantine; adkim=s"');
    });

    /** Sonst bliebe der Vorschlag selbst wirkungslos. */
    it('lässt ein ungültiges sp= auch beim Ergänzen von p= weg', () => {
      const findings = mailFindings(real({ dmarc: record('v=DMARC1; sp=foo; rua=mailto:x@y') }), 'example.de');
      expect(findings.find((f) => f.id === 'dmarc-policy-none')?.fix?.snippet).toBe(
        '_dmarc.example.de  TXT  "v=DMARC1; p=none; rua=mailto:x@y"'
      );
    });
  });

  /** §6.6.3 Schritt 5: Bei mehreren Records wenden Empfänger DMARC gar nicht an. */
  it('wertet mehrere DMARC-Records wie keinen, auch mit p=reject', () => {
    const records = ['v=DMARC1; p=reject; rua=mailto:x@y', 'v=DMARC1; p=quarantine'];
    const findings = mailFindings(
      real({ dmarc: { present: true, record: records[0], records, policy: 'reject', rua: 'mailto:x@y' } }),
      'example.de'
    );
    expectSameRating(findings, mailFindings(real({ dmarc: dmarc(undefined) }), 'example.de'));
    const finding = findings.find((f) => f.id === 'no-dmarc');
    expect(finding?.title).toBe('DMARC wirkt nicht: 2 DMARC-Records statt einem');
    expect(finding?.description).toContain('mehr als einem DMARC-Record');
    expect(finding?.fix?.explanation).toContain('nur einen DMARC-Record');
    expect(finding?.fix?.snippet).toBeUndefined();
  });

  describe('bei einer Domain ohne Mail (Null-MX)', () => {
    it('wertet rua= ohne p= wie p=none — ohne doppelten Abzug', () => {
      const findings = mailFindings(
        mail({ dmarc: record('v=DMARC1; rua=mailto:dmarc@example.net') }),
        'example.com'
      );
      expectSameRating(findings, mailFindings(mail({ dmarc: dmarc('none') }), 'example.com'));
      expect(calculateScore(findings).score).toBe(92);

      // Ohne echte Mails: gleich p=reject vorschlagen.
      expect(findings.find((f) => f.id === 'dmarc-policy-none')?.fix?.snippet).toBe(
        '_dmarc.example.com  TXT  "v=DMARC1; p=reject; rua=mailto:dmarc@example.net"'
      );
      const hint = findings.find((f) => f.id === 'null-mx-incomplete');
      expect(hint?.description).toContain('DMARC mit p=reject (jetzt: p= fehlt)');
    });

    it('zählt p=reject neben ungültigem sp= nicht als Schutz und schlägt p=reject ohne sp= vor', () => {
      const findings = mailFindings(
        mail({ dmarc: { ...record('v=DMARC1; p=quarantine; sp=foo; rua=mailto:d@example.net'), policy: 'quarantine' } }),
        'example.com'
      );
      expectSameRating(findings, mailFindings(mail({ dmarc: dmarc('none') }), 'example.com'));
      expect(findings.find((f) => f.id === 'dmarc-policy-none')?.fix?.snippet).toBe(
        '_dmarc.example.com  TXT  "v=DMARC1; p=reject; rua=mailto:d@example.net"'
      );
      expect(findings.find((f) => f.id === 'null-mx-incomplete')?.description).toContain(
        'DMARC mit p=reject (jetzt: sp=foo ist ungültig)'
      );
    });

    it('zählt mehrere Records mit p=reject nicht als Schutz', () => {
      const records = ['v=DMARC1; p=reject', 'v=DMARC1; p=reject'];
      const findings = mailFindings(
        mail({ dmarc: { present: true, record: records[0], records, policy: 'reject' } }),
        'example.com'
      );
      expectSameRating(findings, mailFindings(mail({ dmarc: dmarc(undefined) }), 'example.com'));
      expect(findings.find((f) => f.id === 'null-mx-incomplete')?.description).toContain(
        'DMARC mit p=reject (jetzt: 2 DMARC-Records statt einem)'
      );
    });

    /** Vorher: „sauber als mail-frei markiert“, weil der Record als gesetzt galt. */
    it('zählt v=DMARC1; sp=reject nicht als Schutz', () => {
      const findings = mailFindings(mail({ dmarc: record('v=DMARC1; sp=reject') }), 'example.com');
      expectSameRating(findings, mailFindings(mail({ dmarc: dmarc(undefined) }), 'example.com'));
      expect(findings.find((f) => f.id === 'null-mx')?.title).not.toContain('sauber');
      expect(findings.find((f) => f.id === 'no-dmarc')?.fix?.snippet).toBe(
        '_dmarc.example.com  TXT  "v=DMARC1; p=reject"'
      );
    });
  });

  describe('bei BIMI', () => {
    const missing = { bimi: { present: false }, tlsRpt: { present: false } };

    it('empfiehlt BIMI nicht, solange DMARC nur wie p=none wirkt', () => {
      const findings = mailFindings(
        real({ ...missing, dmarc: record('v=DMARC1; sp=reject; rua=mailto:x@y') }),
        'example.de'
      );
      expect(findings.find((f) => f.id === 'bimi-needs-dmarc')?.description).toContain(
        'Jetzt: DMARC wirkt wie p=none (p= fehlt)'
      );
      expect(summary(findings)).not.toContain('info no-bimi');
    });

    it('nennt einen BIMI-Record, der an einem ignorierten DMARC-Record scheitert', () => {
      const findings = mailFindings(
        real({
          ...missing,
          dmarc: record('v=DMARC1; p=foo'),
          bimi: { present: true, logoUrl: 'https://example.de/l.svg' },
        }),
        'example.de'
      );
      expect(findings.find((f) => f.id === 'bimi-dmarc-weak')?.description).toContain(
        'Jetzt: DMARC wirkt nicht (p=foo ist ungültig)'
      );
      expect(summary(findings)).not.toContain('success bimi-present');
    });
  });
});
