import { describe, expect, it } from 'vitest';
import {
  compareDocumentTitle,
  comparePathFor,
  getComparePairFromPath,
} from './comparePath';

describe('getComparePairFromPath', () => {
  it('liest beide Domains', () => {
    expect(getComparePairFromPath('/compare/example.com/github.com')).toEqual({
      left: 'example.com',
      right: 'github.com',
    });
    expect(getComparePairFromPath('/compare/example.com/github.com/')).toEqual({
      left: 'example.com',
      right: 'github.com',
    });
  });

  it('erlaubt eine oder keine Domain', () => {
    expect(getComparePairFromPath('/compare')).toEqual({ left: '', right: '' });
    expect(getComparePairFromPath('/compare/')).toEqual({ left: '', right: '' });
    expect(getComparePairFromPath('/compare/example.com')).toEqual({
      left: 'example.com',
      right: '',
    });
  });

  it('normalisiert wie die Suche', () => {
    expect(getComparePairFromPath('/COMPARE/Example.COM./GitHub.com')).toEqual({
      left: 'example.com',
      right: 'github.com',
    });
  });

  it('dekodiert IDN und DNS-Einträge mit Unterstrich', () => {
    expect(getComparePairFromPath('/compare/m%C3%BCnster.de/_dmarc.example.com')).toEqual({
      left: 'münster.de',
      right: '_dmarc.example.com',
    });
  });

  it('rückt eine leere erste Domain nach', () => {
    expect(getComparePairFromPath('/compare/%20/github.com')).toEqual({
      left: 'github.com',
      right: '',
    });
  });

  it('gibt null für andere und überlange Pfade zurück', () => {
    for (const path of ['/', '/lookup/example.com', '/comparex', '/compare/a/b/c', '/compare//b']) {
      expect(getComparePairFromPath(path), path).toBeNull();
    }
  });

  it('gibt null bei kaputter Kodierung zurück statt zu werfen', () => {
    expect(getComparePairFromPath('/compare/%')).toBeNull();
    expect(getComparePairFromPath('/compare/example.com/%E0%A4%A')).toBeNull();
  });
});

describe('comparePathFor', () => {
  it('ist die Umkehrung von getComparePairFromPath', () => {
    const pairs = [
      { left: 'example.com', right: 'github.com' },
      { left: 'münster.de', right: 'www.münster.de' },
      { left: 'example.com', right: '' },
      { left: '', right: '' },
    ];
    for (const pair of pairs) {
      expect(getComparePairFromPath(comparePathFor(pair.left, pair.right))).toEqual(pair);
    }
  });

  it('kodiert Zeichen, die den Pfad sprengen würden', () => {
    expect(comparePathFor('a/b', 'c?d')).toBe('/compare/a%2Fb/c%3Fd');
  });

  it('lässt leere Teile weg und rückt die zweite Domain nach vorn', () => {
    expect(comparePathFor('', '')).toBe('/compare');
    expect(comparePathFor('Example.com ')).toBe('/compare/example.com');
    expect(comparePathFor('', 'github.com')).toBe('/compare/github.com');
  });
});

describe('compareDocumentTitle', () => {
  it('nennt beide Domains', () => {
    expect(compareDocumentTitle({ left: 'a.de', right: 'b.de' })).toBe('a.de vs. b.de — diggy');
  });

  it('nennt die eine Domain oder fällt auf den Seitennamen zurück', () => {
    expect(compareDocumentTitle({ left: 'a.de', right: '' })).toBe('a.de vergleichen — diggy');
    expect(compareDocumentTitle({ left: '', right: '' })).toBe('Vergleich — diggy');
  });
});
