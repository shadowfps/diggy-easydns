/**
 * Deutsche Texte — die Quelle aller Übersetzungen (#86).
 *
 * Der deutsche Text ist zugleich der Schlüssel (warum: siehe i18n/index.ts).
 * Diese Datei legt fest, welche Schlüssel es gibt:
 *
 * - `DeText` zählt jeden Text auf, der durch `t()` läuft. Nur ein Typ — er
 *   kostet im Bundle nichts. `t('Tippfehler')` scheitert am Compiler, ebenso
 *   ein Eintrag hier, der in `en.ts` fehlt.
 * - `DE_PLURALS` hält die Texte mit Einzahl und Mehrzahl. Das ist das einzige
 *   Stück Wörterbuch, das wirklich ausgeliefert wird: die Einzahl braucht die
 *   Laufzeit, sie steht an keiner Aufrufstelle.
 *
 * Neuer Text: hier eintragen, in `en.ts` übersetzen, im Code `t('…')`.
 * Gleicher Text an zwei Stellen ist ein Schlüssel — braucht das Englische
 * zwei verschiedene Übersetzungen, muss sich auch der deutsche Text
 * unterscheiden. Vorgehen und Regeln: docs/I18N.md.
 */

export type DeText =
  // ─── Header und Menü ─────────────────────────────────────────────────
  | 'Zur Startseite'
  | 'Menü öffnen'
  | 'Menü schließen'
  | 'Available Check'
  | 'Sprache';

/**
 * Mehrzahl → Einzahl. Schlüssel ist die Mehrzahl (`{count} Tage`), der Wert
 * die Einzahl (`{count} Tag`). `t(key, { count })` wählt die Form.
 */
export const DE_PLURALS = {} as const satisfies Record<string, string>;

export type DePluralKey = keyof typeof DE_PLURALS;
export type DeKey = DeText | DePluralKey;

export interface Plural {
  one: string;
  other: string;
}

export type Message = string | Plural;

/**
 * Form des englischen Wörterbuchs: jeder deutsche Schlüssel genau einmal.
 *
 * Englisch darf auch dort Einzahl und Mehrzahl unterscheiden, wo das Deutsche
 * keine braucht („3 kritisch“, aber „3 warnings“) — umgekehrt nicht.
 */
export type Dictionary = { [K in DeText]: Message } & { [K in DePluralKey]: Plural };
