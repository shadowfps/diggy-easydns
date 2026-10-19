import { useEffect, useState } from 'react';
import { lookupPropagation } from '@/lib/api';
import type { RecordType, ResolverResult } from '@/types/dns';

/**
 * Antworten für einen Typ, den der Report nicht mitlädt (#131).
 *
 * Der Report holt nur die Standard-Typen (`propagationTypes`). Jeder andere
 * Typ kostet eine eigene Abfrage — erst, wenn jemand ihn wählt.
 *
 * Zwischengespeichert je Report: Schlüssel ist das Ergebnis-Array, das der
 * Report für die Standard-Typen hat. Ein Tab-Wechsel baut die Ansicht neu
 * auf, fragt aber nicht neu; ein neuer Check — auch derselben Domain — bringt
 * ein neues Array und fragt frisch. Fehler werden nicht gespeichert.
 */
const loaded = new WeakMap<ResolverResult[], Map<RecordType, ResolverResult[]>>();

export interface TypedPropagation {
  /** `undefined`, solange nichts da ist (lädt oder ist gescheitert). */
  results: ResolverResult[] | undefined;
  /** Der geworfene Fehler — übersetzt wird beim Rendern (#86). */
  error: unknown;
  retry: () => void;
}

export function useTypedPropagation(
  report: ResolverResult[],
  domain: string,
  type: RecordType,
  enabled: boolean
): TypedPropagation {
  // Fehler mit Report und Typ, zu denen er gehört — nach einem Typwechsel
  // soll nicht für einen Render der alte Fehler stehen.
  const [failure, setFailure] = useState<{ report: ResolverResult[]; type: RecordType; error: unknown } | null>(
    null
  );
  // Zählt Abfragen, die fertig wurden: ein Treffer liegt im Modul-Cache, nicht
  // im State — der Zähler sorgt für den Render danach.
  const [, setSettled] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const results = enabled ? loaded.get(report)?.get(type) : undefined;
  const error = failure?.report === report && failure.type === type ? failure.error : undefined;

  useEffect(() => {
    if (!enabled || loaded.get(report)?.has(type)) return;
    // Gescheitert: erst „Erneut versuchen“ fragt wieder. Sonst stünde nach
    // einem Typwechsel zurück der alte Fehler samt Knopf da, während im
    // Hintergrund schon neu gefragt wird.
    if (failure?.report === report && failure.type === type) return;
    let stale = false;

    lookupPropagation(domain, type)
      .then(({ propagation }) => {
        let byType = loaded.get(report);
        if (!byType) loaded.set(report, (byType = new Map()));
        byType.set(type, propagation);
        if (!stale) setSettled((n) => n + 1);
      })
      .catch((err: unknown) => {
        if (!stale) setFailure({ report, type, error: err ?? new Error() });
      });

    return () => {
      stale = true;
    };
  }, [enabled, report, domain, type, attempt, failure]);

  return {
    results,
    error,
    retry: () => {
      setFailure(null);
      setAttempt((n) => n + 1);
    },
  };
}
