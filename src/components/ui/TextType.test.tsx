import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import TextType from './TextType';

/**
 * Tests für den Typewriter.
 *
 * Die Komponente hatte keine Abdeckung, obwohl ihr Laufzeitverhalten bei
 * "Bewegung reduzieren" schon einmal fehlerhaft war (der Text verdoppelte
 * sich — siehe useReducedMotion.test.ts). Beim Umstieg auf
 * eslint-plugin-react-hooks 7 sind zwei Dinge umgebaut worden:
 *
 * - der statische Satz bei reduzierter Bewegung wird jetzt im Render
 *   abgeleitet statt per setState im Effect gesetzt,
 * - das Element entsteht als JSX statt über createElement, damit die Ref
 *   nicht im Render durch einen Funktionsaufruf läuft (react-hooks/refs).
 *
 * Beides ist sichtbares Verhalten, also hier festgehalten.
 */

type Listener = (event: MediaQueryListEvent) => void;

/** matchMedia, dessen Wert sich zur Laufzeit umschalten lässt. */
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

beforeEach(() => {
  installMatchMedia(false);
});

describe('TextType', () => {
  it('rendert in das über `as` gewählte Element und reicht Props durch', () => {
    installMatchMedia(true);
    render(<TextType as="h1" data-testid="hero" text="DNS made friendly" />);

    const host = screen.getByTestId('hero');
    expect(host.tagName).toBe('H1');
    expect(host).toHaveClass('text-type');
  });

  it('zeigt bei reduzierter Bewegung den ersten Satz sofort vollständig', () => {
    installMatchMedia(true);
    render(<TextType data-testid="hero" text={['Erster Satz', 'Zweiter Satz']} />);

    expect(screen.getByTestId('hero')).toHaveTextContent('Erster Satz');
  });

  it('blendet den Cursor bei reduzierter Bewegung nicht aus', () => {
    installMatchMedia(true);
    const { container } = render(<TextType hideCursorWhileTyping text="Ein Satz" />);

    // Ohne Tipp-Schleife tippt nichts — ein versteckter Cursor wäre hier ein
    // Dauerzustand, kein Zwischenschritt.
    const cursor = container.querySelector('.text-type__cursor');
    expect(cursor).not.toBeNull();
    expect(cursor).not.toHaveClass('text-type__cursor--hidden');
  });

  /**
   * Verhaltensänderung des Umbaus, bewusst festgehalten.
   *
   * Vorher übernahm die Schleife den bereits vollständigen Satz und lief
   * dahinter weiter, weil der Effect `displayedText` und `currentCharIndex`
   * mitgesetzt hatte. Jetzt bleibt der Tipp-State unberührt, der Satz wird
   * nur noch abgeleitet — schaltet jemand die Präferenz ab, tippt die
   * Schleife von vorn. Die Verdopplung von damals kann so nicht entstehen.
   */
  it('tippt von vorn, wenn die Präferenz zur Laufzeit abgeschaltet wird', () => {
    const media = installMatchMedia(true);
    render(<TextType data-testid="hero" text="Erster Satz" initialDelay={50} />);
    expect(screen.getByTestId('hero')).toHaveTextContent('Erster Satz');

    act(() => media.set(false));

    // Unmittelbar nach dem Umschalten hat noch kein Timer gefeuert.
    expect(screen.getByTestId('hero')).not.toHaveTextContent('Erster Satz');
  });
});
