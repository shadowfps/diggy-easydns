import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'diggy-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Hell/Dunkel — gespeichert wird nur eine ausdrückliche Wahl (#125).
 *
 * Vorher schrieb ein Effekt `diggy-theme` bei jedem Laden, auch wenn nur die
 * Systemeinstellung übernommen wurde. Die Datenschutzseite beschreibt den
 * Eintrag aber als Einstellung, die der Nutzer wählt. Jetzt gilt dieselbe
 * Regel wie für die Sprache (`diggy-language`): ohne Wahl folgt diggy dem
 * System — auch wenn es sich zur Laufzeit ändert — und legt nichts ab.
 *
 * Ein gespeicherter Wert zählt als Wahl. Ältere Versionen haben ihn auch ohne
 * Umschalten geschrieben; davon lässt sich eine echte Wahl nicht
 * unterscheiden, er bleibt also stehen, bis der Nutzer die Websitedaten
 * löscht.
 *
 * Flow liest das Theme aus `data-theme` am html-Element (`light`/`dark`).
 * Vor dem ersten Paint setzt das Inline-Script in index.html das Attribut aus
 * demselben Eintrag und derselben Media Query; ändert sich die Regel hier,
 * dort mitziehen.
 */
export function useTheme() {
  const [choice, setChoice] = useState<Theme | null>(() =>
    typeof window === 'undefined' ? null : readChoice()
  );
  const [system, setSystem] = useState<Theme>(() =>
    typeof window === 'undefined' ? 'dark' : systemTheme()
  );
  const theme = choice ?? system;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (choice || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DARK_QUERY);
    const update = () => setSystem(query.matches ? 'dark' : 'light');
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [choice]);

  const setTheme = (next: Theme) => {
    setChoice(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Kein Storage (privates Fenster) — die Wahl gilt dann bis zum Neuladen.
    }
  };

  return {
    theme,
    toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    setTheme,
  };
}

function readChoice(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  if (typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}
