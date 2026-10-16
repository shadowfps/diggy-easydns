import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';

/*
 * „nicht prüfbar“ (#101): der Check scheiterte (Timeout, SERVFAIL …), über
 * die Domain sagt das nichts. Deshalb neutral statt Warnfarbe — aber wie
 * jeder Status mit Form und Wort, nie nur über die Farbe (docs/DESIGN.md).
 * Das Fragezeichen trägt „offen“ auch in der Verfügbarkeitsprüfung.
 */

/** Badge im Kartenkopf. */
export function UncheckedBadge() {
  return (
    <span className="badge">
      <CircleHelp className="size-3" aria-hidden />
      nicht prüfbar
    </span>
  );
}

/** Statuszeile im Karteninhalt: was offen bleibt und warum. */
export function UncheckedLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm leading-relaxed text-fg-muted">
      <CircleHelp className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
