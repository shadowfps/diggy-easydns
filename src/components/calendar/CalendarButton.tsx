import { useState } from 'react';
import { AlertCircle, CalendarPlus } from 'lucide-react';
import type { ExpiryReminder } from '@/lib/calendar';
import { useI18n } from '@/i18n';

/**
 * „In den Kalender“: lädt eine .ics mit dem Ablauftermin herunter.
 *
 * Rendert nichts, wenn das Datum nicht lesbar ist — ein Button, der eine
 * leere oder falsche Datei liefert, wäre schlechter als keiner. Ob der Ablauf
 * schon vorbei ist, entscheidet die Karte: sie kennt die Tage bis zum Ablauf
 * bereits und zeigt sie im Badge an.
 */
export function CalendarButton({ reminder }: { reminder: ExpiryReminder }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);

  if (Number.isNaN(new Date(reminder.expiresAt).getTime())) return null;

  const handleClick = async () => {
    try {
      // Erst beim Klick laden: die meisten Besucher brauchen die Datei nie, und
      // der Erzeuger kostete im Haupt-Chunk rund 1,5 kB gzip — fast das ganze
      // verbleibende Budget des kritischen Pfads (scripts/check-bundle-size.mjs).
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
      <button
        type="button"
        onClick={handleClick}
        className="btn btn-secondary btn-sm"
        title={t('Termin am Ablaufdatum mit Erinnerung 14 Tage und 1 Tag vorher (.ics)')}
      >
        <CalendarPlus className="size-3.5" />
        {t('In den Kalender')}
      </button>
      {failed && (
        <p role="alert" className="mt-2 flex items-start gap-2 text-xs text-fg-muted">
          <AlertCircle className="mt-px size-3.5 shrink-0 text-danger" />
          <span>
            {t('Die Kalender-Datei ließ sich nicht laden. Lade die Seite neu und versuch es noch einmal.')}
          </span>
        </p>
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
