import { Alert, Text } from '@mittwald/flow-react-components';
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
    <Alert status="info">
      <Text>The legal information on this page is only available in German.</Text>
    </Alert>
  );
}
