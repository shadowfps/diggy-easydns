import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useReducedMotion } from './useReducedMotion';

/**
 * Der Hook trägt, was Flow nicht selbst anhält: sanftes Scrollen per JS. Er
 * muss auch einem Wechsel der Präferenz zur Laufzeit folgen — der war in den
 * früheren Hero-Animationen fehlerhaft und fiel nur einem Review auf.
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

  /** Genau der Fall, an dem die früheren Hero-Animationen scheiterten. */
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
