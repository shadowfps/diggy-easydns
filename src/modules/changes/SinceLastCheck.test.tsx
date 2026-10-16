import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LookupReport } from '@/types/dns';
import { createHistoryEntry, type LookupHistoryEntry } from '@/lib/lookupHistory';
import { SinceLastCheck } from './SinceLastCheck';

/**
 * Tests für die Karte „Seit dem letzten Check“ (#79): die drei Zustände
 * (vergleicht noch, keine Änderungen, Liste) und dass hinzugefügt und
 * entfallen in Worten erkennbar sind, nicht nur an der Farbe.
 */

const report: LookupReport = {
  domain: 'example.com',
  timestamp: '2026-10-16T10:00:00.000Z',
  records: [
    { type: 'A', name: 'example.com', value: '203.0.113.5', ttl: 300 },
    { type: 'NS', name: 'example.com', value: 'ns1.example.net', ttl: 300 },
  ],
  propagation: [],
  dnssec: { enabled: true, valid: true, chainOfTrust: 'valid' },
  mail: {
    spf: { present: false, valid: false, issues: [] },
    dmarc: { present: false },
    dkim: { selectors: [] },
    mtaSts: { present: false },
    hasMx: false,
    nullMx: false,
  },
  findings: [],
  healthScore: { score: 82, verdict: 'Solide', counts: { success: 1, info: 0, warning: 0, critical: 0 } },
  techStack: [],
};

function threeDaysAgo(): string {
  return new Date(Date.now() - 3 * 86_400_000 - 60_000).toISOString();
}

/** Der Stand vor drei Tagen: andere A-Adresse, DNSSEC aus, Score 70. */
function previousCheck(overrides: Partial<LookupHistoryEntry> = {}): LookupHistoryEntry {
  return {
    ...createHistoryEntry(report, [], threeDaysAgo()),
    score: 70,
    dnssecValid: false,
    records: { A: ['198.51.100.7'], NS: ['ns1.example.net'] },
    ...overrides,
  };
}

function renderCard(previous: LookupHistoryEntry, settled = true) {
  return render(<SinceLastCheck previous={previous} report={report} failed={[]} settled={settled} />);
}

describe('SinceLastCheck', () => {
  it('nennt im Kopf, wann zuletzt geprüft wurde', () => {
    renderCard(previousCheck());
    expect(screen.getByText(/Seit dem letzten Check/)).toHaveTextContent(
      'Seit dem letzten Check (vor 3 Tagen)'
    );
  });

  // Vorher stünden für noch ladende Sektionen Defaults im Report — der
  // Vergleich meldete Änderungen, die keine sind.
  it('vergleicht erst, wenn alle Sektionen fertig sind', () => {
    renderCard(previousCheck(), false);

    expect(screen.getByText(/Wird verglichen/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/Änderung/)).not.toBeInTheDocument();
  });

  it('sagt ohne Änderungen „Keine Änderungen seit …“', () => {
    renderCard(createHistoryEntry(report, [], threeDaysAgo()));

    expect(screen.getByText(/^Keine Änderungen seit /)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('zeigt die Zahl und klappt die Liste auf', async () => {
    renderCard(previousCheck());

    const toggle = screen.getByRole('button', { name: /4 Änderungen seit/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'gestiegenHealth Score 70 → 82',
      'aktiviertDNSSEC ist jetzt aktiv',
      'neuA-Record203.0.113.5',
      'entfallenA-Record198.51.100.7',
    ]);
  });

  it('klappt die Liste wieder zu', async () => {
    renderCard(previousCheck());
    const toggle = screen.getByRole('button', { name: /Änderungen seit/ });

    await userEvent.click(toggle);
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  // Vergleichbar gemacht bleibt vom Null-MX (`MX 0 .`) nur „0“ — so wäre
  // der Wechsel auf „keine Mails“ in der Liste nicht zu erkennen.
  it('zeigt einen neuen Null-MX lesbar an', async () => {
    const nullMxReport: LookupReport = {
      ...report,
      records: [...report.records, { type: 'MX', name: 'example.com', value: '', priority: 0, ttl: 300 }],
      mail: { ...report.mail, hasMx: true, nullMx: true },
    };
    render(
      <SinceLastCheck
        previous={{
          ...createHistoryEntry(nullMxReport, [], threeDaysAgo()),
          records: { A: ['203.0.113.5'], NS: ['ns1.example.net'], MX: ['10 mx.example.com'] },
        }}
        report={nullMxReport}
        failed={[]}
        settled
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /2 Änderungen seit/ }));

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'neuMX-Record0 . (Null-MX)',
      'entfallenMX-Record10 mx.example.com',
    ]);
  });

  it('schreibt „1 Änderung“ in der Einzahl', () => {
    renderCard(createHistoryEntry({ ...report, healthScore: { ...report.healthScore, score: 90 } }, [], threeDaysAgo()));
    expect(screen.getByRole('button', { name: /1 Änderung seit/ })).toBeInTheDocument();
  });
});
