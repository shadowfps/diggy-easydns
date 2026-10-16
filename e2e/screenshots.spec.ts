import type { Page } from '@playwright/test';
import { expect, openHome, openReport, test, type Theme } from './test';

/**
 * Pixelvergleich für eine kleine Auswahl stabiler Ansichten.
 *
 * Bewusst wenige Bilder: jedes Referenzbild muss bei einer gewollten
 * Design-Änderung neu erzeugt und im Review angesehen werden. Die Breite der
 * Abdeckung liefert der Überlauf-Check (overflow.spec.ts). Hier geht es um
 * Brüche, die man nur sieht — Farben, Abstände, Schriften, Dark Mode. Die
 * beiden Ansichten enthalten zusammen Header, Suche, Karten, Score, Tabs,
 * Tabellen und Footer.
 *
 * Referenzbilder entstehen ausschließlich im Playwright-Docker-Image
 * (`npm run e2e:docker`, siehe docs/E2E.md). Überall sonst rendern Schriften
 * und Kanten anders — unter macOS ohnehin, aber auch unter einem anderen
 * Linux mit anderen Schriftpaketen. Der Vergleich läuft deshalb nur dort,
 * wo das Docker-Skript E2E_DOCKER setzt.
 */
test.skip(
  !process.env.E2E_DOCKER,
  'Pixelvergleich nur im Playwright-Image: `npm run e2e:docker`.'
);

for (const theme of ['light', 'dark'] as Theme[]) {
  const suffix = theme === 'light' ? 'hell' : 'dunkel';

  test.describe(`Screenshots ${suffix}`, () => {
    test.use({ theme });

    test('Startseite', async ({ page }) => {
      await openHome(page);
      await expectScreenshot(page, `startseite-${suffix}.png`);
    });

    test('Report example.com', async ({ page }) => {
      await openReport(page, 'example.com');
      await expectScreenshot(page, `report-${suffix}.png`);
    });
  });
}

async function expectScreenshot(page: Page, name: string): Promise<void> {
  // Ganz oben: der Header ist sticky und stünde sonst mitten im Bild.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    // Die Versionsnummer im Footer — sonst bräuchte jedes Release neue Bilder.
    mask: [page.getByText(/^v\d+\.\d+\.\d+$/)],
  });
}
