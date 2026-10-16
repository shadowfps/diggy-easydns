import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DnsRecord, DnssecInfo, MailSecurity, SslInfo } from '@/types/dns';

/**
 * Die Vergleichsansicht mit gemockter API: geprüft wird, dass beide Seiten
 * laden, Unterschiede sichtbar markiert sind und jede Seite für sich laden
 * oder scheitern darf. Die Diff-Regeln selbst testet compareDomains.test.ts.
 */

vi.mock('@/lib/api', () => ({
  lookupRecords: vi.fn(),
  lookupPropagation: vi.fn(),
  lookupDnssec: vi.fn(),
  lookupSsl: vi.fn(),
  lookupMail: vi.fn(),
  lookupWhois: vi.fn(),
  lookupTechStack: vi.fn(),
}));

const api = await import('@/lib/api');
const { CompareView } = await import('./CompareView');

interface Fixture {
  records: DnsRecord[];
  mail: MailSecurity;
  ssl: SslInfo | null;
  dnssec: DnssecInfo;
}

const r = (type: DnsRecord['type'], name: string, value: string): DnsRecord => ({
  type,
  name,
  value,
  ttl: 300,
});

const MAIL: MailSecurity = {
  spf: { present: true, valid: true, issues: [], record: 'v=spf1 -all' },
  dmarc: { present: true, policy: 'reject', record: 'v=DMARC1; p=reject' },
  dkim: { selectors: [] },
  mtaSts: { present: false },
  hasMx: false,
  nullMx: false,
};

const SSL: SslInfo = {
  valid: true,
  issuer: 'DigiCert',
  subject: 'example.com',
  validFrom: '2026-01-01T00:00:00Z',
  validTo: '2027-01-01T00:00:00Z',
  daysUntilExpiry: 77,
  sans: [],
  tlsVersion: 'TLSv1.3',
  signatureAlgorithm: 'sha256',
  isWildcard: false,
};

const FIXTURES: Record<string, Fixture> = {
  'example.com': {
    records: [
      r('A', 'example.com', '93.184.216.34'),
      r('A', 'example.com', '192.0.2.10'),
      r('NS', 'example.com', 'a.iana-servers.net'),
      r('TXT', 'example.com', 'v=spf1 -all'),
    ],
    mail: MAIL,
    ssl: SSL,
    dnssec: { enabled: true, valid: true, chainOfTrust: 'valid', algorithm: 'ECDSAP256SHA256' },
  },
  'github.com': {
    records: [
      r('A', 'github.com', '140.82.121.3'),
      r('A', 'github.com', '192.0.2.10'),
      r('NS', 'github.com', 'a.iana-servers.net'),
      r('TXT', 'github.com', 'v=spf1 -all'),
      r('CAA', 'github.com', '0 issue "digicert.com"'),
    ],
    mail: { ...MAIL, dmarc: { present: true, policy: 'none', record: 'v=DMARC1; p=none' } },
    ssl: { ...SSL, issuer: 'Sectigo', daysUntilExpiry: 40 },
    dnssec: { enabled: false, valid: false, chainOfTrust: 'none' },
  },
  '_dmarc.example.com': {
    records: [r('TXT', '_dmarc.example.com', 'v=DMARC1; p=reject')],
    mail: MAIL,
    ssl: null,
    dnssec: { enabled: false, valid: false, chainOfTrust: 'none' },
  },
};

function stubApi() {
  const fixture = (domain: string) => {
    const f = FIXTURES[domain];
    if (!f) throw new Error(`Für "${domain}" gibt es keine DNS-Antwort.`);
    return f;
  };
  vi.mocked(api.lookupRecords).mockImplementation(async (domain) => ({
    domain,
    timestamp: '2026-10-16T10:00:00.000Z',
    records: fixture(domain).records,
    findings: [],
  }));
  vi.mocked(api.lookupPropagation).mockResolvedValue({ propagation: [], findings: [] });
  vi.mocked(api.lookupDnssec).mockImplementation(async (d) => ({ dnssec: fixture(d).dnssec, findings: [] }));
  vi.mocked(api.lookupSsl).mockImplementation(async (d) => ({ ssl: fixture(d).ssl, findings: [] }));
  vi.mocked(api.lookupMail).mockImplementation(async (d) => ({ mail: fixture(d).mail, findings: [] }));
  vi.mocked(api.lookupWhois).mockResolvedValue({ whois: null, findings: [] });
  vi.mocked(api.lookupTechStack).mockResolvedValue({ techStack: [] });
}

function renderView(left: string, right: string) {
  const onCompare = vi.fn();
  const onOpenReport = vi.fn();
  render(<CompareView left={left} right={right} onCompare={onCompare} onOpenReport={onOpenReport} />);
  return { onCompare, onOpenReport };
}

/** Die Zeile (Listeneintrag) eines Record-Werts. */
const valueItem = (value: string) => screen.getByText(value).closest('li')!;

beforeEach(() => {
  vi.clearAllMocks();
  stubApi();
});

describe('CompareView', () => {
  it('lädt beide Domains und markiert, was nur auf einer Seite steht', async () => {
    renderView('example.com', 'github.com');

    await screen.findByText('140.82.121.3');
    expect(api.lookupRecords).toHaveBeenCalledWith('example.com');
    expect(api.lookupRecords).toHaveBeenCalledWith('github.com');

    // Abweichende A-Records: je Seite als „nur hier“ markiert, der gemeinsame nicht.
    expect(within(valueItem('93.184.216.34')).getByText('nur hier')).toBeInTheDocument();
    expect(within(valueItem('140.82.121.3')).getByText('nur hier')).toBeInTheDocument();
    for (const item of screen.getAllByText('192.0.2.10')) {
      expect(within(item.closest('li')!).queryByText('nur hier')).toBeNull();
    }
    // Gleicher TXT-Record: ohne Markierung.
    for (const item of screen.getAllByText('v=spf1 -all', { selector: 'li span' })) {
      expect(within(item.closest('li')!).queryByText('nur hier')).toBeNull();
    }
  });

  it('markiert „nur hier“ nur, wo sich die Seiten teilweise decken', async () => {
    renderView('example.com', 'github.com');

    // CAA gibt es nur rechts: die Zeile heißt „Unterschied“, der Wert bleibt
    // ohne eigenes Badge — sonst stünde es bei fremden Listen an jedem Eintrag.
    const caa = await screen.findByText('0 issue "digicert.com"');
    expect(within(caa.closest('li')!).queryByText('nur hier')).toBeNull();
    expect(screen.getAllByText('nur hier')).toHaveLength(2);
  });

  it('nennt Unterschiede mit Wort, nicht nur mit Farbe', async () => {
    renderView('example.com', 'github.com');

    // Alles geladen, sobald die Zusammenfassung zählt.
    await screen.findByText(/Unterschiede in \d+ Punkten/);
    expect(screen.getAllByText('Unterschied').length).toBeGreaterThan(0);
    expect(screen.getAllByText('gleich').length).toBeGreaterThan(0);
    // DMARC: reject gegen none, Aussteller DigiCert gegen Sectigo.
    expect(screen.getByText('none')).toBeInTheDocument();
    expect(screen.getByText('Sectigo')).toBeInTheDocument();
    // Restlaufzeit 77 gegen 40 Tage: beide unkritisch, also gleichwertig.
    expect(screen.getByText('gleichwertig')).toBeInTheDocument();
    // Score beider Seiten und wer vorn liegt.
    expect(screen.getAllByText('/ 100')).toHaveLength(2);
  });

  it('zeigt eine fertige Seite schon, während die andere noch lädt', async () => {
    vi.mocked(api.lookupRecords).mockImplementation((domain) =>
      domain === 'github.com'
        ? new Promise(() => {})
        : Promise.resolve({ domain, timestamp: '2026-10-16T10:00:00.000Z', records: FIXTURES[domain].records, findings: [] })
    );
    renderView('example.com', 'github.com');

    await screen.findByText('93.184.216.34');
    expect(screen.getByRole('heading', { name: 'github.com' })).toBeInTheDocument();
    expect(screen.getByText('Wird noch geladen …')).toBeInTheDocument();
    // Ohne Gegenseite kein Urteil.
    expect(screen.queryByText('nur hier')).toBeNull();
  });

  it('zeigt einen Fehler nur auf der betroffenen Seite', async () => {
    renderView('example.com', 'gibt-es-nicht.example');

    expect(await screen.findByText(/keine DNS-Antwort/)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'example.com' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Gegenüberstellung' })).toBeNull();
  });

  it('lädt neu, wenn dieselben Domains noch einmal abgeschickt werden', async () => {
    const { onCompare } = renderView('example.com', 'gibt-es-nicht.example');
    await screen.findByText(/keine DNS-Antwort/);
    expect(api.lookupRecords).toHaveBeenCalledTimes(2);

    // Der Pfad bliebe gleich — ohne eigenen Neustart passierte gar nichts.
    await userEvent.click(screen.getByRole('button', { name: 'Vergleichen' }));

    await waitFor(() => expect(api.lookupRecords).toHaveBeenCalledTimes(4));
    expect(onCompare).not.toHaveBeenCalled();
  });

  it('fragt eine IP nicht ab und verweist auf die IP-Ansicht', async () => {
    const { onOpenReport } = renderView('example.com', '8.8.8.8');

    expect(screen.getByText('Nur Domains vergleichbar')).toBeInTheDocument();
    await waitFor(() => expect(api.lookupRecords).toHaveBeenCalledWith('example.com'));
    expect(api.lookupRecords).not.toHaveBeenCalledWith('8.8.8.8');

    await userEvent.click(screen.getByRole('button', { name: 'IP-Adresse ansehen' }));
    expect(onOpenReport).toHaveBeenCalledWith('8.8.8.8');
  });

  it('prüft bei DNS-Einträgen mit Unterstrich kein Zertifikat', async () => {
    renderView('_dmarc.example.com', 'example.com');

    expect(await screen.findByText('nicht anwendbar')).toBeInTheDocument();
    expect(api.lookupSsl).not.toHaveBeenCalledWith('_dmarc.example.com');
    expect(api.lookupSsl).toHaveBeenCalledWith('example.com');
  });
});

describe('Eingabe', () => {
  it('meldet die normalisierten Domains', async () => {
    const { onCompare } = renderView('example.com', '');

    await userEvent.type(screen.getByLabelText('Domain B'), ' GitHub.com. ');
    await userEvent.click(screen.getByRole('button', { name: 'Vergleichen' }));

    expect(onCompare).toHaveBeenCalledWith('example.com', 'github.com');
  });

  it('übernimmt neue Domains aus den Props, ohne den Fokus zu verlieren', async () => {
    const onCompare = vi.fn();
    const props = { onCompare, onOpenReport: vi.fn() };
    const { rerender } = render(<CompareView left="example.com" right="" {...props} />);

    await userEvent.type(screen.getByLabelText('Domain B'), 'github.com');
    const submit = screen.getByRole('button', { name: 'Vergleichen' });
    await userEvent.click(submit);
    expect(onCompare).toHaveBeenCalledWith('example.com', 'github.com');

    // So kommt der neue Permalink zurück: dasselbe Formular, Fokus bleibt am Knopf.
    rerender(<CompareView left="example.com" right="github.com" {...props} />);
    expect(screen.getByRole('button', { name: 'Vergleichen' })).toBe(submit);
    expect(submit).toHaveFocus();

    // Zurück-Button: die Felder folgen dem Pfad.
    rerender(<CompareView left="a.example" right="b.example" {...props} />);
    expect(screen.getByLabelText('Domain A')).toHaveValue('a.example');
    expect(screen.getByLabelText('Domain B')).toHaveValue('b.example');
  });

  it('tauscht die beiden Felder', async () => {
    renderView('example.com', 'github.com');

    await userEvent.click(screen.getByRole('button', { name: 'Domains tauschen' }));

    expect(screen.getByLabelText('Domain A')).toHaveValue('github.com');
    expect(screen.getByLabelText('Domain B')).toHaveValue('example.com');
  });

  it('bittet um die zweite Domain, solange sie fehlt', () => {
    renderView('example.com', '');
    expect(screen.getByText('Domain B eintragen')).toBeInTheDocument();
  });
});
