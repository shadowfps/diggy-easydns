import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { lookupFailurePhrase } from '@/lib/lookupFailure';
import { phraseText, useI18n } from '@/i18n';

/*
 * „nicht prüfbar“ (#101): der Check scheiterte (Timeout, SERVFAIL …), über
 * die Domain sagt das nichts. Deshalb neutral statt Warnfarbe — aber wie
 * jeder Status mit Form und Wort, nie nur über die Farbe (docs/DESIGN.md).
 * Das Fragezeichen trägt „offen“ auch in der Verfügbarkeitsprüfung.
 */

/** Badge im Kartenkopf. */
export function UncheckedBadge() {
  const { t } = useI18n();
  return (
    <span className="badge">
      <CircleHelp className="size-3" aria-hidden />
      {t('nicht prüfbar')}
    </span>
  );
}

/**
 * Statuszeile im Karteninhalt: „Der <name>-Check scheiterte (<Grund>). Ob
 * <name> eingerichtet ist, bleibt offen — später erneut prüfen.“ Ein Satz für
 * alle Karten — die Einzelheiten stehen im Finding. Ohne `reason` (die ganze
 * Sektion fiel aus) entfällt die Klammer.
 */
export function UncheckedLine({
  name,
  reason,
  children,
}: {
  name: string;
  reason?: unknown;
  /** Ergänzung hinter dem Satz, etwa was ein anhaltender Fehler bedeutet. */
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-2 text-sm leading-relaxed text-fg-muted">
      <CircleHelp className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
      <span>
        {reason
          ? t('Der {name}-Check scheiterte ({reason}). Ob {name} eingerichtet ist, bleibt offen — später erneut prüfen.', {
              name,
              reason: phraseText(lookupFailurePhrase(reason)),
            })
          : t('Der {name}-Check scheiterte. Ob {name} eingerichtet ist, bleibt offen — später erneut prüfen.', {
              name,
            })}
        {children && <> {children}</>}
      </span>
    </div>
  );
}
