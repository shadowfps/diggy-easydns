import type { Dictionary } from './de';

/**
 * Englisches Wörterbuch (#86).
 *
 * Eigener Chunk: `i18n/index.ts` lädt ihn per `import()` erst, wenn Englisch
 * gewählt ist — deutsche Besucher laden davon nichts.
 *
 * Schlüssel sind die deutschen Texte aus `de.ts`. Fehlt einer oder ist einer
 * zu viel, meldet das der Compiler. Platzhalter wie `{count}` müssen in beiden
 * Sprachen gleich heißen (geprüft in i18n.test.ts).
 *
 * Ton: wie das Deutsche — freundlich, knapp, „you“ statt Passiv. Fachbegriffe
 * (SPF, DKIM, DMARC, TTL, Records) bleiben stehen.
 */
const ui: Dictionary = {
  // ─── Header und Menü ─────────────────────────────────────────────────
  'Zur Startseite': 'Go to home page',
  'Menü öffnen': 'Open menu',
  'Menü schließen': 'Close menu',
  'Available Check': 'Availability check',
  Sprache: 'Language',
};

export interface EnglishPack {
  ui: Dictionary;
}

const pack: EnglishPack = { ui };

export default pack;
