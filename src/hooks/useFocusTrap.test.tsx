import { describe, expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFocusTrap } from './useFocusTrap';

/**
 * Der Fokus wanderte mit Tab durch die Seite HINTER dem Overlay und landete
 * nach dem Schließen am Dokumentanfang statt beim Auslöser (WCAG 2.4.3).
 *
 * Testbar geworden, nachdem das Sichtbarkeits-Kriterium aus einer
 * Layout-Abfrage (`offsetParent`, in jsdom immer null) in den Selektor
 * gewandert ist.
 */

function Dialog({ active, onClose }: { active: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);

  if (!active) return null;
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label="Test">
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
