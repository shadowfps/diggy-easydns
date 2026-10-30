import {
  AccentBox,
  Heading,
  IconPicture,
  LayoutCard,
  Link,
  Section,
  Text,
} from '@mittwald/flow-react-components';
import { useI18n } from '@/i18n';
import styles from './ConverterPromo.module.css';

/**
 * Schlichter Werbe-Block für das Schwester-Tool converter.diggydns.cloud
 * (Bild-Konverter & Online-Editor). Sitzt weiter unten auf der Landing-Page,
 * nur im Idle-Zustand — verschwindet, sobald eine Domain gesucht wird.
 *
 * Flows AccentBox in einer LayoutCard: hebt einen Hinweis dekorativ hervor,
 * den man ohne Folgen übergehen kann (sonst wäre es ein Alert). Blau ist
 * eine der beiden zurückhaltenden Grundfarben. Ein Link, kein Button: er
 * führt auf eine andere Seite; die einzige Hauptaktion der Startseite ist
 * die Suche.
 */

const CONVERTER_URL = 'https://converter.diggydns.cloud';

export function ConverterPromo() {
  const { t, tRich } = useI18n();
  return (
    <aside className={styles.promo}>
      <LayoutCard>
        <AccentBox backgroundColor="blue">
          <Section>
            <IconPicture />
            <Heading level={2}>
              {tRich('Kennst du schon {converter} by diggy?', {
                converter: <span className={styles.brand}>converter</span>,
              })}
            </Heading>
            <Text elementType="p">{t('Bilder umwandeln, skalieren & komprimieren — direkt im Browser.')}</Text>
            <Link href={CONVERTER_URL} target="_blank" rel="noopener noreferrer">
              {t('Zu Converter')}
            </Link>
          </Section>
        </AccentBox>
      </LayoutCard>
    </aside>
  );
}
