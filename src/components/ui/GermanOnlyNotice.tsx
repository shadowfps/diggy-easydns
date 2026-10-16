import { Info } from 'lucide-react';
import { useI18n } from '@/i18n';

/**
 * Hinweis über Impressum und Datenschutz, nur auf Englisch (#86).
 *
 * Beide Seiten bleiben deutsch: maßgeblich ist die deutsche Fassung, und eine
 * Übersetzung wäre ein zweiter Text, der mit dem ersten übereinstimmen muss.
 * Auf Deutsch gibt es nichts zu erklären — deshalb kein Wörterbucheintrag,
 * sondern englischer Text, der nur im Englischen erscheint.
 */
export function GermanOnlyNotice() {
  const { language } = useI18n();
  if (language !== 'en') return null;
  return (
    <p className="panel mt-4 flex items-start gap-2.5 py-3 text-sm text-fg-muted">
      <Info className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
      <span>This page is only available in German for legal reasons.</span>
    </p>
  );
}
