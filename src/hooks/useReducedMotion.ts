import { useEffect, useState } from 'react';

/**
 * Spiegelt die OS-Einstellung "Bewegung reduzieren".
 *
 * Framer Motion bringt für seine eigenen Komponenten `MotionConfig
 * reducedMotion="user"` mit (siehe main.tsx). Alles daneben — GSAP-Tweens, der
 * Typewriter-Effekt, CSS-Keyframes und die von Hand gesetzten Stagger-Delays —
 * muss die Präferenz selbst abfragen. Genau dafür ist dieser Hook.
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

/**
 * Deckelt Stagger-Delays und schaltet sie bei reduzierter Bewegung ab.
 *
 * `index * step` unbegrenzt hochlaufen zu lassen skaliert nicht: bei 15
 * Findings erschien das letzte erst nach ~0,9 s, bei vielen TXT-Records
 * entsprechend später. Der Deckel begrenzt das auch für Nutzer ohne Präferenz.
 */
export function staggerDelay(index: number, step: number, reduced: boolean, max = 0.4): number {
  if (reduced) return 0;
  return Math.min(index * step, max);
}
