import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRdap } from './rdap.js';

const fetchMock = vi.fn<typeof fetch>();
const signal = new AbortController().signal;
const allowHost = (host: string) => ['rdap.org', 'rdap.example', 'rdap2.example'].includes(host);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const redirect = (location: string | null, status = 302) =>
  new Response(null, { status, headers: location ? { location } : {} });

describe('fetchRdap', () => {
  it('folgt keiner Weiterleitung selbst, sondern prüft jede', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect('https://rdap.example/domain/example.org'))
      .mockResolvedValueOnce(Response.json({ objectClassName: 'domain' }));

    const result = await fetchRdap('https://rdap.org/domain/example.org', { signal, allowHost });
    expect(result).toMatchObject({ url: 'https://rdap.example/domain/example.org', redirected: true });
    expect(result.response.status).toBe(200);
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.redirect])).toEqual([
      ['https://rdap.org/domain/example.org', 'manual'],
      ['https://rdap.example/domain/example.org', 'manual'],
    ]);
  });

  it('löst relative Ziele gegen die aktuelle URL auf', async () => {
    fetchMock.mockResolvedValueOnce(redirect('/v2/domain/example.org', 301)).mockResolvedValueOnce(new Response(null, { status: 404 }));
    const result = await fetchRdap('https://rdap.example/domain/example.org', { signal, allowHost });
    expect(result).toMatchObject({ url: 'https://rdap.example/v2/domain/example.org', redirected: true });
    expect(result.response.status).toBe(404);
  });

  it('meldet ohne Weiterleitung redirected: false', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await fetchRdap('https://rdap.org/domain/example.io', { signal, allowHost })).toMatchObject({
      url: 'https://rdap.org/domain/example.io',
      redirected: false,
    });
  });

  it.each([
    ['http:', 'http://rdap.example/domain/example.org', 'Weiterleitung auf http://rdap.example abgelehnt'],
    ['fremden Host', 'https://169.254.169.254/latest/meta-data/', 'Weiterleitung auf 169.254.169.254 abgelehnt'],
    ['localhost', 'https://localhost:3002/api', 'Weiterleitung auf localhost abgelehnt'],
    ['Zugangsdaten', 'https://user:pw@rdap.example/', 'Weiterleitung auf https://rdap.example abgelehnt'],
  ])('lehnt eine Weiterleitung auf %s ab, ohne sie aufzurufen', async (_name, location, message) => {
    fetchMock.mockResolvedValueOnce(redirect(location));
    await expect(fetchRdap('https://rdap.org/domain/example.org', { signal, allowHost })).rejects.toThrow(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bricht nach drei Weiterleitungen ab', async () => {
    fetchMock.mockImplementation(async () => redirect('https://rdap2.example/loop'));
    await expect(fetchRdap('https://rdap.example/domain/x.org', { signal, allowHost })).rejects.toThrow(
      'zu viele Weiterleitungen'
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('wirft bei einer Weiterleitung ohne Ziel', async () => {
    fetchMock.mockResolvedValueOnce(redirect(null, 307));
    await expect(fetchRdap('https://rdap.example/domain/x.org', { signal, allowHost })).rejects.toThrow(
      'HTTP 307 ohne Ziel'
    );
  });
});
