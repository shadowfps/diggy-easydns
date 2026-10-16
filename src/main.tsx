import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import { ErrorBoundary } from './components/errors/ErrorBoundary';
import { AppErrorFallback } from './components/errors/AppErrorFallback';
import { initLanguage } from './i18n';
import './styles/globals.css';

const root = createRoot(document.getElementById('root')!);

function render() {
  root.render(
    <StrictMode>
      {/*
        reducedMotion="user" respektiert die OS-Einstellung "Bewegung
        reduzieren": Framer Motion setzt dann alle Transform- und
        Layout-Animationen auf Dauer 0 und lässt nur Opacity übrig. Deckt alle
        motion.*-Komponenten und die Tab-Unterstreichung ab. GSAP und die
        CSS-Keyframes brauchen eigene Behandlung, siehe SplitText/TextType/ShinyText.
      */}
      <MotionConfig reducedMotion="user">
        <ErrorBoundary fallback={({ error }) => <AppErrorFallback error={error} />}>
          <App />
        </ErrorBoundary>
      </MotionConfig>
    </StrictMode>
  );
}

/*
 * Englische Besucher: erst das Wörterbuch, dann der erste Render.
 *
 * Sonst stünde die Seite für die Dauer eines Requests auf Deutsch da und
 * spränge dann um — jeder Text, jede Zeilenlänge, die Hero-Animation startete
 * neu. Warten kostet kaum: index.html lädt den Chunk parallel zu index.js vor,
 * er ist meist schon da (Fast 3G: 60 ms später als Deutsch statt 650 ms).
 * Auf sehr langsamen Verbindungen soll die Seite trotzdem nicht ewig leer
 * bleiben: nach 1,5 s wird auf Deutsch gerendert, und die Seite schaltet um,
 * sobald Englisch da ist. Deutsche Besucher rendern sofort.
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
