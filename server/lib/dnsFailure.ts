/**
 * „Gibt es nicht“ oder „keine Antwort“? (#101)
 *
 * node:dns wirft für beides. ENOTFOUND (NXDOMAIN) und ENODATA (NODATA) sind
 * eine Antwort: der Name oder der Typ existiert nicht. Alles andere —
 * Zeitüberschreitung, SERVFAIL, abgewiesene oder kaputte Antworten — heißt
 * nur, dass wir es nicht wissen.
 */

import type { LookupFailure } from '../types.js';

const ABSENT_CODES = new Set(['ENOTFOUND', 'ENODATA']);

/** `undefined`: echte Antwort „gibt es nicht“. Sonst der Grund des Ausfalls. */
export function dnsLookupFailure(error: unknown): LookupFailure | undefined {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code && ABSENT_CODES.has(code)) return undefined;
  if (code === 'ETIMEOUT') return 'timeout';
  if (code === 'ESERVFAIL') return 'servfail';
  return 'network';
}
