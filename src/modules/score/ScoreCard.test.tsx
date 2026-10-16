import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Finding } from '@/types/dns';
import { calculateScore } from '@/lib/scoring';
import { ScoreCard } from './ScoreCard';

const info = (id: string, title: string, scored?: false): Finding => ({
  id,
  severity: 'info',
  title,
  description: '',
  category: 'mail',
  ...(scored === false ? { scored } : {}),
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
  it('zeigt einen gewerteten Hinweis vor einer reinen Empfehlung', () => {
    const top = renderTop([info('no-bimi', 'Kein BIMI-Record', false), info('no-caa', 'Kein CAA-Record')]);
    expect(top).toHaveTextContent('Kein CAA-Record');
  });

  it('zeigt die Empfehlung, wenn sonst nichts offen ist', () => {
    expect(renderTop([info('no-bimi', 'Kein BIMI-Record', false)])).toHaveTextContent(
      'Kein BIMI-Record'
    );
  });
});
