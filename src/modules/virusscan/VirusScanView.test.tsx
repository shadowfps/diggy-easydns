import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirusScanView } from './VirusScanView';

/**
 * Ladeanzeige des VirusTotal-Scans (#108) — gleicher Aufbau wie bei PageSpeed,
 * Hintergrund dort in PageSpeedView.test.tsx.
 */

function renderView(loading: boolean) {
  return render(<VirusScanView data={null} loading={loading} error={null} onRun={() => {}} />);
}

describe('VirusScanView — Ladezustand', () => {
  it('sagt den laufenden Scan als Status an', () => {
    renderView(true);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Scan läuft');
    expect(status).toHaveTextContent('Verbinde mit VirusTotal');
    expect(status).not.toHaveAttribute('aria-busy');
  });

  it('animiert über die Klassen, die die Reduced-Motion-Regel erreicht', () => {
    renderView(true);
    expect(screen.getByText('Verbinde mit VirusTotal…')).toHaveClass('animate-fade-in-up');
    expect(screen.getByRole('status').querySelectorAll('.animate-scan-bar')).toHaveLength(5);
  });

  it('hat ohne laufenden Scan keine Statusanzeige', () => {
    renderView(false);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
