import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Der Verfügbarkeits-Check als Flow-Formular: Pflichtfeld, Anfrage mit der
 * getrimmten Eingabe, Ergebnis als Tabelle mit Status in Wort und Icon.
 */

vi.mock('@/lib/api', () => ({ checkDomainAvailability: vi.fn() }));

const api = await import('@/lib/api');
const { AvailabilityView } = await import('./AvailabilityView');

beforeEach(() => {
  vi.clearAllMocks();
});

const field = () => screen.getByLabelText('Domain');

describe('AvailabilityView', () => {
  it('prüft die getrimmte Eingabe und zeigt die Vorschläge mit Status', async () => {
    vi.mocked(api.checkDomainAvailability).mockResolvedValue({
      label: 'meinprojekt',
      results: [
        { domain: 'meinprojekt.de', status: 'available' },
        { domain: 'meinprojekt.com', status: 'taken' },
        { domain: 'meinprojekt.io', status: 'unknown' },
      ],
    } as never);
    render(<AvailabilityView />);

    await userEvent.type(field(), '  meinprojekt ');
    await userEvent.click(screen.getByRole('button', { name: 'Prüfen' }));

    expect(api.checkDomainAvailability).toHaveBeenCalledWith('meinprojekt');
    const table = await screen.findByRole('grid', { name: '3 Vorschläge für meinprojekt' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('meinprojekt.de')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Verfügbar')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Vergeben')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Unklar')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: 'Domain kopieren' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Mittwald/ })).toHaveAttribute('target', '_blank');
  });

  it('fragt ohne Eingabe nicht an und sagt, was fehlt', async () => {
    render(<AvailabilityView />);

    await userEvent.type(field(), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Prüfen' }));

    expect(await screen.findByText('Bitte gib einen Namen oder eine Domain ein.')).toBeInTheDocument();
    expect(api.checkDomainAvailability).not.toHaveBeenCalled();
  });

  it('meldet einen Fehler der Anfrage', async () => {
    vi.mocked(api.checkDomainAvailability).mockRejectedValue(new Error('Dienst nicht erreichbar'));
    render(<AvailabilityView />);

    await userEvent.type(field(), 'meinprojekt');
    await userEvent.click(screen.getByRole('button', { name: 'Prüfen' }));

    expect(await screen.findByText('Dienst nicht erreichbar')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
  });
});
