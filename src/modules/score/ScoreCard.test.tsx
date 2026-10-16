import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Finding } from '@/types/dns';
import { calculateScore } from '@/lib/scoring';
import { ScoreCard } from './ScoreCard';

/**
 * „Nicht prüfbar“ zieht nichts ab (#101). Der Score sagt dann dazu, dass er
 * unvollständig ist — sonst sähe eine Domain, deren Checks ins Leere liefen,
 * besser aus als eine, die geprüft wurde.
 */

const finding = (id: string, extra: Partial<Finding> = {}): Finding => ({
  id,
  severity: 'info',
  title: id,
  description: '',
  category: 'ssl',
  ...extra,
});

function renderCard(findings: Finding[], failed?: Parameters<typeof ScoreCard>[0]['failed']) {
  render(
    <ScoreCard
      score={calculateScore(findings)}
      findings={findings}
      failed={failed}
      onShowFindings={() => {}}
    />
  );
}

describe('ScoreCard', () => {
  it('kennzeichnet den Score als unvollständig, wenn Checks nicht prüfbar waren', () => {
    renderCard(
      [finding('ssl-unchecked', { unchecked: true }), finding('no-caa')],
      // Der Tech-Stack liefert keine Findings — sein Ausfall zählt nicht.
      ['whois', 'techStack']
    );

    const note = screen.getByText('Unvollständig:').parentElement;
    expect(note).toHaveTextContent(/^Unvollständig:\s*2 Checks nicht prüfbar$/);
  });

  it('zeigt nichts davon, wenn alles geprüft wurde', () => {
    renderCard([finding('no-caa')], ['techStack']);

    expect(screen.queryByText(/Unvollständig/)).not.toBeInTheDocument();
  });
});
