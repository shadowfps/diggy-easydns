import {
  DOMAINS,
  REPORT_TABS,
  expectNoHorizontalOverflow,
  openHome,
  openReport,
  settle,
  showTab,
  test,
  type Theme,
} from './test';

/**
 * Seitliches Überlaufen: die Seite darf nie breiter sein als der Viewport.
 *
 * Läuft für jede wichtige Ansicht in hell und dunkel, jeweils mobil (390 px)
 * und am Desktop (1440 px) — die Breiten kommen aus den Projekten in
 * playwright.config.ts. Anders als der Pixelvergleich ist das unabhängig von
 * der Schriftdarstellung und läuft deshalb auf jeder Plattform.
 */

const PAGES = [
  { name: 'About', path: '/about' },
  { name: 'Impressum', path: '/impressum' },
  { name: 'Datenschutz', path: '/datenschutz' },
  { name: 'IP-Lookup', path: '/lookup/1.1.1.1' },
];

for (const theme of ['light', 'dark'] as Theme[]) {
  test.describe(`Überlauf ${theme === 'light' ? 'hell' : 'dunkel'}`, () => {
    test.use({ theme });

    for (const { name, path } of PAGES) {
      test(name, async ({ page }) => {
        await page.goto(path);
        await settle(page);
        await expectNoHorizontalOverflow(page, name);
      });
    }

    test('Startseite', async ({ page }) => {
      await openHome(page);
      await expectNoHorizontalOverflow(page, 'Startseite');
    });

    test('Startseite mit offenem Einstellungsmenü', async ({ page }) => {
      await openHome(page);
      await page.getByRole('button', { name: 'Einstellungen' }).click();
      await page.getByRole('menuitemradio', { name: 'Dark' }).waitFor();
      await settle(page);
      await expectNoHorizontalOverflow(page, 'Einstellungsmenü');
    });

    // Auf dem Handy liegt die Navigation hinter dem Burger im OffCanvas.
    test('Startseite mit offenem Menü', async ({ page }) => {
      await openHome(page);
      const burger = page.getByRole('button', { name: 'Menü öffnen' });
      test.skip(!(await burger.isVisible()), 'Navigation steht in der Kopfzeile.');
      await burger.click();
      await page.getByRole('dialog').getByRole('link', { name: /^History/ }).waitFor();
      await settle(page);
      await expectNoHorizontalOverflow(page, 'Menü');
    });

    for (const domain of DOMAINS) {
      test(`Report ${domain}, alle Tabs`, async ({ page }) => {
        await openReport(page, domain);
        for (const tab of REPORT_TABS) {
          await showTab(page, tab);
          await expectNoHorizontalOverflow(page, `Report ${domain}, Tab ${tab}`);
        }
      });
    }

    test('History', async ({ page }) => {
      // Die History füllt sich wie im echten Betrieb: erst nachschlagen.
      for (const domain of DOMAINS) await openReport(page, domain);
      await page.goto('/history');
      await page.getByText('github.com', { exact: true }).first().waitFor();
      await settle(page);
      await expectNoHorizontalOverflow(page, 'History');
    });

    // Beide Seiten nebeneinander, mit langen TXT-Werten von github.com (#85).
    test('Vergleich', async ({ page }) => {
      await page.goto('/compare/example.com/github.com');
      await page.getByRole('heading', { name: 'Mail-Schutz' }).waitFor();
      await settle(page);
      await expectNoHorizontalOverflow(page, 'Vergleich');
    });

    test('Available Check mit Ergebnis', async ({ page }) => {
      await page.goto('/availability');
      await page.getByLabel('Domain', { exact: true }).fill('diggy');
      await page.getByRole('button', { name: 'Prüfen' }).click();
      await page.getByText('diggy.de', { exact: true }).waitFor();
      await settle(page);
      await expectNoHorizontalOverflow(page, 'Available Check');
    });
  });
}
