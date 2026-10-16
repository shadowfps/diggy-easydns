import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupPageSpeed } from './pagespeed.js';
import { UpstreamTimeoutError, upstreamErrorStatus } from '../lib/upstreamError.js';

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
  });

  /**
   * Die API hat geantwortet, nur eben mit einem Fehler. Dass „TIMEOUT“ im Text
   * steht, macht daraus keinen Timeout bei uns — früher wurde das ein 504.
   */
  it('meldet einen Fehler der API als 502, auch wenn „timeout“ im Text steht', async () => {
    const message = 'Lighthouse returned error: PROTOCOL_TIMEOUT';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: { code: 500, message } }, { status: 500 }))
    );

    const error = await lookupPageSpeed('example.com', 'mobile', 5_000).catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(UpstreamTimeoutError);
    expect((error as Error).message).toBe(message);
    expect(upstreamErrorStatus(error)).toBe(502);
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
