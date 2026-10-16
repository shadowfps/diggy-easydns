import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * JSON-Export eines Reports mit Null-MX (#120).
 *
 * Die Records-Liste zeigt den Null-MX als „0 .“ mit Badge. Das ist nur
 * Anzeige: Der Export ist die Antwort der API und muss den Record so
 * enthalten, wie der Resolver ihn liefert — Ziel leer, kein Punkt, kein
 * Badge-Text.
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

const DOMAIN = 'example.com';
const NULL_MX = { type: 'MX' as const, name: DOMAIN, value: '', priority: 0, ttl: 3600 };

function stubApi() {
  vi.mocked(api.lookupRecords).mockResolvedValue({
    domain: DOMAIN,
    timestamp: '2026-10-16T09:00:00.000Z',
    records: [NULL_MX],
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
      dmarc: { present: false },
      dkim: { selectors: [] },
      mtaSts: { present: false },
      hasMx: true,
      nullMx: true,
    },
    findings: [],
  });
  vi.mocked(api.lookupWhois).mockResolvedValue({ whois: null, findings: [] });
  vi.mocked(api.lookupTechStack).mockResolvedValue({ techStack: [] });
}

// jsdom kennt weder Object-URLs noch Downloads.
const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:diggy-test');

beforeEach(() => {
  vi.clearAllMocks();
  clearLookupHistory();
  stubApi();
  window.history.replaceState(null, '', `/lookup/${DOMAIN}`);
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

// Den Spy auf `click` setzt `restoreMocks` (vitest.config.ts) zurück.
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('JSON-Export mit Null-MX', () => {
  it('enthält den Record, wie er kam — die Liste zeigt „0 .“ mit Badge', async () => {
    render(<App />);

    expect(await screen.findByText('Null-MX — keine Mails')).toBeInTheDocument();
    await screen.findByText('Health Score');
    await userEvent.click(screen.getByRole('button', { name: 'JSON herunterladen' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const json = await createObjectURL.mock.calls[0][0].text();
    expect(JSON.parse(json).records).toEqual([NULL_MX]);
    expect(json).not.toContain('Null-MX');
  });
});
