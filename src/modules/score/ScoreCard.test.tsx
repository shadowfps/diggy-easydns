import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Finding } from '@/types/dns';
import { calculateScore } from '@/lib/scoring';
import { ScoreCard } from './ScoreCard';

const finding = (
  id: string,
  title: string,
  options: Partial<Pick<Finding, 'severity' | 'advisory'>> = {}
): Finding => ({
  id,
  severity: 'info',
  title,
  description: '',
  category: 'mail',
  ...options,
});

function renderTop(findings: Finding[]) {
  render(<ScoreCard score={calculateScore(findings)} findings={findings} onShowFindings={() => {}} />);
  return screen.getByText('Wichtigster Punkt').nextElementSibling;
}

/**
 * #83: Reine Empfehlungen (BIMI, TLS-RPT) kosten keine Punkte — als
 * „wichtigster Punkt“ sollen sie erst erscheinen, wenn sonst nichts offen ist.
 */
describe('ScoreCard — wichtigster Punkt', () => {
  const bimi = finding('no-bimi', 'Kein BIMI-Record', { advisory: true });

  it('zeigt einen gewerteten Hinweis vor einer reinen Empfehlung', () => {
    const top = renderTop([bimi, finding('no-caa', 'Kein CAA-Record')]);
    expect(top).toHaveTextContent('Kein CAA-Record');
  });

  it('zeigt die Empfehlung, wenn sonst nichts offen ist', () => {
    const ok = finding('dmarc-present', 'DMARC-Policy: reject', { severity: 'success' });
    expect(renderTop([ok, bimi])).toHaveTextContent('Kein BIMI-Record');
  });

  it('bleibt bei der Reihenfolge kritisch, Warnung, Hinweis', () => {
    const top = renderTop([
      bimi,
      finding('no-caa', 'Kein CAA-Record'),
      finding('no-dmarc', 'Kein DMARC-Record', { severity: 'warning' }),
    ]);
    expect(top).toHaveTextContent('Kein DMARC-Record');
  });
});
