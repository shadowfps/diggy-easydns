import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Routing-Tests für App.tsx.
 *
 * Der Umbau in #10 (pushState ohne popstate-Listener) war die riskanteste
 * Änderung des Audits, und ein Review fand dort zwei Zustandsfehler:
 * `searchValue` wurde beim Wechsel auf eine statische Route nicht
 * zurückgesetzt, und ob eine Suche einen History-Eintrag anlegt, hing an
 * `records || ipQuery` statt am Pfad. Beides ließ sich nur durch Lesen finden.
 *
 * Die Sub-Checks sind gemockt: getestet wird die Navigation, nicht das
 * Zusammenspiel mit dem Backend.
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
  fetchContactChallenge: vi.fn(),
  sendContactMessage: vi.fn(),
}));

const api = await import('@/lib/api');
const App = (await import('./App')).default;

const EMPTY_SECTION = { findings: [] };

function stubApi(domain = 'example.com') {
  vi.mocked(api.lookupRecords).mockResolvedValue({
    domain,
    timestamp: '2026-09-09T10:00:00.000Z',
    records: [{ type: 'A', name: domain, value: '93.184.216.34', ttl: 300 }],
    findings: [],
  });
  vi.mocked(api.lookupPropagation).mockResolvedValue({ propagation: [], ...EMPTY_SECTION });
  vi.mocked(api.lookupDnssec).mockResolvedValue({
    dnssec: { enabled: false, valid: false, chainOfTrust: 'none' },
    ...EMPTY_SECTION,
  });
  vi.mocked(api.lookupSsl).mockResolvedValue({ ssl: null, ...EMPTY_SECTION });
  vi.mocked(api.lookupMail).mockResolvedValue({
    mail: {
      spf: { present: false, valid: false, issues: [] },
      dmarc: { present: false },
      dkim: { selectors: [] },
      mtaSts: { present: false },
      hasMx: false,
    },
    ...EMPTY_SECTION,
  });
  vi.mocked(api.lookupWhois).mockResolvedValue({ whois: null, ...EMPTY_SECTION });
  vi.mocked(api.lookupTechStack).mockResolvedValue({ techStack: [] });
  vi.mocked(api.fetchContactChallenge).mockResolvedValue({ token: 't', minDelayMs: 0 });
}

/** Setzt die URL, ohne die History-Länge zu verändern. */
function setPath(path: string) {
  window.history.replaceState(null, '', path);
}

const searchField = () => screen.getByPlaceholderText(/Anfrage starten/);
const openMenu = () => userEvent.click(screen.getByRole('button', { name: /Menü öffnen/ }));

beforeEach(() => {
  vi.clearAllMocks();
  stubApi();
  setPath('/');
  window.localStorage.clear();
});

afterEach(() => {
  setPath('/');
});

describe('Deep-Links beim ersten Laden', () => {
  it('zeigt die Startseite mit Hero', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(searchField()).toBeInTheDocument();
  });

  it('öffnet /impressum direkt', () => {
    setPath('/impressum');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Impressum' })).toBeInTheDocument();
  });

  it('öffnet /datenschutz direkt', () => {
    setPath('/datenschutz');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Datenschutz' })).toBeInTheDocument();
  });

  it('öffnet /history direkt', () => {
    setPath('/history');
    render(<App />);
    expect(screen.getByRole('heading', { name: /Letzte Suchanfragen/ })).toBeInTheDocument();
  });

  it('führt einen Permalink-Lookup aus', async () => {
    setPath('/lookup/example.com');
    render(<App />);
    await waitFor(() => expect(api.lookupRecords).toHaveBeenCalledWith('example.com'));
  });

  it('behandelt einen unbekannten Pfad wie die Startseite', () => {
    setPath('/gibt-es-nicht');
    render(<App />);
    expect(searchField()).toBeInTheDocument();
  });
});

describe('Navigation und Zurück-Button', () => {
  it('setzt den Pfad beim Wechsel auf eine statische Route', async () => {
    render(<App />);
    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: 'About' }));

    expect(window.location.pathname).toBe('/about');
    expect(screen.getByRole('heading', { name: /Warum diggy existiert/ })).toBeInTheDocument();
  });

  /**
   * Der Kern von #10: vorher änderte popstate nur die URL, die Ansicht blieb
   * stehen.
   */
  it('wendet popstate auf die Ansicht an, nicht nur auf die URL', async () => {
    render(<App />);
    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(screen.getByRole('heading', { name: /Warum diggy existiert/ })).toBeInTheDocument();

    setPath('/');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect(searchField()).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: /Warum diggy existiert/ })).toBeNull();
  });

  it('kommt per popstate auch auf /impressum zurück', async () => {
    render(<App />);
    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: 'History' }));

    setPath('/impressum');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Impressum' })).toBeInTheDocument()
    );
  });

  /**
   * Regression aus dem Review: das alte handleHome() setzte searchValue
   * zurück, beim Zusammenfassen der fünf Handler ging das verloren. Weil die
   * SearchBar bei view==='lookup' nicht neu gemountet wird, blieb die alte
   * Domain im Feld stehen.
   */
  it('leert das Suchfeld beim Wechsel auf eine statische Route', async () => {
    render(<App />);
    await userEvent.type(searchField(), 'example.com');
    expect(searchField()).toHaveValue('example.com');

    setPath('/');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect(searchField()).toHaveValue(''));
  });

  it('führt einen Lookup erneut aus, wenn man per popstate auf den Permalink zurückkommt', async () => {
    render(<App />);
    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: 'About' }));

    setPath('/lookup/example.com');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect(api.lookupRecords).toHaveBeenCalledWith('example.com'));
  });
});

describe('Suche und History-Einträge', () => {
  /**
   * Regression aus dem Review: die Bedingung hing an `records || ipQuery`.
   * Während ein Lookup lädt, ist `records` bereits null — eine Suche in
   * diesem Moment legte einen Eintrag an, nach dem Laden dagegen nicht.
   * Jetzt entscheidet der Pfad.
   */
  it('legt bei der ersten Suche von der Startseite einen History-Eintrag an', async () => {
    const push = vi.spyOn(window.history, 'pushState');
    render(<App />);

    await userEvent.type(searchField(), 'example.com{Enter}');

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(null, '', '/lookup/example.com')
    );
    push.mockRestore();
  });

  it('legt bei einer Suche INNERHALB der Lookup-Ansicht keinen zweiten Eintrag an', async () => {
    render(<App />);
    await userEvent.type(searchField(), 'example.com{Enter}');
    await waitFor(() => expect(window.location.pathname).toBe('/lookup/example.com'));

    const push = vi.spyOn(window.history, 'pushState');
    stubApi('other.com');
    await userEvent.clear(searchField());
    await userEvent.type(searchField(), 'other.com{Enter}');

    await waitFor(() => expect(api.lookupRecords).toHaveBeenCalledWith('other.com'));
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it('setzt den Dokumenttitel auf die abgefragte Domain', async () => {
    render(<App />);
    await userEvent.type(searchField(), 'example.com{Enter}');
    await waitFor(() => expect(document.title).toBe('example.com — diggy'));
  });

  it('setzt den Dokumenttitel je statischer Route', async () => {
    render(<App />);
    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: 'About' }));
    await waitFor(() => expect(document.title).toBe('About — diggy'));
  });

  it('erkennt eine IP-Eingabe und zeigt die PTR-Ansicht', async () => {
    vi.mocked(api.lookupIpDetails).mockResolvedValue({
      ip: '8.8.8.8',
      type: 'IPv4',
      source: 'test',
    });
    render(<App />);
    await userEvent.type(searchField(), '8.8.8.8{Enter}');

    await waitFor(() => expect(screen.getByText(/PTR \/ Reverse DNS/)).toBeInTheDocument());
    expect(api.lookupRecords).not.toHaveBeenCalled();
  });
});
