import type { ReactNode } from 'react';
import {
  Heading,
  IconCertificate,
  IconDnsZone,
  IconDomain,
  IconEmail,
  IconRegistry,
  IconSecurity,
  Text,
} from '@mittwald/flow-react-components';
import { useI18n, type I18n } from '@/i18n';
import { SectionIntro } from './SectionIntro';
import styles from './CheckOverview.module.css';

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

/**
 * Die sechs Bereiche als Kacheln im Grainy-Gradient-Stil der mittwald-
 * Promo-Kacheln: Körnung über einem Verlauf mit einem Licht oben rechts, das
 * Icon groß daneben, Titel und Frage darunter.
 *
 * Überzeile, Überschrift und Einleitung stehen über den Kacheln auf dem
 * Seitenhintergrund — die Kacheln selbst sind die Liste.
 */
export function CheckOverview() {
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <section aria-labelledby="checks-heading" className={styles.overview}>
      <SectionIntro
        id="checks-heading"
        eyebrow={t('Was diggy prüft')}
        title={t('Sechs Bereiche, ein Befund')}
        lead={t('Jeder Bereich fließt in den Health Score ein. PageSpeed und VirusTotal gibt es auf Klick dazu.')}
      />

      <ul className={styles.tiles}>
        {checks(i18n).map(({ icon, title, text }) => (
          <li key={title} className={styles.tile}>
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
            <Heading level={3} className={styles.title}>
              {title}
            </Heading>
            <Text elementType="p" className={styles.text}>
              {text}
            </Text>
          </li>
        ))}
      </ul>
    </section>
  );
}
