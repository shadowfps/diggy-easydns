import { describe, expect, it } from 'vitest';
import type { LookupHistoryEntry } from './lookupHistory';
import { changeTone, diffChecks, type CheckChange } from './checkChanges';

/**
 * Tests für den Vergleich zweier Checks (#79).
 *
 * Der Grundsatz der Funktion — lieber eine Änderung verschweigen als eine
 * erfinden — hat hier eigene Fälle: fehlgeschlagene Sektionen, alte Einträge
 * ohne die neuen Felder und gekürzte Listen dürfen nie „entfallen“ melden.
 */

const CHECKED_AT = '2026-10-13T09:00:00.000Z';

/** Eintrag im Format ab #79. */
function entry(overrides: Partial<LookupHistoryEntry> = {}): LookupHistoryEntry {
  return {
    domain: 'example.com',
    lookedUpAt: CHECKED_AT,
    score: 80,
    verdict: 'Solide',
    recordCount: 4,
    ips: ['198.51.100.7', '2001:db8::1'],
    mx: ['10 mx1.example.com'],
    nameservers: ['ns1.example.net', 'ns2.example.net'],
    sslValid: true,
    sslDaysUntilExpiry: 40,
    dnssecValid: false,
    dmarcPresent: true,
    findingsCount: 3,
    records: {
      A: ['198.51.100.7'],
      AAAA: ['2001:db8::1'],
      MX: ['10 mx1.example.com'],
      NS: ['ns1.example.net', 'ns2.example.net'],
    },
    sslValidTo: '2026-11-22T12:00:00.000Z',
    dmarcPolicy: 'none',
    ...overrides,
  };
}

/** Eintrag, wie ihn diggy vor #79 gespeichert hat: ohne records, sslValidTo, dmarcPolicy, failedChecks. */
function legacy(overrides: Partial<LookupHistoryEntry> = {}): LookupHistoryEntry {
  const { records: _r, sslValidTo: _s, dmarcPolicy: _d, failedChecks: _f, ...base } = entry();
  return { ...base, ...overrides };
}

const kinds = (changes: CheckChange[]) => changes.map((change) => change.kind);

describe('diffChecks', () => {
  it('meldet nichts, wenn sich nichts geändert hat', () => {
    expect(diffChecks(entry(), entry({ lookedUpAt: '2026-10-16T09:00:00.000Z' }))).toEqual([]);
  });

  describe('Records', () => {
    it.each([
      ['A', ['198.51.100.7', '203.0.113.5']],
      ['AAAA', ['2001:db8::1', '2001:db8::2']],
      ['MX', ['10 mx1.example.com', '20 mx2.example.com']],
      ['NS', ['ns1.example.net', 'ns2.example.net', 'ns3.example.net']],
    ] as const)('meldet einen neuen %s-Record', (type, values) => {
      const before = entry();
      const after = entry({ records: { ...before.records, [type]: [...values] } });

      expect(diffChecks(before, after)).toEqual([
        { kind: 'records', type, change: 'added', values: [values[values.length - 1]] },
      ]);
    });

    it.each(['A', 'AAAA', 'MX', 'NS'] as const)('meldet einen entfallenen %s-Record', (type) => {
      const before = entry();
      const records = { ...before.records };
      delete records[type];

      expect(diffChecks(before, entry({ records }))).toEqual([
        { kind: 'records', type, change: 'removed', values: before.records?.[type] },
      ]);
    });

    it('meldet einen getauschten Wert als neu und entfallen, sortiert', () => {
      const before = entry({ records: { A: ['198.51.100.7', '198.51.100.9'] } });
      const after = entry({ records: { A: ['203.0.113.9', '198.51.100.9', '203.0.113.10'] } });

      expect(diffChecks(before, after)).toEqual([
        { kind: 'records', type: 'A', change: 'added', values: ['203.0.113.9', '203.0.113.10'] },
        { kind: 'records', type: 'A', change: 'removed', values: ['198.51.100.7'] },
      ]);
    });

    it('ignoriert Schreibweise und Schlusspunkt', () => {
      const after = entry({
        records: { ...entry().records, NS: ['NS1.example.net.', 'ns2.EXAMPLE.net'] },
      });
      expect(diffChecks(entry(), after)).toEqual([]);
    });

    it('überspringt einen Typ, der die Speichergrenze erreicht — er könnte gekürzt sein', () => {
      const many = Array.from({ length: 20 }, (_, i) => `198.51.100.${i + 1}`);
      const before = entry({ records: { ...entry().records, A: many } });
      const after = entry({ records: { ...entry().records, A: ['198.51.100.1'] } });

      expect(diffChecks(before, after)).toEqual([]);
    });
  });

  describe('Zertifikat', () => {
    it('erkennt ein erneuertes Zertifikat am späteren Ablaufdatum', () => {
      const after = entry({ sslValidTo: '2027-01-20T12:00:00.000Z' });
      expect(diffChecks(entry(), after)).toEqual([
        { kind: 'ssl-renewed', validTo: '2027-01-20T12:00:00.000Z' },
      ]);
    });

    it('meldet ein getauschtes Zertifikat, das früher abläuft', () => {
      const after = entry({ sslValidTo: '2026-11-01T12:00:00.000Z' });
      expect(diffChecks(entry(), after)).toEqual([
        { kind: 'ssl-replaced', validTo: '2026-11-01T12:00:00.000Z' },
      ]);
    });

    it('meldet ein abgelaufenes oder ungültiges Zertifikat', () => {
      const after = entry({ sslValid: false, sslDaysUntilExpiry: -2 });
      expect(diffChecks(entry(), after)).toEqual([{ kind: 'ssl-invalid' }]);
    });

    it('meldet ein wieder gültiges Zertifikat mit Ablaufdatum', () => {
      const before = entry({ sslValid: false, sslDaysUntilExpiry: undefined, sslValidTo: undefined });
      expect(diffChecks(before, entry())).toEqual([
        { kind: 'ssl-valid', validTo: '2026-11-22T12:00:00.000Z' },
      ]);
    });

    it('vergleicht nicht, wenn der SSL-Check auf einer Seite fehlschlug', () => {
      const failed = entry({ sslValid: false, sslValidTo: undefined, failedChecks: ['ssl'] });
      expect(diffChecks(entry(), failed)).toEqual([]);
      expect(diffChecks(failed, entry())).toEqual([]);
    });
  });

  describe('DNSSEC und DMARC', () => {
    it('meldet DNSSEC an und aus', () => {
      expect(diffChecks(entry(), entry({ dnssecValid: true }))).toEqual([
        { kind: 'dnssec', enabled: true },
      ]);
      expect(diffChecks(entry({ dnssecValid: true }), entry())).toEqual([
        { kind: 'dnssec', enabled: false },
      ]);
    });

    it('meldet einen neuen und einen entfallenen DMARC-Record', () => {
      const without = entry({ dmarcPresent: false, dmarcPolicy: undefined });
      expect(diffChecks(without, entry({ dmarcPolicy: 'reject' }))).toEqual([
        { kind: 'dmarc', present: true, policy: 'reject' },
      ]);
      expect(diffChecks(entry(), without)).toEqual([{ kind: 'dmarc', present: false }]);
    });

    it('meldet eine geänderte DMARC-Policy', () => {
      expect(diffChecks(entry(), entry({ dmarcPolicy: 'quarantine' }))).toEqual([
        { kind: 'dmarc-policy', from: 'none', to: 'quarantine' },
      ]);
    });

    it('vergleicht nicht, wenn DNSSEC- oder Mail-Check fehlschlug', () => {
      const failed = entry({
        dnssecValid: true,
        dmarcPresent: false,
        dmarcPolicy: undefined,
        failedChecks: ['dnssec', 'mail'],
      });
      expect(kinds(diffChecks(entry(), failed))).toEqual([]);
    });
  });

  describe('Score', () => {
    it('meldet einen gestiegenen und einen gefallenen Score', () => {
      expect(diffChecks(entry(), entry({ score: 92 }))).toEqual([
        { kind: 'score', from: 80, to: 92 },
      ]);
      expect(diffChecks(entry(), entry({ score: 61 }))).toEqual([
        { kind: 'score', from: 80, to: 61 },
      ]);
    });

    // Fehlt eine Sektion, fehlen auch ihre Findings — der Score wäre eine
    // andere Rechnung, kein Fortschritt.
    it('vergleicht den Score nicht, wenn eine Sektion fehlschlug', () => {
      expect(diffChecks(entry(), entry({ score: 92, failedChecks: ['whois'] }))).toEqual([]);
    });

    it('ein fehlgeschlagener Tech-Stack ändert nichts am Score-Vergleich', () => {
      expect(kinds(diffChecks(entry(), entry({ score: 92, failedChecks: ['techStack'] })))).toEqual([
        'score',
      ]);
    });
  });

  it('ordnet: Score, Zertifikat, DNSSEC, DMARC, dann Records', () => {
    const after = entry({
      score: 90,
      sslValidTo: '2027-01-20T12:00:00.000Z',
      dnssecValid: true,
      dmarcPolicy: 'reject',
      records: { ...entry().records, A: ['203.0.113.5'] },
    });

    expect(kinds(diffChecks(entry(), after))).toEqual([
      'score',
      'ssl-renewed',
      'dnssec',
      'dmarc-policy',
      'records',
      'records',
    ]);
  });
});

describe('diffChecks mit Einträgen von vor #79', () => {
  it('liest A und AAAA aus der gemischten IP-Liste', () => {
    const after = entry({
      records: { ...entry().records, AAAA: ['2001:db8::1', '2001:db8::2'] },
    });
    expect(diffChecks(legacy(), after)).toEqual([
      { kind: 'records', type: 'AAAA', change: 'added', values: ['2001:db8::2'] },
    ]);
  });

  it('meldet nichts, wenn alter und neuer Stand gleich sind', () => {
    expect(diffChecks(legacy(), entry())).toEqual([]);
  });

  it('vergleicht gekürzte alte Listen nicht', () => {
    const ips = ['198.51.100.1', '198.51.100.2', '198.51.100.3', '198.51.100.4', '198.51.100.5', '2001:db8::1'];
    const mx = ['10 a.example.com', '20 b.example.com', '30 c.example.com', '40 d.example.com', '50 e.example.com'];
    const after = entry({ records: { ...entry().records, A: ['203.0.113.5'], MX: ['10 a.example.com'] } });

    expect(diffChecks(legacy({ ips, mx }), after)).toEqual([]);
  });

  it('schätzt das Ablaufdatum aus den Resttagen und erkennt eine Erneuerung', () => {
    // 13.10. + 40 Tage = 22.11. — innerhalb der Toleranz kein Wechsel …
    expect(diffChecks(legacy(), entry())).toEqual([]);
    // … ein Ablaufdatum Wochen später schon.
    expect(kinds(diffChecks(legacy(), entry({ sslValidTo: '2027-01-20T12:00:00.000Z' })))).toEqual([
      'ssl-renewed',
    ]);
  });

  it('vergleicht DMARC nur an/aus, weil die Policy fehlt', () => {
    expect(diffChecks(legacy(), entry({ dmarcPolicy: 'reject' }))).toEqual([]);
  });

  it('übersteht Einträge mit fehlenden oder kaputten Feldern', () => {
    const broken = {
      ...legacy(),
      sslValid: undefined,
      dnssecValid: 'ja',
      dmarcPresent: null,
      ips: [42, '198.51.100.7'],
    } as unknown as LookupHistoryEntry;

    expect(() => diffChecks(broken, entry())).not.toThrow();
    expect(kinds(diffChecks(broken, entry()))).toEqual(['records']);
  });
});

describe('changeTone', () => {
  it.each<[CheckChange, string]>([
    [{ kind: 'score', from: 70, to: 80 }, 'success'],
    [{ kind: 'score', from: 80, to: 70 }, 'warning'],
    [{ kind: 'ssl-renewed', validTo: CHECKED_AT }, 'success'],
    [{ kind: 'ssl-replaced', validTo: CHECKED_AT }, 'neutral'],
    [{ kind: 'ssl-invalid' }, 'danger'],
    [{ kind: 'ssl-valid' }, 'success'],
    [{ kind: 'dnssec', enabled: true }, 'success'],
    [{ kind: 'dnssec', enabled: false }, 'warning'],
    [{ kind: 'dmarc', present: true }, 'success'],
    [{ kind: 'dmarc', present: false }, 'warning'],
    [{ kind: 'dmarc-policy', from: 'none', to: 'reject' }, 'success'],
    [{ kind: 'dmarc-policy', from: 'reject', to: 'quarantine' }, 'warning'],
    [{ kind: 'records', type: 'A', change: 'added', values: ['203.0.113.5'] }, 'neutral'],
  ])('%j → %s', (change, tone) => {
    expect(changeTone(change)).toBe(tone);
  });
});
