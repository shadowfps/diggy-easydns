import {
  ColumnLayout,
  Content,
  Flex,
  Heading,
  Label,
  LabeledValue,
  LayoutCard,
  Link,
  Section,
  Text,
} from '@mittwald/flow-react-components';
import { ContactForm } from '@/modules/impressum/ContactForm';
import { GermanOnlyNotice } from '@/components/ui/GermanOnlyNotice';
import { useI18n } from '@/i18n';
import styles from './ImpressumView.module.css';

/**
 * Impressum als Textseite: Überschrift, darunter eine LayoutCard, deren
 * Sections Flow mit einer Linie trennt.
 *
 * Die Pflichtangaben bleiben deutsch (#86) und tragen `lang="de"` — für
 * Screenreader und für das Prüfskript, das deutsche Texte außerhalb von
 * `t()` sucht. Übersetzt sind Rahmen und Kontaktformular.
 */
export function ImpressumView() {
  const { t } = useI18n();
  return (
    <Flex direction="column" gap="m">
      <Heading level={1}>{t('Impressum')}</Heading>
      <GermanOnlyNotice />

      <LayoutCard>
        <Section lang="de">
          <Heading level={2} lang="de">
            Angaben gemäß § 5 DDG
          </Heading>
          <address className={styles.address}>
            <Text elementType="p" lang="de">
              Ruben Yannik Riesen
              <br />
              An Wehes Hof 1
              <br />
              32369 Rahden
              <br />
              Deutschland
            </Text>
          </address>
        </Section>

        <Section lang="de">
          <Heading level={2} lang="de">
            Kontakt
          </Heading>
          <ColumnLayout s={[1]} m={[1, 1]} l={[1, 1]}>
            <div lang="de">
              <LabeledValue>
                <Label>Telefon</Label>
                <Content>Wird nachgereicht</Content>
              </LabeledValue>
            </div>
            <div lang="de">
              <LabeledValue>
                <Label>E-Mail</Label>
                <Link href="mailto:hallo@cavara.dev">hallo@cavara.dev</Link>
              </LabeledValue>
            </div>
          </ColumnLayout>
        </Section>

        <ContactForm />

        <Section lang="de">
          <Text elementType="p" lang="de">
            diggydns ist ein privates, kostenloses Open-Source-Projekt und wird nicht im Rahmen
            einer gewerblichen Tätigkeit angeboten.
          </Text>
        </Section>
      </LayoutCard>
    </Flex>
  );
}
