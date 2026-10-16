import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scanVirusTotal } from './virusscan.js';
import { UpstreamTimeoutError, upstreamErrorStatus } from '../lib/upstreamError.js';

/**
 * Regression für #78: ein Timeout landete als 502 statt 504, weil der Service
 * den AbortError in einen neuen Error verpackte und die Route nur auf
 * `name === 'AbortError'` schaute. Geprüft wird die Kette Service → Status,
 * die /api/virusscan nutzt.
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

beforeEach(() => {
  vi.stubEnv('VIRUS_TOTAL_API_KEY', 'test-key');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('scanVirusTotal — Fehler und HTTP-Status', () => {
  it('wirft bei einem Timeout UpstreamTimeoutError → 504', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());

    // Handler sofort anhängen, sonst gilt die Ablehnung beim Vorspulen als unbehandelt.
    const pending = scanVirusTotal('example.com').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    const error = await pending;

    expect(error).toBeInstanceOf(UpstreamTimeoutError);
    expect((error as Error).message).toBe('VirusTotal Timeout — bitte erneut versuchen.');
    expect(((error as Error).cause as Error).name).toBe('AbortError');
    expect(upstreamErrorStatus(error)).toBe(504);
  });

  it('meldet einen Fehler der API als 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: { code: 'ServerError' } }, { status: 500 }))
    );

    const error = await scanVirusTotal('example.com').catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(UpstreamTimeoutError);
    expect((error as Error).message).toBe('VirusTotal Fehler: ServerError');
    expect(upstreamErrorStatus(error)).toBe(502);
  });

  it('meldet einen Netzwerkfehler als 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );

    const error = await scanVirusTotal('example.com').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TypeError);
    expect(upstreamErrorStatus(error)).toBe(502);
  });
});
