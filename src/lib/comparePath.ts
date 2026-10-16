/**
 * Pfade der Vergleichsansicht: `/compare`, `/compare/<a>`, `/compare/<a>/<b>`.
 *
 * Eigene Datei statt in lookupPath.ts, weil App.tsx nur diese drei kleinen
 * Helfer für das Routing braucht — die Vergleichsansicht selbst wird
 * nachgeladen. Wie lookupPath.ts ohne Zugriff auf `window`, damit die
 * Funktionen ohne DOM testbar sind.
 */

import { t } from '@/i18n';

export interface ComparePair {
  /** Domain A (links); leer, solange keine eingetragen ist. */
  left: string;
  /** Domain B (rechts); leer, solange keine eingetragen ist. */
  right: string;
}

/**
 * Wie die Suche: ohne Leerraum, klein, ohne Schlusspunkt. Dazu ohne Schema,
 * Pfad und Port, wie es der Server ohnehin tut — wer eine URL aus der Adresszeile
 * einfügt, bekäme sonst einen Permalink mit `%2F`, den manche Proxys
 * ablehnen. Anders als im Report schreibt hier keine Server-Antwort den Pfad
 * nachträglich glatt.
 */
export function normalizeCompareInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/\/.*$/, '')
    // Port nur bei genau einem Doppelpunkt — IPv6-Adressen haben mehrere.
    .replace(/^([^:]+):\d+$/, '$1')
    .replace(/\.$/, '');
}

/**
 * Baut den Permalink. Fehlt die erste Domain, rückt die zweite nach vorn —
 * ein Pfad wie `/compare//b` wäre zwar gültig, aber für Menschen unlesbar,
 * und links/rechts hat ohne Gegenstück keine Bedeutung.
 */
export function comparePathFor(left: string, right = ''): string {
  const a = normalizeCompareInput(left);
  const b = normalizeCompareInput(right);
  const parts = (a ? [a, b] : [b]).filter(Boolean).map(encodeURIComponent);
  return parts.length > 0 ? `/compare/${parts.join('/')}` : '/compare';
}

/**
 * Liest das Paar aus einem Vergleichspfad.
 *
 * null bei allem, was kein Vergleichspfad ist, mehr als zwei Domains enthält
 * oder kaputt kodiert ist (`decodeURIComponent` wirft bei einem einzelnen
 * `%`). App.tsx behandelt den Pfad dann wie einen unbekannten — Startseite
 * statt einer halb kaputten Vergleichsseite.
 */
export function getComparePairFromPath(pathname: string): ComparePair | null {
  const match = pathname.match(/^\/compare(?:\/([^/]+))?(?:\/([^/]+))?\/?$/i);
  if (!match) return null;
  try {
    const left = match[1] ? normalizeCompareInput(decodeURIComponent(match[1])) : '';
    const right = match[2] ? normalizeCompareInput(decodeURIComponent(match[2])) : '';
    return left ? { left, right } : { left: right, right: '' };
  } catch {
    return null;
  }
}

/**
 * Tab-Titel: beide Domains, damit offene Vergleiche unterscheidbar bleiben.
 * Übersetzt beim Aufruf — App.tsx setzt ihn bei einem Sprachwechsel neu.
 */
export function compareDocumentTitle({ left, right }: ComparePair): string {
  if (left && right) return `${left} vs. ${right} — diggy`;
  if (left) return `${t('{domain} vergleichen', { domain: left })} — diggy`;
  return `${t('Vergleich')} — diggy`;
}
