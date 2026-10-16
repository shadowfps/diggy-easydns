import { describe, expect, it } from 'vitest';
import { UpstreamTimeoutError, upstreamErrorStatus } from './upstreamError.js';

describe('upstreamErrorStatus', () => {
  it('meldet einen Timeout als 504', () => {
    const abort = new DOMException('This operation was aborted', 'AbortError');
    expect(upstreamErrorStatus(new UpstreamTimeoutError('Timeout', { cause: abort }))).toBe(504);
  });

  it('meldet andere Fehler als 502', () => {
    expect(upstreamErrorStatus(new Error('VirusTotal Fehler: 500'))).toBe(502);
    expect(upstreamErrorStatus(new TypeError('fetch failed'))).toBe(502);
    expect(upstreamErrorStatus('kaputt')).toBe(502);
    expect(upstreamErrorStatus(undefined)).toBe(502);
  });

  /**
   * Früher entschied bei PageSpeed das Wort in der Meldung. Ein Fehlertext der
   * API selbst ist aber eine Antwort des Dienstes, kein Timeout bei uns.
   */
  it('entscheidet nicht anhand des Meldungstexts', () => {
    expect(upstreamErrorStatus(new Error('Lighthouse returned error: PROTOCOL_TIMEOUT'))).toBe(502);
  });
});
