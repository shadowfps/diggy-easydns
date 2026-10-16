import { describe, expect, it } from 'vitest';
import type { DnsRecord, MailSecurity, SslInfo } from '@/types/dns';
import {
  CERT_ROWS,
  MAIL_ROWS,
  certFacts,
  compareFacts,
  compareScores,
  diffRecords,
  dnssecFacts,
  mailFacts,
  nameserverFact,
  nameserverProvider,
  recordValueKey,
  scoreTone,
  sectionCells,
  summarize,
  type Fact,
  type SideCells,
} from './compareDomains';

const rec = (type: DnsRecord['type'], value: string, extra: Partial<DnsRecord> = {}): DnsRecord => ({
  type,
  name: 'example.com',
  value,
  ttl: 300,
  ...extra,
});

const row = (rows: ReturnType<typeof diffRecords>, type: string) => rows.find((r) => r.type === type)!;

describe('diffRecords', () => {
  it('erkennt gleiche Werte unabhängig von Reihenfolge, Schreibweise und Schlusspunkt', () => {
    const rows = diffRecords(
      [rec('NS', 'NS1.example.net.'), rec('NS', 'ns2.example.net')],
      [rec('NS', 'ns2.example.net'), rec('NS', 'ns1.example.net')]
    );
    expect(row(rows, 'NS').status).toBe('same');
    expect(row(rows, 'NS').left!.every((v) => v.match === 'both')).toBe(true);
  });

  it('markiert, was nur links oder nur rechts steht — gemeinsame Werte zuerst', () => {
    const rows = diffRecords(
      [rec('A', '1.1.1.1'), rec('A', '2.2.2.2')],
      [rec('A', '2.2.2.2'), rec('A', '3.3.3.3')]
    );
    const a = row(rows, 'A');
    expect(a.status).toBe('different');
    expect(a.left).toEqual([
      { value: '2.2.2.2', match: 'both' },
      { value: '1.1.1.1', match: 'only' },
    ]);
    expect(a.right).toEqual([
      { value: '2.2.2.2', match: 'both' },
      { value: '3.3.3.3', match: 'only' },
    ]);
  });

  it('wertet eine Teilmenge als Unterschied', () => {
    const rows = diffRecords([rec('A', '1.1.1.1')], [rec('A', '1.1.1.1'), rec('A', '2.2.2.2')]);
    expect(row(rows, 'A').status).toBe('different');
  });

  it('vergleicht MX mit Priorität', () => {
    const rows = diffRecords(
      [rec('MX', 'mx.example.net', { priority: 10 })],
      [rec('MX', 'mx.example.net', { priority: 20 })]
    );
    expect(row(rows, 'MX').status).toBe('different');
    expect(row(rows, 'MX').left).toEqual([{ value: '10 mx.example.net', match: 'only' }]);
  });

  it('schreibt einen Null-MX als Punkt aus', () => {
    expect(recordValueKey(rec('MX', '', { priority: 0 }))).toBe('0 .');
  });

  it('nimmt TXT-Inhalte wörtlich', () => {
    expect(recordValueKey(rec('TXT', 'Token=ABC'))).toBe('Token=ABC');
    const rows = diffRecords([rec('TXT', 'token=abc')], [rec('TXT', 'token=ABC')]);
    expect(row(rows, 'TXT').status).toBe('different');
  });

  it('zeigt die Standardtypen immer, CNAME nur wenn eine Seite einen hat', () => {
    const empty = diffRecords([], []);
    expect(empty.map((r) => r.type)).toEqual(['A', 'AAAA', 'MX', 'NS', 'TXT', 'CAA']);
    expect(empty.every((r) => r.status === 'same')).toBe(true);

    const withAlias = diffRecords([], [rec('CNAME', 'example.com.')]);
    expect(row(withAlias, 'CNAME').status).toBe('different');
    expect(row(withAlias, 'CNAME').right).toEqual([{ value: 'example.com', match: 'only' }]);
  });

  it('zeigt eine fertige Seite schon, markiert aber erst, wenn die andere da ist', () => {
    const rows = diffRecords([rec('A', '1.1.1.1')], null);
    expect(row(rows, 'A')).toEqual({
      type: 'A',
      left: [{ value: '1.1.1.1', match: 'unknown' }],
      right: null,
      status: 'pending',
    });
  });
});

const MAIL: MailSecurity = {
  spf: { present: true, valid: true, issues: [], record: 'v=spf1 include:_spf.example.net ~all' },
  dmarc: { present: true, policy: 'reject', record: 'v=DMARC1; p=reject' },
  dkim: { selectors: [{ selector: 'google', present: true }] },
  mtaSts: { present: false },
  hasMx: true,
};

describe('mailFacts', () => {
  it('beschreibt SPF, DMARC-Policy, DKIM und MTA-STS', () => {
    const facts = mailFacts(MAIL);
    expect(facts.spf).toMatchObject({ value: 'gültig', tone: 'success' });
    expect(facts.dmarc).toMatchObject({ value: 'reject', tone: 'success' });
    expect(facts.dkim).toMatchObject({ value: 'google', tone: 'success' });
    expect(facts.mtaSts).toMatchObject({ value: 'nicht eingerichtet', tone: 'neutral' });
  });

  it('bewertet Fehlendes mit MX als Warnung, ohne MX neutral', () => {
    const missing = { ...MAIL, spf: { present: false, valid: false, issues: [] }, dmarc: { present: false } };
    expect(mailFacts(missing).spf.tone).toBe('warning');
    expect(mailFacts({ ...missing, hasMx: false }).dmarc.tone).toBe('neutral');
  });

  it('zählt einen anderen SPF-Record als Unterschied, auch wenn beide gültig sind', () => {
    const other = mailFacts({ ...MAIL, spf: { ...MAIL.spf, record: 'v=spf1 include:spf.other.de ~all' } });
    const rows = compareFacts(
      MAIL_ROWS,
      cells(mailFacts(MAIL)),
      cells(other)
    );
    expect(rows.find((r) => r.id === 'spf')!.status).toBe('different');
    expect(rows.find((r) => r.id === 'dmarc')!.status).toBe('same');
  });
});

const SSL: SslInfo = {
  valid: true,
  issuer: "Let's Encrypt",
  subject: 'example.com',
  validFrom: '2026-09-01T00:00:00Z',
  validTo: '2026-12-01T00:00:00Z',
  daysUntilExpiry: 45,
  sans: [],
  tlsVersion: 'TLSv1.3',
  signatureAlgorithm: 'sha256',
  isWildcard: false,
};

describe('certFacts', () => {
  it('stuft die Restlaufzeit ein', () => {
    expect(certFacts(SSL).expiry).toMatchObject({ value: 'noch 45 Tage', key: 'ok', tone: 'success' });
    expect(certFacts({ ...SSL, daysUntilExpiry: 1 }).expiry).toMatchObject({ value: 'noch 1 Tag', key: 'soon' });
    expect(certFacts({ ...SSL, daysUntilExpiry: -3 }).expiry).toMatchObject({
      value: 'seit 3 Tagen abgelaufen',
      tone: 'danger',
    });
  });

  it('wertet verschieden lange, aber unkritische Laufzeiten als gleichwertig', () => {
    const rows = compareFacts(
      CERT_ROWS,
      cells(certFacts(SSL)),
      cells(certFacts({ ...SSL, daysUntilExpiry: 80 }))
    );
    expect(rows.map((r) => r.status)).toEqual(['same', 'equivalent', 'same']);
  });

  it('unterscheidet fehlendes TLS und DNS-Einträge ohne Host', () => {
    expect(certFacts(null).status).toMatchObject({ value: 'kein TLS erreichbar', tone: 'warning' });
    expect(certFacts(undefined, false).status).toMatchObject({ value: 'nicht anwendbar' });
  });
});

describe('dnssecFacts', () => {
  it('folgt den Stufen der Security-Ansicht', () => {
    expect(dnssecFacts({ enabled: true, valid: true, chainOfTrust: 'valid', algorithm: 'ECDSAP256SHA256' }))
      .toMatchObject({ dnssec: { key: 'valid' }, algorithm: { value: 'ECDSAP256SHA256' } });
    expect(dnssecFacts({ enabled: true, valid: false, chainOfTrust: 'incomplete' }).dnssec.tone).toBe('danger');
    expect(dnssecFacts({ enabled: false, valid: false, chainOfTrust: 'none' })).toMatchObject({
      dnssec: { value: 'nicht aktiviert' },
      algorithm: { value: '—' },
    });
  });
});

describe('Nameserver-Anbieter', () => {
  it('nimmt die registrierbare Domain des Nameservers', () => {
    expect(nameserverProvider('ns1.example.net.')).toBe('example.net');
    expect(nameserverProvider('dns1.p01.nsone.net')).toBe('nsone.net');
    expect(nameserverProvider('ns1.hoster.co.uk')).toBe('hoster.co.uk');
    expect(nameserverProvider('ns1.abc.de')).toBe('abc.de');
  });

  it('fasst Route 53 zusammen', () => {
    const aws = ['ns-1.awsdns-12.com', 'ns-2.awsdns-40.net', 'ns-3.awsdns-07.org', 'ns-4.awsdns-55.co.uk'];
    expect(nameserverFact(aws.map((v) => rec('NS', v)))).toMatchObject({ value: 'Amazon Route 53' });
  });

  it('meldet einen Alias ohne eigene Nameserver', () => {
    expect(nameserverFact([rec('CNAME', 'example.com')])).toMatchObject({ value: 'keine eigenen' });
  });
});

describe('compareFacts und sectionCells', () => {
  it('wartet auf die ladende Seite und urteilt nicht über eine gescheiterte', () => {
    const done = cells(mailFacts(MAIL));
    const loading = sectionCells(MAIL_ROWS, { status: 'loading', data: undefined }, mailFacts);
    const failed = sectionCells(MAIL_ROWS, { status: 'error', data: undefined, error: 'Timeout' }, mailFacts);

    expect(compareFacts(MAIL_ROWS, done, loading).every((r) => r.status === 'pending')).toBe(true);
    const rows = compareFacts(MAIL_ROWS, failed, done);
    expect(rows.every((r) => r.status === 'unknown')).toBe(true);
    expect(rows[0].left).toEqual({ state: 'error', message: 'Timeout' });
  });

  it('behandelt eine übersprungene Sektion als erledigt', () => {
    const skipped = sectionCells(CERT_ROWS, { status: 'skipped', data: undefined }, (d) => certFacts(d, false));
    expect(skipped.status).toEqual({ state: 'done', fact: expect.objectContaining({ value: 'nicht anwendbar' }) });
  });
});

describe('Score und Zusammenfassung', () => {
  it('nennt Abstand und Vorsprung', () => {
    expect(compareScores(80, 68)).toEqual({ delta: 12, leader: 'left' });
    expect(compareScores(50, 70)).toEqual({ delta: 20, leader: 'right' });
    expect(compareScores(70, 70)).toEqual({ delta: 0, leader: null });
  });

  it('nutzt die Schwellen der Score-Karte', () => {
    expect([scoreTone(65), scoreTone(64), scoreTone(40), scoreTone(39)]).toEqual([
      'success',
      'warning',
      'warning',
      'danger',
    ]);
  });

  it('zählt nur echte Unterschiede', () => {
    expect(summarize(['same', 'equivalent', 'different', 'different', 'unknown'])).toEqual({
      compared: 4,
      differences: 2,
      pending: false,
    });
    expect(summarize(['same', 'pending']).pending).toBe(true);
  });
});

function cells(facts: Record<string, Fact>): SideCells {
  return Object.fromEntries(Object.entries(facts).map(([id, fact]) => [id, { state: 'done', fact }]));
}
