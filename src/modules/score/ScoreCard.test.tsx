import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { animate } from 'motion/react';
import type { Finding, HealthScore } from '@/types/dns';
import { calculateScore } from '@/lib/scoring';
import { ScoreCard } from './ScoreCard';

/**
 * Die Score-Karte zählt die Zahl per imperativem `animate()` hoch und lässt den
 * Balken wachsen. `MotionConfig reducedMotion="user"` erfasst das imperative
 * `animate()` nicht — bei „Bewegung reduzieren“ zählte die Zahl trotzdem hoch
 * (#103). Gefunden hat das erst ein Browser-Screenshot (90 statt 94).
 *
 * `animate` bleibt echt, wird aber beobachtbar: so lässt sich prüfen, ob
 * überhaupt ein Zähler startet. `vi.spyOn` auf den Modul-Namespace geht nicht,
 * ESM-Namespaces sind nicht konfigurierbar.
 */
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, animate: vi.fn(actual.animate) };
});

const animateMock = vi.mocked(animate);

type Listener = (event: MediaQueryListEvent) => void;

/** Steuerbare matchMedia-Implementierung wie in useReducedMotion.test.ts. */
function installMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  let matches = initial;

  window.matchMedia = ((query: string) =>
    ({
      get matches() {
        return query.includes('prefers-reduced-motion') ? matches : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, listener: Listener) => void listeners.add(listener),
      removeEventListener: (_: string, listener: Listener) => void listeners.delete(listener),
      addListener: (listener: Listener) => void listeners.add(listener),
      removeListener: (listener: Listener) => void listeners.delete(listener),
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;

  return {
    set(next: boolean) {
      matches = next;
      for (const listener of listeners) listener({ matches } as MediaQueryListEvent);
    },
  };
}

const score: HealthScore = {
  score: 94,
  verdict: 'Gut',
  counts: { success: 8, info: 1, warning: 1, critical: 0 },
};

function card(value = score.score) {
  return <ScoreCard score={{ ...score, score: value }} findings={[]} onShowFindings={() => {}} />;
}

/** Die große Zahl steht direkt vor „/ 100“. */
function scoreValue(root: HTMLElement) {
  return within(root).getByText('/ 100').previousElementSibling;
}

/** Der Balken ist das einzige Kind der grauen Spur; die Breite steht inline. */
function barWidth(root: HTMLElement) {
  return root.querySelector<HTMLElement>('.bg-surface-muted > *')?.style.width;
}

describe('ScoreCard', () => {
  beforeEach(() => {
    animateMock.mockClear();
  });

  describe('bei „Bewegung reduzieren“', () => {
    /**
     * Ohne Effects: `renderToStaticMarkup` zeigt genau den ersten Render. Ein
     * Nachziehen erst im Effect würde hier auffallen — RTLs render() führt die
     * Effects schon aus, bevor der Test hinschaut.
     */
    it('steht schon im ersten Render auf dem Endwert', () => {
      installMatchMedia(true);
      const root = document.createElement('div');
      root.innerHTML = renderToStaticMarkup(card());

      expect(scoreValue(root)).toHaveTextContent(/^94$/);
      expect(barWidth(root)).toBe('94%');
    });

    it('zeigt sofort die Endwerte und startet keinen Zähler', () => {
      installMatchMedia(true);
      const { container } = render(card());

      expect(scoreValue(container)).toHaveTextContent(/^94$/);
      expect(barWidth(container)).toBe('94%');
      expect(animateMock).not.toHaveBeenCalled();
    });

    it('springt bei einem neuen Lookup direkt auf den neuen Score', () => {
      installMatchMedia(true);
      const { container, rerender } = render(card());

      rerender(card(72));

      expect(scoreValue(container)).toHaveTextContent(/^72$/);
      expect(barWidth(container)).toBe('72%');
      expect(animateMock).not.toHaveBeenCalled();
    });

    it('stoppt einen laufenden Zähler, wenn die Präferenz eingeschaltet wird', () => {
      const media = installMatchMedia(false);
      const { container } = render(card());
      const controls = animateMock.mock.results[0].value as ReturnType<typeof animate>;
      const stop = vi.spyOn(controls, 'stop');

      act(() => media.set(true));

      expect(stop).toHaveBeenCalledOnce();
      expect(animateMock).toHaveBeenCalledOnce();
      expect(scoreValue(container)).toHaveTextContent(/^94$/);
      expect(barWidth(container)).toBe('94%');
    });
  });

  describe('ohne die Einstellung', () => {
    it('zählt wie bisher von 0 hoch und lässt den Balken wachsen', () => {
      installMatchMedia(false);
      const { container } = render(card());

      expect(scoreValue(container)).toHaveTextContent(/^0$/);
      expect(barWidth(container)).toBe('0px');
      expect(animateMock).toHaveBeenCalledOnce();
      expect(animateMock).toHaveBeenCalledWith(expect.anything(), 94, {
        duration: 1.2,
        ease: 'easeOut',
      });
    });
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
  return screen.getByText('Wichtigster Punkt').nextElementSibling;
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
