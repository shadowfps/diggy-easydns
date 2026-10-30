import { IconPicture } from '@mittwald/flow-react-components';
import { useI18n } from '@/i18n';
import { PromoTile } from './PromoTile';
import styles from './ConverterPromo.module.css';

const CONVERTER_URL = 'https://converter.diggydns.cloud';

/**
 * Hinweis auf das Schwester-Tool converter.diggydns.cloud (Bild-Konverter &
 * Online-Editor) — die warme Kupfer-Kachel neben dem Aufruf zum Mitmachen.
 * Nur auf der Startseite, im Idle-Zustand; ein Link, kein Button: die einzige
 * Hauptaktion der Startseite ist die Suche.
 */
export function ConverterPromo() {
  const { t, tRich } = useI18n();
  return (
    <PromoTile
      tone="copper"
      id="converter-heading"
      eyebrow={tRich('{converter} by diggy', { converter: <span className={styles.brand}>converter</span> })}
      title={t('Bilder umwandeln und verkleinern, direkt im Browser.')}
      icon={<IconPicture />}
      href={CONVERTER_URL}
      cta={t('Zu Converter')}
    />
  );
}
