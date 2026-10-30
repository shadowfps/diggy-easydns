import type { ReactNode } from 'react';
import { AlertBadge, AlertText } from '@mittwald/flow-react-components';
import { lookupFailurePhrase } from '@/lib/lookupFailure';
import { phraseText, useI18n } from '@/i18n';

/*
 * „nicht prüfbar“ (#101): der Check scheiterte (Timeout, SERVFAIL …), über
 * die Domain sagt das nichts. Deshalb Flows Status `unavailable` statt einer
 * Warnfarbe — aber wie jeder Status mit Icon und Wort, nie nur über die Farbe
 * (docs/DESIGN.md).
 */

/** Badge in der Überschrift einer Section. */
export function UncheckedBadge() {
  const { t } = useI18n();
  return <AlertBadge status="unavailable">{t('nicht prüfbar')}</AlertBadge>;
}

/**
 * Statuszeile im Inhalt: „Der <name>-Check scheiterte (<Grund>). Ob <name>
 * eingerichtet ist, bleibt offen — später erneut prüfen.“ Ein Satz für alle
 * Bereiche — die Einzelheiten stehen im Finding. Ohne `reason` (die ganze
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
    <AlertText status="unavailable">
      {reason
        ? t('Der {name}-Check scheiterte ({reason}). Ob {name} eingerichtet ist, bleibt offen — später erneut prüfen.', {
            name,
            reason: phraseText(lookupFailurePhrase(reason)),
          })
        : t('Der {name}-Check scheiterte. Ob {name} eingerichtet ist, bleibt offen — später erneut prüfen.', {
            name,
          })}
      {children && <> {children}</>}
    </AlertText>
  );
}
