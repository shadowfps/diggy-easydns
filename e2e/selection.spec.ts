import { expect, openHome, test, type Theme } from './test';

/**
 * Markierter Text muss in beiden Themes lesbar bleiben (#127).
 *
 * Die Regel stand einmal als `@apply … dark:…` in `::selection`. Tailwind
 * machte daraus `::selection:is()`, einen Selektor, der nie greift — im Dark
 * Mode blieb die helle Regel stehen, und markierter Text wurde schwarz auf
 * Schwarz. Unit-Tests sehen das nicht, weil jsdom kein CSS anwendet; hier
 * rechnet Chrome die echten Farben aus.
 *
 * Gemessen wird der Kontrast zwischen Textfarbe und Markierung, die über dem
 * Seitenhintergrund liegt. Die Farben laufen über ein 1×1-Canvas, damit jede
 * Schreibweise (`rgb()`, `oklab()`, `color-mix()`) als RGB ankommt.
 */

for (const theme of ['light', 'dark'] as Theme[]) {
  test.describe(`Markierung ${theme === 'light' ? 'hell' : 'dunkel'}`, () => {
    test.use({ theme });

    test('markierter Text ist lesbar', async ({ page }) => {
      await openHome(page);

      const { text, highlight } = await page.evaluate(() => {
        const selection = getComputedStyle(document.body, '::selection');
        const canvasColor = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        const pixel = (...fills: string[]): number[] => {
          ctx.clearRect(0, 0, 1, 1);
          for (const fill of fills) {
            ctx.fillStyle = fill;
            ctx.fillRect(0, 0, 1, 1);
          }
          return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
        };
        return {
          text: pixel(selection.color),
          highlight: pixel(canvasColor, selection.backgroundColor),
        };
      });

      expect(contrast(text, highlight), `Text ${text} auf Markierung ${highlight}`).toBeGreaterThanOrEqual(4.5);
    });
  });
}

/** Kontrastverhältnis nach WCAG 2.x. */
function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
