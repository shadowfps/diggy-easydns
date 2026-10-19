import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setMediaQuery } from '@/test/setup';
import type { DnsRecord, Finding, ResolverResult } from '@/types/dns';

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
  lookupAuthoritative: vi.fn(),
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

const EMPTY_SECTION = { findings: [] };

function stubApi(domain = 'example.com') {
  vi.mocked(api.lookupRecords).mockResolvedValue({
    domain,
    timestamp: '2026-09-09T10:00:00.000Z',
    records: [{ type: 'A', name: domain, value: '93.184.216.34', ttl: 300 }],
    findings: [],
  });
  vi.mocked(api.lookupPropagation).mockResolvedValue({ propagation: [], ...EMPTY_SECTION });
  // Nameserver nicht prüfbar: Die Resolver vergleichen dann wie vor #133 mit der Mehrheit.
  vi.mocked(api.lookupAuthoritative).mockImplementation(async (name, type) => ({
    domain: name,
    type,
    nameservers: [],
    error: 'lookup_failed',
  }));
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
      nullMx: false,
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

  // Beide Seiten werden nachgeladen (Bundle-Budget) — deshalb findBy.
  it('öffnet /impressum direkt', async () => {
    setPath('/impressum');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Impressum' })).toBeInTheDocument();
  });

  it('öffnet /datenschutz direkt', async () => {
    setPath('/datenschutz');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Datenschutz' })).toBeInTheDocument();
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

  /** #108: PTR und Details warten auf dieselbe Anfrage — eine Ansage, nicht zwei. */
  it('sagt das Laden der IP-Details einmal an', async () => {
    vi.mocked(api.lookupIpDetails).mockReturnValue(new Promise(() => {}));
    render(<App />);
    // Andere IP als oben: useIpDetails merkt sich Ergebnisse modulweit.
    await userEvent.type(searchField(), '9.9.9.9{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent('Reverse-DNS wird ermittelt');
    expect(screen.getByText(/IP-Details werden geladen/)).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});

describe('Layout', () => {
  it('setzt die Suche auf Report-Seiten in die Kopfzeile', async () => {
    setPath('/lookup/example.com');
    render(<App />);

    await screen.findByText('Health Score');
    expect(within(screen.getByRole('banner')).getByPlaceholderText(/Anfrage starten/)).toBeInTheDocument();
    // Nur eine Suche auf der Seite — die große über dem Report entfällt.
    expect(screen.getAllByPlaceholderText(/Anfrage starten/)).toHaveLength(1);
  });

  it('bietet zuletzt geprüfte Domains auf der Startseite an', async () => {
    clearLookupHistory();
    render(<App />);
    await userEvent.type(searchField(), 'example.com{Enter}');
    await screen.findByText('Health Score');

    await userEvent.click(screen.getByRole('button', { name: 'Zur Startseite' }));
    const recent = await screen.findByRole('button', { name: /example\.com/ });
    vi.mocked(api.lookupRecords).mockClear();
    await userEvent.click(recent);
    await waitFor(() => expect(api.lookupRecords).toHaveBeenCalledWith('example.com'));
  });
});

describe('Report', () => {
  it('springt aus der Score-Karte zu den Findings', async () => {
    setPath('/lookup/example.com');
    render(<App />);

    const button = await screen.findByRole('button', { name: /Alle Findings/ });
    await userEvent.click(button);
    expect(screen.getByRole('tab', { name: /Findings/ })).toHaveAttribute('aria-selected', 'true');
  });

  /** #83: Die Mail-Ansicht ist ein eigener Chunk — der Tab muss sie trotzdem zeigen. */
  it('zeigt den nachgeladenen Mail-Tab', async () => {
    setPath('/lookup/example.com');
    render(<App />);

    const tab = await screen.findByRole('tab', { name: /Mail/ });
    await waitFor(() => expect(api.lookupMail).toHaveBeenCalled());
    await userEvent.click(tab);
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { name: 'SPF' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'MTA-STS' })).toBeInTheDocument();
  });
});

/**
 * #108: Sanftes Scrollen per JS erreichen weder MotionConfig noch die
 * CSS-Regel — bei „Bewegung reduzieren“ springt die Seite stattdessen.
 */
describe('Scrollen und „Bewegung reduzieren“', () => {
  afterEach(() => setMediaQuery());

  async function gotoAbout() {
    render(<App />);
    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: 'About' }));
  }

  it('gleitet ohne die Einstellung nach oben', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    await gotoAbout();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('springt bei reduzierter Bewegung nach oben', async () => {
    setMediaQuery('(prefers-reduced-motion: reduce)');
    const scrollTo = vi.spyOn(window, 'scrollTo');
    await gotoAbout();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' });
  });

  it('holt die Findings bei reduzierter Bewegung ohne Gleiten in Sicht', async () => {
    setMediaQuery('(prefers-reduced-motion: reduce)');
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    setPath('/lookup/example.com');
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /Alle Findings/ }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'nearest' });
  });
});

/**
 * #64: Für einen DNS-Eintrag wie `crsend._domainkey.kksn.de` laufen nur die
 * DNS-Checks. SSL und Tech-Stack bräuchten einen Host, den es dort nicht gibt.
 * #82: Die Propagation läuft dagegen mit — sie vergleicht dort TXT und CNAME.
 */
describe('DNS-Einträge mit Unterstrich', () => {
  const dkim = 'crsend._domainkey.kksn.de';

  beforeEach(() => {
    vi.mocked(api.lookupRecords).mockResolvedValue({
      domain: dkim,
      timestamp: '2026-10-15T10:00:00.000Z',
      records: [{ type: 'TXT', name: dkim, value: 'v=DKIM1; k=rsa; p=MIIB', ttl: 300 }],
      findings: [],
    });
    setPath(`/lookup/${dkim}`);
  });

  it('zeigt den TXT-Record und fragt nur die DNS-Checks ab', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText(/v=DKIM1/)).toBeInTheDocument());
    for (const check of [api.lookupDnssec, api.lookupMail, api.lookupWhois, api.lookupPropagation]) {
      expect(check).toHaveBeenCalledWith(dkim);
    }
    for (const check of [api.lookupSsl, api.lookupTechStack]) {
      expect(check).not.toHaveBeenCalled();
    }
  });

  // Die übersprungenen Sektionen zählen als erledigt — sonst bliebe der
  // Score für immer beim Skeleton.
  it('zeigt den Score, obwohl zwei Sektionen übersprungen sind', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Health Score')).toBeInTheDocument());
  });

  it('blendet die Tabs aus, die eine Website bräuchten', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByRole('tab', { name: /Records/ })).toBeInTheDocument());
    for (const name of [/Speed/, /Virus Scan/]) {
      expect(screen.queryByRole('tab', { name })).not.toBeInTheDocument();
    }
    for (const name of [/Propagation/, /Security/]) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
  });

  /**
   * #82: Nach einem DKIM-Wechsel will man sehen, ob der neue Schlüssel bei
   * allen Resolvern angekommen ist.
   */
  it('vergleicht im Propagation-Tab den TXT-Record über alle Resolver', async () => {
    const key = `v=DKIM1; k=rsa; p=${'A'.repeat(380)}wIDAQAB`;
    vi.mocked(api.lookupPropagation).mockResolvedValue({
      propagation: ['Cloudflare', 'Google', 'AdGuard'].map((name) => ({
        resolver: { id: name.toLowerCase(), name, ip: '0.0.0.0', country: 'X', flag: '', provider: name },
        records: [{ type: 'TXT' as const, name: dkim, value: key, ttl: 3600 }],
        responseTimeMs: 20,
      })),
      findings: [],
    });
    render(<App />);

    await userEvent.click(await screen.findByRole('tab', { name: /Propagation/ }));
    const panel = await screen.findByRole('tabpanel');
    expect(await within(panel).findByRole('region', { name: 'Antwort A' })).toHaveTextContent(
      'Cloudflare, Google, AdGuard'
    );
    expect(within(panel).getByRole('button', { name: /Ganzen Wert zeigen/ })).toBeInTheDocument();
    expect(within(panel).getByText(/denselben TXT-Record/)).toBeInTheDocument();
  });
});

/**
 * #131: Der Typ im Propagation-Tab steht im Link (`?propagation=MX`), Zurück
 * und Vorwärts schalten zwischen den Typen. Was nicht zum Report gehört, fragt
 * der Tab erst bei Auswahl ab — und es ändert weder Score noch Findings.
 */
describe('Propagation-Typ im Link', () => {
  const resolverResult = (name: string, records: DnsRecord[]): ResolverResult => ({
    resolver: { id: name.toLowerCase(), name, ip: '0.0.0.0', country: 'X', flag: '', provider: name },
    records,
    responseTimeMs: 10,
  });
  const consistent: Finding = {
    id: 'propagation-consistent',
    severity: 'success',
    title: 'Konsistente Propagation',
    description: 'Alle 5 Resolver liefern dasselbe Ergebnis.',
    category: 'dns',
  };

  beforeEach(() => {
    vi.mocked(api.lookupPropagation).mockImplementation(async (domain, type) =>
      type
        ? {
            propagation: [
              resolverResult('Cloudflare', [{ type, name: domain, value: 'mx.example.net', priority: 10, ttl: 300 }]),
              resolverResult('Google', [{ type, name: domain, value: 'mx.alt.example.net', priority: 10, ttl: 240 }]),
              resolverResult('AdGuard', [{ type, name: domain, value: 'mx.example.net', priority: 10, ttl: 300 }]),
            ],
            // Käme hier ein Befund an, dürfte er den Report trotzdem nicht ändern.
            findings: [{ ...consistent, id: 'propagation-mismatch', severity: 'warning' }],
          }
        : {
            propagation: [resolverResult('Cloudflare', [{ type: 'A', name: domain, value: '93.184.216.34', ttl: 60 }])],
            findings: [consistent],
          }
    );
  });

  afterEach(() => setMediaQuery());

  const typeButton = async (name: string) =>
    within(await screen.findByRole('group', { name: 'Record-Typ' })).getByRole('button', { name });
  const currentUrl = () => `${window.location.pathname}${window.location.search}`;

  it('öffnet einen Link mit Typ im Propagation-Tab', async () => {
    setPath('/lookup/example.com?propagation=mx');
    render(<App />);

    expect(await typeButton('MX')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: /Propagation/ })).toHaveAttribute('aria-selected', 'true');
    expect(api.lookupPropagation).toHaveBeenCalledWith('example.com', 'MX');
    // Der Report selbst lädt weiter nur die Standard-Typen.
    expect(api.lookupPropagation).toHaveBeenCalledWith('example.com');
    await waitFor(() => expect(currentUrl()).toBe('/lookup/example.com?propagation=MX'));
  });

  it('nimmt bei einem unbekannten Typ die Voreinstellung', async () => {
    setPath('/lookup/example.com?propagation=SRV');
    render(<App />);

    expect(await typeButton('A')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: /Propagation/ })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(currentUrl()).toBe('/lookup/example.com?propagation=A'));
    expect(api.lookupPropagation).toHaveBeenCalledTimes(1);
  });

  it('legt je Typwahl einen History-Eintrag an; Zurück schaltet ohne neuen Check', async () => {
    setPath('/lookup/example.com');
    render(<App />);
    await userEvent.click(await screen.findByRole('tab', { name: /Propagation/ }));
    // Der Tab allein schreibt den gezeigten Typ in den Link, ohne Eintrag.
    await waitFor(() => expect(currentUrl()).toBe('/lookup/example.com?propagation=A'));

    const push = vi.spyOn(window.history, 'pushState');
    await userEvent.click(await typeButton('MX'));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(null, '', '/lookup/example.com?propagation=MX');
    expect(await screen.findByText(/1 von 3 Resolvern weicht ab/)).toBeInTheDocument();
    push.mockRestore();

    // Zurück …
    setPath('/lookup/example.com?propagation=A');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(async () => expect(await typeButton('A')).toHaveAttribute('aria-pressed', 'true'));

    // … und wieder vor: aus dem Zwischenspeicher, ohne neue Abfrage.
    setPath('/lookup/example.com?propagation=MX');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(async () => expect(await typeButton('MX')).toHaveAttribute('aria-pressed', 'true'));

    expect(api.lookupRecords).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.lookupPropagation).mock.calls).toEqual([['example.com'], ['example.com', 'MX']]);
  });

  it('nimmt den Typ beim Wechsel auf einen anderen Tab aus dem Link', async () => {
    setPath('/lookup/example.com?propagation=NS');
    render(<App />);
    await typeButton('NS');

    await userEvent.click(screen.getByRole('tab', { name: /Records/ }));
    await waitFor(() => expect(currentUrl()).toBe('/lookup/example.com'));
  });

  it('ändert weder Score noch Findings', async () => {
    // Der Score steht dann sofort auf dem Endwert, statt hochzuzählen (#103).
    setMediaQuery('(prefers-reduced-motion: reduce)');
    setPath('/lookup/example.com');
    render(<App />);
    const findingsTab = await screen.findByRole('tab', { name: /Findings/ });
    await waitFor(() => expect(findingsTab).toHaveTextContent(/\d/));
    const scoreCard = () => screen.getByRole('heading', { name: 'Health Score' }).closest('.card');
    const before = { findings: findingsTab.textContent, score: scoreCard()?.textContent };

    await userEvent.click(screen.getByRole('tab', { name: /Propagation/ }));
    await userEvent.click(await typeButton('MX'));
    expect(await screen.findByText(/1 von 3 Resolvern weicht ab/)).toBeInTheDocument();

    expect(findingsTab.textContent).toBe(before.findings);
    expect(scoreCard()?.textContent).toBe(before.score);
    await userEvent.click(findingsTab);
    expect(screen.getByText('Konsistente Propagation')).toBeInTheDocument();
    expect(screen.queryByText(/Propagation-Abweichung/)).not.toBeInTheDocument();
  });
});

/**
 * #133: Der erwartete Wert gehört zum Typ und steht mit ihm im Link
 * (`?propagation=A&expected=…`). Tippen ersetzt den Link, statt für jeden
 * Tastendruck einen History-Eintrag anzulegen.
 */
describe('Erwarteter Wert im Link', () => {
  const resolverResult = (name: string, value: string): ResolverResult => ({
    resolver: { id: name.toLowerCase(), name, ip: '0.0.0.0', country: 'X', flag: '', provider: name },
    records: [{ type: 'A', name: 'example.com', value, ttl: 60 }],
    responseTimeMs: 10,
  });

  beforeEach(() => {
    vi.mocked(api.lookupPropagation).mockResolvedValue({
      propagation: [resolverResult('Cloudflare', '192.0.2.1'), resolverResult('Google', '192.0.2.9')],
      findings: [],
    });
  });

  const field = () => screen.findByRole('textbox', { name: 'Erwarteter Wert' });
  const typeButton = async (name: string) =>
    within(await screen.findByRole('group', { name: 'Record-Typ' })).getByRole('button', { name });
  const currentUrl = () => `${window.location.pathname}${window.location.search}`;

  it('öffnet einen Link mit erwartetem Wert und vergleicht die Resolver damit', async () => {
    setPath('/lookup/example.com?propagation=A&expected=192.0.2.1');
    render(<App />);

    expect(await field()).toHaveValue('192.0.2.1');
    expect(await screen.findByText('Noch ohne den erwarteten Wert: 1 von 2 Resolvern.')).toBeInTheDocument();
    expect(screen.getByText(/Verglichen mit dem erwarteten Wert/)).toBeInTheDocument();
    await waitFor(() => expect(currentUrl()).toBe('/lookup/example.com?propagation=A&expected=192.0.2.1'));
  });

  it('ohne Typ im Link bleibt der Wert außen vor', async () => {
    setPath('/lookup/example.com?expected=192.0.2.1');
    render(<App />);

    await waitFor(() => expect(currentUrl()).toBe('/lookup/example.com'));
    await userEvent.click(screen.getByRole('tab', { name: /Propagation/ }));
    expect(await field()).toHaveValue('');
  });

  it('schreibt den Wert ohne History-Eintrag in den Link; ein anderer Typ beginnt leer', async () => {
    setPath('/lookup/example.com');
    render(<App />);
    await userEvent.click(await screen.findByRole('tab', { name: /Propagation/ }));
    await waitFor(() => expect(currentUrl()).toBe('/lookup/example.com?propagation=A'));

    const push = vi.spyOn(window.history, 'pushState');
    await userEvent.type(await field(), '192.0.2.9');
    await waitFor(() => expect(currentUrl()).toBe('/lookup/example.com?propagation=A&expected=192.0.2.9'));
    expect(push).not.toHaveBeenCalled();
    expect(await screen.findByText('Noch ohne den erwarteten Wert: 1 von 2 Resolvern.')).toBeInTheDocument();

    await userEvent.click(await typeButton('MX'));
    expect(push).toHaveBeenCalledWith(null, '', '/lookup/example.com?propagation=MX');
    expect(await field()).toHaveValue('');
    push.mockRestore();

    // Zurück: der vorige Typ mit seinem Wert.
    setPath('/lookup/example.com?propagation=A&expected=192.0.2.9');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(async () => expect(await field()).toHaveValue('192.0.2.9'));
    expect(await typeButton('A')).toHaveAttribute('aria-pressed', 'true');

    // Leeren: der Wert verschwindet aus dem Link.
    await userEvent.click(screen.getByRole('button', { name: 'Erwarteten Wert löschen' }));
    await waitFor(() => expect(currentUrl()).toBe('/lookup/example.com?propagation=A'));
  });

  it('fragt die autoritativen Nameserver erst im Propagation-Tab', async () => {
    setPath('/lookup/example.com');
    render(<App />);
    const findingsTab = await screen.findByRole('tab', { name: /Findings/ });
    await waitFor(() => expect(findingsTab).toHaveTextContent(/\d/));
    expect(api.lookupAuthoritative).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('tab', { name: /Propagation/ }));
    await waitFor(() => expect(api.lookupAuthoritative).toHaveBeenCalledWith('example.com', 'A'));
  });
});
