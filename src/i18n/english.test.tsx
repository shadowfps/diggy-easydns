import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setLanguage } from '@/i18n';

/**
 * Die App auf Englisch (#86): Startseite, Rechtsseiten mit Hinweis und
 * Dokumenttitel. Die Sub-Checks sind gemockt wie in App.routing.test.tsx.
 */

vi.mock('@/lib/api', () => ({
  lookupRecords: vi.fn(),
  lookupPropagation: vi.fn(),
  lookupDnssec: vi.fn(),
  lookupSsl: vi.fn(),
  lookupMail: vi.fn(),
  lookupWhois: vi.fn(),
  lookupTechStack: vi.fn(),
  lookupPageSpeed: vi.fn(),
  lookupVirusScan: vi.fn(),
  lookupIpDetails: vi.fn(),
  checkDomainAvailability: vi.fn(),
  fetchContactChallenge: vi.fn(() => new Promise(() => {})),
  sendContactMessage: vi.fn(),
  ApiError: class extends Error {},
}));

const App = (await import('@/App')).default;

function setPath(path: string) {
  window.history.replaceState(null, '', path);
}

beforeEach(async () => {
  setPath('/');
  window.localStorage.clear();
  await setLanguage('en', { persist: false });
});

describe('App auf Englisch', () => {
  it('zeigt die Startseite übersetzt', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'What’s behind your domain?' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Look up a domain or IP')).toBeInTheDocument();
    expect(screen.getByText('What diggy checks')).toBeInTheDocument();
    expect(screen.getByText('Email protection')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Legal notice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Privacy policy' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('lässt das Impressum deutsch und sagt das oben', () => {
    setPath('/impressum');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Legal notice' })).toBeInTheDocument();
    expect(
      screen.getByText('This page is only available in German for legal reasons.')
    ).toBeInTheDocument();
    const legal = screen.getByText('Angaben gemäß § 5 DDG').closest('section');
    expect(legal).toHaveAttribute('lang', 'de');
    // Das Kontaktformular gehört nicht zum Rechtstext und ist übersetzt.
    expect(screen.getByRole('heading', { name: 'Contact form' })).toBeInTheDocument();
    expect(document.title).toBe('Legal notice — diggy');
  });

  it('lädt den Datenschutztext deutsch nach', async () => {
    setPath('/datenschutz');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeInTheDocument();
    expect(
      screen.getByText('This page is only available in German for legal reasons.')
    ).toBeInTheDocument();
    const section = await screen.findByRole('heading', { name: 'Verantwortlicher' });
    expect(section.closest('[lang]')).toHaveAttribute('lang', 'de');
  });

  it('zeigt den Hinweis auf Deutsch nicht', async () => {
    await setLanguage('de', { persist: false });
    setPath('/impressum');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeInTheDocument();
    expect(screen.queryByText(/only available in German/)).toBeNull();
  });
});
