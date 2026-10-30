import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PageSpeedReport } from '@/types/dns';
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

    expect(screen.getByText('Verbinde mit PageSpeed Insights…').closest('[aria-hidden="true"]')).not.toBeNull();
    act(() => vi.advanceTimersByTime(2500));
    expect(screen.getByText('Starte Lighthouse Runner…')).toBeInTheDocument();
    expect(status.textContent).toBe(announced);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  /**
   * Bei „Bewegung reduzieren“ steht Flows Spinner still — dann trägt der Text
   * den Zustand: Überschrift und aktuelle Stufe stehen sichtbar da.
   */
  it('zeigt den Ladezustand auch als Text', () => {
    renderView(true);
    expect(screen.getByText('Analyse läuft')).toBeInTheDocument();
    expect(screen.getByText('Verbinde mit PageSpeed Insights…')).toBeVisible();
  });

  it('hat ohne laufenden Scan keine Statusanzeige', () => {
    renderView(false);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('PageSpeedView — Start und Strategie', () => {
  it('startet den Scan aus dem Leerzustand', async () => {
    const onRun = vi.fn();
    render(
      <PageSpeedView
        data={null}
        loading={false}
        error={null}
        strategy="mobile"
        onStrategyChange={() => {}}
        onRun={onRun}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Scan starten' }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('meldet die gewählte Strategie und wechselt sie', async () => {
    const onStrategyChange = vi.fn();
    render(
      <PageSpeedView
        data={null}
        loading={false}
        error={null}
        strategy="mobile"
        onStrategyChange={onStrategyChange}
        onRun={() => {}}
      />
    );
    expect(screen.getByRole('radio', { name: 'Mobile' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Desktop' })).not.toBeChecked();
    await userEvent.click(screen.getByText('Desktop'));
    expect(onStrategyChange).toHaveBeenCalledWith('desktop');
  });
});

describe('PageSpeedView — Ergebnis', () => {
  const report: PageSpeedReport = {
    domain: 'example.com',
    requestedUrl: 'https://example.com',
    finalUrl: 'https://example.com/',
    strategy: 'mobile',
    fetchedAt: '2026-10-30T10:00:00.000Z',
    source: 'psi',
    performanceScore: 72,
    metrics: { lcpMs: 1800, inpMs: 650, fcpMs: 900, ttfbMs: 300, cls: 0.02 },
    fieldData: { lcp: {}, cls: {}, inp: {}, fcp: {} },
    opportunities: [{ id: 'unused-js', title: 'Reduce unused JavaScript', displayValue: 'Est savings of 120 KiB' }],
  };

  it('zeigt Kennzahlen mit Urteil als Wort und die Optimierungen', () => {
    render(
      <PageSpeedView
        data={report}
        loading={false}
        error={null}
        strategy="mobile"
        onStrategyChange={() => {}}
        onRun={() => {}}
      />
    );
    expect(screen.getByRole('heading', { name: /^PageSpeed Scan/ })).toHaveTextContent('Scan abgeschlossen');
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('1.80s')).toBeInTheDocument();
    // 72 ist verbesserungswürdig, 650 ms INP schlecht — jeweils als Wort, nicht nur als Farbe.
    expect(screen.getAllByText('verbesserungswürdig')).toHaveLength(1);
    expect(screen.getAllByText('schlecht')).toHaveLength(1);
    const table = screen.getByRole('grid', { name: 'Top Optimierungspotenziale' });
    expect(within(table).getByText('Reduce unused JavaScript')).toBeInTheDocument();
    expect(within(table).getByText('Est savings of 120 KiB')).toBeInTheDocument();
  });
});
