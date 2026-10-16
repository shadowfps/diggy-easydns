import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent } from 'react';
import { motion } from 'motion/react';
import { CircleHelp } from 'lucide-react';
import type { Explanation } from '@/lib/explanations';
import { cn } from '@/lib/cn';

/** Mindestabstand des Popovers zum Fensterrand und zum Button, in px. */
const EDGE = 16;
const GAP = 8;

interface InfoButtonProps {
  /** Der erklärte Begriff, so wie er in der Oberfläche steht: „MX“, „DMARC“. */
  term: string;
  explanation: Explanation;
  className?: string;
}

/**
 * Kleines „?“ neben einem Fachbegriff, das eine Erklärung aufklappt (#80).
 *
 * Bewusst kein Hover-Tooltip: das erreicht man weder per Touch noch per
 * Tastatur, und Screenreader lesen es unzuverlässig vor. Stattdessen das
 * Disclosure-Muster — ein Button mit `aria-expanded`, der Inhalt steht im DOM
 * direkt dahinter und wird so in der richtigen Reihenfolge vorgelesen. Der
 * Fokus bleibt auf dem Button; Escape, ein Klick daneben oder Tab weiter
 * schließen wieder.
 *
 * Der Inhalt hängt absolut am Button, nicht in einem Portal: so bleibt die
 * Lesereihenfolge erhalten. Dafür darf kein Vorfahr `overflow-hidden` haben
 * (siehe RecordsList), und die Position wird nach dem Öffnen nachgemessen —
 * im Viewport gehalten und nach oben geklappt, wenn unten der Platz fehlt.
 */
export function InfoButton({ term, explanation, className }: InfoButtonProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);

  // Klick oder Tippen außerhalb schließt, Escape ebenso. `pointerdown` statt
  // `click`, damit es auch greift, wenn das Ziel den Klick selbst abfängt
  // (`stopPropagation`).
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    // Der Fokus bleibt dabei, wo er ist: auf dem Button — das Popover selbst
    // enthält nichts Fokussierbares.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Position vor dem ersten Paint korrigieren. Direkt am Element statt über
  // State: das spart einen zweiten Render und ein Flackern an der Ausgangslage.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const panel = panelRef.current;
    if (!open || !wrapper || !panel) return;

    const place = () => {
      panel.style.left = '0px';
      delete panel.dataset.side;

      const anchor = wrapper.getBoundingClientRect();
      const rect = panel.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;

      let shift = 0;
      if (rect.right > viewportWidth - EDGE) shift = viewportWidth - EDGE - rect.right;
      if (rect.left + shift < EDGE) shift = EDGE - rect.left;
      panel.style.left = `${shift}px`;

      const needed = rect.height + GAP + EDGE;
      if (window.innerHeight - anchor.bottom < needed && anchor.top >= needed) {
        panel.dataset.side = 'top';
      }
    };

    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  // Tab auf das nächste Element schließt. Ohne `relatedTarget` (Klick auf den
  // Text im Popover, der selbst keinen Fokus annimmt) bleibt es offen.
  const handleBlur = (event: FocusEvent<HTMLSpanElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && !event.currentTarget.contains(next)) setOpen(false);
  };

  return (
    <span ref={wrapperRef} onBlur={handleBlur} className={cn('relative inline-flex', className)}>
      {/* Sichtbar 20 px, damit Titel und Zeilen nicht höher werden; die
          Klickfläche wächst über `before:` auf 32 px (DESIGN.md: btn-sm). */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Was bedeutet ${term}?`}
        aria-expanded={open}
        // Nur bei offenem Popover: sonst zeigte die Referenz auf eine ID, die
        // es im DOM nicht gibt (gleiches Problem wie früher bei den Tabs).
        aria-controls={open ? panelId : undefined}
        className="btn btn-ghost btn-icon relative size-5 text-fg-subtle before:absolute before:-inset-1.5 hover:text-fg aria-expanded:bg-surface-muted aria-expanded:text-fg"
      >
        <CircleHelp className="size-3.5" aria-hidden="true" />
      </button>

      {open && (
        <motion.span
          ref={panelRef}
          id={panelId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          // `font-sans font-normal …` setzt zurück, was der Ort vererbt — in
          // der Typ-Spalte der Records etwa Mono und Semibold.
          className="overlay absolute left-0 top-full z-50 mt-2 block w-80 max-w-[calc(100vw-2rem)] whitespace-normal p-4 text-left font-sans font-normal normal-case tracking-normal data-[side=top]:top-auto data-[side=top]:bottom-full data-[side=top]:mb-2 data-[side=top]:mt-0"
        >
          <span className="block text-sm font-semibold text-fg">
            {term} <span className="text-fg-subtle">·</span> {explanation.title}
          </span>
          <span className="mt-1 block text-sm leading-relaxed text-fg-muted">{explanation.text}</span>
        </motion.span>
      )}
    </span>
  );
}
