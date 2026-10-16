import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectLanguage,
  format,
  formatDate,
  formatNumber,
  getLanguage,
  initLanguage,
  setLanguage,
  t,
  tRich,
} from '@/i18n';
import type { DeKey } from '@/i18n/de';
import { DE_PLURALS } from '@/i18n/de';
import english from '@/i18n/en';

/**
 * Das Übersetzungsmodul (#86): Platzhalter, Plural, Rückfall auf Deutsch,
 * Spracherkennung und Speichern der Wahl.
 */

function browserLanguages(...tags: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(tags);
}

afterEach(() => {
  window.localStorage.clear();
});

describe('format', () => {
  it('setzt Platzhalter ein', () => {
    expect(format('Geprüft am {date}', { date: '16.10.2026' })).toBe('Geprüft am 16.10.2026');
  });

  it('lässt einen fehlenden Platzhalter sichtbar stehen', () => {
    expect(format('Details zu {ip}', {})).toBe('Details zu {ip}');
  });

  it('wählt die Pluralform nach count', () => {
    const days = { one: 'noch {count} Tag', other: 'noch {count} Tage' };
    expect(format(days, { count: 1 })).toBe('noch 1 Tag');
    expect(format(days, { count: 0 })).toBe('noch 0 Tage');
    expect(format(days, { count: 12 })).toBe('noch 12 Tage');
  });

  it('schreibt Zahlen im Format der Sprache', async () => {
    expect(format('{count} Lookups', { count: 1234 })).toBe('1.234 Lookups');
    await setLanguage('en', { persist: false });
    expect(format('{count} lookups', { count: 1234 })).toBe('1,234 lookups');
  });
});

describe('t', () => {
  it('liefert auf Deutsch den Schlüssel selbst', () => {
    expect(t('Menü öffnen')).toBe('Menü öffnen');
  });

  it('übersetzt nach dem Wechsel auf Englisch', async () => {
    await setLanguage('en', { persist: false });
    expect(t('Menü öffnen')).toBe('Open menu');
  });

  it('fällt bei einem fehlenden Schlüssel auf den deutschen Text zurück', async () => {
    await setLanguage('en', { persist: false });
    // Am Compiler vorbei — genau den Fall soll die Laufzeit abfangen.
    expect(t('Gibt es nicht {x}' as DeKey, { x: 1 })).toBe('Gibt es nicht 1');
  });

  it('setzt Elemente über tRich ein', () => {
    const link = { type: 'a' };
    const parts = tRich('Gibt es {link} nicht' as DeKey, { link: link as never, count: 2 });
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('Gibt es ');
    expect(parts[2]).toBe(' nicht');
  });
});

describe('Englisches Wörterbuch', () => {
  /** `{name}`-Platzhalter, sortiert — Reihenfolge darf sich ändern. */
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it('benutzt dieselben Platzhalter wie der deutsche Text', () => {
    const plurals = DE_PLURALS as Record<string, string>;
    for (const [german, message] of Object.entries(english.ui)) {
      const forms = typeof message === 'string' ? [message] : [message.one, message.other];
      // Die Einzahl darf die Zahl weglassen („a day ago“), die Mehrzahl nicht.
      const expected = placeholders(german);
      expect(placeholders(forms[forms.length - 1]), german).toEqual(expected);
      for (const form of forms) {
        expect(
          placeholders(form).every((name) => expected.includes(name)),
          `${german} → ${form}`
        ).toBe(true);
      }
      if (plurals[german]) {
        expect(placeholders(plurals[german]), german).toEqual(expected);
      }
    }
  });

  it('hat keinen leeren Eintrag', () => {
    for (const [german, message] of Object.entries(english.ui)) {
      const forms = typeof message === 'string' ? [message] : [message.one, message.other];
      for (const form of forms) expect(form.trim(), german).not.toBe('');
    }
  });
});

describe('Spracherkennung', () => {
  it('nimmt Deutsch für jede deutsche Variante', () => {
    browserLanguages('de-AT', 'en');
    expect(detectLanguage()).toBe('de');
  });

  it('nimmt Englisch, wenn Englisch vor Deutsch steht', () => {
    browserLanguages('en-GB', 'de-DE');
    expect(detectLanguage()).toBe('en');
  });

  it('nimmt die erste unterstützte Sprache', () => {
    browserLanguages('fr-FR', 'de');
    expect(detectLanguage()).toBe('de');
  });

  it('fällt ohne unterstützte Sprache auf Englisch zurück', () => {
    browserLanguages('fr-FR', 'es');
    expect(detectLanguage()).toBe('en');
  });

  it('bevorzugt die gespeicherte Wahl vor dem Browser', () => {
    browserLanguages('en-US');
    window.localStorage.setItem('diggy-language', 'de');
    expect(detectLanguage()).toBe('de');
  });

  it('ignoriert einen kaputten gespeicherten Wert', () => {
    browserLanguages('de-DE');
    window.localStorage.setItem('diggy-language', 'klingonisch');
    expect(detectLanguage()).toBe('de');
  });

  it('übersteht einen werfenden Storage', () => {
    browserLanguages('de-DE');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(detectLanguage()).toBe('de');
  });
});

describe('Sprachwechsel', () => {
  it('speichert die Wahl und setzt <html lang>', async () => {
    await setLanguage('en');
    expect(getLanguage()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('diggy-language')).toBe('en');

    await setLanguage('de');
    expect(document.documentElement.lang).toBe('de');
    expect(window.localStorage.getItem('diggy-language')).toBe('de');
  });

  it('speichert die erkannte Sprache beim Start nicht', async () => {
    browserLanguages('en-US');
    const pending = initLanguage();
    expect(pending).not.toBeNull();
    await pending;
    expect(getLanguage()).toBe('en');
    expect(window.localStorage.getItem('diggy-language')).toBeNull();
  });

  it('rendert deutsche Besucher ohne Wartezeit', () => {
    browserLanguages('de-DE');
    expect(initLanguage()).toBeNull();
  });

  it('nimmt bei schnellem Hin und Her den letzten Klick', async () => {
    const toEnglish = setLanguage('en');
    const toGerman = setLanguage('de');
    await Promise.all([toEnglish, toGerman]);
    expect(getLanguage()).toBe('de');
  });
});

describe('Datum und Zahl', () => {
  it('formatiert in der aktiven Sprache', async () => {
    const date = '2026-10-16T12:00:00.000Z';
    expect(formatDate(date, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })).toBe(
      '16. Oktober 2026'
    );
    expect(formatNumber(1234.5)).toBe('1.234,5');

    await setLanguage('en', { persist: false });
    expect(formatDate(date, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })).toBe(
      'October 16, 2026'
    );
    expect(formatNumber(1234.5)).toBe('1,234.5');
  });

  it('zeigt ein ungültiges Datum wie bisher statt zu werfen', () => {
    expect(formatDate('kaputt')).toBe('Invalid Date');
  });
});
