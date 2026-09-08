import { useEffect, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Hält den Tastatur-Fokus innerhalb eines offenen Dialogs und gibt ihn beim
 * Schließen an das auslösende Element zurück.
 *
 * Ohne das wandert der Fokus mit Tab durch die Seite HINTER dem Overlay, und
 * nach dem Schließen landet er am Dokumentanfang statt beim Auslöser —
 * WCAG 2.4.3 (Focus Order) und 2.1.2 (No Keyboard Trap, hier die Gegenrichtung).
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    // Auslöser merken, um den Fokus später zurückzugeben.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Erstes fokussierbares Element anspringen, sonst den Container selbst
    // (der trägt tabIndex={-1}), damit Screenreader im Dialog landen.
    const focusables = () =>
      Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (element) => element.offsetParent !== null || element === container
      );

    (focusables()[0] ?? container)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !container) return;

      const elements = focusables();
      if (elements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && (current === first || current === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Nur zurückgeben, wenn das Element noch im Dokument hängt.
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [active, containerRef]);
}
