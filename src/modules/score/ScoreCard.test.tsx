import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Finding, HealthScore } from '@/types/dns';
import { calculateScore } from '@/lib/scoring';
import { ScoreCard } from './ScoreCard';

/**
 * Die Score-Karte zeigt den Score als Ring (Flows DonutChart). Früher zählte
 * die Zahl per `animate()` hoch, und bei „Bewegung reduzieren“ tat sie das
 * trotzdem (#103). Mit Flow gibt es kein Hochzählen mehr: die Zahl steht vom
 * ersten Render an auf dem Endwert, den Ring animiert Flow selbst und hält
 * ihn bei der Einstellung an.
 */

const score: HealthScore = {
  score: 94,
  verdict: 'Gut',
  counts: { success: 8, info: 1, warning: 1, critical: 0 },
};

function card(value = score.score) {
  return <ScoreCard score={{ ...score, score: value }} findings={[]} onShowFindings={() => {}} />;
}

/** Der Ring trägt den Wert für Screenreader und zeigt ihn als Zahl. */
function ring(root: HTMLElement) {
  return root.querySelector<HTMLElement>('[role="progressbar"][aria-label="Health Score"]');
}

describe('ScoreCard', () => {
  it('steht schon im ersten Render auf dem Endwert', () => {
    // Ohne Effects: `renderToStaticMarkup` zeigt genau den ersten Render.
    const root = document.createElement('div');
    root.innerHTML = renderToStaticMarkup(card());

    expect(ring(root)).toHaveAttribute('aria-valuenow', '94');
    expect(ring(root)).toHaveTextContent('94');
    expect(ring(root)).toHaveTextContent('/ 100');
  });

  it('springt bei einem neuen Lookup direkt auf den neuen Score', () => {
    const { container, rerender } = render(card());
    rerender(card(72));
    expect(ring(container)).toHaveAttribute('aria-valuenow', '72');
    expect(ring(container)).toHaveTextContent('72');
  });

  it.each([
    [94, 'Status "Erfolg"'],
    [50, 'Status "Warnung"'],
    [20, 'Status "Fehler"'],
  ])('zeigt das Urteil zu %i mit dem passenden Status', (value, status) => {
    render(card(value));
    const heading = screen.getByRole('heading', { name: /^Health Score/ });
    expect(within(heading).getByRole('img', { name: status })).toBeInTheDocument();
  });

  it('führt über „Alle Findings“ zur Liste', async () => {
    const onShowFindings = vi.fn();
    render(<ScoreCard score={score} findings={[]} onShowFindings={onShowFindings} />);
    await userEvent.click(screen.getByRole('button', { name: 'Alle Findings' }));
    expect(onShowFindings).toHaveBeenCalledOnce();
  });

  it('zählt die Befunde je Stufe', () => {
    const { container } = render(card());
    expect(container).toHaveTextContent('8 ok');
    expect(container).toHaveTextContent('1 info');
    expect(container).toHaveTextContent('1 Warnung');
    expect(container).toHaveTextContent('0 kritisch');
  });
});

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

describe('ScoreCard – nicht prüfbare Checks', () => {
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

const titledFinding = (
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
  return screen.getByRole('group', { name: 'Wichtigster Punkt' });
}

/**
 * #83: Reine Empfehlungen (BIMI, TLS-RPT) kosten keine Punkte — als
 * „wichtigster Punkt“ sollen sie erst erscheinen, wenn sonst nichts offen ist.
 */
describe('ScoreCard — wichtigster Punkt', () => {
  const bimi = titledFinding('no-bimi', 'Kein BIMI-Record', { advisory: true });

  it('zeigt einen gewerteten Hinweis vor einer reinen Empfehlung', () => {
    const top = renderTop([bimi, titledFinding('no-caa', 'Kein CAA-Record')]);
    expect(top).toHaveTextContent('Kein CAA-Record');
  });

  it('zeigt die Empfehlung, wenn sonst nichts offen ist', () => {
    const ok = titledFinding('dmarc-present', 'DMARC-Policy: reject', { severity: 'success' });
    expect(renderTop([ok, bimi])).toHaveTextContent('Kein BIMI-Record');
  });

  it('bleibt bei der Reihenfolge kritisch, Warnung, Hinweis', () => {
    const top = renderTop([
      bimi,
      titledFinding('no-caa', 'Kein CAA-Record'),
      titledFinding('no-dmarc', 'Kein DMARC-Record', { severity: 'warning' }),
    ]);
    expect(top).toHaveTextContent('Kein DMARC-Record');
  });
});
