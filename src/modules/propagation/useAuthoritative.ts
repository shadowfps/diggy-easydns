import { useEffect, useState } from 'react';
import { lookupAuthoritative } from '@/lib/api';
import type { AuthoritativeResult, RecordType, ResolverResult } from '@/types/dns';

/**
 * Antworten der autoritativen Nameserver für den gezeigten Typ (#133).
 *
 * Gefragt wird erst, wenn der Propagation-Tab offen ist — der Report lädt
 * nichts davon mit. Zwischengespeichert wie in `useTypedPropagation`: je
 * Report (Schlüssel ist dessen Ergebnis-Array) und Typ. Ein Tab-Wechsel
 * fragt nicht neu, ein neuer Check schon. Fehler werden nicht gespeichert.
 */
const loaded = new WeakMap<ResolverResult[], Map<RecordType, AuthoritativeResult>>();

export interface Authoritative {
  /** `undefined`, solange nichts da ist (lädt oder ist gescheitert). */
  result: AuthoritativeResult | undefined;
  /** Der geworfene Fehler — übersetzt wird beim Rendern (#86). */
  error: unknown;
  retry: () => void;
}

export function useAuthoritative(report: ResolverResult[], domain: string, type: RecordType): Authoritative {
  const [failure, setFailure] = useState<{ report: ResolverResult[]; type: RecordType; error: unknown } | null>(
    null
  );
  const [, setSettled] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const result = loaded.get(report)?.get(type);
  const error = failure?.report === report && failure.type === type ? failure.error : undefined;

  useEffect(() => {
    if (loaded.get(report)?.has(type)) return;
    let stale = false;

    lookupAuthoritative(domain, type)
      .then((answer) => {
        let byType = loaded.get(report);
        if (!byType) loaded.set(report, (byType = new Map()));
        byType.set(type, answer);
        if (!stale) setSettled((n) => n + 1);
      })
      .catch((err: unknown) => {
        if (!stale) setFailure({ report, type, error: err ?? new Error() });
      });

    return () => {
      stale = true;
    };
  }, [report, domain, type, attempt]);

  return {
    result,
    error,
    retry: () => {
      setFailure(null);
      setAttempt((n) => n + 1);
    },
  };
}
