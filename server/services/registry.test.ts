import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../lib/cache.js';
import { IANA_RDAP_BOOTSTRAP_URL, resetRdapBootstrap } from '../lib/rdapBootstrap.js';
import { queryPort43 } from '../lib/whoisPort43.js';
import { BOOTSTRAP_SAMPLE } from '../test/rdapBootstrap.js';
import { checkDomainsAvailability } from './domainAvailability.js';
import { FIXED_REGISTRIES, RDAP_ORG_BASE, resolveRegistry, type RegistryRoute } from './registry.js';
import { lookupWhois } from './whois.js';

// Port 43 nie ins Netz: Die Antworten kommen aus den Fixtures.
vi.mock('../lib/whoisPort43.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/whoisPort43.js')>()),
  queryPort43: vi.fn(),
}));

// Namensauflösung für Weiterleitungen ohne Bootstrap: feste Antworten.
const ADDRESSES: Record<string, string> = {
  'rdap.publicinterestregistry.org': '199.19.56.1',
  'internal.example.net': '10.0.0.5',
  'metadata.example.net': '169.254.169.254',
};
vi.mock('node:dns', async (importOriginal) => {
  const dns = await importOriginal<typeof import('node:dns')>();
  const lookup = vi.fn(async (host: string) => {
    if (!(host in ADDRESSES)) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
    return [{ address: ADDRESSES[host], family: 4 }];
  });
  return { ...dns, promises: { ...dns.promises, lookup } };
});

const fetchMock = vi.fn<typeof fetch>();
const port43Mock = vi.mocked(queryPort43);
const FIXTURES = new URL('../test/fixtures/whois/', import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');

let bootstrapResponse: () => Response;
let registryResponse: (url: string) => Response;

beforeEach(() => {
  clearCache();
  resetRdapBootstrap();
  bootstrapResponse = () => Response.json(BOOTSTRAP_SAMPLE);
  registryResponse = () => {
    throw new Error('keine Registry-Antwort im Test vorgesehen');
  };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) =>
    String(input) === IANA_RDAP_BOOTSTRAP_URL ? bootstrapResponse() : registryResponse(String(input))
  );
  port43Mock.mockReset();
  port43Mock.mockRejectedValue(new Error('kein Port 43 im Test vorgesehen'));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const registryCalls = () => fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url !== IANA_RDAP_BOOTSTRAP_URL);

/** Kurzform einer Route für Vergleiche. */
function describeRoute(route: RegistryRoute): string[] | string {
  if (route.kind !== 'query') return route.kind === 'web-only' ? `web-only ${route.url}` : 'none';
  return route.steps.map((step) => (step.kind === 'rdap' ? step.url : `port43 ${step.host}`));
}

describe('resolveRegistry', () => {
  it.each([
    ['example.com', ['https://rdap.verisign.com/com/v1/domain/example.com']],
    ['google.dev', ['https://pubapi.registry.google/rdap/domain/google.dev']],
    // Longest-Match über die Labels; bbc.co.uk steht unter „uk“.
    ['bbc.co.uk', ['https://rdap.nominet.uk/uk/domain/bbc.co.uk']],
    ['Example.ORG.', ['https://rdap.publicinterestregistry.org/rdap/domain/example.org']],
    ['denic.de', ['https://rdap.denic.de/domain/denic.de']],
    ['github.io', ['https://rdap.identitydigital.services/rdap/domain/github.io', 'port43 whois.nic.io']],
    ['orf.at', ['port43 whois.nic.at']],
    ['repubblica.it', ['port43 whois.nic.it']],
    ['europa.eu', ['port43 whois.eu']],
    ['switch.ch', 'web-only https://www.nic.ch/whois/'],
    // Kein Bootstrap-Eintrag, keine feste Registry: keine Abfrage.
    ['google.co', 'none'],
  ])('%s → %j', async (domain, expected) => {
    expect(describeRoute(await resolveRegistry(domain))).toEqual(expected);
  });

  it('nimmt einen Bootstrap-Eintrag vor einer festen Registry', async () => {
    bootstrapResponse = () =>
      Response.json({ services: [...BOOTSTRAP_SAMPLE.services, [['io'], ['https://rdap.nic.io/']]] });
    expect(describeRoute(await resolveRegistry('github.io'))).toEqual(['https://rdap.nic.io/domain/github.io']);
  });

  it('fragt ohne Bootstrap rdap.org, für .com/.net Verisign und behält die festen Registries', async () => {
    bootstrapResponse = () => new Response(null, { status: 503 });
    expect(describeRoute(await resolveRegistry('example.org'))).toEqual(['https://rdap.org/domain/example.org']);
    expect(describeRoute(await resolveRegistry('google.co'))).toEqual(['https://rdap.org/domain/google.co']);
    expect(describeRoute(await resolveRegistry('example.net'))).toEqual(['https://rdap.verisign.com/net/v1/domain/example.net']);
    expect(describeRoute(await resolveRegistry('denic.de'))).toEqual(['https://rdap.denic.de/domain/denic.de']);
    expect(describeRoute(await resolveRegistry('orf.at'))).toEqual(['port43 whois.nic.at']);
    expect(describeRoute(await resolveRegistry('switch.ch'))).toBe('web-only https://www.nic.ch/whois/');
    const route = await resolveRegistry('example.org');
    expect(route.kind === 'query' && route.steps[0]).toMatchObject({ viaRdapOrg: true, source: 'rdap.org' });
    // Der Bootstrap wird während der Sperre nicht erneut geladen.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('erlaubt Weiterleitungen nur zu Hosts aus dem Bootstrap und zu festen Registries', async () => {
    const route = await resolveRegistry('example.com');
    if (route.kind !== 'query') throw new Error('erwartet: query');
    expect(route.allowHost('rdap.verisign.com')).toBe(true);
    expect(route.allowHost('rdap.nominet.uk')).toBe(true);
    expect(route.allowHost('rdap.denic.de')).toBe(true);
    expect(route.allowHost('rdap.org')).toBe(false);
    expect(route.allowHost('169.254.169.254')).toBe(false);
    expect(route.allowHost('localhost')).toBe(false);
  });

  it('erlaubt ohne Bootstrap nur Namen mit öffentlichen Adressen auf dem Standard-Port', async () => {
    bootstrapResponse = () => new Response(null, { status: 503 });
    const route = await resolveRegistry('example.org');
    if (route.kind !== 'query') throw new Error('erwartet: query');
    // Die festen Registries und was rdap.org für .org nennt.
    expect(await route.allowHost('rdap.verisign.com')).toBe(true);
    expect(await route.allowHost('rdap.publicinterestregistry.org')).toBe(true);
    // IP-Literale, interne Namen, nicht auflösbare Namen.
    for (const host of ['169.254.169.254', '127.0.0.1', '[::1]', 'localhost', 'internal.example.net', 'metadata.example.net', 'nicht-da.example.net']) {
      expect(await route.allowHost(host), host).toBe(false);
    }

    // Auch über fetchRdap: Weiterleitungen von rdap.org auf interne Ziele laufen nicht.
    for (const location of [
      'https://169.254.169.254/latest/meta-data/',
      'https://internal.example.net/admin',
      'https://rdap.publicinterestregistry.org:8443/admin',
    ]) {
      fetchMock.mockClear();
      registryResponse = (url) =>
        url.startsWith(RDAP_ORG_BASE)
          ? new Response(null, { status: 302, headers: { location } })
          : Response.json({ objectClassName: 'domain' });
      clearCache();
      expect(await lookupWhois('example.org'), location).toBeNull();
      expect(registryCalls(), location).toEqual(['https://rdap.org/domain/example.org']);
    }
  });

  it.each([
    '',
    'localhost',
    'example',
    'a..b.com',
    '-x.com',
    'ex ample.com',
    'example.com/../admin',
    'example.com\r\nhelp',
    '_dmarc.example.com',
    'user@example.com',
    'example.com:8080',
    `${'a'.repeat(64)}.com`,
  ])('fragt für %j niemanden', async (domain) => {
    expect(await resolveRegistry(domain)).toEqual({ kind: 'none' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('kennt für jede feste Registry eine https-URL oder einen WHOIS-Server', () => {
    for (const [tld, registry] of Object.entries(FIXED_REGISTRIES)) {
      expect(registry.rdap ?? registry.whois, tld).toBeDefined();
      if (registry.rdap) expect(registry.rdap, tld).toMatch(/^https:\/\/[^/]+\/(?:.*\/)?$/);
    }
    expect(RDAP_ORG_BASE).toBe('https://rdap.org/');
  });
});

describe('WHOIS über die festen Registries', () => {
  it('.io: RDAP bei Identity Digital', async () => {
    registryResponse = () =>
      Response.json({
        objectClassName: 'domain',
        events: [
          { eventAction: 'expiration', eventDate: '2027-03-08T19:12:48Z' },
          { eventAction: 'registration', eventDate: '2013-03-08T19:12:48Z' },
        ],
        status: ['client transfer prohibited'],
        secureDNS: { delegationSigned: false },
      });
    expect(await lookupWhois('github.io')).toMatchObject({
      domain: 'github.io',
      createdAt: '2013-03-08T19:12:48Z',
      expiresAt: '2027-03-08T19:12:48Z',
      source: 'rdap.identitydigital.services',
    });
    expect(port43Mock).not.toHaveBeenCalled();
  });

  it('.io: WHOIS als Rückfall, wenn RDAP scheitert', async () => {
    registryResponse = () => new Response(null, { status: 503 });
    port43Mock.mockResolvedValue(fixture('io-found.txt'));

    expect(await lookupWhois('github.io')).toEqual({
      domain: 'github.io',
      registrar: 'MarkMonitor Inc.',
      createdAt: '2013-03-08T19:12:48.000Z',
      expiresAt: '2027-03-08T19:12:48.000Z',
      updatedAt: '2026-08-12T09:08:04.000Z',
      nameServers: ['ns-692.awsdns-22.net', 'ns-1622.awsdns-10.co.uk', 'dns1.p05.nsone.net', 'dns2.p05.nsone.net', 'dns3.p05.nsone.net'],
      status: ['clientDeleteProhibited', 'clientTransferProhibited', 'clientUpdateProhibited'],
      dnssecDelegated: false,
      source: 'whois.nic.io',
    });
    expect(port43Mock).toHaveBeenCalledExactlyOnceWith('whois.nic.io', 'github.io', { timeoutMs: 5000 });
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      '[rdap] https://rdap.identitydigital.services/rdap/domain/github.io: HTTP 503'
    );
  });

  it('.io: ein 404 bei RDAP ist endgültig, kein WHOIS-Rückfall', async () => {
    registryResponse = () => new Response(null, { status: 404 });
    expect(await lookupWhois('diggy-frei-1.io')).toBeNull();
    expect(port43Mock).not.toHaveBeenCalled();
  });

  it.each([
    ['orf.at', 'whois.nic.at', 'at-found.txt', { registrar: 'APA-IT Informations Technologie GmbH', createdAt: '2000-08-25T18:31:02.000Z' }],
    ['repubblica.it', 'whois.nic.it', 'it-found.txt', { registrar: 'Gandi SAS', expiresAt: '2027-01-15T23:00:00.000Z', status: ['ok'] }],
    ['europa.eu', 'whois.eu', 'eu-found.txt', { registrar: 'ClearMedia NV', dnssecDelegated: undefined }],
  ])('%s: WHOIS über Port 43 bei %s', async (domain, host, file, expected) => {
    port43Mock.mockResolvedValue(fixture(file));
    expect(await lookupWhois(domain)).toMatchObject({ domain, source: host, ...expected });
    expect(port43Mock).toHaveBeenCalledExactlyOnceWith(host, domain, { timeoutMs: 5000 });
    expect(registryCalls()).toEqual([]);
  });

  it('meldet eine Sperre als Fehler im Log und liefert null', async () => {
    port43Mock.mockResolvedValue(fixture('ch-refused.txt'));
    expect(await lookupWhois('orf.at')).toBeNull();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[whois] whois.nic.at orf.at: abgelehnt („not permitted“)');
  });

  it('fragt für .ch und Endungen ohne bekannten Dienst niemanden', async () => {
    expect(await lookupWhois('switch.ch')).toBeNull();
    expect(await lookupWhois('google.co')).toBeNull();
    expect(registryCalls()).toEqual([]);
    expect(port43Mock).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('folgt keiner Weiterleitung einer Registry auf einen fremden Host', async () => {
    registryResponse = (url) =>
      url.startsWith('https://rdap.verisign.com/')
        ? new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data/' } })
        : Response.json({ objectClassName: 'domain' });
    expect(await lookupWhois('example.com')).toBeNull();
    expect(registryCalls()).toEqual(['https://rdap.verisign.com/com/v1/domain/example.com']);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      '[rdap] https://rdap.verisign.com/com/v1/domain/example.com: Weiterleitung auf 169.254.169.254 abgelehnt'
    );
  });
});

describe('Verfügbarkeit über die festen Registries', () => {
  const statusOf = async (query: string, domain: string) =>
    (await checkDomainsAvailability(query)).results.find((r) => r.domain === domain);

  it('.io: 404 bei Identity Digital heißt frei, 200 vergeben', async () => {
    registryResponse = (url) =>
      url.endsWith('/diggy-frei-1.io') ? new Response(null, { status: 404 }) : Response.json({ objectClassName: 'domain' });
    expect(await statusOf('diggy-frei-1', 'diggy-frei-1.io')).toEqual({
      domain: 'diggy-frei-1.io',
      status: 'available',
      source: 'rdap.identitydigital.services',
    });
    expect(await statusOf('github', 'github.io')).toEqual({
      domain: 'github.io',
      status: 'taken',
      source: 'rdap.identitydigital.services',
    });
    expect(port43Mock).not.toHaveBeenCalled();
  });

  it('.io: „Domain not found.“ von whois.nic.io heißt frei, wenn RDAP scheitert', async () => {
    registryResponse = (url) =>
      url.includes('identitydigital') ? new Response(null, { status: 503 }) : new Response(null, { status: 404 });
    port43Mock.mockResolvedValue(fixture('io-not-found.txt'));
    expect(await statusOf('diggy-frei-1', 'diggy-frei-1.io')).toEqual({
      domain: 'diggy-frei-1.io',
      status: 'available',
      source: 'whois.nic.io',
    });
    expect(port43Mock).toHaveBeenCalledExactlyOnceWith('whois.nic.io', 'diggy-frei-1.io', { timeoutMs: 6000 });
  });

  it('.io: eine Sperre bei whois.nic.io ist unklar, nicht frei', async () => {
    registryResponse = (url) =>
      url.includes('identitydigital') ? new Response(null, { status: 429 }) : new Response(null, { status: 404 });
    port43Mock.mockResolvedValue('WHOIS LIMIT EXCEEDED - SEE WWW.PIR.ORG/WHOIS FOR DETAILS\r\n');
    expect(await statusOf('diggy-frei-1', 'diggy-frei-1.io')).toEqual({
      domain: 'diggy-frei-1.io',
      status: 'unknown',
      source: 'whois.nic.io',
    });
  });

  it.each([
    ['diggy-frei-1.at', 'at-not-found.txt', 'available'],
    ['repubblica.it', 'it-found.txt', 'taken'],
    ['diggy-frei-1.eu', 'eu-not-found.txt', 'available'],
  ])('eingegebene Domain %s über Port 43: %s → %s', async (domain, file, status) => {
    registryResponse = () => new Response(null, { status: 404 });
    // Die Fixtures nennen die Domain, für die sie abgefragt wurden.
    port43Mock.mockImplementation(async (_host, query) =>
      fixture(file).replaceAll(/diggy-frei-8317465|repubblica/g, query.split('.')[0])
    );
    expect(await statusOf(domain, domain)).toMatchObject({ status });
  });

  it('eine Sperre neben „nicht gefunden“ ist unklar, nicht frei', async () => {
    registryResponse = () => new Response(null, { status: 404 });
    port43Mock.mockResolvedValue('% Quota exceeded\n% nothing found\n');
    expect(await statusOf('diggy-frei-1.at', 'diggy-frei-1.at')).toEqual({
      domain: 'diggy-frei-1.at',
      status: 'unknown',
      source: 'whois.nic.at',
    });
    expect(console.warn).toHaveBeenCalledWith('[whois] whois.nic.at diggy-frei-1.at: abgelehnt („exceeded“)');
  });

  it('.ch: unklar, ohne zu fragen', async () => {
    registryResponse = () => new Response(null, { status: 404 });
    expect(await statusOf('switch.ch', 'switch.ch')).toEqual({ domain: 'switch.ch', status: 'unknown' });
    expect(port43Mock).not.toHaveBeenCalled();
    expect(registryCalls().some((url) => url.includes('switch.ch'))).toBe(false);
  });
});

describe('Datenschutzhinweise', () => {
  /**
   * Jede feste Registry bekommt die abgefragte Domain — sie gehört in die
   * Empfänger-Tabelle der Datenschutzhinweise und mit ihrem Endpunkt in
   * docs/COMPLIANCE.md (wie die DoH-Resolver, doh.test.ts).
   */
  it('nennen jede feste Registry mit Endpunkt in COMPLIANCE.md', () => {
    const privacy = readFileSync(new URL('../../src/modules/datenschutz/DatenschutzText.tsx', import.meta.url), 'utf8');
    const compliance = readFileSync(new URL('../../docs/COMPLIANCE.md', import.meta.url), 'utf8');
    for (const [tld, registry] of Object.entries(FIXED_REGISTRIES)) {
      const name = registry.operator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // WHOIS-Report und Verfügbarkeits-Check teilen sich resolveRegistry:
      // Wer für das eine gefragt wird, wird es auch für das andere.
      expect(privacy, tld).toMatch(
        new RegExp(`<Row service="(?:[^"]*\\W)?${name}\\b[^"]*" purpose="[^"]*WHOIS[^"]*Verfügbarkeits-Check`)
      );
      if (registry.rdap) expect(compliance, tld).toContain(registry.rdap);
      if (registry.whois) expect(compliance, tld).toContain(registry.whois.host);
    }
    expect(privacy).toMatch(/<Row service="rdap\.org" purpose="[^"]*nur[^"]*"/);
  });

  /**
   * Über Port 43 regeln die Bedingungen der Registry auch, ob die Daten
   * angezeigt oder gespeichert werden dürfen — das muss der Betreiber
   * bewerten. COMPLIANCE.md fasst sie je Registry zusammen.
   */
  it('nennen in COMPLIANCE.md die Nutzungsbedingungen jeder Registry, die über Port 43 gefragt wird', () => {
    const compliance = readFileSync(new URL('../../docs/COMPLIANCE.md', import.meta.url), 'utf8');
    for (const [tld, registry] of Object.entries(FIXED_REGISTRIES)) {
      if (!registry.whois) continue;
      expect(compliance, tld).toContain(`- **${registry.operator}:**`);
    }
  });
});
