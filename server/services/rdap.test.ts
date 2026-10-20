import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import packageJson from '../../package.json' with { type: 'json' };
import { clearCache } from '../lib/cache.js';
import { IANA_RDAP_BOOTSTRAP_URL, resetRdapBootstrap } from '../lib/rdapBootstrap.js';
import { queryPort43 } from '../lib/whoisPort43.js';
import { BOOTSTRAP_SAMPLE } from '../test/rdapBootstrap.js';
import { checkDomainsAvailability } from './domainAvailability.js';
import { lookupIpDetails } from './ipDetails.js';
import { lookupWhois } from './whois.js';

vi.mock('./dnsLookup.js', () => ({ lookupPtrRecords: vi.fn().mockResolvedValue([]) }));
// Ohne Bootstrap prüft registry.ts das Ziel einer Weiterleitung per
// Namensauflösung — im Test eine feste öffentliche Adresse statt Netz.
vi.mock('node:dns', async (importOriginal) => {
  const dns = await importOriginal<typeof import('node:dns')>();
  const lookup = vi.fn(async () => [{ address: '199.19.56.1', family: 4 }]);
  return { ...dns, promises: { ...dns.promises, lookup } };
});
// Port 43 prüfen whoisPort43.test.ts und registry.test.ts; hier nie ins Netz.
vi.mock('../lib/whoisPort43.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/whoisPort43.js')>()),
  queryPort43: vi.fn(),
}));

const fetchMock = vi.fn<typeof fetch>();
const port43Mock = vi.mocked(queryPort43);
const expectedHeaders = {
  'user-agent': `diggy/${packageJson.version} (+https://diggydns.cloud)`,
  accept: 'application/rdap+json',
};

beforeEach(() => {
  clearCache();
  resetRdapBootstrap();
  fetchMock.mockReset();
  port43Mock.mockReset();
  port43Mock.mockRejectedValue(new Error('Timeout'));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Beantwortet den IANA-Bootstrap mit dem Auszug, alles andere mit `handler`. */
function registries(handler: Handler, bootstrap: () => Response = () => Response.json(BOOTSTRAP_SAMPLE)) {
  fetchMock.mockImplementation(async (input, init) =>
    String(input) === IANA_RDAP_BOOTSTRAP_URL ? bootstrap() : handler(String(input), init)
  );
}

/** Der Bootstrap ist nicht ladbar — der Rückfall auf rdap.org greift. */
function withoutBootstrap(handler: Handler) {
  registries(handler, () => new Response(null, { status: 503 }));
}

const BOOTSTRAP_WARNING = `[rdap] ${IANA_RDAP_BOOTSTRAP_URL}: HTTP 503 — Rückfall auf rdap.org`;

/** Aufrufe an Registries, ohne den Bootstrap. */
const registryCalls = () => fetchMock.mock.calls.filter(([url]) => String(url) !== IANA_RDAP_BOOTSTRAP_URL);

function domainResponse(): Response {
  return Response.json({
    objectClassName: 'domain',
    entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'Example Registrar']]] }],
    events: [{ eventAction: 'registration', eventDate: '2000-01-01T00:00:00Z' }],
    nameservers: [{ ldhName: 'NS1.EXAMPLE.COM.' }],
    status: ['active'],
    secureDNS: { delegationSigned: true },
  });
}

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function abortOnTimeout(_input: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
}

describe('WHOIS-RDAP', () => {
  it.each(['github.com', 'example.com', 'google.com'])('setzt Header und verarbeitet Registry-Daten für %s', async (domain) => {
    registries(() => domainResponse());

    expect(await lookupWhois(domain)).toEqual({
      domain,
      registrar: 'Example Registrar',
      createdAt: '2000-01-01T00:00:00Z',
      expiresAt: undefined,
      updatedAt: undefined,
      nameServers: ['ns1.example.com'],
      status: ['active'],
      dnssecDelegated: true,
      source: 'rdap.verisign.com',
    });
    // Direkt bei Verisign laut Bootstrap, nicht mehr über rdap.org (#105).
    expect(registryCalls()).toEqual([
      [`https://rdap.verisign.com/com/v1/domain/${domain}`, expect.objectContaining({
        headers: expectedHeaders,
        redirect: 'manual',
        signal: expect.any(AbortSignal),
      })],
    ]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([403, 429, 500, 501])('liefert bei HTTP %s null und loggt Status und URL', async (status) => {
    registries(() => new Response(null, { status }));
    expect(await lookupWhois('example.com')).toBeNull();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(`[rdap] https://rdap.verisign.com/com/v1/domain/example.com: HTTP ${status}`);
  });

  it('liefert bei HTTP 404 null ohne Warnung, weil das ein erwarteter Pfad ist', async () => {
    registries(() => new Response(null, { status: 404 }));
    expect(await lookupWhois('example.com')).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('liefert bei Timeout null und unterscheidet ihn von HTTP-Fehlern', async () => {
    vi.useFakeTimers();
    registries(abortOnTimeout);
    const lookup = lookupWhois('example.com', 50);
    await vi.advanceTimersByTimeAsync(50);
    expect(await lookup).toBeNull();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[rdap] https://rdap.verisign.com/com/v1/domain/example.com: Timeout');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('loggt Netzwerkfehler mit Ursache', async () => {
    registries(() => {
      throw new TypeError('fetch failed');
    });
    expect(await lookupWhois('example.com')).toBeNull();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[rdap] https://rdap.verisign.com/com/v1/domain/example.com: fetch failed');
  });

  it('loggt RDAP-Fehler auch bei HTTP 200', async () => {
    registries(() => Response.json({ errorCode: 403 }));
    expect(await lookupWhois('example.com')).toBeNull();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[rdap] https://rdap.verisign.com/com/v1/domain/example.com: RDAP 403');
  });

  it('fragt für .de nur DENIC und verwendet auch dort die Header', async () => {
    // Früher lief rdap.org parallel mit und antwortete immer 404.
    registries(() => domainResponse());

    expect(await lookupWhois('example.de')).toMatchObject({ source: 'rdap.denic.de' });
    expect(registryCalls()).toEqual([
      ['https://rdap.denic.de/domain/example.de', expect.objectContaining({ headers: expectedHeaders, redirect: 'manual' })],
    ]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('fällt ohne Bootstrap auf rdap.org zurück und folgt dessen Weiterleitung', async () => {
    withoutBootstrap((url) => url.startsWith('https://rdap.org/')
      ? redirectTo('https://rdap.publicinterestregistry.org/rdap/domain/example.org')
      : domainResponse());

    expect(await lookupWhois('example.org')).toMatchObject({ source: 'rdap.publicinterestregistry.org' });
    expect(registryCalls().map(([url]) => url)).toEqual([
      'https://rdap.org/domain/example.org',
      'https://rdap.publicinterestregistry.org/rdap/domain/example.org',
    ]);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(BOOTSTRAP_WARNING);
  });
});

describe('Domain-Verfügbarkeit über RDAP', () => {
  it('setzt Header für die Registries laut Bootstrap und erkennt vergebene Domains', async () => {
    registries(() => domainResponse());
    const report = await checkDomainsAvailability('example');
    expect(report.results.every((result) => result.status === 'taken')).toBe(true);
    expect(new Set(registryCalls().map(([url]) => new URL(String(url)).hostname))).toEqual(
      new Set([
        'rdap.verisign.com',
        'rdap.denic.de',
        'rdap.identitydigital.services',
        'pubapi.registry.google',
        'rdap.publicinterestregistry.org',
      ])
    );
    for (const [, init] of registryCalls()) {
      expect(init).toMatchObject({ headers: expectedHeaders, redirect: 'manual' });
    }
    expect(port43Mock).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('behandelt 404 der Registry weiterhin als freie Domain ohne Warnung', async () => {
    registries(() => new Response(null, { status: 404 }));
    const report = await checkDomainsAvailability('example');
    expect(report.results.every((result) => result.status === 'available')).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('behandelt über rdap.org den 404 der Registry nach der Weiterleitung als frei', async () => {
    withoutBootstrap((url) => url.startsWith('https://rdap.org/')
      ? redirectTo(`https://rdap.publicinterestregistry.org/rdap/domain/${url.split('/').pop()}`)
      : new Response(null, { status: 404 }));
    const report = await checkDomainsAvailability('example');
    expect(report.results.every((result) => result.status === 'available')).toBe(true);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(BOOTSTRAP_WARNING);
  });

  it('meldet TLDs ohne RDAP-Dienst bei rdap.org als unklar statt frei', async () => {
    // rdap.org antwortet für Endungen ohne Dienst direkt mit 404 („No RDAP
    // service is available“) — ohne Bootstrap trifft das .org, .app, .dev.
    withoutBootstrap(() => new Response(null, { status: 404 }));
    const report = await checkDomainsAvailability('example');
    const byDomain = Object.fromEntries(report.results.map((result) => [result.domain, result.status]));
    expect(byDomain).toMatchObject({
      'example.org': 'unknown',
      'example.app': 'unknown',
      'example.com': 'available',
      'example.de': 'available',
      // .io fragt diggy seit #105 direkt bei Identity Digital.
      'example.io': 'available',
    });
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(BOOTSTRAP_WARNING);
  });

  it.each([403, 500])('meldet HTTP %s als unklar und loggt den Status', async (status) => {
    registries(() => new Response(null, { status }));
    const report = await checkDomainsAvailability('example');
    expect(report.results.every((result) => result.status === 'unknown')).toBe(true);
    // Je Domain eine Warnung, für .io eine zweite vom WHOIS-Rückfall.
    expect(console.warn).toHaveBeenCalledTimes(report.results.length + 1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`HTTP ${status}`));
    expect(console.warn).toHaveBeenCalledWith('[whois] whois.nic.io example.io: Timeout');
  });

  it('loggt Timeouts und liefert unklar', async () => {
    vi.useFakeTimers();
    registries(abortOnTimeout);
    const lookup = checkDomainsAvailability('example');
    await vi.advanceTimersByTimeAsync(6000);
    const report = await lookup;
    expect(report.results.every((result) => result.status === 'unknown')).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(report.results.length + 1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(': Timeout'));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('IP-Details über RDAP', () => {
  it('setzt RDAP-Header und übernimmt Netzwerkdaten', async () => {
    fetchMock.mockImplementation(async (input) => String(input).includes('rdap.org')
      ? Response.json({ name: 'EXAMPLE-NET', country: 'US', cidr0_cidrs: [{ v4prefix: '8.8.8.0', length: 24 }] })
      : Response.json({ success: false }));
    expect(await lookupIpDetails('8.8.8.8')).toMatchObject({ network: '8.8.8.0/24', organization: 'EXAMPLE-NET', source: 'rdap.org' });
    expect(fetchMock).toHaveBeenCalledWith(new URL('https://rdap.org/ip/8.8.8.8'), expect.objectContaining({
      headers: expectedHeaders,
      redirect: 'follow',
    }));
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([403, 500])('loggt HTTP %s und liefert weiterhin Geo-Daten', async (status) => {
    fetchMock.mockImplementation(async (input) => String(input).includes('rdap.org')
      ? new Response(null, { status })
      : Response.json({ success: true, country: 'US' }));
    expect(await lookupIpDetails('8.8.8.8')).toMatchObject({ country: 'US', source: 'ipwhois.app' });
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(`[rdap] https://rdap.org/ip/8.8.8.8: IP-Details API Fehler (HTTP ${status})`);
  });

  it('nennt jeden gefragten Dienst in den Datenschutzhinweisen mit der IP-Adresse als Zweck', async () => {
    // rdap.org fragt die IP-Details auch mit geladenem IANA-Bootstrap (#105) —
    // „nur als Rückfall“ wäre dort eine falsche Angabe.
    fetchMock.mockImplementation(async () => Response.json({ success: true, country: 'US' }));
    await lookupIpDetails('8.8.8.8');
    const hosts = new Set(fetchMock.mock.calls.map(([url]) => new URL(String(url)).hostname));
    expect(hosts).toEqual(new Set(['ipwhois.app', 'rdap.org']));

    const privacy = readFileSync(new URL('../../src/modules/datenschutz/DatenschutzText.tsx', import.meta.url), 'utf8');
    for (const host of hosts) {
      const name = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(privacy, host).toMatch(new RegExp(`<Row service="${name}" purpose="[^"]*IP-Adresse[^"]*"`));
    }
  });

  it('loggt einen RDAP-Timeout und liefert weiterhin Geo-Daten', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((input, init) => String(input).includes('rdap.org')
      ? abortOnTimeout(input, init)
      : Promise.resolve(Response.json({ success: true, country: 'US' })));
    const lookup = lookupIpDetails('8.8.8.8', 50);
    await vi.advanceTimersByTimeAsync(50);
    expect(await lookup).toMatchObject({ country: 'US', source: 'ipwhois.app' });
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[rdap] https://rdap.org/ip/8.8.8.8: Timeout');
    expect(vi.getTimerCount()).toBe(0);
  });
});
