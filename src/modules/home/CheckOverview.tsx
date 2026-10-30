import type { ReactNode } from 'react';
import {
  ColumnLayout,
  Flex,
  Heading,
  IconCertificate,
  IconDnsZone,
  IconDomain,
  IconEmail,
  IconRegistry,
  IconSecurity,
  LayoutCard,
  Section,
  Text,
} from '@mittwald/flow-react-components';
import { useI18n, type I18n } from '@/i18n';

/**
 * „Was diggy prüft“ auf der Startseite: die sechs Bereiche, die jeder Report
 * bewertet. Wer zum ersten Mal kommt, sieht vor der ersten Suche, was ihn
 * erwartet.
 *
 * Eine Funktion statt einer Konstante, damit die Texte beim Rendern in der
 * aktiven Sprache entstehen. Die Bereichsnamen sind Fachbegriffe und heißen
 * in beiden Sprachen gleich — bis auf den Mail-Schutz.
 */
function checks({ t }: I18n): { icon: ReactNode; title: string; text: string }[] {
  return [
    {
      icon: <IconDnsZone />,
      title: 'Records',
      text: t('A, AAAA, MX, NS, TXT, CAA, SOA und CNAME — mit dem Netzbetreiber hinter jeder IP.'),
    },
    {
      icon: <IconEmail />,
      title: t('Mail-Schutz'),
      text: t('SPF, DKIM, DMARC und MTA-STS: Kann jemand in deinem Namen Mails fälschen?'),
    },
    {
      icon: <IconCertificate />,
      title: 'SSL / TLS',
      text: t('Zertifikat, Aussteller und Ablaufdatum — bevor Besucher eine Warnung sehen.'),
    },
    {
      icon: <IconSecurity />,
      title: 'DNSSEC',
      text: t('Sind die Antworten signiert, und hält die Vertrauenskette?'),
    },
    {
      icon: <IconDomain />,
      title: 'Propagation',
      text: t('Neun öffentliche Resolver im Vergleich: Ist eine Änderung bei allen angekommen?'),
    },
    {
      icon: <IconRegistry />,
      title: 'WHOIS / RDAP',
      text: t('Registrar, Laufzeit und Status — bevor eine Domain unbemerkt ausläuft.'),
    },
  ];
}

export function CheckOverview() {
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <LayoutCard>
      <Section>
        {/* Überzeile und Überschrift als Block: in der Section stünde die
            Überschrift sonst mit dem Abstand eines neuen Abschnitts darunter. */}
        <Flex direction="column" gap="xs">
          <Text className="eyebrow">{t('Was diggy prüft')}</Text>
          <Heading level={2}>{t('Sechs Bereiche, ein Befund')}</Heading>
        </Flex>
        <Text elementType="p">
          {t('Jeder Bereich fließt in den Health Score ein. PageSpeed und VirusTotal gibt es auf Klick dazu.')}
        </Text>

        <ColumnLayout s={[1]} m={[1, 1]} l={[1, 1, 1]} gap="l">
          {checks(i18n).map(({ icon, title, text }) => (
            <Flex key={title} direction="column" gap="xs">
              {/* Icon und Titel in einer Zeile. Die Überschrift steht in einem
                  eigenen Element: in einer Section bekäme sie hinter dem Icon
                  sonst den Abstand einer neuen Unterüberschrift. */}
              <Flex align="center" gap="s">
                {icon}
                <div>
                  <Heading level={3}>{title}</Heading>
                </div>
              </Flex>
              <Text elementType="p">{text}</Text>
            </Flex>
          ))}
        </ColumnLayout>
      </Section>
    </LayoutCard>
  );
}
