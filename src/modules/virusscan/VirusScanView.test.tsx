import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { VirusScanView } from './VirusScanView';

/**
 * Ladeanzeige des VirusTotal-Scans (#108) — gleicher Aufbau wie bei PageSpeed,
 * Hintergrund dort in PageSpeedView.test.tsx.
 */

function renderView(loading: boolean) {
  return render(<VirusScanView data={null} loading={loading} error={null} onRun={() => {}} />);
}

describe('VirusScanView — Ladezustand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sagt den laufenden Scan an, sobald die Region steht', () => {
    renderView(true);
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();

    act(() => vi.advanceTimersByTime(100));
    expect(status).toHaveTextContent('VirusTotal-Scan läuft');
    expect(status).not.toHaveAttribute('aria-busy');
  });

  /** Die Stufen wechseln endlos alle 2 s — angesagt wird nur der Scan selbst. */
  it('sagt Stufenwechsel nicht an', () => {
    renderView(true);
    act(() => vi.advanceTimersByTime(100));
    const status = screen.getByRole('status');
    const announced = status.textContent;

    expect(screen.getByText('Verbinde mit VirusTotal…').closest('[aria-hidden="true"]')).not.toBeNull();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText('Prüfe 80+ Security-Engines…')).toBeInTheDocument();
    expect(status.textContent).toBe(announced);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('animiert über die Klassen, die die Reduced-Motion-Regel erreicht', () => {
    const { container } = renderView(true);
    expect(screen.getByText('Verbinde mit VirusTotal…')).toHaveClass('animate-fade-in-up');
    expect(container.querySelectorAll('.animate-scan-bar')).toHaveLength(5);
  });

  it('hat ohne laufenden Scan keine Statusanzeige', () => {
    renderView(false);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
