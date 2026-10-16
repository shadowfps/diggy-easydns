/**
 * Satzbausteine (#86) — Text mit Platzhaltern plus Werte, siehe `Phrase` in
 * shared/textKeys.ts.
 *
 * Der Server baut seine Meldungen aus Bausteinen, die auch der Mail-Tab
 * zeigt („DMARC wirkt nicht: p= fehlt“). Fertig eingesetzt ließe sich so ein
 * Satz im Client nicht mehr übersetzen; als Baustein schon: Der Client
 * schlägt `text` im Wörterbuch nach und setzt die Werte selbst ein.
 */

import type { Phrase, PhraseText, TextParams } from './textKeys.js';

/** Nur Texte aus `PhraseText` — dort stehen sie, damit sie übersetzt werden. */
export function phrase(text: PhraseText, params?: TextParams): Phrase {
  return params ? { text, params } : { text };
}

/** Der Baustein auf Deutsch, Werte eingesetzt — Bausteine in den Werten ebenso. */
export function germanText(value: Phrase): string {
  const { text, params } = value;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const param = params[name];
    if (param === undefined) return match;
    return typeof param === 'object' ? germanText(param) : String(param);
  });
}
