import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTheme } from './useTheme';

/**
 * `diggy-theme` landet nur nach einer ausdrücklichen Wahl im localStorage
 * (#125). Vorher schrieb der Hook bei jedem Laden — auch, wenn er nur die
 * Systemeinstellung übernahm.
 */

type Listener = (event: MediaQueryListEvent) => void;

/** Steuerbares `prefers-color-scheme: dark`, wie in useReducedMotion.test.ts. */
function installColorScheme(initialDark: boolean) {
  const listeners = new Set<Listener>();
  let dark = initialDark;

  window.matchMedia = ((query: string) =>
    ({
      get matches() {
        return query.includes('prefers-color-scheme: dark') && dark;
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
    set(nextDark: boolean) {
      dark = nextDark;
      for (const listener of listeners) listener({ matches: dark } as MediaQueryListEvent);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

const isDark = () => document.documentElement.classList.contains('dark');

function reset() {
  window.localStorage.removeItem('diggy-theme');
  document.documentElement.classList.remove('dark');
}

beforeEach(reset);
afterEach(reset);

describe('useTheme', () => {
  it('folgt beim ersten Besuch dem System und speichert nichts', () => {
    installColorScheme(true);
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(isDark()).toBe(true);
    expect(window.localStorage.getItem('diggy-theme')).toBeNull();
  });

  it('nimmt ohne Wahl auch ein helles System, ohne zu speichern', () => {
    installColorScheme(false);
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
    expect(isDark()).toBe(false);
    expect(window.localStorage.getItem('diggy-theme')).toBeNull();
  });

  it('speichert die Wahl beim Umschalten und stellt sie beim nächsten Mount wieder her', () => {
    installColorScheme(true);
    const first = renderHook(() => useTheme());

    act(() => first.result.current.toggle());

    expect(first.result.current.theme).toBe('light');
    expect(isDark()).toBe(false);
    expect(window.localStorage.getItem('diggy-theme')).toBe('light');
    first.unmount();

    // Nächster Besuch: das System ist weiter dunkel, die Wahl gewinnt.
    const second = renderHook(() => useTheme());
    expect(second.result.current.theme).toBe('light');
    expect(isDark()).toBe(false);
  });

  it('speichert auch über setTheme', () => {
    installColorScheme(false);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme('dark'));

    expect(result.current.theme).toBe('dark');
    expect(window.localStorage.getItem('diggy-theme')).toBe('dark');
  });

  /** Auch Werte, die ältere Versionen ohne Umschalten geschrieben haben. */
  it('respektiert einen vorhandenen gespeicherten Wert', () => {
    installColorScheme(true);
    window.localStorage.setItem('diggy-theme', 'light');
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
    expect(isDark()).toBe(false);
    expect(window.localStorage.getItem('diggy-theme')).toBe('light');
  });

  it('ignoriert einen ungültigen gespeicherten Wert, ohne ihn zu überschreiben', () => {
    installColorScheme(true);
    window.localStorage.setItem('diggy-theme', 'system');
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(window.localStorage.getItem('diggy-theme')).toBe('system');
  });

  it('wechselt ohne Wahl mit dem System, nach einer Wahl nicht mehr', () => {
    const media = installColorScheme(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');

    act(() => media.set(true));
    expect(result.current.theme).toBe('dark');
    expect(isDark()).toBe(true);
    expect(window.localStorage.getItem('diggy-theme')).toBeNull();

    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    expect(media.listenerCount).toBe(0);

    act(() => media.set(false));
    act(() => media.set(true));
    expect(result.current.theme).toBe('light');
  });

  it('meldet den System-Listener beim Unmount ab', () => {
    const media = installColorScheme(false);
    const { unmount } = renderHook(() => useTheme());
    expect(media.listenerCount).toBe(1);
    unmount();
    expect(media.listenerCount).toBe(0);
  });

  it('kommt ohne nutzbaren Storage aus', () => {
    installColorScheme(false);
    const original = window.localStorage;
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    } as unknown as Storage;
    Object.defineProperty(window, 'localStorage', { value: throwing, configurable: true });

    try {
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe('light');

      act(() => result.current.toggle());
      expect(result.current.theme).toBe('dark');
      expect(isDark()).toBe(true);
    } finally {
      Object.defineProperty(window, 'localStorage', { value: original, configurable: true });
    }
  });
});
