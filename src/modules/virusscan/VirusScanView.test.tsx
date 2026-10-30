import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import type { VirusScanReport } from '@/types/dns';
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

  /** Steht der Spinner still („Bewegung reduzieren“), trägt der Text den Zustand. */
  it('zeigt den Ladezustand auch als Text', () => {
    renderView(true);
    expect(screen.getByText('Scan läuft')).toBeInTheDocument();
    expect(screen.getByText('Verbinde mit VirusTotal…')).toBeVisible();
  });

  it('hat ohne laufenden Scan keine Statusanzeige', () => {
    renderView(false);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('VirusScanView — Ergebnis', () => {
  const report: VirusScanReport = {
    domain: 'example.com',
    scannedAt: '2026-10-30T10:00:00.000Z',
    reputation: -3,
    verdict: 'suspicious',
    stats: { malicious: 0, suspicious: 2, harmless: 60, undetected: 20, timeout: 0 },
    vendors: [
      { name: 'EngineA', category: 'suspicious', result: 'suspicious' },
      { name: 'EngineB', category: 'suspicious', result: 'phishing' },
      { name: 'EngineC', category: 'harmless', result: 'clean' },
    ],
    categories: { EngineA: 'parked', EngineB: 'parked' },
    totalVotes: { harmless: 4, malicious: 1 },
    lastAnalysisDate: '2026-10-29T08:00:00.000Z',
  };

  it('zeigt Urteil, Kennzahlen und die angeschlagenen Engines', () => {
    render(<VirusScanView data={report} loading={false} error={null} onRun={() => {}} />);
    // Der Name trägt zusätzlich das Status-Icon des Alerts.
    expect(screen.getByRole('heading', { level: 3, name: /Verdächtig$/ })).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) => element?.textContent === 'Einige Engines haben Bedenken. 2 von 82 Engines haben angeschlagen'
      )
    ).toBeInTheDocument();
    const flagged = screen.getByRole('grid', { name: '2 Engines haben angeschlagen' });
    expect(within(flagged).getByText('EngineB')).toBeInTheDocument();
    expect(within(flagged).getByText('phishing')).toBeInTheDocument();
    expect(within(flagged).queryByText('EngineC')).toBeNull();
    // Kategorien ohne Doppelte.
    expect(screen.getAllByText('parked')).toHaveLength(1);
    expect(screen.getByText('-3')).toBeInTheDocument();
  });
});
