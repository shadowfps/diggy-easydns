import { afterEach, describe, expect, it, vi } from 'vitest';
import { describePageSpeedError, lookupPageSpeed } from './pagespeed.js';
import {
  UpstreamQuotaError,
  UpstreamTargetError,
  UpstreamTimeoutError,
  upstreamErrorStatus,
} from '../lib/upstreamError.js';

/**
 * Zu #78: /api/pagespeed erkannte einen Timeout bisher am Wort „timeout“ in
 * der Meldung. Jetzt entscheidet wie bei VirusTotal die Fehlerklasse.
 */

/** fetch, das erst auf den Abbruch des Signals hin scheitert — wie das echte. */
function hangingFetch() {
  return vi.fn(
    (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('lookupPageSpeed — Fehler und HTTP-Status', () => {
  it('wirft bei einem Timeout UpstreamTimeoutError → 504', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());

    // 5 s ist das kleinste erlaubte Budget; Handler sofort anhängen, sonst gilt
    // die Ablehnung beim Vorspulen als unbehandelt.
    const pending = lookupPageSpeed('example.com', 'mobile', 5_000).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5_000);
    const error = await pending;

    expect(error).toBeInstanceOf(UpstreamTimeoutError);
    expect((error as Error).message).toMatch(/^PageSpeed Timeout nach 5s\./);
    expect(((error as Error).cause as Error).name).toBe('AbortError');
    expect(upstreamErrorStatus(error)).toBe(504);
    // #147: verständlich statt mit Hinweis auf die .env, die Sekunden für die englische Fassung.
    expect(describePageSpeedError(error)).toEqual({
      error: 'pagespeed_timeout',
      message: expect.stringMatching(/^Google braucht für die Analyse dieser Seite länger als 5 Sekunden\./),
      params: { seconds: 5 },
    });
  });

  // #147: mittwald.de braucht mobil 77 s — mehr als 95 s käme hinter Cloudflare (100 s) nie an.
  it('wartet höchstens 95 s, auch wenn mehr verlangt ist', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());

    const pending = lookupPageSpeed('example.com', 'mobile', 300_000).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(94_000);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toBeInstanceOf(UpstreamTimeoutError);
  });

  /**
   * Die API hat geantwortet, nur eben mit einem Fehler. Dass „TIMEOUT“ im Text
   * steht, macht daraus keinen Timeout bei uns — früher wurde das ein 504.
   */
  it('meldet einen Fehler der API als 502, auch wenn „timeout“ im Text steht', async () => {
    const message = 'Internal error encountered (timeout).';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: { code: 500, message } }, { status: 500 }))
    );

    const error = await lookupPageSpeed('example.com', 'mobile', 5_000).catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(UpstreamTimeoutError);
    expect((error as Error).message).toBe(message);
    expect(upstreamErrorStatus(error)).toBe(502);
    expect(describePageSpeedError(error).error).toBe('pagespeed_failed');
  });

  /**
   * #147: Lighthouse kam an die Seite nicht heran — kein Timeout bei uns und
   * kein Fehler bei Google. 422 mit dem Grund; Cloudflare lässt 4xx durch.
   */
  it('meldet eine Seite, die Lighthouse nicht laden konnte, mit Grund als 422', async () => {
    const message = 'Lighthouse returned error: DNS_FAILURE. DNS servers could not resolve the provided domain.';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: { code: 400, message } }, { status: 400 }))
    );

    const error = await lookupPageSpeed('example.invalid', 'mobile', 5_000).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UpstreamTargetError);
    expect(upstreamErrorStatus(error)).toBe(422);
    expect(describePageSpeedError(error)).toEqual({
      error: 'pagespeed_unreachable',
      message: 'Google konnte die Seite nicht laden (DNS_FAILURE).',
      params: { reason: 'DNS_FAILURE' },
    });
  });

  it('meldet ein erschöpftes Kontingent als 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: { code: 429, message: 'Quota exceeded for quota metric' } }, { status: 429 })
      )
    );

    const error = await lookupPageSpeed('example.com', 'mobile', 5_000).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UpstreamQuotaError);
    expect(upstreamErrorStatus(error)).toBe(429);
    expect(describePageSpeedError(error).error).toBe('pagespeed_quota');
  });

  it('meldet einen Netzwerkfehler als 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );

    const error = await lookupPageSpeed('example.com', 'mobile', 5_000).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TypeError);
    expect(upstreamErrorStatus(error)).toBe(502);
  });
});
