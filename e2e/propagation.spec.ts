import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, openReport, showTab, test } from './test';

/**
 * Beim Wechsel des Record-Typs im Propagation-Tab flackerte der Hintergrund
 * (#147): Bis die Antworten da waren, standen nur zwei Ladezeilen im Tab, die
 * Karte klappte auf ein Viertel zusammen und wuchs gleich wieder. Gemessen
 * auf mittwald.de: 1495 → 345 → 1909 px.
 *
 * MX lädt der Report nicht mit, erst die Wahl fragt. Hier antworten beide
 * Abfragen erst, wenn der Test es sagt — so lässt sich die Höhe mitten im
 * Laden messen. Die Antworten selbst sind die von A; es geht nur ums Laden.
 */

const data = JSON.parse(readFileSync(path.join(import.meta.dirname, 'api-data', 'example.com.json'), 'utf8'));

test('Typwechsel: Der Tab behält beim Laden seine Höhe', async ({ page }) => {
  let release!: () => void;
  const answered = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) =>
      /^\/api\/lookup\/(propagation|authoritative)$/.test(url.pathname) && url.searchParams.get('type') === 'MX',
    async (route) => {
      await answered;
      const section = new URL(route.request().url()).pathname.endsWith('authoritative') ? 'authoritative' : 'propagation';
      await route.fulfill({ json: section === 'authoritative' ? { ...data.authoritative, type: 'MX' } : data.propagation });
    }
  );

  await openReport(page, 'example.com');
  await showTab(page, 'propagation');
  const panel = page.getByRole('tabpanel', { name: /^Propagation/ });
  const before = (await panel.boundingBox())!.height;

  await page.getByRole('button', { name: /Record-Typ/ }).click();
  await page.getByRole('option', { name: 'MX', exact: true }).click();
  await expect(panel.getByText('MX-Records werden bei allen Resolvern abgefragt…').last()).toBeVisible();

  expect((await panel.boundingBox())!.height).toBeGreaterThanOrEqual(before - 1);

  release();
  await expect(panel.getByText('MX-Records werden bei allen Resolvern abgefragt…')).toHaveCount(0);
});
