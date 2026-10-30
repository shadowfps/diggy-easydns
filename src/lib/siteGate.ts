/**
 * Ist diese Seite die Testumgebung mit Passwortschutz? Den Meta-Tag setzt
 * der Server nur, wenn SITE_PASSWORD gesetzt ist (server/lib/siteGate.ts) —
 * auf diggydns.cloud nie.
 */
export function isSiteGated(): boolean {
  return typeof document !== 'undefined' && document.querySelector('meta[name="diggy-site-gate"]') !== null;
}
