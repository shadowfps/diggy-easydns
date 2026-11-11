import { describe, expect, it, vi } from 'vitest';

/**
 * „Gibt es nicht“ oder „hat nichts“ (#151)?
 *
 * node:dns meldet NXDOMAIN als ENOTFOUND, einen existierenden Namen ohne den
 * Typ als ENODATA — live nachgemessen: eine nicht registrierte .de-Domain
 * liefert für jeden Typ ENOTFOUND, `nicht-da.example.com` für jeden ENODATA.
 */

const dnsError = (code: string) => Object.assign(new Error(code), { code });

/** Fehler je Name, für alle Typen gleich — bis auf MX bei `langsam.example`. */
const ERRORS: Record<string, string> = {
  'gibt-es-nicht.example': 'ENOTFOUND',
  'leer.example': 'ENODATA',
  'langsam.example': 'ENOTFOUND',
};

vi.mock('node:dns', () => {
  const fail = async (name: string) => {
    throw dnsError(ERRORS[name]);
  };
  class Resolver {
    setServers() {}
    resolve4 = fail;
    resolve6 = fail;
    // Ein Typ ohne Antwort: ob es den Namen gibt, ist dann offen.
    resolveMx = async (name: string) => {
      if (name === 'langsam.example') throw dnsError('ETIMEOUT');
      return fail(name);
    };
    resolveNs = fail;
    resolveTxt = fail;
    resolveCaa = fail;
    resolveSoa = fail;
    resolveCname = fail;
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
});
