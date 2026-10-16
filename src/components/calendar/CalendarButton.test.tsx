import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarButton } from './CalendarButton';

/*
 * Der Erzeuger wird erst beim Klick nachgeladen. Scheitert das — etwa weil ein
 * Tab von vor dem letzten Deploy einen Chunk anfragt, den es nicht mehr gibt —,
 * lehnt der dynamische Import ab. Genau das stellt die werfende Fabrik nach.
 */
vi.mock('@/lib/calendar', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

describe('CalendarButton', () => {
  it('meldet, wenn sich die Kalender-Datei nicht laden lässt', async () => {
    render(
      <CalendarButton
        reminder={{
          kind: 'certificate',
          subject: 'www.example.com',
          expiresAt: '2026-12-01T12:00:00.000Z',
          reportDomain: 'www.example.com',
        }}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /in den kalender/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/seite neu/i);
  });
});
