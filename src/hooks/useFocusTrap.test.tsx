import { describe, expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFocusTrap } from './useFocusTrap';

/**
 * Der Fokus wanderte mit Tab durch die Seite HINTER dem Overlay und landete
 * nach dem Schließen am Dokumentanfang statt beim Auslöser (WCAG 2.4.3).
 *
 * Testbar geworden, nachdem das Sichtbarkeits-Kriterium von einer
 * Layout-Abfrage (`offsetParent`, in jsdom immer null) auf `getComputedStyle`
 * über die Vorfahren umgestellt ist. Die eingeklappten Abschnitte am Anfang
 * und Ende des Dialogs sind der Grund, warum der Selektor allein nicht reicht:
 * ihre Buttons tragen selbst kein `hidden`.
 */

function Dialog({ active, onClose }: { active: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);

  if (!active) return null;
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label="Test">
      <div style={{ display: 'none' }}>
        <button type="button">Eingeklappt oben</button>
      </div>
      <button type="button">Erster</button>
      <button type="button">Zweiter</button>
      <button type="button" disabled>
        Gesperrt
      </button>
      <button type="button" hidden>
        Versteckt
      </button>
      <button type="button" onClick={onClose}>
        Schließen
      </button>
      <div hidden>
        <button type="button">Eingeklappt unten</button>
      </div>
    </div>
  );
}

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Öffnen
      </button>
      <button type="button">Dahinter</button>
      <Dialog active={open} onClose={() => setOpen(false)} />
    </>
  );
}

describe('useFocusTrap', () => {
  it('setzt den Fokus beim Öffnen in den Dialog', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Erster' }));
  });

  it('lässt Tab am letzten Element auf das erste umlaufen', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Öffnen' }));

    screen.getByRole('button', { name: 'Schließen' }).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Erster' }));
  });

  it('lässt Shift+Tab am ersten Element auf das letzte umlaufen', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Öffnen' }));

    screen.getByRole('button', { name: 'Erster' }).focus();
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Schließen' }));
  });

  it('überspringt gesperrte und versteckte Elemente', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Öffnen' }));

    // Von "Zweiter" aus weiter: "Gesperrt" und "Versteckt" fallen aus, also
    // landet der Fokus auf "Schließen".
    screen.getByRole('button', { name: 'Zweiter' }).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Schließen' }));
  });

  /**
   * `display:none` und `[hidden]` am VORFAHREN nehmen alles darunter mit. Der
   * Selektor sieht nur das Element selbst — die eingeklappten Buttons standen
   * damit als erstes und letztes Element in der Liste. Folge: der initiale
   * Fokus ging ins Leere, und Tab brach am tatsächlich letzten sichtbaren
   * Element nicht um, sondern verließ den Dialog.
   */
  it('überspringt Elemente unter einem versteckten Vorfahren', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Öffnen' }));

    // Erstes Element: nicht der eingeklappte Button darüber.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Erster' }));

    // Letztes Element: "Schließen", nicht der eingeklappte Button darunter.
    screen.getByRole('button', { name: 'Schließen' }).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Erster' }));
  });

  /**
   * Nach einer DOM-Mutation kann activeElement außerhalb liegen — etwa weil
   * das fokussierte Element entfernt wurde (dann steht es auf <body>) oder
   * weil etwas den Fokus hinter das Overlay gesetzt hat. Umgebrochen wurde
   * vorher nur an first/last/container, der nächste Tab lief also weiter durch
   * die Seite hinter dem Dialog.
   */
  it('holt den Fokus zurück, wenn er außerhalb des Dialogs liegt', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Öffnen' }));

    screen.getByRole('button', { name: 'Dahinter' }).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Erster' }));

    screen.getByRole('button', { name: 'Dahinter' }).focus();
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Schließen' }));
  });

  /** Ohne das landet der Fokus nach dem Schließen am Dokumentanfang. */
  it('gibt den Fokus beim Schließen an den Auslöser zurück', async () => {
    render(<Host />);
    const trigger = screen.getByRole('button', { name: 'Öffnen' });

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));

    expect(document.activeElement).toBe(trigger);
  });

  it('tut nichts, solange der Dialog nicht aktiv ist', () => {
    const onClose = vi.fn();
    render(<Dialog active={false} onClose={onClose} />);
    expect(document.activeElement).toBe(document.body);
  });
});
