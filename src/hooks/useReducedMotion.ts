import { useEffect, useState } from 'react';

/**
 * Spiegelt die OS-Einstellung "Bewegung reduzieren".
 *
 * Flows Komponenten halten ihre Animationen dann selbst an. Was diggy selbst
 * bewegt — sanftes Scrollen per JS (App.tsx) — muss die Präferenz abfragen.
 * Genau dafür ist dieser Hook.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}
