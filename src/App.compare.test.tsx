import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Routing der Vergleichsansicht (#85): Permalink, Einstiege aus Report und
 * Menü, Zurück-Button. Eigene Datei statt App.routing.test.tsx, weil sie
 * je Domain verschiedene Antworten braucht — dort liefert der Mock für jede
 * Domain dieselbe.
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

const IPS: Record<string, string> = { 'example.com': '93.184.216.34', 'github.com': '140.82.121.3' };

function stubApi() {
  vi.mocked(api.lookupRecords).mockImplementation(async (domain) => ({
    domain,
    timestamp: '2026-10-16T10:00:00.000Z',
    records: [{ type: 'A', name: domain, value: IPS[domain] ?? '192.0.2.1', ttl: 300 }],
    findings: [],
  }));
  vi.mocked(api.lookupPropagation).mockResolvedValue({ propagation: [], findings: [] });
  vi.mocked(api.lookupDnssec).mockResolvedValue({
    dnssec: { enabled: false, valid: false, chainOfTrust: 'none' },
    findings: [],
  });
  vi.mocked(api.lookupSsl).mockResolvedValue({ ssl: null, findings: [] });
  vi.mocked(api.lookupMail).mockResolvedValue({
    mail: {
      spf: { present: false, valid: false, issues: [] },
      dmarc: { present: false },
      dkim: { selectors: [] },
      mtaSts: { present: false },
      hasMx: false,
      nullMx: false,
    },
    findings: [],
  });
  vi.mocked(api.lookupWhois).mockResolvedValue({ whois: null, findings: [] });
  vi.mocked(api.lookupTechStack).mockResolvedValue({ techStack: [] });
}

function setPath(path: string) {
  window.history.replaceState(null, '', path);
}

/** Zurück-Button: URL setzen und popstate auslösen, wie es der Browser tut. */
function goBackTo(path: string) {
  setPath(path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

const compareHeading = () => screen.findByRole('heading', { name: 'Zwei Domains vergleichen' });

beforeEach(() => {
  vi.clearAllMocks();
  stubApi();
  setPath('/');
  window.localStorage.clear();
});

afterEach(() => {
  setPath('/');
});

describe('Vergleich per Permalink', () => {
  it('lädt beide Domains aus dem Pfad', async () => {
    setPath('/compare/example.com/github.com');
    render(<App />);

    await compareHeading();
    await waitFor(() => {
      expect(api.lookupRecords).toHaveBeenCalledWith('example.com');
      expect(api.lookupRecords).toHaveBeenCalledWith('github.com');
    });
    expect(await screen.findByText('140.82.121.3')).toBeInTheDocument();
    expect(document.title).toBe('example.com vs. github.com — diggy');
  });

  it('behandelt einen Pfad mit drei Domains wie einen unbekannten', async () => {
    setPath('/compare/a.de/b.de/c.de');
    render(<App />);

    expect(screen.getByPlaceholderText(/Anfrage starten/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Zwei Domains vergleichen' })).toBeNull();
    expect(api.lookupRecords).not.toHaveBeenCalled();
  });
});

describe('Einstiege', () => {
  it('führt aus dem Report mit der aktuellen Domain zum Vergleich — und zurück', async () => {
    setPath('/lookup/example.com');
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Vergleichen' }));

    expect(window.location.pathname).toBe('/compare/example.com');
    await compareHeading();
    expect(screen.getByLabelText('Domain A')).toHaveValue('example.com');
    expect(screen.getByLabelText('Domain B')).toHaveValue('');

    vi.mocked(api.lookupRecords).mockClear();
    goBackTo('/lookup/example.com');

    await waitFor(() => expect(api.lookupRecords).toHaveBeenCalledWith('example.com'));
    expect(await screen.findByText('Health Score')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Zwei Domains vergleichen' })).toBeNull();
  });

  it('öffnet den Vergleich aus der Navigation', async () => {
    render(<App />);
    // Flow hängt Link-Namen ein U+200D an — daher der Vergleich über den Anfang.
    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('link', {
        name: /^Vergleichen/,
      })
    );

    expect(window.location.pathname).toBe('/compare');
    await compareHeading();
    expect(document.title).toBe('Vergleich — diggy');
  });
});

describe('Navigation in der Vergleichsansicht', () => {
  it('schreibt eine neue Eingabe als Permalink und kommt per Zurück wieder', async () => {
    setPath('/compare/example.com');
    render(<App />);
    await compareHeading();

    await userEvent.type(screen.getByLabelText('Domain B'), 'github.com');
    await userEvent.click(screen.getByRole('button', { name: 'Vergleichen' }));

    expect(window.location.pathname).toBe('/compare/example.com/github.com');
    await waitFor(() => expect(api.lookupRecords).toHaveBeenCalledWith('github.com'));

    goBackTo('/compare/example.com');
    await waitFor(() => expect(screen.getByLabelText('Domain B')).toHaveValue(''));
    expect(await screen.findByText('Domain B eintragen')).toBeInTheDocument();
  });

  it('öffnet den vollständigen Report einer Seite', async () => {
    setPath('/compare/example.com/github.com');
    render(<App />);

    const buttons = await screen.findAllByRole('button', { name: /Vollständigen Report öffnen/ });
    await waitFor(() => expect(buttons[1]).toBeEnabled());
    await userEvent.click(buttons[1]);

    expect(window.location.pathname).toBe('/lookup/github.com');
    expect(await screen.findByText('Health Score')).toBeInTheDocument();
  });
});
