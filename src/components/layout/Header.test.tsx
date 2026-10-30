import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from './Header';

const openSettings = (name = 'Einstellungen') =>
  userEvent.click(screen.getByRole('button', { name }));

/**
 * Sprachumschalter im Einstellungsmenü (#86): Wechsel ändert die Texte,
 * `<html lang>` und wird gespeichert.
 */
describe('Sprachumschalter', () => {
  it('schaltet auf Englisch und zurück', async () => {
    render(<Header />);
    await openSettings();

    expect(screen.getByRole('menuitemradio', { name: 'Deutsch' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Sprache')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('menuitemradio', { name: 'English' }));

    expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Availability check/ })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('diggy-language')).toBe('en');

    await openSettings('Settings');
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Deutsch' }));

    expect(await screen.findByRole('button', { name: 'Menü öffnen' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('de');
    expect(window.localStorage.getItem('diggy-language')).toBe('de');
  });

  it('kennzeichnet die Sprachnamen für Screenreader', async () => {
    render(<Header />);
    await openSettings();
    expect(screen.getByText('English')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Deutsch')).toHaveAttribute('lang', 'de');
    // Die Überschrift benennt die Gruppe — sonst fehlt der Zusammenhang.
    const languages = screen.getByRole('group', { name: 'Sprache' });
    expect(within(languages).getByRole('menuitemradio', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
  });
});

/**
 * Theme-Umschalter im Einstellungsmenü (#125): gespeichert wird erst die
 * Wahl, nicht schon das Theme, das beim Laden aus der Systemeinstellung kommt.
 */
describe('Theme-Umschalter', () => {
  afterEach(() => {
    window.localStorage.removeItem('diggy-theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('speichert das Theme erst, wenn es im Menü gewählt wird', async () => {
    render(<Header />);
    expect(window.localStorage.getItem('diggy-theme')).toBeNull();

    await openSettings();
    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
    expect(window.localStorage.getItem('diggy-theme')).toBeNull();

    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem('diggy-theme')).toBe('dark');
    await openSettings();
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  });
});

/**
 * Navigation nach dem Flow-Template „Simple App“: Links in der Kopfzeile,
 * auf schmalen Screens dieselben Links hinter dem Burger.
 */
describe('Navigation', () => {
  it('verlinkt die Bereiche und markiert den aktuellen', () => {
    render(<Header view="history" />);
    const nav = screen.getByRole('navigation', { name: 'Hauptnavigation' });
    expect(within(nav).getByRole('link', { name: /^History/ })).toHaveAttribute('href', '/history');
    expect(within(nav).getByRole('link', { name: /^History/ })).toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: /^Vergleichen/ })).toHaveAttribute('href', '/compare');
    expect(within(nav).getByRole('link', { name: /^Available Check/ })).toHaveAttribute('href', '/availability');
    expect(within(nav).getByRole('link', { name: /^About/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Zur Startseite' })).toHaveAttribute('href', '/');
  });

  it('öffnet die Links hinter dem Burger und schließt beim Navigieren', async () => {
    render(<Header />);
    await userEvent.click(screen.getByRole('button', { name: 'Menü öffnen' }));
    const dialog = await screen.findByRole('dialog');
    const link = within(dialog).getByRole('link', { name: /^About/ });
    expect(link).toHaveAttribute('href', '/about');
    await userEvent.click(link);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
