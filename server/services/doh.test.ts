import { describe, expect, it } from 'vitest';
import { parseDohTxt } from './doh.js';

/**
 * DoH liefert TXT als '"chunk1" "chunk2"'. Der Zusammenbau muss stimmen, weil
 * SPF-, DMARC- und DKIM-Erkennung auf dem Ergebnis-String arbeiten.
 */
describe('parseDohTxt', () => {
  it('entfernt die umschließenden Anführungszeichen', () => {
    expect(parseDohTxt('"v=spf1 -all"')).toBe('v=spf1 -all');
  });

  it('fügt mehrere Chunks ohne Trennzeichen zusammen', () => {
    // 255-Byte-Grenze: lange DKIM-Keys kommen in Stücken.
    expect(parseDohTxt('"v=DKIM1; p=MIIB" "IjANBgkq"')).toBe('v=DKIM1; p=MIIBIjANBgkq');
  });

  it('behandelt escapte Anführungszeichen im Wert', () => {
    expect(parseDohTxt('"sagt \\"hallo\\""')).toBe('sagt "hallo"');
  });

  /**
   * #82: Google liefert den Wert so, wie er im Eintrag steht, die anderen
   * Resolver escaped. Beide müssen danach gleich sein — sonst meldet die
   * Propagation eine Abweichung, die es nicht gibt.
   */
  it('liefert für Google- und Cloudflare-Format denselben Wert', () => {
    const pairs: [google: string, cloudflare: string][] = [
      ['sagt "hallo"', '"sagt \\"hallo\\""'],
      // `\;` aus einer Zonendatei, versehentlich mit Backslash eingetragen.
      ['v=DKIM1\\; k=rsa\\; p=MIIB', '"v=DKIM1\\\\; k=rsa\\\\; p=MIIB"'],
    ];
    for (const [google, cloudflare] of pairs) {
      expect(parseDohTxt(google), google).toBe(parseDohTxt(cloudflare));
    }
  });

  /**
   * Der Fallback ist der Fall, der in der Praxis über Erfolg entscheidet:
   * Resolver liefern TXT nicht einheitlich quotiert. Wird ein unquotierter
   * Wert verschluckt, fehlt anschließend der SPF-/DMARC-Record.
   */
  it('gibt unquotierte Eingaben unverändert zurück', () => {
    for (const raw of [
      'kein-quoting',
      'v=spf1 include:_spf.google.com ~all',
      'v=DMARC1; p=reject; rua=mailto:x@example.com',
      'google-site-verification=abc123',
    ]) {
      expect(parseDohTxt(raw), raw).toBe(raw);
    }
  });

  it('behandelt Sonderfälle ohne zu werfen', () => {
    expect(parseDohTxt('""')).toBe('');
    expect(parseDohTxt('')).toBe('');
    // Halb offenes Quoting: kein Match, also unverändert durchreichen statt
    // einen Teilstring zu erfinden.
    expect(parseDohTxt('"unvollstaendig')).toBe('"unvollstaendig');
    // Quotes mitten im Wert, aber nicht als Chunk-Trenner.
    expect(parseDohTxt('"a" "" "b"')).toBe('ab');
  });
});
