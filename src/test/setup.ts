import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { setLanguage } from '@/i18n';

/**
 * Gemeinsames Setup für die Frontend-Tests.
 *
 * jsdom bringt einige Browser-APIs nicht mit, die die App benutzt. Sie hier zu
 * ergänzen ist ehrlicher, als die Komponenten daran anzupassen — der
 * Produktivcode soll nicht wissen, dass er getestet wird.
 *
 * Bewusst KEINE `vi.fn()` für diese Shims: der Workspace läuft mit
 * `restoreMocks: true`, das zwischen den Tests die Implementierung von
 * vi.fn-Mocks entfernt. `matchMedia()` hätte danach `undefined` geliefert —
 * jeder zweite Test wäre an einem Shim gescheitert, nicht an der Komponente.
 */

afterEach(() => {
  cleanup();
  // Tests laufen auf Deutsch (#86): jsdom meldet `en-US` als Browser-Sprache,
  // die App startet hier aber nie über initLanguage(). Wer in einem Test auf
  // Englisch schaltet, soll den nächsten Test nicht mitnehmen.
  void setLanguage('de', { persist: false });
  try {
    window.localStorage.removeItem('diggy-language');
  } catch {
    // Kein Storage — nichts aufzuräumen.
  }
});

/*
 * Nachgeladene Ansichten (Mail, Security, Impressum, Datenschutz, …) sind in
 * den Tests ein echtes `import()`: Vite transformiert das Modul samt
 * Abhängigkeiten beim ersten Zugriff. Auf einem kalten CI-Runner dauerte das
 * für den Mail-Tab 1,24 s — länger als die 1 s, die `findBy*`/`waitFor`
 * standardmäßig warten. 3 s lassen Luft und bleiben unter dem Test-Timeout
 * von Vitest (5 s), damit ein echter Fehler weiter als Fehlschlag der
 * Assertion erscheint und nicht als Timeout.
 */
configure({ asyncUtilTimeout: 3000 });

/*
 * Sprache der Flow-Komponenten (Modal-„Schließen“, CopyButton …). In der App
 * setzt App.tsx einen I18nProvider passend zur gewählten Sprache. Tests, die
 * eine Komponente allein rendern, haben keinen — react-aria nähme dann
 * `navigator.language`, in jsdom `en-US`, und Flows eigene Texte stünden
 * mitten in deutschen Tests auf Englisch. Dieses Symbol liest react-aria vor
 * `navigator.language`; diggys eigene Spracherkennung (navigator.languages)
 * bleibt davon unberührt.
 */
(window as unknown as Record<symbol, string>)[Symbol.for('react-aria.i18n.locale')] = 'de-DE';

/** Vollständiges MediaQueryList — samt Legacy-API (`addListener`), die manche Bibliotheken noch nutzen. */
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
 * Beobachter, die jsdom nicht mitbringt. Flow und react-aria fragen sie ab
 * (Tabs messen ihren Indikator, Overlays ihre Größe, eingeklappte Tabs ihre
 * Breite) — ohne Shim wirft schon der Aufruf von `new`.
 */
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
