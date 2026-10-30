import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/errors/ErrorBoundary';
import { AppErrorFallback } from './components/errors/AppErrorFallback';
import { initLanguage } from './i18n';
/*
 * Flow zuerst, in der geschichteten Fassung: seine Regeln liegen in eigenen
 * `@layer`s, die eigenen (globals.css, CSS-Module) ungeschichtet darüber.
 * Die Schriften, die Flow von cdn.mittwald.de laden würde, entfernt der
 * Build — siehe flowSelfHostedFonts in vite.config.ts.
 */
import '@mittwald/flow-react-components/all-layered.css';
import './styles/globals.css';

const root = createRoot(document.getElementById('root')!);

/*
 * Die Provider für Flow (Sprache, Router) sitzen in App: sie brauchen die
 * gewählte Sprache und die Navigation der App. Bewegung regelt Flow selbst —
 * bei „Bewegung reduzieren“ stehen seine Animationen still.
 */
function render() {
  root.render(
    <StrictMode>
      <ErrorBoundary fallback={({ error }) => <AppErrorFallback error={error} />}>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}

/*
 * Englische Besucher: erst das Wörterbuch, dann der erste Render.
 *
 * Sonst stünde die Seite für die Dauer eines Requests auf Deutsch da und
 * spränge dann um — jeder Text, jede Zeilenlänge. Warten kostet kaum:
 * index.html lädt den Chunk parallel zu index.js vor, er ist meist schon da
 * (Fast 3G: 60 ms später als Deutsch statt 650 ms). Auf sehr langsamen
 * Verbindungen soll die Seite trotzdem nicht ewig leer bleiben: nach 1,5 s
 * wird auf Deutsch gerendert, und die Seite schaltet um, sobald Englisch da
 * ist. Deutsche Besucher rendern sofort.
 */
const pendingLanguage = initLanguage();
if (pendingLanguage) {
  const fallback = window.setTimeout(render, 1500);
  void pendingLanguage.finally(() => {
    window.clearTimeout(fallback);
    render();
  });
} else {
  render();
}
