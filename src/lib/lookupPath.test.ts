import { describe, expect, it } from 'vitest';
import {
  buildDocumentTitle,
  formatExportTimestamp,
  getDomainFromLookupPath,
  lookupPathFor,
  normalizeSearchDomain,
  sanitizeFilename,
  STATIC_ROUTES,
} from './lookupPath';

describe('getDomainFromLookupPath', () => {
  it('liest die Domain aus einem Permalink', () => {
    expect(getDomainFromLookupPath('/lookup/example.com')).toBe('example.com');
    expect(getDomainFromLookupPath('/lookup/example.com/')).toBe('example.com');
    expect(getDomainFromLookupPath('/LOOKUP/Example.COM')).toBe('example.com');
  });

  it('dekodiert IDN und Sonderzeichen', () => {
    expect(getDomainFromLookupPath('/lookup/m%C3%BCnster.de')).toBe('münster.de');
  });

  it('gibt null für Nicht-Lookup-Pfade zurück', () => {
    for (const path of ['/', '/history', '/about', '/lookup', '/lookup/', '/lookup/a/b']) {
      expect(getDomainFromLookupPath(path), path).toBeNull();
    }
  });

  it('gibt null bei kaputter Kodierung zurück statt zu werfen', () => {
    // decodeURIComponent wirft bei einem einzelnen %
    expect(getDomainFromLookupPath('/lookup/%')).toBeNull();
    expect(getDomainFromLookupPath('/lookup/%E0%A4%A')).toBeNull();
  });
});

describe('lookupPathFor', () => {
  it('ist die Umkehrung von getDomainFromLookupPath', () => {
    for (const domain of ['example.com', 'www.example.co.uk', 'münster.de', '8.8.8.8']) {
      expect(getDomainFromLookupPath(lookupPathFor(domain)), domain).toBe(domain);
    }
  });

  it('kodiert Zeichen, die den Pfad sprengen würden', () => {
    expect(lookupPathFor('a/b')).toBe('/lookup/a%2Fb');
    expect(lookupPathFor('a?b')).toBe('/lookup/a%3Fb');
  });
});

describe('buildDocumentTitle', () => {
  it('nennt die Domain bei einem Lookup', () => {
    expect(buildDocumentTitle('lookup', 'example.com', null)).toBe('example.com — diggy');
  });

  it('nennt die IP bei einer IP-Abfrage', () => {
    expect(buildDocumentTitle('lookup', null, '8.8.8.8')).toBe('8.8.8.8 — diggy');
  });

  it('fällt auf den Standardtitel zurück', () => {
    expect(buildDocumentTitle('lookup', null, null)).toBe('diggy — DNS made friendly');
  });

  it('hat für jede statische Route einen eigenen Titel', () => {
    const titles = Object.values(STATIC_ROUTES)
      .filter((view): view is Exclude<NonNullable<typeof view>, 'lookup'> => !!view && view !== 'lookup')
      .map((view) => buildDocumentTitle(view, null, null));
    // Alle unterschiedlich — sonst wären offene Tabs wieder nicht zu trennen.
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.every((title) => title.endsWith(' — diggy'))).toBe(true);
  });
});

describe('normalizeSearchDomain', () => {
  it('trimmt, kleinschreibt und entfernt den Trailing Dot', () => {
    expect(normalizeSearchDomain('  Example.COM.  ')).toBe('example.com');
  });
});

describe('sanitizeFilename', () => {
  it('ersetzt alles, was kein Dateiname sein darf', () => {
    expect(sanitizeFilename('example.com')).toBe('example.com');
    expect(sanitizeFilename('münster.de')).toBe('m-nster.de');
    // Slashes werden ersetzt, führende Punkte entfernt — die Eingabe ist
    // ohnehin immer eine servergeprüfte Domain.
    expect(sanitizeFilename('../../etc/passwd')).toBe('etc-passwd');
    expect(sanitizeFilename('a b/c:d')).toBe('a-b-c-d');
  });

  it('lässt keine führenden oder abschließenden Bindestriche und Punkte stehen', () => {
    expect(sanitizeFilename('!!!abc!!!')).toBe('abc');
    expect(sanitizeFilename('...abc...')).toBe('abc');
    expect(sanitizeFilename('-.-abc-.-')).toBe('abc');
  });
});

describe('formatExportTimestamp', () => {
  it('macht aus einem ISO-Zeitstempel einen dateinamentauglichen String', () => {
    expect(formatExportTimestamp('2026-09-08T14:30:00.000Z')).toBe('2026-09-08T14-30-00-000Z');
  });

  it('fällt bei ungültiger Eingabe auf "report" zurück', () => {
    expect(formatExportTimestamp('kein datum')).toBe('report');
    expect(formatExportTimestamp('')).toBe('report');
  });
});
