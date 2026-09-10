import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { staggerDelay, useReducedMotion } from './useReducedMotion';

/**
 * Der Hook trägt alles, was Framer Motions `MotionConfig` nicht sieht: GSAP in
 * SplitText, die setTimeout-Schleife in TextType, die rAF-Schleife in
 * ShinyText und die handgesetzten Stagger-Delays.
 *
 * Der Laufzeitwechsel der Präferenz war in TextType und ShinyText fehlerhaft
 * (Text verdoppelte sich, Glanz fror ein) — beides fand nur ein Review.
 */

type Listener = (event: MediaQueryListEvent) => void;

/** Setzt eine steuerbare matchMedia-Implementierung ein. */
function installMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  let matches = initial;

  window.matchMedia = ((query: string) =>
    ({
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, listener: Listener) => void listeners.add(listener),
      removeEventListener: (_: string, listener: Listener) => void listeners.delete(listener),
      addListener: (listener: Listener) => void listeners.add(listener),
      removeListener: (listener: Listener) => void listeners.delete(listener),
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;

  return {
    set(next: boolean) {
      matches = next;
      for (const listener of listeners) listener({ matches } as MediaQueryListEvent);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

describe('useReducedMotion', () => {
  beforeEach(() => {
    window.matchMedia = (query: string) =>
      ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList;
  });

  it('liefert false, wenn keine Präferenz gesetzt ist', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('liefert true, wenn die Präferenz gesetzt ist', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  /** Genau der Fall, in dem TextType und ShinyText kaputt waren. */
  it('reagiert auf eine Änderung zur Laufzeit', () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => media.set(true));
    expect(result.current).toBe(true);

    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it('meldet den Listener beim Unmount ab', () => {
    const media = installMatchMedia(false);
    const { unmount } = renderHook(() => useReducedMotion());
    expect(media.listenerCount).toBe(1);
    unmount();
    expect(media.listenerCount).toBe(0);
  });

  it('kommt ohne matchMedia klar', () => {
    // @ts-expect-error absichtlich entfernt
    delete window.matchMedia;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});

describe('staggerDelay', () => {
  it('staffelt normal', () => {
    expect(staggerDelay(0, 0.06, false)).toBe(0);
    expect(staggerDelay(3, 0.06, false)).toBeCloseTo(0.18);
  });

  /**
   * `index * step` lief vorher unbegrenzt hoch: bei 15 Findings erschien das
   * letzte erst nach ~0,9 s.
   */
  it('deckelt die Wartezeit', () => {
    expect(staggerDelay(100, 0.06, false)).toBe(0.4);
    expect(staggerDelay(100, 0.06, false, 0.2)).toBe(0.2);
  });

  it('schaltet bei reduzierter Bewegung ganz ab', () => {
    expect(staggerDelay(0, 0.06, true)).toBe(0);
    expect(staggerDelay(50, 0.06, true)).toBe(0);
  });
});
