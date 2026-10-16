import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from './Header';

/**
 * Sprachumschalter im Menü (#86): Wechsel ändert die Texte, `<html lang>` und
 * wird gespeichert.
 */
describe('Sprachumschalter', () => {
  it('schaltet auf Englisch und zurück', async () => {
    render(<Header />);
    await userEvent.click(screen.getByRole('button', { name: 'Menü öffnen' }));

    const english = screen.getByRole('button', { name: 'English' });
    expect(screen.getByRole('button', { name: 'Deutsch' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Sprache')).toBeInTheDocument();

    await userEvent.click(english);

    expect(await screen.findByRole('button', { name: 'Close menu' })).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Availability check' })).toBeInTheDocument();
    expect(english).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('diggy-language')).toBe('en');

    await userEvent.click(screen.getByRole('button', { name: 'Deutsch' }));

    expect(await screen.findByRole('button', { name: 'Menü schließen' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('de');
    expect(window.localStorage.getItem('diggy-language')).toBe('de');
  });

  it('kennzeichnet die Sprachnamen für Screenreader', async () => {
    render(<Header />);
    await userEvent.click(screen.getByRole('button', { name: 'Menü öffnen' }));
    expect(screen.getByText('English')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Deutsch')).toHaveAttribute('lang', 'de');
    // Die Überschrift benennt die Gruppe — sonst fehlt der Zusammenhang.
    expect(screen.getByRole('group', { name: 'Sprache' })).toContainElement(
      screen.getByRole('button', { name: 'English' })
    );
    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
  });
});
