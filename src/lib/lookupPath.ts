/**
 * Pure Helfer rund um Lookup-Pfade, Titel und Dateinamen.
 *
 * Bewusst aus App.tsx herausgezogen: dort waren sie nicht exportiert und
 * damit ohne DOM-Test-Setup nicht prüfbar, obwohl sie die Routing-Logik
 * tragen. Keine dieser Funktionen greift auf `window` zu.
 */

export type AppView = 'lookup' | 'history' | 'availability' | 'about' | 'impressum' | 'datenschutz';

/** Pfad → View für die statischen Routen. Einzige Quelle für beide Richtungen. */
export const STATIC_ROUTES: Record<string, AppView | undefined> = {
  '/': 'lookup',
  '/history': 'history',
  '/about': 'about',
  '/availability': 'availability',
  '/impressum': 'impressum',
  '/datenschutz': 'datenschutz',
};

const VIEW_TITLES: Record<Exclude<AppView, 'lookup'>, string> = {
  history: 'History',
  availability: 'Available Check',
  about: 'About',
  impressum: 'Impressum',
  datenschutz: 'Datenschutz',
};

export function buildDocumentTitle(
  view: AppView,
  domain: string | null,
  ipQuery: string | null
): string {
  if (view !== 'lookup') return `${VIEW_TITLES[view]} — diggy`;
  const subject = domain ?? ipQuery;
  return subject ? `${subject} — diggy` : 'diggy — DNS made friendly';
}

export function lookupPathFor(domain: string): string {
  return `/lookup/${encodeURIComponent(domain)}`;
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
