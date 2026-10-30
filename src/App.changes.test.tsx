import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * „Seit dem letzten Check“ im Zusammenspiel mit App.tsx (#79).
 *
 * Der heikle Teil ist die Reihenfolge: App.tsx überschreibt den Eintrag der
 * Domain in der History, sobald alle Sektionen fertig sind. Der alte Stand
 * muss vorher gegriffen sein — sonst vergliche die Karte den Lookup mit sich
 * selbst und meldete immer „Keine Änderungen seit gerade eben“. Die gemockten
 * Checks antworten sofort; Records und alle Sektionen landen damit im selben
 * Render, der ungünstigste Fall.
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
const { clearLookupHistory } = await import('@/lib/lookupHistory');
const App = (await import('./App')).default;
// App lädt die Karte per lazy(). Beim ersten Import transformiert Vitest das
// Modul erst — unter Last länger als die Sekunde, die findBy* wartet. Vorab
// geladen, löst der dynamische Import im Test sofort auf.
await import('@/modules/changes/SinceLastCheck');

const DOMAIN = 'example.com';

function stubApi({ ip, timestamp, dmarc }: { ip: string; timestamp: string; dmarc: boolean }) {
  vi.mocked(api.lookupRecords).mockResolvedValue({
    domain: DOMAIN,
    timestamp,
    records: [{ type: 'A', name: DOMAIN, value: ip, ttl: 300 }],
    findings: [],
  });
  vi.mocked(api.lookupPropagation).mockResolvedValue({ propagation: [], findings: [] });
  vi.mocked(api.lookupDnssec).mockResolvedValue({
    dnssec: { enabled: false, valid: false, chainOfTrust: 'none' },
    findings: [],
  });
  vi.mocked(api.lookupSsl).mockResolvedValue({ ssl: null, findings: [] });
  vi.mocked(api.lookupMail).mockResolvedValue({
    mail: {
      spf: { present: false, valid: false, issues: [] },
      // Mit Record: gewertet wird die wirksame Policy daraus (#107).
      dmarc: dmarc
        ? { present: true, record: 'v=DMARC1; p=reject', policy: 'reject' }
        : { present: false },
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

const headerSearch = () => within(screen.getByRole('banner')).getByPlaceholderText(/Anfrage starten/);

async function lookUpAgain() {
  await userEvent.clear(headerSearch());
  await userEvent.type(headerSearch(), `${DOMAIN}{Enter}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  clearLookupHistory();
  window.history.replaceState(null, '', `/lookup/${DOMAIN}`);
  stubApi({ ip: '198.51.100.7', timestamp: '2026-10-13T09:00:00.000Z', dmarc: false });
});

describe('Seit dem letzten Check im Report', () => {
  it('zeigt beim ersten Lookup einer Domain nichts', async () => {
    render(<App />);

    await screen.findByText('Health Score');
    expect(screen.queryByText(/Seit dem letzten Check/)).not.toBeInTheDocument();
  });

  it('listet beim zweiten Lookup, was sich geändert hat', async () => {
    render(<App />);
    await screen.findByText('Health Score');

    stubApi({ ip: '203.0.113.5', timestamp: '2026-10-16T09:00:00.000Z', dmarc: true });
    await lookUpAgain();

    const toggle = await screen.findByRole('button', { name: /Änderungen seit/ });
    await userEvent.click(toggle);

    // Eigene Liste der Karte — die Kopfzeile hat auch eine (Navigation).
    const list = within(
      within(screen.getByRole('region', { name: 'Seit dem letzten Check' })).getByRole('list')
    );
    expect(list.getByText('203.0.113.5').closest('li')).toHaveTextContent(/^neu/);
    expect(list.getByText('198.51.100.7').closest('li')).toHaveTextContent(/^entfallen/);
    expect(list.getByText(/DMARC-Record gesetzt/)).toBeInTheDocument();
  });

  // StrictMode rendert doppelt und führt Mount-Effects zweimal aus — der
  // alte Eintrag muss trotzdem vor dem Speichern gegriffen sein.
  it('greift den alten Stand auch unter StrictMode vor dem Speichern', async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    await screen.findByText('Health Score');

    stubApi({ ip: '203.0.113.5', timestamp: '2026-10-16T09:00:00.000Z', dmarc: false });
    await lookUpAgain();

    expect(await screen.findByRole('button', { name: /2 Änderungen seit/ })).toBeInTheDocument();
  });

  // Permalink neu geladen: frischer App-Mount, der alte Stand steht nur noch
  // in localStorage.
  it('vergleicht nach einem Neuladen mit dem gespeicherten Stand', async () => {
    const first = render(<App />);
    await screen.findByText('Health Score');
    first.unmount();

    stubApi({ ip: '203.0.113.5', timestamp: '2026-10-16T09:00:00.000Z', dmarc: false });
    render(<App />);

    expect(await screen.findByRole('button', { name: /2 Änderungen seit/ })).toBeInTheDocument();
  });

  it('sagt beim zweiten Lookup ohne Änderungen „Keine Änderungen seit …“', async () => {
    render(<App />);
    await screen.findByText('Health Score');

    stubApi({ ip: '198.51.100.7', timestamp: '2026-10-16T09:00:00.000Z', dmarc: false });
    await lookUpAgain();

    await waitFor(() =>
      expect(screen.getByText(/^Keine Änderungen seit /)).toBeInTheDocument()
    );
  });

  // Ein Timeout ist keine Änderung: fällt der Mail-Check aus, steht im
  // Report „DMARC fehlt“ als Default — das darf nicht als „entfernt“ zählen.
  it('meldet einen fehlgeschlagenen Check nicht als Änderung', async () => {
    stubApi({ ip: '198.51.100.7', timestamp: '2026-10-13T09:00:00.000Z', dmarc: true });
    render(<App />);
    await screen.findByText('Health Score');

    stubApi({ ip: '198.51.100.7', timestamp: '2026-10-16T09:00:00.000Z', dmarc: true });
    vi.mocked(api.lookupMail).mockRejectedValue(new Error('Timeout'));
    await lookUpAgain();

    await waitFor(() =>
      expect(screen.getByText(/^Keine Änderungen seit /)).toBeInTheDocument()
    );
  });

  // #101: ein SSL-Timeout kostet keine Punkte mehr. Der Score ist dann eine
  // andere Rechnung als beim letzten Check — „Health Score gestiegen“ wäre
  // erfunden. Prüft zugleich den Weg vom API-Feld bis in die Schnellübersicht.
  it('zeigt einen SSL-Timeout als „nicht prüfbar“ und vergleicht den Score nicht', async () => {
    const finding = (id: string, severity: 'warning' | 'info', unchecked?: boolean) => ({
      id,
      severity,
      title: id,
      description: '',
      category: 'ssl' as const,
      ...(unchecked && { unchecked }),
    });
    vi.mocked(api.lookupSsl).mockResolvedValue({
      ssl: null,
      findings: [finding('no-ssl', 'warning')],
    });
    render(<App />);
    await screen.findByText('Health Score');

    stubApi({ ip: '198.51.100.7', timestamp: '2026-10-16T09:00:00.000Z', dmarc: false });
    vi.mocked(api.lookupSsl).mockResolvedValue({
      ssl: null,
      lookupFailed: 'timeout',
      findings: [finding('ssl-unchecked', 'info', true)],
    });
    await lookUpAgain();

    await waitFor(() =>
      expect(screen.getByText(/^Keine Änderungen seit /)).toBeInTheDocument()
    );
    expect(screen.getByRole('group', { name: 'SSL' })).toHaveTextContent('nicht prüfbar');
  });
});
