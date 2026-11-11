import { describe, expect, it, vi } from 'vitest';

/**
 * „Gibt es nicht“ oder „hat nichts“ (#151)?
 *
 * node:dns meldet NXDOMAIN als ENOTFOUND, einen existierenden Namen ohne den
 * Typ als ENODATA — live nachgemessen: eine nicht registrierte .de-Domain
 * liefert für jeden Typ ENOTFOUND, `nicht-da.example.com` für jeden ENODATA.
 */

const dnsError = (code: string) => Object.assign(new Error(code), { code });

type Method = 'resolve4' | 'resolve6' | 'resolveMx' | 'resolveNs' | 'resolveTxt' | 'resolveCaa' | 'resolveSoa' | 'resolveCname';

/** Fehler je Name, für alle Typen gleich — bis auf die Ausnahmen darunter. */
const ERRORS: Record<string, string> = {
  'gibt-es-nicht.example': 'ENOTFOUND',
  'leer.example': 'ENODATA',
  'langsam.example': 'ENOTFOUND',
  'cname-langsam.example': 'ENOTFOUND',
  'soa-kaputt.example': 'ENOTFOUND',
};
const EXCEPTIONS: Record<string, Partial<Record<Method, string>>> = {
  'langsam.example': { resolveMx: 'ETIMEOUT' },
  // Ein Alias, dessen Ziel fehlt: A & Co. melden NXDOMAIN fürs Ziel, nur die
  // CNAME-Abfrage wüsste es besser — und kam nicht an.
  'cname-langsam.example': { resolveCname: 'ETIMEOUT' },
  // EBADRESP gilt als erwartbar (SOA auf einem Alias), beweist aber nichts.
  'soa-kaputt.example': { resolveSoa: 'EBADRESP' },
};

vi.mock('node:dns', () => {
  const method = (name: Method) => async (domain: string) => {
    throw dnsError(EXCEPTIONS[domain]?.[name] ?? ERRORS[domain]);
  };
  class Resolver {
    setServers() {}
    resolve4 = method('resolve4');
    resolve6 = method('resolve6');
    resolveMx = method('resolveMx');
    resolveNs = method('resolveNs');
    resolveTxt = method('resolveTxt');
    resolveCaa = method('resolveCaa');
    resolveSoa = method('resolveSoa');
    resolveCname = method('resolveCname');
  }
  return { promises: { Resolver } };
});

vi.mock('./doh.js', () => ({
  DOH_RESOLVERS: [{ id: 'cloudflare' }, { id: 'google' }],
  dohQuery: vi.fn(),
}));

const { lookupStandardRecords } = await import('./dnsLookup.js');

describe('lookupStandardRecords — NXDOMAIN (#151)', () => {
  it('meldet einen Namen, den es nicht gibt', async () => {
    expect(await lookupStandardRecords('gibt-es-nicht.example')).toEqual({
      records: [],
      failedTypes: [],
      nxdomain: true,
    });
  });

  it('unterscheidet einen Namen ohne Records', async () => {
    expect(await lookupStandardRecords('leer.example')).toMatchObject({ records: [], nxdomain: false });
  });

  it('meldet NXDOMAIN nicht, wenn ein Typ keine Antwort bekam', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await lookupStandardRecords('langsam.example')).toEqual({
      records: [],
      failedTypes: ['MX'],
      nxdomain: false,
    });
  });

  it('meldet NXDOMAIN nicht, wenn die CNAME-Abfrage keine Antwort bekam — und nennt sie', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await lookupStandardRecords('cname-langsam.example')).toEqual({
      records: [],
      failedTypes: ['CNAME'],
      nxdomain: false,
    });
  });

  it('meldet NXDOMAIN nicht, wenn eine Antwort unbrauchbar war', async () => {
    expect(await lookupStandardRecords('soa-kaputt.example')).toEqual({
      records: [],
      failedTypes: [],
      nxdomain: false,
    });
  });
});
