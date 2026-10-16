import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import packageJson from '../../package.json' with { type: 'json' };
import { clearCache } from '../lib/cache.js';
import { checkDomainsAvailability } from './domainAvailability.js';
import { lookupIpDetails } from './ipDetails.js';
import { lookupWhois } from './whois.js';

vi.mock('./dnsLookup.js', () => ({ lookupPtrRecords: vi.fn().mockResolvedValue([]) }));

const fetchMock = vi.fn<typeof fetch>();
const expectedHeaders = {
  'user-agent': `diggy/${packageJson.version} (+https://diggydns.cloud)`,
  accept: 'application/rdap+json',
};

beforeEach(() => {
  clearCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function domainResponse(url = 'https://rdap.verisign.com/com/v1/domain/example.com'): Response {
  const response = Response.json({
    objectClassName: 'domain',
    entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'Example Registrar']]] }],
    events: [{ eventAction: 'registration', eventDate: '2000-01-01T00:00:00Z' }],
    nameservers: [{ ldhName: 'NS1.EXAMPLE.COM.' }],
    status: ['active'],
    secureDNS: { delegationSigned: true },
  });
  // fetch liefert nach einem Redirect die finale Registry-URL zurück.
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

function notFound({ redirected }: { redirected: boolean }): Response {
  const response = new Response(null, { status: 404 });
  Object.defineProperty(response, 'redirected', { value: redirected });
  return response;
}

function abortOnTimeout(_input: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
}

describe('WHOIS-RDAP', () => {
  it.each(['github.com', 'example.com', 'google.com'])('setzt Header und verarbeitet Registry-Daten für %s', async (domain) => {
    fetchMock.mockResolvedValue(domainResponse());

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
    expect(fetchMock).toHaveBeenCalledWith(`https://rdap.org/domain/${domain}`, expect.objectContaining({
      headers: expectedHeaders,
      redirect: 'follow',
      signal: expect.any(AbortSignal),
    }));
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([403, 429, 500, 501])('liefert bei HTTP %s null und loggt Status und URL', async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    expect(await lookupWhois('example.com')).toBeNull();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(`[rdap] https://rdap.org/domain/example.com: HTTP ${status}`);
  });

  it('liefert bei HTTP 404 null ohne Warnung, weil das ein erwarteter Pfad ist', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    expect(await lookupWhois('example.com')).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('liefert bei Timeout null und unterscheidet ihn von HTTP-Fehlern', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(abortOnTimeout);
    const lookup = lookupWhois('example.com', 50);
    await vi.advanceTimersByTimeAsync(50);
    expect(await lookup).toBeNull();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[rdap] https://rdap.org/domain/example.com: Timeout');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('loggt Netzwerkfehler mit Ursache', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect(await lookupWhois('example.com')).toBeNull();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[rdap] https://rdap.org/domain/example.com: fetch failed');
  });

  it('loggt RDAP-Fehler auch bei HTTP 200', async () => {
    fetchMock.mockResolvedValue(Response.json({ errorCode: 403 }));
    expect(await lookupWhois('example.com')).toBeNull();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[rdap] https://rdap.org/domain/example.com: RDAP 403');
  });

  it('fragt DENIC weiterhin parallel ab und verwendet auch dort die Header', async () => {
    // rdap.org kennt .de nicht und antwortet mit 404 — das darf nicht warnen.
    fetchMock.mockImplementation(async (input) => String(input).includes('rdap.denic.de')
      ? domainResponse('https://rdap.denic.de/domain/example.de')
      : new Response(null, { status: 404 }));

    expect(await lookupWhois('example.de')).toMatchObject({ source: 'rdap.denic.de' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith('https://rdap.denic.de/domain/example.de', expect.objectContaining({
      headers: expectedHeaders,
      redirect: 'follow',
    }));
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('Domain-Verfügbarkeit über RDAP', () => {
  it('setzt Header für Verisign, DENIC und rdap.org und erkennt vergebene Domains', async () => {
    fetchMock.mockImplementation(async () => domainResponse());
    const report = await checkDomainsAvailability('example');
    expect(report.results.every((result) => result.status === 'taken')).toBe(true);
    expect(new Set(fetchMock.mock.calls.map(([url]) => new URL(String(url)).hostname))).toEqual(
      new Set(['rdap.verisign.com', 'rdap.denic.de', 'rdap.org'])
    );
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ headers: expectedHeaders, redirect: 'follow' });
    }
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('behandelt 404 der Registry weiterhin als freie Domain ohne Warnung', async () => {
    // Über rdap.org kommt der 404 der Registry erst nach einer Weiterleitung.
    fetchMock.mockImplementation(async () => notFound({ redirected: true }));
    const report = await checkDomainsAvailability('example');
    expect(report.results.every((result) => result.status === 'available')).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('meldet TLDs ohne RDAP-Dienst bei rdap.org als unklar statt frei', async () => {
    // rdap.org antwortet für .io direkt mit 404 („No RDAP service is available“).
    fetchMock.mockImplementation(async () => notFound({ redirected: false }));
    const report = await checkDomainsAvailability('example');
    const byDomain = Object.fromEntries(report.results.map((result) => [result.domain, result.status]));
    expect(byDomain).toMatchObject({
      'example.io': 'unknown',
      'example.com': 'available',
      'example.de': 'available',
    });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([403, 500])('meldet HTTP %s als unklar und loggt den Status', async (status) => {
    fetchMock.mockImplementation(async () => new Response(null, { status }));
    const report = await checkDomainsAvailability('example');
    expect(report.results.every((result) => result.status === 'unknown')).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(report.results.length);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`HTTP ${status}`));
  });

  it('loggt Timeouts und liefert unklar', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(abortOnTimeout);
    const lookup = checkDomainsAvailability('example');
    await vi.advanceTimersByTimeAsync(6000);
    const report = await lookup;
    expect(report.results.every((result) => result.status === 'unknown')).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(report.results.length);
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
