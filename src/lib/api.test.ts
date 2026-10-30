import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, lookupPageSpeed } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

const respond = (response: Response) => vi.stubGlobal('fetch', vi.fn(async () => response));

describe('lookupPageSpeed — Fehler (#147)', () => {
  it('reicht die Meldung des Servers samt Code durch', async () => {
    respond(
      Response.json(
        { error: 'pagespeed_unreachable', message: 'Google konnte die Seite nicht laden (DNS_FAILURE).', params: { reason: 'DNS_FAILURE' } },
        { status: 422 }
      )
    );
    const error = await lookupPageSpeed('example.com').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('pagespeed_unreachable');
    expect((error as Error).message).toBe('Google konnte die Seite nicht laden (DNS_FAILURE).');
  });

  // Cloudflare ersetzt die 504 des Servers durch „error code: 504“ als Text.
  it('erkennt eine von Cloudflare ersetzte 504 als Zeitüberschreitung', async () => {
    respond(new Response('error code: 504', { status: 504, headers: { 'content-type': 'text/plain' } }));
    const error = await lookupPageSpeed('mittwald.de').catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/^Google braucht für die Analyse dieser Seite zu lange\./);
  });

  it('erkennt Cloudflares eigenen Abbruch nach 100 s (524) ebenso', async () => {
    respond(new Response('error code: 524', { status: 524 }));
    const error = await lookupPageSpeed('mittwald.de').catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/^Google braucht für die Analyse dieser Seite zu lange\./);
  });

  it('bleibt bei anderen Fehlerseiten bei der allgemeinen Meldung', async () => {
    respond(new Response('error code: 502', { status: 502 }));
    const error = await lookupPageSpeed('mittwald.de').catch((e: unknown) => e);
    expect((error as Error).message).toBe('PageSpeed fehlgeschlagen');
  });
});
