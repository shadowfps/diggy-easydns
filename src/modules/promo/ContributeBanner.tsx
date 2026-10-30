import { AccentBox, Color, Flex, Heading, LayoutCard, Link, Text } from '@mittwald/flow-react-components';
import { GITHUB_URL } from '@/lib/project';
import { useI18n } from '@/i18n';
import styles from './ContributeBanner.module.css';

/**
 * Aufruf zum Mitmachen: diggy ist Open Source. Flows AccentBox, aufgebaut wie
 * „Mitgestalten erwünscht!“ im mStudio — Text links, der Link rechts (bei
 * wenig Platz darunter), je Zeile ein Wort in Violett (Color). Neutral statt
 * mit Verlauf: ein Hinweis, keine Werbung. In einer LayoutCard wie der
 * Converter-Hinweis — so fluchten Ecken und Text mit den Karten ringsum.
 *
 * Wie der Converter-Hinweis nur auf der Startseite: Im Report lenkte ein
 * Banner von den Ergebnissen ab.
 */
export function ContributeBanner() {
  const { t, tRich } = useI18n();
  return (
    <aside aria-labelledby="contribute-heading">
      <LayoutCard>
        <AccentBox backgroundColor="neutral">
          <Flex align="center" wrap="wrap" gap="m">
            <Flex direction="column" grow className={styles.text}>
              <Heading level={2} size="m" id="contribute-heading">
                {tRich('{mitgestalten} erwünscht!', {
                  mitgestalten: <Color color="violet" className={styles.highlight}>{t('Mitgestalten')}</Color>,
                })}
              </Heading>
              <Text>
                <small>
                  <strong>
                    {tRich('diggy ist Open Source — bring {idee} ein oder entwickle mit.', {
                      idee: <Color color="violet" className={styles.highlight}>{t('deine Idee')}</Color>,
                    })}
                  </strong>
                </small>
              </Text>
            </Flex>
            <Link href={GITHUB_URL} target="_blank" rel="noopener noreferrer" size="s" color="dark">
              {t('diggy auf GitHub')}
            </Link>
          </Flex>
        </AccentBox>
      </LayoutCard>
    </aside>
  );
}
