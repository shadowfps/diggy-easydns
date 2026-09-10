import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Gemeinsames Setup für die Frontend-Tests.
 *
 * jsdom bringt einige Browser-APIs nicht mit, die die App benutzt. Sie hier zu
 * ergänzen ist ehrlicher, als die Komponenten daran anzupassen — der
 * Produktivcode soll nicht wissen, dass er getestet wird.
 *
 * Bewusst KEINE `vi.fn()` für diese Shims: der Workspace läuft mit
 * `restoreMocks: true`, das zwischen den Tests die Implementierung von
 * vi.fn-Mocks entfernt. `matchMedia()` hätte danach `undefined` geliefert, und
 * Framer Motion ruft darauf `addListener` auf — jeder zweite Test wäre an
 * einem Shim gescheitert, nicht an der Komponente.
 */

afterEach(() => {
  cleanup();
});

/** Vollständiges MediaQueryList — Framer Motion nutzt noch das Legacy-API. */
function mediaQueryList(query: string, matches: boolean): MediaQueryList {
  return {
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}

/**
 * Genutzt von useTheme (`prefers-color-scheme`), useReducedMotion
 * (`prefers-reduced-motion`) und SearchBar (`(hover: hover)`).
 *
 * Default ist überall `false`: helles Theme, keine reduzierte Bewegung, kein
 * Zeigergerät. Tests, die etwas anderes brauchen, überschreiben
 * `window.matchMedia` selbst — siehe `setMediaQuery` unten.
 */
window.matchMedia = (query: string) => mediaQueryList(query, false);

/**
 * Hilfe für Tests, die eine bestimmte Media Query auf `true` setzen wollen.
 *
 * ```ts
 * setMediaQuery('(prefers-reduced-motion: reduce)');
 * ```
 */
export function setMediaQuery(...matching: string[]): void {
  window.matchMedia = (query: string) =>
    mediaQueryList(
      query,
      matching.some((m) => query.includes(m))
    );
}

/**
 * Font Loading API — in jsdom nicht implementiert.
 *
 * SplitText wartet auf `document.fonts.ready`, bevor es den Text zerlegt:
 * sonst verschieben sich die Zeichen beim Font-Swap. Ohne Shim wirft der
 * Zugriff auf `document.fonts.status` und reißt den ganzen Render-Baum mit.
 *
 * `status: 'loaded'` lässt die Komponente direkt weiterlaufen.
 */
if (!document.fonts) {
  Object.defineProperty(document, 'fonts', {
    value: {
      status: 'loaded',
      ready: Promise.resolve(),
      check: () => true,
      load: () => Promise.resolve([]),
      add: () => {},
      delete: () => false,
      clear: () => {},
      forEach: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    configurable: true,
    writable: true,
  });
}

/** Von GSAP/ScrollTrigger (SplitText) und TextType erwartet. */
window.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = '';
  thresholds: number[] = [];
} as unknown as typeof IntersectionObserver;

/** Framer Motion fragt ResizeObserver für Layout-Animationen ab. */
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// In jsdom nicht implementiert; ohne Shim schreibt jeder Aufruf eine
// "Not implemented"-Warnung ins Log.
window.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};

/**
 * localStorage-Shim.
 *
 * Nicht wegen jsdom — das bringt eigenes localStorage mit. Node 26 hat aber
 * einen eigenen, experimentellen `localStorage`-Global, der ohne
 * `--localstorage-file` undefined liefert und den von jsdom bereitgestellten
 * verdrängt. Der Effekt: `window.localStorage` ist undefined, und jeder Test,
 * der die Lookup-History oder das Theme berührt, scheitert an der Umgebung
 * statt an der Komponente.
 *
 * Die App fasst localStorage ausschließlich in try/catch an (siehe
 * lib/lookupHistory.ts und hooks/useTheme.ts), würde also auch ohne Shim
 * funktionieren — die Tests sollen das Verhalten aber prüfen können.
 */
function createStorage(): Storage {
  let store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => {
      store = new Map();
    },
  } as Storage;
}

if (!window.localStorage) {
  Object.defineProperty(window, 'localStorage', {
    value: createStorage(),
    configurable: true,
    writable: true,
  });
}
if (!window.sessionStorage) {
  Object.defineProperty(window, 'sessionStorage', {
    value: createStorage(),
    configurable: true,
    writable: true,
  });
}
