import { t } from '@/i18n';
import type { DeKey } from '@/i18n/de';
import type { PropagationRecordType } from '@/lib/propagation';

/**
 * Pure Helfer rund um Lookup-Pfade, Titel und Dateinamen.
 *
 * Bewusst aus App.tsx herausgezogen: dort waren sie nicht exportiert und
 * damit ohne DOM-Test-Setup nicht prüfbar, obwohl sie die Routing-Logik
 * tragen. Keine dieser Funktionen greift auf `window` zu.
 */

export type AppView = 'lookup' | 'history' | 'availability' | 'about' | 'impressum' | 'datenschutz' | 'compare';

/** Pfad → View für die statischen Routen. Einzige Quelle für beide Richtungen. */
export const STATIC_ROUTES: Record<string, AppView | undefined> = {
  '/': 'lookup',
  '/history': 'history',
  '/about': 'about',
  '/availability': 'availability',
  '/impressum': 'impressum',
  '/datenschutz': 'datenschutz',
};

// Schlüssel statt fertiger Titel: übersetzt wird beim Aufruf, damit der
// Titel einem Sprachwechsel folgt (App.tsx setzt ihn dann neu).
const VIEW_TITLES: Record<Exclude<AppView, 'lookup'>, DeKey> = {
  history: 'History',
  availability: 'Available Check',
  about: 'About',
  impressum: 'Impressum',
  datenschutz: 'Datenschutz',
  // Mit Domains baut comparePath.ts den Titel; das hier ist der Rückfall.
  compare: 'Vergleich',
};

export function buildDocumentTitle(
  view: AppView,
  domain: string | null,
  ipQuery: string | null
): string {
  if (view !== 'lookup') return `${t(VIEW_TITLES[view])} — diggy`;
  const subject = domain ?? ipQuery;
  return subject ? `${subject} — diggy` : 'diggy — DNS made friendly';
}

/**
 * Permalink eines Reports — mit Typ für den Propagation-Tab
 * (`/lookup/example.com?propagation=MX`, #131).
 *
 * Ein Query-Parameter statt eines weiteren Pfadsegments: Server,
 * Link-Vorschau und alle bisherigen Permalinks hängen am Pfad
 * `/lookup/<domain>` und bleiben so unverändert. Gelesen wird er mit
 * `propagationTypeFromSearch` (lib/propagation.ts).
 *
 * Ein erwarteter Wert (#133) reist nur mit dem Typ: Er gehört zu ihm
 * (`?propagation=A&expected=192.0.2.1`) — wer den Link öffnet, sieht genau
 * den Vergleich, den der Absender sah.
 */
export function lookupPathFor(
  domain: string,
  propagationType?: PropagationRecordType | null,
  expected?: string
): string {
  const path = `/lookup/${encodeURIComponent(domain)}`;
  if (!propagationType) return path;
  const value = expected?.trim();
  return value
    ? `${path}?propagation=${propagationType}&expected=${encodeURIComponent(value)}`
    : `${path}?propagation=${propagationType}`;
}

/**
 * Holt die Domain aus einem Permalink-Pfad.
 *
 * Gibt null zurück, wenn der Pfad keiner ist oder die Kodierung kaputt ist —
 * `decodeURIComponent` wirft bei einem einzelnen `%`.
 */
export function getDomainFromLookupPath(pathname: string): string | null {
  const match = pathname.match(/^\/lookup\/([^/]+)\/?$/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim().toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeSearchDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * Macht aus einer Domain einen unbedenklichen Dateinamen-Bestandteil.
 *
 * Die Eingabe ist immer eine servergeprüfte Domain, ein Traversal-Risiko gibt
 * es also nicht. Führende und abschließende Punkte werden trotzdem entfernt:
 * ein Name, der mit `.` beginnt, ist unter Unix versteckt, und `..-..-` als
 * Präfix ist schlicht unbrauchbar.
 */
export function sanitizeFilename(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

export function formatExportTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'report';
  return date.toISOString().replace(/[:.]/g, '-');
}
