import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registryWebLookup } from '../../shared/registryWebLookup.js';
import { clearCache } from '../lib/cache.js';
import { resetHostThrottles } from '../lib/hostThrottle.js';
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
  resetHostThrottles();
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
  vi.useRealTimers();
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
    ['europa.eu', ['port43 whois.eu']],
    // Nur Web-Abfrage: .ch sperrt, nic.at und Registro .it nur mit Genehmigung.
    ['switch.ch', 'web-only https://www.nic.ch/whois/'],
    ['orf.at', 'web-only https://www.nic.at/de/meine-at-domain/domain-suche/whois'],
    ['repubblica.it', 'web-only https://www.nic.it/en/find-your-it/web-whois'],
    // Kein Bootstrap-Eintrag, keine feste Registry: keine Abfrage.
    ['google.co', 'none'],
  ])('%s → %j', async (domain, expected) => {
    expect(describeRoute(await resolveRegistry(domain))).toEqual(expected);
  });

  it('fragt Endungen mit Web-Abfrage nie, auch nicht mit Bootstrap-Eintrag', async () => {
    bootstrapResponse = () =>
      Response.json({ services: [...BOOTSTRAP_SAMPLE.services, [['at', 'it'], ['https://rdap.example-at.test/']]] });
    expect(describeRoute(await resolveRegistry('orf.at'))).toBe('web-only https://www.nic.at/de/meine-at-domain/domain-suche/whois');
    expect(describeRoute(await resolveRegistry('repubblica.it'))).toBe('web-only https://www.nic.it/en/find-your-it/web-whois');
    // Dafür muss nicht einmal der Bootstrap geladen werden.
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(describeRoute(await resolveRegistry('europa.eu'))).toEqual(['port43 whois.eu']);
    expect(describeRoute(await resolveRegistry('orf.at'))).toBe('web-only https://www.nic.at/de/meine-at-domain/domain-suche/whois');
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

  it('europa.eu: WHOIS über Port 43 bei whois.eu', async () => {
    port43Mock.mockResolvedValue(fixture('eu-found.txt'));
    expect(await lookupWhois('europa.eu')).toMatchObject({
      domain: 'europa.eu',
      source: 'whois.eu',
      registrar: 'ClearMedia NV',
      dnssecDelegated: undefined,
    });
    expect(port43Mock).toHaveBeenCalledExactlyOnceWith('whois.eu', 'europa.eu', { timeoutMs: 5000 });
    expect(registryCalls()).toEqual([]);
  });

  it('meldet eine Sperre als Fehler im Log und liefert null', async () => {
    port43Mock.mockResolvedValue(fixture('ch-refused.txt'));
    expect(await lookupWhois('europa.eu')).toBeNull();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('[whois] whois.eu europa.eu: abgelehnt („not permitted“)');
  });

  it('fragt für .ch, .at, .it und Endungen ohne bekannten Dienst niemanden', async () => {
    expect(await lookupWhois('switch.ch')).toBeNull();
    expect(await lookupWhois('orf.at')).toBeNull();
    expect(await lookupWhois('repubblica.it')).toBeNull();
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
    ['diggy-frei-1.eu', 'eu-not-found.txt', 'available'],
    ['europa.eu', 'eu-found.txt', 'taken'],
  ])('eingegebene Domain %s über Port 43: %s → %s', async (domain, file, status) => {
    registryResponse = () => new Response(null, { status: 404 });
    // Die Fixtures nennen die Domain, für die sie abgefragt wurden.
    port43Mock.mockImplementation(async (_host, query) =>
      fixture(file).replaceAll(/diggy-frei-8317465|europa/g, query.split('.')[0])
    );
    expect(await statusOf(domain, domain)).toMatchObject({ status });
  });

  it('eine Sperre neben „nicht gefunden“ ist unklar, nicht frei', async () => {
    registryResponse = () => new Response(null, { status: 404 });
    port43Mock.mockResolvedValue('% Excessive querying\nDomain: diggy-frei-1.eu\nStatus: AVAILABLE\n');
    expect(await statusOf('diggy-frei-1.eu', 'diggy-frei-1.eu')).toEqual({
      domain: 'diggy-frei-1.eu',
      status: 'unknown',
      source: 'whois.eu',
    });
    expect(console.warn).toHaveBeenCalledWith('[whois] whois.eu diggy-frei-1.eu: abgelehnt („Excessive“)');
  });

  it.each(['switch.ch', 'orf.at', 'repubblica.it'])('%s: unklar, ohne zu fragen', async (domain) => {
    registryResponse = () => new Response(null, { status: 404 });
    expect(await statusOf(domain, domain)).toEqual({ domain, status: 'unknown' });
    expect(port43Mock).not.toHaveBeenCalled();
    expect(registryCalls().some((url) => url.includes(domain))).toBe(false);
  });
});

describe('Drosselung je Host', () => {
  /** WHOIS-Antworten, die erst kommen, wenn der Test sie freigibt. */
  function holdPort43() {
    const pending: (() => void)[] = [];
    port43Mock.mockImplementation(
      (_host, query) =>
        new Promise((resolve) => pending.push(() => resolve(`Domain: ${query}\nStatus: AVAILABLE\n`)))
    );
    return () => pending.splice(0).forEach((release) => release());
  }

  it('fasst gleichzeitige Abfragen derselben Domain zusammen', async () => {
    registryResponse = () => new Response(null, { status: 404 });
    const release = holdPort43();
    // Erst die Verfügbarkeit (6 s), dann der Report (5 s): Der Report hängt
    // sich an, weil die laufende Abfrage nicht vor seiner Frist aufgibt. In
    // umgekehrter Reihenfolge fragt die Verfügbarkeit selbst — sie soll nicht
    // das frühere Ende des Reports erben (hostThrottle.test.ts).
    const check = checkDomainsAvailability('diggy-frei-1.eu');
    await vi.waitFor(() => expect(port43Mock).toHaveBeenCalled());
    const report = lookupWhois('diggy-frei-1.eu');
    // Beide hängen an derselben Abfrage, bevor sie freigegeben wird.
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    expect(await report).toBeNull();
    expect((await check).results.find((r) => r.domain === 'diggy-frei-1.eu')).toMatchObject({ status: 'available' });
    expect(port43Mock).toHaveBeenCalledTimes(1);
  });

  it('fragt whois.eu höchstens zweimal gleichzeitig und meldet Überlauf als unklar, nie frei', async () => {
    vi.useFakeTimers();
    registryResponse = () => new Response(null, { status: 404 });
    const release = holdPort43();
    // 2 laufen, 6 warten.
    const reports = Array.from({ length: 8 }, (_, i) => lookupWhois(`diggy-${i}.eu`));
    await vi.advanceTimersByTimeAsync(0);
    expect(port43Mock).toHaveBeenCalledTimes(2);

    // Der neunte bekommt keinen Platz: sofort unklar statt frei.
    const overflow = await checkDomainsAvailability('diggy-8.eu');
    expect(overflow.results.find((r) => r.domain === 'diggy-8.eu')).toEqual({
      domain: 'diggy-8.eu',
      status: 'unknown',
      source: 'whois.eu',
    });
    expect(console.warn).toHaveBeenCalledWith('[whois] whois.eu diggy-8.eu: Drosselung: Warteschlange voll');

    // Freigeben, bis alle durch sind — 3/s braucht für 8 rund 2 s.
    for (let i = 0; i < 10; i += 1) {
      release();
      await vi.advanceTimersByTimeAsync(400);
    }
    const settled = await Promise.all(reports);
    // Freie Domains liefern im Report null; wer zu lange wartete, ebenso.
    expect(settled.every((r) => r === null)).toBe(true);
    expect(port43Mock.mock.calls.length).toBeLessThanOrEqual(8);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drosselt RDAP bei Identity Digital, nicht bei Verisign', async () => {
    const pending: (() => void)[] = [];
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === IANA_RDAP_BOOTSTRAP_URL) return bootstrapResponse();
      return new Promise((resolve) => pending.push(() => resolve(new Response(null, { status: 404 }))));
    });

    const io = ['a', 'b', 'c'].map((label) => lookupWhois(`${label}.io`));
    const com = ['a', 'b', 'c'].map((label) => lookupWhois(`${label}.com`));
    await vi.waitFor(() => expect(registryCalls()).toHaveLength(5));
    const hosts = registryCalls().map((url) => new URL(url).hostname);
    expect(hosts.filter((h) => h === 'rdap.identitydigital.services')).toHaveLength(2);
    expect(hosts.filter((h) => h === 'rdap.verisign.com')).toHaveLength(3);

    pending.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(registryCalls()).toHaveLength(6));
    pending.splice(0).forEach((release) => release());
    expect(await Promise.all([...io, ...com])).toEqual([null, null, null, null, null, null]);
  });

  it('drosselt ohne Bootstrap auch, was rdap.org zu Identity Digital weiterleitet', async () => {
    // .agency gehört zu Identity Digital; ohne Bootstrap kennt nur rdap.org
    // das Ziel (Befund aus dem Codex-Review der zweiten Runde).
    bootstrapResponse = () => new Response(null, { status: 503 });
    const pending: (() => void)[] = [];
    registryResponse = (url) =>
      url.startsWith(RDAP_ORG_BASE)
        ? new Response(null, {
            status: 302,
            headers: { location: `https://rdap.identitydigital.services/rdap/domain/${url.split('/').pop()}` },
          })
        : (new Promise((resolve) => pending.push(() => resolve(new Response(null, { status: 404 })))) as never);

    const lookups = ['a', 'b', 'c', 'd', 'e'].map((label) => lookupWhois(`${label}.agency`));
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Höchstens zwei gleichzeitig bei Identity Digital, wie bei direkten Abfragen.
    expect(registryCalls().filter((url) => url.includes('identitydigital'))).toHaveLength(2);

    while ((await Promise.race([Promise.all(lookups).then(() => true), new Promise((r) => setTimeout(r, 50, false))])) === false) {
      pending.splice(0).forEach((release) => release());
    }
    expect(await Promise.all(lookups)).toEqual([null, null, null, null, null]);
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
      // Abgeschaltet (nur Web-Abfrage): bekommt nichts, steht also auch
      // nicht als Empfänger da — erst nach dem Einschalten.
      if (registryWebLookup(`example.${tld}`)) {
        expect(privacy, tld).not.toMatch(new RegExp(`<Row service="[^"]*${name}`));
        continue;
      }
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
