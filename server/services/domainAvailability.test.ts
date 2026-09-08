import { describe, expect, it } from 'vitest';
import {
  availabilityStatusLabel,
  buildDomainCandidates,
  isValidDomainLabel,
  parseDomainQuery,
} from './domainAvailability.js';

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
});

describe('availabilityStatusLabel', () => {
  it('übersetzt alle Status', () => {
    expect(availabilityStatusLabel('available')).toBe('Verfügbar');
    expect(availabilityStatusLabel('taken')).toBe('Vergeben');
    expect(availabilityStatusLabel('unknown')).toBe('Unklar');
  });
});
