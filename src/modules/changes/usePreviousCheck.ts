import { useState } from 'react';
import type { LookupReport } from '@/types/dns';
import {
  findHistoryEntry,
  useLookupHistory,
  type LookupHistoryEntry,
} from '@/lib/lookupHistory';

interface HeldCheck {
  key: string | null;
  entry: LookupHistoryEntry | null;
}

/**
 * Der letzte gespeicherte Check dieser Domain — festgehalten, BEVOR der
 * laufende Lookup ihn überschreibt.
 *
 * Die History hält je Domain nur einen Eintrag, und App.tsx schreibt den
 * neuen Stand hinein, sobald alle Sektionen fertig sind. Danach wäre der
 * alte weg. Deshalb wird er im ersten Render gegriffen, der den neuen Report
 * kennt: dieser Render liegt immer vor dem Effect, der speichert — auch wenn
 * Records und alle Sektionen in einem Rutsch ankommen.
 *
 * Bewusst State, der beim Wechsel des Lookups im Render nachgeführt wird
 * (Reacts Muster „Informationen aus vorigen Renders speichern“): ein Effect
 * liefe erst nach dem Speichern, und eine Ref dürfte im Render nicht
 * geschrieben werden.
 */
export function usePreviousCheck(report: LookupReport | null): LookupHistoryEntry | null {
  const history = useLookupHistory();
  // Domain + Zeitstempel des Servers: jeder neue Lookup ist ein neuer Schlüssel,
  // auch für dieselbe Domain.
  const key = report ? `${report.domain}|${report.timestamp}` : null;
  const [held, setHeld] = useState<HeldCheck>({ key: null, entry: null });

  if (held.key !== key) {
    const entry = report ? findHistoryEntry(history, report.domain) : null;
    setHeld({ key, entry });
    return entry;
  }
  return held.entry;
}
