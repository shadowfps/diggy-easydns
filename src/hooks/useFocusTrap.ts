import { useEffect, type RefObject } from 'react';

/**
 * Fokussierbare Elemente.
 *
 * `:not([disabled])` und `:not([hidden])` stehen im Selektor, weil sie CSS
 * sind und überall gleich funktionieren. Der Selektor allein reicht aber
 * nicht: er sieht nur das Attribut am Element selbst.
 */
const FOCUSABLE = [
  'a[href]:not([hidden])',
  'button:not([disabled]):not([hidden])',
  'input:not([disabled]):not([hidden])',
  'select:not([disabled]):not([hidden])',
  'textarea:not([disabled]):not([hidden])',
  '[tabindex]:not([tabindex="-1"]):not([hidden])',
].join(',');

/**
 * Per CSS versteckt — und damit nicht fokussierbar.
 *
 * Nötig zusätzlich zum Selektor, weil `display:none` und `[hidden]` am
 * VORFAHREN alles darunter mitnehmen: ein Element in einem eingeklappten
 * Abschnitt matcht `:not([hidden])` und stand trotzdem in der Liste. War es
 * das erste, ging der initiale Fokus ins Leere; war es das berechnete letzte,
 * brach Tab am tatsächlich letzten sichtbaren Element nicht um und verließ
 * den Dialog — genau der Keyboard-Trap, den der Hook verhindern soll.
 *
 * Vorher stand hier `offsetParent !== null`. Das deckte beides ab, ist aber
 * eine Layout-Abfrage und liefert in jsdom immer `null`, machte den Hook also
 * untestbar. `getComputedStyle` kennt jsdom, die Kette über die Vorfahren
 * bildet dasselbe Kriterium ohne Layout nach.
 */
function isHiddenByStyle(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hasAttribute('hidden')) return true;

    const style = getComputedStyle(node);
    if (style.display === 'none') return true;
    // visibility erbt, am Element selbst genügte theoretisch — die Kette
    // kostet nichts und deckt 'collapse' mit ab.
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return true;
  }

  return false;
}

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
        (element) => !isHiddenByStyle(element)
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

      // Fokus schon außerhalb: passiert, wenn das fokussierte Element entfernt
      // oder deaktiviert wurde (dann steht activeElement auf <body>) oder wenn
      // etwas ihn hinter das Overlay gesetzt hat. Ohne diesen Zweig fing der
      // nächste Tab nicht um — geprüft wurde nur auf first/last/container —
      // und die Falle war offen.
      if (!container.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

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
