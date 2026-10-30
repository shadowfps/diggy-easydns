import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LookupHistoryEntry } from '@/lib/lookupHistory';
import { HistoryView } from './HistoryView';

/**
 * Der Verlauf als Flow-List: je Lookup ein Eintrag mit Score, Kerndaten und
 * Aktionen. Löschen ist nicht rückgängig zu machen und braucht deshalb eine
 * Bestätigung.
 */

const entry = (domain: string, overrides: Partial<LookupHistoryEntry> = {}): LookupHistoryEntry => ({
  domain,
  lookedUpAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  score: 86,
  verdict: 'Hervorragend',
  recordCount: 4,
  ips: ['93.184.216.34'],
  mx: [],
  nameservers: ['a.iana-servers.net', 'b.iana-servers.net'],
  sslValid: true,
  sslDaysUntilExpiry: 40,
  dnssecValid: false,
  dmarcPresent: true,
  findingsCount: 2,
  ...overrides,
});

function setup(entries: LookupHistoryEntry[]) {
  const props = { onRun: vi.fn(), onClear: vi.fn() };
  render(<HistoryView entries={entries} {...props} />);
  return props;
}

describe('HistoryView', () => {
  it('zeigt je Lookup Domain, Score, Zeit und Kerndaten', async () => {
    setup([entry('example.com'), entry('github.com', { score: 30, sslValid: false })]);

    expect(screen.getByRole('heading', { level: 1, name: 'Letzte Suchanfragen' })).toBeInTheDocument();
    const rows = await screen.findAllByRole('row');
    expect(rows).toHaveLength(2);

    const first = rows[0];
    expect(within(first).getByText('example.com')).toBeInTheDocument();
    expect(within(first).getByText('86 · Solides Setup')).toBeInTheDocument();
    expect(within(first).getByText('vor 5 min')).toBeInTheDocument();
    expect(within(first).getByText('93.184.216.34')).toBeInTheDocument();
    expect(within(first).getByText('keine Daten')).toBeInTheDocument();
    expect(within(first).getByText('SSL 40 Tage')).toBeInTheDocument();
    expect(within(first).getByText('DNSSEC inaktiv')).toBeInTheDocument();
    expect(within(first).getByText('DMARC gesetzt')).toBeInTheDocument();

    expect(within(rows[1]).getByText(/30 · /)).toBeInTheDocument();
    expect(within(rows[1]).getByText('SSL fehlt')).toBeInTheDocument();
  });

  it('prüft eine Domain erneut und verlinkt ihre Nameserver (#147)', async () => {
    const { onRun } = setup([entry('example.com')]);

    await userEvent.click(await screen.findByRole('button', { name: 'Scan erneut' }));
    expect(onRun).toHaveBeenCalledWith('example.com');

    expect(screen.getByRole('link', { name: /^b\.iana-servers\.net/ })).toHaveAttribute(
      'href',
      '/lookup/b.iana-servers.net'
    );
  });

  it('löscht erst nach Bestätigung', async () => {
    const { onClear } = setup([entry('example.com')]);

    await userEvent.click(await screen.findByRole('button', { name: 'History löschen' }));
    const dialog = await screen.findByRole('dialog');
    expect(onClear).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onClear).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'History löschen' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'History löschen' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('folgt neuen Einträgen — nach dem Löschen steht der Leerzustand da', async () => {
    const props = { onRun: vi.fn(), onClear: vi.fn() };
    const { rerender } = render(<HistoryView entries={[entry('example.com')]} {...props} />);
    expect(await screen.findByText('example.com')).toBeInTheDocument();

    rerender(<HistoryView entries={[]} {...props} />);
    expect(await screen.findByText('Noch keine History')).toBeInTheDocument();
    expect(screen.queryByText('example.com')).toBeNull();
  });

  it('zeigt ohne Einträge einen Leerzustand und nichts zu löschen', async () => {
    setup([]);

    expect(await screen.findByText('Noch keine History')).toBeInTheDocument();
    // Die leere List zeigt nur den Leerzustand, ohne ihre Aktionen.
    expect(screen.queryByRole('button', { name: 'History löschen' })).toBeNull();
  });
});
