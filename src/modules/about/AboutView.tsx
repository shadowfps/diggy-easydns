import type { ReactNode } from 'react';
import {
  AccentBox,
  ColumnLayout,
  Heading,
  Icon,
  IconDomain,
  IconServer,
  LayoutCard,
  Section,
  Text,
} from '@mittwald/flow-react-components';
import { IconSchool } from '@tabler/icons-react';
import { useI18n } from '@/i18n';
import styles from './AboutView.module.css';

/**
 * Textseite: Überschrift und Lead, darunter eine LayoutCard. Die erste
 * Section erzählt, die drei AccentBoxen fassen zusammen, die beiden letzten
 * Sections sagen, was diggy sein soll und was noch kommt.
 */
export function AboutView() {
  const { t } = useI18n();
  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <Heading level={1}>{t('Warum diggy existiert')}</Heading>
        <Text elementType="p">
          {t('diggy ist ein privates Lern- und Entwicklungsprojekt. Ich nutze es, um besser zu verstehen, wie DNS, Domains, SSL, Mail-Security und Web-Performance in der Praxis zusammenspielen.')}
        </Text>
      </div>

      <LayoutCard>
        <Section>
          <Text elementType="p">
            {t('Ich arbeite bei einem Webhoster und habe dadurch täglich Berührungspunkte mit Domains, Hosting und technischen Setups. Dieses Tool ist aus genau dieser Neugier entstanden: Dinge sichtbar machen, die sonst oft in verschiedenen Tools, Terminals oder Panels verteilt sind.')}
          </Text>
          <Text elementType="p">
            {t('Gleichzeitig lerne ich noch, probiere Ideen aus und entwickle nebenbei auch an anderen Projekten. diggy ist also bewusst nicht „fertig“, sondern wächst Schritt für Schritt weiter.')}
          </Text>
          <Text elementType="p">
            {t('Ich stelle das Tool gerne öffentlich zur Verfügung, damit andere schnell einen kompakten Blick auf eine Domain bekommen können. Wenn es jemandem hilft, ein Problem schneller zu verstehen, hat sich das Projekt schon gelohnt.')}
          </Text>

          <ColumnLayout s={[1]} m={[1, 1, 1]}>
            <Highlight
              icon={
                <Icon>
                  <IconSchool />
                </Icon>
              }
              title={t('Lernprojekt')}
              text={t('Gebaut, um Hosting- und DNS-Themen besser zu verstehen.')}
            />
            <Highlight
              icon={<IconServer />}
              title={t('Webhosting-Bezug')}
              text={t('Inspiriert von realen Fragen rund um Domains, Mail und SSL.')}
            />
            <Highlight
              icon={<IconDomain />}
              title={t('Öffentlich nutzbar')}
              text={t('Ein kleines Tool für schnelle Checks, nicht nur für mich allein.')}
            />
          </ColumnLayout>
        </Section>

        <Section>
          <Heading level={2}>{t('Was diggy sein soll')}</Heading>
          <Text elementType="p">
            {t('Ein ruhiger Ort für Domain-Checks: DNS Records, Health Score, Mail Security, WHOIS/RDAP, Propagation und Speed in einer Oberfläche.')}
          </Text>
        </Section>

        <Section>
          <Heading level={2}>{t('Was noch kommt')}</Heading>
          <Text elementType="p">
            {t('Mehr Feinschliff, bessere Erklärungen, sauberere Reports und kleine Features, die beim Lernen und Debuggen wirklich helfen.')}
          </Text>
        </Section>
      </LayoutCard>
    </div>
  );
}

/** Kurzfassung in der Karte — AccentBox statt einer Karte in der Karte. */
function Highlight({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <AccentBox>
      <Section>
        {icon}
        <Heading level={3}>{title}</Heading>
        <Text elementType="p">{text}</Text>
      </Section>
    </AccentBox>
  );
}
