import { parsePropagationType, type PropagationRecordType } from '@shared/propagation';

export * from '@shared/propagation';

/**
 * Der Propagation-Typ aus dem Query-String eines Permalinks
 * (`/lookup/example.com?propagation=MX`, gebaut von `lookupPathFor`).
 *
 * - `undefined`: kein Parameter — der Report öffnet wie immer mit Records
 * - `null`: Parameter da, aber leer oder kein bekannter Typ — der
 *   Propagation-Tab öffnet mit der Voreinstellung
 *
 * Hier statt in lookupPath.ts: das nutzt auch der nachgeladene Kalender, und
 * der soll den Propagation-Vergleich nicht mitziehen.
 */
export function propagationTypeFromSearch(search: string): PropagationRecordType | null | undefined {
  const value = new URLSearchParams(search).get('propagation');
  return value === null ? undefined : parsePropagationType(value);
}

/**
 * Höchstlänge des erwarteten Werts aus einem Link: reicht für einen
 * DKIM-Schlüssel mit 4096 Bit (rund 750 Zeichen), mehr wäre kein Record.
 */
const MAX_EXPECTED = 2000;

/** Der erwartete Wert aus dem Link (`&expected=…`, #133) — leer, wenn keiner da ist. */
export function propagationExpectedFromSearch(search: string): string {
  return (new URLSearchParams(search).get('expected') ?? '').slice(0, MAX_EXPECTED);
}
