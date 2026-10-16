import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageSpeedView } from './PageSpeedView';

/**
 * Ladeanzeige des PageSpeed-Scans (#108). Bei „Bewegung reduzieren“ stehen
 * Spinner und Balken still — dann muss der Ladezustand über Text und Ansage
 * ankommen. Ob die Animation wirklich steht, kann jsdom nicht prüfen (es
 * rechnet kein CSS); das belegt die Sichtprüfung im Browser.
 */

function renderView(loading: boolean) {
  return render(
    <PageSpeedView
      data={null}
      loading={loading}
      error={null}
      strategy="mobile"
      onStrategyChange={() => {}}
      onRun={() => {}}
    />
  );
}

describe('PageSpeedView — Ladezustand', () => {
  it('sagt die laufende Analyse als Status an', () => {
    renderView(true);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Analyse läuft');
    expect(status).toHaveTextContent('Verbinde mit PageSpeed Insights');
    // aria-busy auf der Live-Region hieße „Ansage zurückhalten“.
    expect(status).not.toHaveAttribute('aria-busy');
  });

  /**
   * Die Regel für „Bewegung reduzieren“ in globals.css greift über diese
   * Klassen. Ein Inline-`style={{ animation }}` wie vorher käme an ihr vorbei.
   */
  it('animiert über die Klassen, die die Reduced-Motion-Regel erreicht', () => {
    renderView(true);
    expect(screen.getByText('Verbinde mit PageSpeed Insights...')).toHaveClass('animate-fade-in-up');
    expect(screen.getByRole('status').querySelectorAll('.animate-scan-bar')).toHaveLength(5);
  });

  it('hat ohne laufenden Scan keine Statusanzeige', () => {
    renderView(false);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
