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
