import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLanguage } from '@/i18n';
import { dnsFindings, mailFindings } from '../../server/services/reportBuilder';

/**
 * Die App auf Englisch (#86): Startseite, Report mit Findings, Rechtsseiten
 * mit Hinweis und Dokumenttitel. Die Sub-Checks sind gemockt wie in
 * App.routing.test.tsx — die Findings kommen aber aus den echten Erzeugern
 * des Servers, samt deutschem Text, Kennung und Werten.
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

const api = await import('@/lib/api');
const App = (await import('@/App')).default;

const NO_MAIL = {
  spf: { present: false, valid: false, issues: [] },
  dmarc: { present: false },
  dkim: { selectors: [] },
  mtaSts: { present: false },
  hasMx: true,
};

function stubReport(domain = 'example.com') {
  const records = [
    { type: 'A' as const, name: domain, value: '93.184.216.34', ttl: 300 },
    { type: 'NS' as const, name: domain, value: 'ns1.example.net', ttl: 300 },
  ];
  vi.mocked(api.lookupRecords).mockResolvedValue({
    domain,
    timestamp: '2026-10-16T10:00:00.000Z',
    records,
    findings: dnsFindings(records, domain, domain),
  });
  vi.mocked(api.lookupPropagation).mockResolvedValue({ propagation: [], findings: [] });
  vi.mocked(api.lookupDnssec).mockResolvedValue({
    dnssec: { enabled: false, valid: false, chainOfTrust: 'none' },
    findings: [],
  });
  vi.mocked(api.lookupSsl).mockResolvedValue({ ssl: null, findings: [] });
  vi.mocked(api.lookupMail).mockResolvedValue({ mail: NO_MAIL, findings: mailFindings(NO_MAIL, domain) });
  vi.mocked(api.lookupWhois).mockResolvedValue({ whois: null, findings: [] });
  vi.mocked(api.lookupTechStack).mockResolvedValue({ techStack: [] });
}

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

  it('zeigt einen Report samt Findings übersetzt', async () => {
    stubReport();
    setPath('/lookup/example.com');
    render(<App />);

    expect(await screen.findByText('Health Score')).toBeInTheDocument();
    expect(screen.getByText('DNS report')).toBeInTheDocument();
    expect(screen.getByText(/^Checked on /)).toBeInTheDocument();
    expect(screen.getByText('At a glance')).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Report sections' })).toBeInTheDocument();
    // Score-Karte: Urteil, Mehrzahl in der Legende, wichtigster Punkt.
    expect(screen.getByText('Solid setup')).toBeInTheDocument();
    expect(screen.getByText('warnings')).toBeInTheDocument();
    expect(screen.getByText('Top priority')).toBeInTheDocument();
    expect(screen.getByText('No SPF record found')).toBeInTheDocument();
    expect(document.title).toBe('example.com — diggy');

    await userEvent.click(screen.getByRole('button', { name: /All findings/ }));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('No CAA record')).toBeInTheDocument();
    expect(within(panel).getByText('No DMARC record at _dmarc.<domain>')).toBeInTheDocument();
    expect(
      within(panel).getByText('Without DMARC, attackers can more easily send email in your name (spoofing).')
    ).toBeInTheDocument();
    expect(within(panel).queryByText(/Kein |Keine /)).toBeNull();
  });

  it('übersetzt eine Fehlermeldung des Servers nach Code', async () => {
    stubReport();
    vi.mocked(api.lookupRecords).mockRejectedValue(
      Object.assign(new Error('Die Domain "nix.example" konnte nicht aufgelöst werden.'), {
        code: 'domain_not_found',
        params: { domain: 'nix.example' },
      })
    );
    setPath('/lookup/nix.example');
    render(<App />);
    expect(await screen.findByText('The domain "nix.example" couldn’t be resolved.')).toBeInTheDocument();
  });

  it('lässt das Impressum deutsch und sagt das oben', () => {
    setPath('/impressum');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Legal notice' })).toBeInTheDocument();
    expect(
      screen.getByText('The legal information on this page is only available in German.')
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
      screen.getByText('The legal information on this page is only available in German.')
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
