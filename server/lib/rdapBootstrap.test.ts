import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOTSTRAP_TTL_MS,
  findRdapBase,
  getRdapBootstrap,
  IANA_RDAP_BOOTSTRAP_URL,
  parseRdapBootstrap,
  rdapDomainUrl,
  resetRdapBootstrap,
  RETRY_AFTER_MS,
} from './rdapBootstrap.js';

/** Aufbau wie data.iana.org/rdap/dns.json (RFC 9224), Einträge daraus gekürzt. */
const SAMPLE = {
  description: 'RDAP bootstrap file for Domain Name System registrations',
  publication: '2026-09-30T23:00:03Z',
  version: '1.0',
  services: [
    [['com'], ['https://rdap.verisign.com/com/v1/']],
    [['app', 'dev'], ['https://pubapi.registry.google/rdap/']],
    [['uk'], ['https://rdap.nominet.uk/uk/']],
    // Stand 30.9.2026 nur über http erreichbar.
    [['mg'], ['http://rdap.nic.mg/']],
  ],
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetRdapBootstrap();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseRdapBootstrap', () => {
  it('übernimmt je Endung die erste https-URL', () => {
    const { services, hosts } = parseRdapBootstrap({
      services: [
        [['org'], ['http://rdap.example.org/', 'https://rdap.example.org/rdap/']],
        [['APP', 'Dev.'], ['https://pubapi.registry.google/rdap']],
      ],
    });
    expect(Object.fromEntries(services)).toEqual({
      org: 'https://rdap.example.org/rdap/',
      // Kleinschreibung, ohne Punkt am Ende, Pfad mit „/“ am Ende.
      app: 'https://pubapi.registry.google/rdap/',
      dev: 'https://pubapi.registry.google/rdap/',
    });
    expect([...hosts]).toEqual(['rdap.example.org', 'pubapi.registry.google']);
  });

  it('lässt Endungen ohne https-Dienst weg', () => {
    expect(parseRdapBootstrap(SAMPLE).services.has('mg')).toBe(false);
  });

  it.each([
    'http://rdap.example/',
    'ftp://rdap.example/',
    'https://user:pass@rdap.example/',
    'https://rdap.example/?redirect=http://intern/',
    'https://rdap.example/#x',
    'kein url',
  ])('verwirft die Basis-URL %s', (url) => {
    expect(() => parseRdapBootstrap({ services: [[['test'], [url]]] })).toThrow('keine Endung');
  });

  it('verwirft Endungen, die keine sind', () => {
    const { services } = parseRdapBootstrap({
      services: [[['ok', 'mit space', 'a/b', '', '-x', 'xn--p1ai', 'co.uk'], ['https://rdap.example/']]],
    });
    expect([...services.keys()]).toEqual(['ok', 'xn--p1ai', 'co.uk']);
  });

  it.each([null, {}, { services: 'x' }, { services: [] }, { services: [['com', 'https://x/']] }])(
    'wirft bei kaputter Datei %j',
    (data) => {
      expect(() => parseRdapBootstrap(data)).toThrow();
    }
  );
});

describe('findRdapBase', () => {
  const bootstrap = parseRdapBootstrap({
    services: [
      [['uk'], ['https://rdap.nominet.uk/uk/']],
      [['co.uk'], ['https://rdap.example-co-uk.test/']],
      [['com'], ['https://rdap.verisign.com/com/v1/']],
    ],
  });

  it('nimmt die längste passende Endung', () => {
    expect(findRdapBase(bootstrap, 'bbc.co.uk')).toBe('https://rdap.example-co-uk.test/');
    expect(findRdapBase(bootstrap, 'www.bbc.co.uk')).toBe('https://rdap.example-co-uk.test/');
    expect(findRdapBase(bootstrap, 'example.uk')).toBe('https://rdap.nominet.uk/uk/');
    expect(findRdapBase(bootstrap, 'Example.COM.')).toBe('https://rdap.verisign.com/com/v1/');
  });

  it('liefert nichts für Endungen ohne Eintrag und für die Endung selbst', () => {
    expect(findRdapBase(bootstrap, 'example.de')).toBeUndefined();
    expect(findRdapBase(bootstrap, 'com')).toBeUndefined();
  });
});

describe('rdapDomainUrl', () => {
  it('hängt die Domain kodiert an die Basis-URL', () => {
    expect(rdapDomainUrl('https://rdap.verisign.com/com/v1/', 'example.com')).toBe(
      'https://rdap.verisign.com/com/v1/domain/example.com'
    );
  });

  it.each([
    ['example.com/../../admin', 'https://rdap.example/rdap/domain/example.com%2F..%2F..%2Fadmin'],
    ['example.com?x=1#y', 'https://rdap.example/rdap/domain/example.com%3Fx%3D1%23y'],
    ['@evil.example', 'https://rdap.example/rdap/domain/%40evil.example'],
  ])('lässt %j weder Host noch Pfad ändern', (domain, url) => {
    expect(rdapDomainUrl('https://rdap.example/rdap/', domain)).toBe(url);
  });

  it('wirft, wenn Punkt-Segmente den Pfad verkürzen würden', () => {
    expect(() => rdapDomainUrl('https://rdap.example/rdap/', '..')).toThrow('ungültige RDAP-URL');
  });

  it('wirft für eine Basis-URL ohne https', () => {
    expect(() => rdapDomainUrl('http://rdap.example/', 'example.com')).toThrow('ungültige RDAP-URL');
  });
});

describe('getRdapBootstrap', () => {
  const ok = () => Response.json(SAMPLE);

  it('lädt die IANA-Datei ohne Weiterleitungen und behält sie 24 Stunden', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => ok());

    const first = await getRdapBootstrap();
    expect(first?.services.get('com')).toBe('https://rdap.verisign.com/com/v1/');
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      IANA_RDAP_BOOTSTRAP_URL,
      expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) })
    );

    vi.setSystemTime(Date.now() + BOOTSTRAP_TTL_MS - 1);
    expect(await getRdapBootstrap()).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 1);
    expect(await getRdapBootstrap()).not.toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('teilt einen Ladevorgang unter gleichzeitigen Abfragen', async () => {
    let release!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => (release = resolve)));

    const pending = Array.from({ length: 5 }, () => getRdapBootstrap());
    release(ok());
    const results = await Promise.all(pending);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBeDefined();
  });

  it('sperrt nach einem Fehler kurz und versucht es dann erneut', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));

    expect(await getRdapBootstrap()).toBeUndefined();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      `[rdap] ${IANA_RDAP_BOOTSTRAP_URL}: HTTP 503 — Rückfall auf rdap.org`
    );

    // Während der Sperre kein neuer Versuch.
    vi.setSystemTime(Date.now() + RETRY_AFTER_MS - 1);
    expect(await getRdapBootstrap()).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 1);
    fetchMock.mockResolvedValueOnce(ok());
    expect(await getRdapBootstrap()).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('behält eine geladene Liste, wenn die Aktualisierung scheitert', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(ok());
    const first = await getRdapBootstrap();

    vi.setSystemTime(Date.now() + BOOTSTRAP_TTL_MS);
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await getRdapBootstrap()).toBe(first);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      `[rdap] ${IANA_RDAP_BOOTSTRAP_URL}: fetch failed — bisherige Liste gilt weiter`
    );
    // Auch während der Sperre.
    expect(await getRdapBootstrap()).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['ungültiges JSON', () => new Response('<html>')],
    ['eine leere Liste', () => Response.json({ services: [] })],
  ])('gilt bei %s als Ladefehler', async (_name, response) => {
    fetchMock.mockImplementation(async () => response());
    expect(await getRdapBootstrap()).toBeUndefined();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('bricht nach 5 Sekunden ab', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = getRdapBootstrap();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(': Timeout — Rückfall auf rdap.org'));
    expect(vi.getTimerCount()).toBe(0);
  });
});
