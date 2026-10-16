import { test as base, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { calculateScore } from '../shared/scoring';
import type { Finding } from '../shared/types/dns';

/**
 * Gemeinsame Grundlage aller E2E-Tests: feste API-Daten, feste Uhrzeit,
 * festes Theme. Was hier steht, macht die Tests reproduzierbar — Live-DNS
 * (Round-Robin-IPs, TTLs, Antwortzeiten) erreicht der Browser nie.
 */

export type Theme = 'light' | 'dark';

/** Domains mit vollständig aufgenommenen Antworten in e2e/api-data/. */
export const DOMAINS = ['example.com', 'github.com'] as const;
export type Domain = (typeof DOMAINS)[number];

/** Alle Report-Tabs in der Reihenfolge der Tab-Leiste. */
export const REPORT_TABS = [
  'records',
  'propagation',
  'security',
  'mail',
  'findings',
  'whois',
  'speed',
  'virusscan',
] as const;

/**
 * Feste „Jetzt“-Zeit, kurz nach der Aufnahme der Testdaten. Ohne sie zählten
 * WHOIS-Laufzeiten und die History („vor 3 min“) mit jedem Tag weiter.
 * „Geprüft am …“ kommt dagegen aus dem `timestamp` der Testdaten.
 */
export const FIXED_NOW = new Date('2026-10-16T08:30:00Z');

const DATA_DIR = path.join(import.meta.dirname, 'api-data');
const readData = (file: string) => JSON.parse(readFileSync(path.join(DATA_DIR, file), 'utf8'));

const domainData: Record<string, Record<string, unknown>> = Object.fromEntries(
  DOMAINS.map((domain) => [domain, readData(`${domain}.json`)])
);
const ipDetails: Record<string, unknown> = readData('ip-details.json');
const domainCheck: Record<string, unknown> = readData('domain-check.json');

/** Antwort aus den Testdaten — `undefined`, wenn es für den Aufruf keine gibt. */
function cannedResponse(url: URL): unknown {
  const param = (name: string) => url.searchParams.get(name) ?? '';
  if (url.pathname === '/api/lookup') return domainData[param('domain')]?.lookup;

  const section = url.pathname.match(/^\/api\/lookup\/([a-z]+)$/)?.[1];
  if (section) return domainData[param('domain')]?.[section];

  if (url.pathname === '/api/ip-details') return ipDetails[param('ip')];
  if (url.pathname === '/api/domain-check') return domainCheck[param('q')];
  // Ohne Mindestwartezeit: bei stehender Uhr bliebe der Senden-Button sonst
  // dauerhaft auf „Gleich bereit“.
  if (url.pathname === '/api/contact/challenge') return { token: 'e2e', minDelayMs: 0 };
  return undefined;
}

export const test = base.extend<{ theme: Theme }>({
  theme: ['light', { option: true }],

  // Passend zum Theme, damit auch das prefers-color-scheme der Seite stimmt.
  colorScheme: async ({ theme }, use) => use(theme),

  page: async ({ page, theme }, use) => {
    // Nur Date steht still, Timer und requestAnimationFrame laufen weiter.
    await page.clock.setFixedTime(FIXED_NOW);
    await page.addInitScript((value) => localStorage.setItem('diggy-theme', value), theme);

    /*
     * Jeder API-Aufruf wird hier beantwortet. Ein Aufruf ohne Testdaten
     * bekommt einen Fehler und lässt den Test scheitern — sonst würde eine
     * neue Ansicht unbemerkt doch wieder Live-Daten holen.
     */
    const unmockedApiCalls: string[] = [];
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      (route: Route) => {
        const url = new URL(route.request().url());
        const body = cannedResponse(url);
        if (body !== undefined) return route.fulfill({ json: body });
        unmockedApiCalls.push(`${url.pathname}${url.search}`);
        return route.fulfill({
          status: 501,
          json: { error: 'e2e_unmocked', message: `Keine Testdaten für ${url.pathname}${url.search}` },
        });
      }
    );

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await use(page);

    expect(unmockedApiCalls, 'API-Aufrufe ohne Testdaten (e2e/record-api-data.mjs)').toEqual([]);
    expect(errors, 'Fehler in der Browser-Konsole').toEqual([]);
  },
});

export { expect };

/**
 * Wartet, bis die Seite fertig aussieht: keine Spinner/Skeletons mehr, alle
 * Schriften geladen, zwei Frames gerendert.
 *
 * Schriften sind wichtig für die Breitenmessung: vor dem Laden von Geist
 * misst der Browser mit der Fallback-Schrift, und die ist schmaler.
 */
export async function settle(page: Page): Promise<void> {
  const loaders = page.locator('.animate-spin, .animate-pulse');
  await expect(loaders).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  // Nachgeladenes (Besitzer der IPs, Lazy-Chunks) kann neue Loader zeigen.
  await expect(loaders).toHaveCount(0);
}

/**
 * Öffnet die Startseite und wartet auf die nachgeladenen Hero-Komponenten.
 * Bis dahin steht ihr Fallback da, und die Seite ist ein paar Pixel kürzer.
 */
export async function openHome(page: Page): Promise<void> {
  await page.goto('/');
  for (const lazy of ['.shiny-text', '.split-parent', '.text-type']) {
    await page.locator(lazy).waitFor();
  }
  await settle(page);
}

/** Öffnet einen Report und wartet, bis alle Sektionen geladen sind. */
export async function openReport(page: Page, domain: Domain): Promise<void> {
  await page.goto(`/lookup/${domain}`);
  // Die Findings-Zahl erscheint erst, wenn Records und alle Sektionen da sind.
  await expect(page.locator('#tab-findings')).toHaveText(/\d/);
  await settle(page);

  /*
   * Der Health Score zählt per JavaScript hoch (1,2 s) und ignoriert dabei
   * „Bewegung reduzieren“ — ohne dieses Warten erwischte der Pixelvergleich
   * die Zahl mitten im Hochzählen (90 statt 94). Den Endwert rechnet dieselbe
   * Funktion aus wie die App; der Balken ist fertig, wenn seine Breite passt.
   */
  const score = String(expectedScore(domain));
  const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Health Score' }) });
  await expect(card.getByText(score, { exact: true })).toBeVisible();
  await expect(card.locator(`[style*="width: ${score}%"]`)).toHaveCount(1);
}

/** Score, den die App aus den Findings der Testdaten berechnet. */
function expectedScore(domain: Domain): number {
  const data = domainData[domain] as Record<string, { findings?: Finding[] }>;
  // Wie useProgressiveLookup: Tech-Stack liefert keine Findings.
  const sections = ['lookup', 'propagation', 'dnssec', 'ssl', 'mail', 'whois'];
  return calculateScore(sections.flatMap((key) => data[key]?.findings ?? [])).score;
}

/** Wechselt im Report auf einen Tab und wartet auf dessen Inhalt. */
export async function showTab(page: Page, tab: (typeof REPORT_TABS)[number]): Promise<void> {
  await page.locator(`#tab-${tab}`).click();
  await expect(page.locator(`#panel-${tab}`)).toBeVisible();
  await settle(page);
}

/**
 * Prüft, dass die Seite nicht breiter als der Viewport ist — der häufigste
 * echte Fehler beim Redesign (Mobil, 390 px). Bei einem Treffer nennt die
 * Meldung die innersten Elemente, die über den rechten Rand ragen.
 *
 * Als soft-Assertion, damit ein Test mit mehreren Ansichten (Report-Tabs)
 * alle Brüche auf einmal meldet statt nur den ersten.
 */
export async function expectNoHorizontalOverflow(page: Page, view: string): Promise<void> {
  const result = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const clipped = (el: Element) => {
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        if (parent === document.body) return false;
        if (getComputedStyle(parent).overflowX !== 'visible') return true;
      }
      return false;
    };
    const outside = new Set(
      [...document.body.querySelectorAll('*')].filter(
        (el) => el.getBoundingClientRect().right > viewport + 0.5 && !clipped(el)
      )
    );
    const offenders = [...outside]
      .filter((el) => ![...el.children].some((child) => outside.has(child)))
      .slice(0, 3)
      .map((el) => {
        const name = el.tagName.toLowerCase();
        const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 4) : [];
        const text = (el.textContent ?? '').trim().slice(0, 40);
        const right = Math.round(el.getBoundingClientRect().right);
        return `<${[name, ...cls].join('.')}> bis ${right}px${text ? ` „${text}“` : ''}`;
      });
    return { scrollWidth: document.documentElement.scrollWidth, viewport, offenders };
  });

  expect
    .soft(
      result.scrollWidth,
      `${view}: Seite ist ${result.scrollWidth}px breit bei ${result.viewport}px Viewport. ` +
        `Ragt heraus: ${result.offenders.join('; ') || '(nicht ermittelbar)'}`
    )
    .toBeLessThanOrEqual(result.viewport);
}
