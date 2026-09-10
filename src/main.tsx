import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import { ErrorBoundary } from './components/errors/ErrorBoundary';
import { AppErrorFallback } from './components/errors/AppErrorFallback';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
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
