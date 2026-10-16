import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
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
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Die Region steht beim Einfügen leer und bekommt den Text kurz danach —
   * eine schon gefüllte Region sagen nicht alle Screenreader an.
   */
  it('sagt die laufende Analyse an, sobald die Region steht', () => {
    renderView(true);
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();

    act(() => vi.advanceTimersByTime(100));
    expect(status).toHaveTextContent('PageSpeed-Analyse läuft');
    // aria-busy auf der Live-Region hieße „Ansage zurückhalten“.
    expect(status).not.toHaveAttribute('aria-busy');
  });

  /**
   * Die Stufen wechseln endlos alle 2,5 s. Stünden sie in der Region, käme
   * jeder Wechsel als neue Ansage, bis das Ergebnis da ist.
   */
  it('sagt Stufenwechsel nicht an', () => {
    renderView(true);
    act(() => vi.advanceTimersByTime(100));
    const status = screen.getByRole('status');
    const announced = status.textContent;

    expect(screen.getByText('Verbinde mit PageSpeed Insights...').closest('[aria-hidden="true"]')).not.toBeNull();
    act(() => vi.advanceTimersByTime(2500));
    expect(screen.getByText('Starte Lighthouse Runner...')).toBeInTheDocument();
    expect(status.textContent).toBe(announced);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  /**
   * Die Regel für „Bewegung reduzieren“ in globals.css greift über diese
   * Klassen. Ein Inline-`style={{ animation }}` wie vorher käme an ihr vorbei.
   */
  it('animiert über die Klassen, die die Reduced-Motion-Regel erreicht', () => {
    const { container } = renderView(true);
    expect(screen.getByText('Verbinde mit PageSpeed Insights...')).toHaveClass('animate-fade-in-up');
    expect(container.querySelectorAll('.animate-scan-bar')).toHaveLength(5);
  });

  it('hat ohne laufenden Scan keine Statusanzeige', () => {
    renderView(false);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
