import { useState } from 'react';
import {
  AlertText,
  Button,
  IconDate,
  Text,
  Tooltip,
  TooltipTrigger,
} from '@mittwald/flow-react-components';
import type { ExpiryReminder } from '@/lib/calendar';
import { useI18n } from '@/i18n';

/**
 * „In den Kalender“: lädt eine .ics mit dem Ablauftermin herunter.
 *
 * Rendert nichts, wenn das Datum nicht lesbar ist — ein Button, der eine
 * leere oder falsche Datei liefert, wäre schlechter als keiner. Ob der Ablauf
 * schon vorbei ist, entscheidet die Ansicht: sie kennt die Tage bis zum Ablauf
 * bereits und zeigt sie im Badge an.
 */
export function CalendarButton({ reminder }: { reminder: ExpiryReminder }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);

  if (Number.isNaN(new Date(reminder.expiresAt).getTime())) return null;

  const handlePress = async () => {
    try {
      // Erst beim Klick laden: die meisten Besucher brauchen die Datei nie, und
      // der Erzeuger muss nicht im Haupt-Chunk liegen.
      const { buildExpiryCalendar, calendarFilename } = await import('@/lib/calendar');
      const ics = buildExpiryCalendar([reminder], {
        now: new Date(),
        origin: window.location.origin,
      });
      downloadFile(calendarFilename(reminder), ics, 'text/calendar;charset=utf-8');
      setFailed(false);
    } catch {
      // Typischer Fall: ein Tab von vor dem letzten Deploy fragt nach einem
      // Chunk, den es nicht mehr gibt. Ohne Meldung passierte beim Klick
      // einfach nichts.
      setFailed(true);
    }
  };

  return (
    <>
      {/* Die Erinnerungen stehen ergänzend im Tooltip — die Beschriftung
          allein sagt schon, was der Button tut (Flow: lange Verzögerung). */}
      <TooltipTrigger delay="long">
        <Button size="s" variant="soft" color="secondary" onPress={handlePress}>
          <IconDate />
          <Text>{t('In den Kalender')}</Text>
        </Button>
        <Tooltip>{t('Termin am Ablaufdatum mit Erinnerung 14 Tage und 1 Tag vorher (.ics)')}</Tooltip>
      </TooltipTrigger>
      {failed && (
        // Das Ergebnis der Aktion direkt am Button (AlertText); `role="alert"`
        // sagt es auch an, wenn der Fokus noch auf dem Button steht.
        <div role="alert">
          <AlertText status="danger">
            {t('Die Kalender-Datei ließ sich nicht laden. Lade die Seite neu und versuch es noch einmal.')}
          </AlertText>
        </div>
      )}
    </>
  );
}

/** Derselbe Weg wie „Export JSON“: Blob, Objekt-URL, unsichtbarer Link. */
function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
