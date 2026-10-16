import { describe, expect, it } from 'vitest';
import { checkSource, looksGerman, readCatalog } from './check-i18n.mjs';

/**
 * Das Prüfskript läuft in `npm run verify` — es darf nichts übersehen, was
 * offensichtlich deutsch ist, und nichts melden, was Code ist.
 */

const catalog = new Set(['Verfügbar', 'Warnungen']);
const check = (code) => checkSource('Test.tsx', code, catalog).map((problem) => problem.text);

describe('looksGerman', () => {
  it('erkennt Umlaute, typische Wörter und Endungen', () => {
    expect(looksGerman('Schließen')).toBe(true);
    expect(looksGerman('Keine Daten')).toBe(true);
    expect(looksGerman('Registrierung')).toBe(true);
    expect(looksGerman('Impressum')).toBe(true);
  });

  it('meldet weder Englisch noch Code', () => {
    for (const text of [
      'Show details for {ip}',
      'flex items-center gap-2',
      'diggy-language',
      'impressum',
      'datenschutz',
      '/datenschutz',
      '@/modules/impressum/ImpressumView',
      'de-DE',
      'Run Scan',
      'Health Score',
    ]) {
      expect(looksGerman(text), text).toBe(false);
    }
  });
});

describe('checkSource', () => {
  it('meldet deutschen JSX-Text und Attribute', () => {
    expect(check('const a = <p>Keine Daten</p>;')).toEqual(['Keine Daten']);
    expect(check('const a = <button aria-label="Menü öffnen" />;')).toEqual(['Menü öffnen']);
    expect(check('const a = <input placeholder={"Worum geht es?"} />;')).toEqual(['Worum geht es?']);
  });

  it('meldet deutsche Strings und Template-Strings im Code', () => {
    expect(check("const a = 'Nicht gefunden';")).toEqual(['Nicht gefunden']);
    expect(check('const a = `noch ${n} Tage`;')).toEqual(['noch … Tage']);
  });

  it('lässt übersetzte Texte und Schlüssel in Tabellen durch', () => {
    expect(check("const a = <p>{t('Keine Daten')}</p>;")).toEqual([]);
    expect(check("const a = i18n.t('Keine Daten', { count });")).toEqual([]);
    expect(check("const a = tRich('Details unter {link}.', { link });")).toEqual([]);
    expect(check("const STATUS = { available: { label: 'Verfügbar' } };")).toEqual([]);
    // Eigene Komponente, die selbst übersetzt — der Schlüssel steht im Katalog.
    expect(check('const a = <Stat label="Warnungen" />;')).toEqual([]);
  });

  it('meldet einen Schlüssel, der direkt im DOM landet', () => {
    expect(check('const a = <span title="Verfügbar" />;')).toEqual(['Verfügbar']);
  });

  it('lässt bewusst Deutsches stehen', () => {
    expect(check('const a = <section lang="de"><p>Angaben gemäß § 5 DDG</p></section>;')).toEqual([]);
    expect(check('// i18n-ignore-file: Rechtstext\nconst a = <p>Keine Daten</p>;')).toEqual([]);
    expect(check("console.error('[diggy] Wörterbuch nicht geladen:', error);")).toEqual([]);
  });

  it('merkt sich, welche Schlüssel vorkommen', () => {
    const used = new Set();
    checkSource('Test.tsx', "const a = t('Verfügbar');", catalog, used);
    expect([...used]).toEqual(['Verfügbar']);
  });
});

describe('readCatalog', () => {
  it('liest die Schlüssel aus de.ts samt importierter Typen und Mehrzahl', () => {
    const keys = readCatalog();
    expect(keys.has('Menü öffnen')).toBe(true);
    expect(keys.has('Hervorragend')).toBe(true); // aus Verdict in shared/scoring.ts
    expect(keys.has('{count} Tage')).toBe(true); // aus DE_PLURALS
    expect(keys.size).toBeGreaterThan(200);
  });
});
