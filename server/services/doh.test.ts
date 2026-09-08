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

  it('gibt unquotierte Eingaben unverändert zurück', () => {
    expect(parseDohTxt('kein-quoting')).toBe('kein-quoting');
  });

  it('kommt mit leeren Chunks klar', () => {
    expect(parseDohTxt('""')).toBe('');
  });
});
