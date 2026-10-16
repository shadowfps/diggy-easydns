import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';

/**
 * E2E-Tests im echten Browser gegen den gebauten Server (siehe docs/E2E.md).
 *
 * Voraussetzung ist `npm run build` — wie beim Smoke-Test läuft der Server
 * so, wie er im Container läuft. Alle `/api/...`-Aufrufe beantwortet der Test
 * selbst aus e2e/api-data/, der Server liefert nur das Frontend aus.
 */

const ROOT = import.meta.dirname;

if (!existsSync(path.join(ROOT, 'dist/index.html'))) {
  throw new Error('Kein Build gefunden — vorher `npm run build` ausführen.');
}

/** Freien Port vom Betriebssystem holen, damit ein laufender Dev-Server nicht stört. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

// Die Config wird in jedem Worker erneut geladen. Über die Umgebung erben die
// Worker den Port des Hauptprozesses, statt sich jeweils einen eigenen
// (falschen) zu holen.
process.env.E2E_PORT ??= String(await freePort());
const baseURL = `http://127.0.0.1:${process.env.E2E_PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Bewusst ohne Retries: die Tests laufen gegen feste Daten, ein Fehlschlag
  // ist ein echter Befund. Ein Retry würde Flakiness nur verstecken.
  retries: 0,
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  // Die Tests warten auf Zustände, nie auf feste Zeiten — volle Parallelität
  // ist deshalb unkritisch und spart auf 4 Kernen gut ein Viertel (34 statt 47 s).
  workers: process.env.CI ? '100%' : undefined,
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  // Referenzbilder ohne Plattform-Suffix: sie entstehen ausschließlich im
  // Playwright-Docker-Image (lokal wie in der CI, e2e/run-in-docker.mjs).
  // Außerhalb des Images wird der Pixelvergleich übersprungen.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  // In der CI nie still ein fehlendes Referenzbild anlegen und grün werden.
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  expect: {
    // Reserve für langsamere CI-Runner: ein ganzseitiger Screenshot muss zwei
    // Mal hintereinander gleich ausfallen, bevor er verglichen wird.
    timeout: 10_000,
    toHaveScreenshot: {
      // Begründung: docs/E2E.md, Abschnitt „Toleranz“. Kurz: Referenz und CI
      // rendern im selben Image auf derselben Architektur, erwartet sind 0
      // abweichende Pixel. 20 sind Reserve für einzelne Subpixel-Reste —
      // schon ein ausgeblendetes 16-px-Icon ändert 66.
      maxDiffPixels: 20,
      threshold: 0.2,
    },
  },

  use: {
    baseURL,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    // Framer Motion, GSAP und der Typewriter fragen das ab und stehen dann
    // still — sonst wäre jeder Screenshot eine Momentaufnahme mitten in einer
    // Animation.
    reducedMotion: 'reduce',
    // Kein Trace: das Aufzeichnen kostet pro Test gut zwei Sekunden. Bei einem
    // Fehlschlag reichen Screenshot und Meldung (die nennt das überstehende
    // Element); für mehr lokal `npx playwright test --trace on`.
    screenshot: 'only-on-failure',
  },

  projects: [
    // Exakt 390 px: die Breite, bei der seitliches Überlaufen am häufigsten
    // aufgefallen ist (iPhone 12–15).
    { name: 'mobil', use: { viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],

  webServer: {
    command: 'node dist-server/server/index.js',
    url: `${baseURL}/api/health`,
    env: { NODE_ENV: 'production', PORT: process.env.E2E_PORT },
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
