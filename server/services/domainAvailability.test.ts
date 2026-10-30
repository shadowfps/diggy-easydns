import { describe, expect, it } from 'vitest';
import {
  availabilityStatusLabel,
  buildDomainCandidates,
  buildNameVariants,
  isValidDomainLabel,
  parseDomainQuery,
  shouldSuggestVariants,
} from './domainAvailability.js';
import type { DomainAvailabilityStatus } from '../types.js';

describe('isValidDomainLabel', () => {
  it('akzeptiert gültige Labels', () => {
    for (const label of ['meinprojekt', 'a', 'a-b-c', 'x1', '1x']) {
      expect(isValidDomainLabel(label), label).toBe(true);
    }
  });

  it('lehnt ungültige Labels ab', () => {
    for (const label of ['-start', 'ende-', 'mit punkt.', 'ümlaut', '', 'a'.repeat(64)]) {
      expect(isValidDomainLabel(label), JSON.stringify(label)).toBe(false);
    }
  });
});

describe('parseDomainQuery', () => {
  it('nimmt ein blankes Label', () => {
    expect(parseDomainQuery('meinprojekt')).toEqual({ label: 'meinprojekt' });
  });

  it('zerlegt label.tld', () => {
    expect(parseDomainQuery('meinprojekt.de')).toEqual({
      label: 'meinprojekt',
      inputDomain: 'meinprojekt.de',
    });
  });

  it('behandelt www.label.tld', () => {
    expect(parseDomainQuery('www.meinprojekt.de')).toEqual({
      label: 'meinprojekt',
      inputDomain: 'meinprojekt.de',
    });
  });

  it('normalisiert Protokoll, Pfad, Großschreibung und Trailing Dot', () => {
    expect(parseDomainQuery('https://MeinProjekt.de/pfad')).toEqual({
      label: 'meinprojekt',
      inputDomain: 'meinprojekt.de',
    });
    expect(parseDomainQuery('meinprojekt.de.')).toEqual({
      label: 'meinprojekt',
      inputDomain: 'meinprojekt.de',
    });
  });

  it('lehnt leere und ungültige Eingaben mit Meldung ab', () => {
    expect(() => parseDomainQuery('')).toThrow('Bitte einen Domain-Namen eingeben');
    expect(() => parseDomainQuery('   ')).toThrow('Bitte einen Domain-Namen eingeben');
    expect(() => parseDomainQuery('ümlaut.de')).toThrow('ungültige Zeichen');
    expect(() => parseDomainQuery('a.b.c.d')).toThrow('nur einen Domain-Namen');
  });
});

describe('buildDomainCandidates', () => {
  it('stellt die eingegebene Domain nach vorne', () => {
    const candidates = buildDomainCandidates('meinprojekt', 'meinprojekt.de');
    expect(candidates[0]).toBe('meinprojekt.de');
  });

  it('erzeugt keine Duplikate und bleibt bei maximal 10', () => {
    const candidates = buildDomainCandidates('meinprojekt', 'meinprojekt.de');
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(candidates.length).toBeLessThanOrEqual(10);
  });

  it('funktioniert auch ohne eingegebene Domain', () => {
    const candidates = buildDomainCandidates('meinprojekt');
    expect(candidates).toContain('meinprojekt.de');
    expect(candidates).toContain('meinprojekt.com');
  });

  // #147: `my<name>.com` stand bei jeder Suche an zweiter Stelle.
  it('schlägt ohne Anlass keine Abwandlung des Namens vor', () => {
    expect(buildDomainCandidates('meinprojekt', 'meinprojekt.de').every((d) => d.startsWith('meinprojekt.'))).toBe(true);
  });
});

describe('Abwandlungen des Namens (#147)', () => {
  const result = (domain: string, status: DomainAvailabilityStatus) => ({ domain, status });

  it('nur, wenn der Name auf .com und .de vergeben ist', () => {
    const taken = [result('covern.com', 'taken'), result('covern.de', 'taken'), result('covern.io', 'available')];
    expect(shouldSuggestVariants('covern', taken)).toBe(true);
    expect(shouldSuggestVariants('covern', [result('covern.com', 'taken'), result('covern.de', 'available')])).toBe(false);
    // Unklar heißt: Der Name könnte selbst noch frei sein.
    expect(shouldSuggestVariants('covern', [result('covern.com', 'taken'), result('covern.de', 'unknown')])).toBe(false);
  });

  it('liefert zwei .com-Varianten, für denselben Namen immer dieselben', () => {
    const variants = buildNameVariants('covern');
    expect(variants).toHaveLength(2);
    expect(variants.every((d) => d.endsWith('.com') && d.includes('covern'))).toBe(true);
    expect(buildNameVariants('covern')).toEqual(variants);
  });

  it('wechselt die Abwandlungen je Name statt immer „my“', () => {
    const names = ['covern', 'tekknine', 'mittwald', 'diggy', 'example'];
    const patterns = new Set(names.flatMap((name) => buildNameVariants(name).map((d) => d.replace(name, '*'))));
    expect(patterns.size).toBeGreaterThan(2);
  });

  it('lässt Varianten weg, die als Label zu lang wären', () => {
    const long = 'a'.repeat(61);
    expect(buildNameVariants(long).every((d) => d.split('.')[0].length <= 63)).toBe(true);
  });
});

describe('availabilityStatusLabel', () => {
  /**
   * Prüft Vollständigkeit, nicht nur die Mapping-Einträge: kommt ein neuer
   * Status in den Union-Typ, fällt hier auf, wenn er keine eigene Beschriftung
   * hat und stillschweigend als "Unklar" durchgeht.
   */
  it('hat für jeden Status eine eigene, nicht-leere Beschriftung', () => {
    const statuses: DomainAvailabilityStatus[] = ['available', 'taken', 'unknown'];
    const labels = statuses.map(availabilityStatusLabel);

    expect(labels.every((label) => label.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(statuses.length);
    expect(availabilityStatusLabel('available')).toBe('Verfügbar');
    expect(availabilityStatusLabel('taken')).toBe('Vergeben');
  });
});
