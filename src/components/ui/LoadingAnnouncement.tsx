import { useEffect, useState } from 'react';

/**
 * Wie lange die Region leer steht, bevor der Text kommt. Eine Live-Region,
 * die schon mit Inhalt eingefügt wird, sagen nicht alle Screenreader an —
 * verlässlich ist nur ein Wechsel in einer Region, die sie schon kennen.
 */
const ANNOUNCE_DELAY_MS = 100;

/**
 * Unsichtbare Ansage eines Ladezustands, genau einmal (#108).
 *
 * Für Ladeanzeigen mit wechselndem Text (Ladestufen): Stünde der in der
 * Live-Region, würde jeder Wechsel angesagt — bei PageSpeed und VirusScan
 * alle zwei Sekunden, bis das Ergebnis da ist. Die sichtbare Anzeige bekommt
 * deshalb `aria-hidden`, angesagt wird nur dieser gleichbleibende Text.
 */
export function LoadingAnnouncement({ children }: { children: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <p role="status" className="sr-only">
      {ready ? children : ''}
    </p>
  );
}
