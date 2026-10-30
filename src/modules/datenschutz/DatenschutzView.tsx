import { Flex, Heading, Text } from '@mittwald/flow-react-components';
import { GermanOnlyNotice } from '@/components/ui/GermanOnlyNotice';
import { useI18n } from '@/i18n';
import DatenschutzText from './DatenschutzText';

/**
 * Datenschutzhinweise — Rahmen der Seite: Überschrift, Lead, darunter der
 * Text in einer LayoutCard. Der Text selbst steht in DatenschutzText.tsx
 * (Begründung dort). Nachgeladen wird die Seite als Ganzes, mit Platzhalter
 * (App.tsx).
 */
export function DatenschutzView() {
  const { t } = useI18n();
  return (
    <Flex direction="column" gap="m">
      <Heading level={1}>{t('Datenschutz')}</Heading>
      <GermanOnlyNotice />
      <Text elementType="p" lang="de">
        Was diggy verarbeitet, auf welcher Rechtsgrundlage, wie lange und was dabei an
        Dritte geht.
      </Text>
      <DatenschutzText />
    </Flex>
  );
}
