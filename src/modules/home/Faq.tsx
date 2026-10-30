import type { ReactNode } from 'react';
import { Accordion, AccordionGroup, Content, Heading, LayoutCard, Link, Text } from '@mittwald/flow-react-components';
import { useI18n, type I18n } from '@/i18n';
import { SectionIntro } from './SectionIntro';
import styles from './Faq.module.css';

/**
 * Die Fragen, die vor der ersten Suche aufkommen. Jede Antwort hält sich an
 * das, was der Code tut — ändert sich ein Wert (Score-Abzüge, Cache-Zeiten,
 * beteiligte Dienste), muss die Antwort mit: shared/scoring.ts,
 * server/index.ts, DatenschutzText.tsx.
 *
 * Eine Funktion statt einer Konstante, damit die Texte in der aktiven Sprache
 * entstehen.
 */
function questions({ t, tRich }: I18n): { question: string; answer: ReactNode }[] {
  const privacy = (
    <Link href="/datenschutz" inline className={styles.textLink}>
      {t('Datenschutzerklärung')}
    </Link>
  );
  return [
    {
      question: t('Was ist diggy?'),
      answer: t('diggy prüft eine Domain in einem Rutsch: DNS-Records, Mail-Schutz, SSL-Zertifikat, DNSSEC, Propagation und WHOIS. Statt roher Antworten bekommst du einen Health Score und Empfehlungen, was zu tun ist.'),
    },
    {
      question: t('Kostet diggy etwas, brauche ich ein Konto?'),
      answer: t('Nein. diggy ist kostenlos und ohne Anmeldung nutzbar — Domain oder IP-Adresse eingeben, fertig.'),
    },
    {
      question: t('Wie entsteht der Health Score?'),
      answer: t('Er startet bei 100 Punkten. Ein kritischer Befund kostet 25, eine Warnung 8, ein Hinweis 2 — alle Hinweise zusammen höchstens 6. Was sich nicht prüfen ließ und reine Empfehlungen kosten nichts.'),
    },
    {
      question: t('Warum zeigen die Resolver unterschiedliche Werte?'),
      answer: t('Resolver merken sich Antworten so lange, wie die TTL des Records es erlaubt. Nach einer Änderung liefern manche noch den alten Wert, bis ihr Zwischenspeicher abläuft. diggy vergleicht neun öffentliche Resolver mit dem, was die Nameserver der Domain selbst ausliefern.'),
    },
    {
      question: t('Was bedeutet „nicht prüfbar“?'),
      answer: t('Eine Abfrage kam nicht durch, etwa wegen einer Zeitüberschreitung oder eines Serverfehlers. diggy sagt das offen, statt zu raten, und zieht dafür keine Punkte ab. Ein neuer Check hilft meistens.'),
    },
    {
      question: t('Speichert diggy meine Suchen?'),
      answer: tRich('Nicht dauerhaft. Ergebnisse liegen auf dem Server nur kurz im Zwischenspeicher, damit dieselbe Abfrage nicht mehrfach nach außen geht. Deine letzten zehn Suchen kennt nur dein Browser — für die History. Mehr in der {datenschutz}.', { datenschutz: privacy }),
    },
    {
      question: t('Wer erfährt, welche Domain ich prüfe?'),
      answer: tRich('Die Dienste, ohne die ein Check nicht geht: öffentliche DNS-Resolver, die Registry der Endung, der Webserver der Domain. Die Anfragen stellt der Server von diggy, nicht dein Browser. PageSpeed (Google) und VirusTotal laufen nur, wenn du sie anklickst. Die vollständige Liste steht in der {datenschutz}.', { datenschutz: privacy }),
    },
    {
      question: t('Kann ich einen Report teilen?'),
      answer: t('Ja. Jeder Report hat eine eigene Adresse — „Link kopieren“ legt sie in die Zwischenablage. Mit „JSON“ lädst du alle Ergebnisse als Datei herunter.'),
    },
  ];
}

/**
 * „Häufige Fragen“ am Ende der Startseite — Flows AccordionGroup in einer
 * Karte. Ab genug Breite steht der Kopf links, die Fragen rechts.
 *
 * Jede Frage ist eine Überschrift (h3) und damit der Button ihres Accordions:
 * Screenreader finden sie in der Seitenstruktur und hören den Zustand.
 */
export function Faq() {
  const i18n = useI18n();
  const { t, tRich } = i18n;
  return (
    <section aria-labelledby="faq-heading" className={styles.faq}>
      <SectionIntro
        id="faq-heading"
        eyebrow="FAQ"
        title={t('Häufige Fragen')}
        lead={
          <>
            {t('Was diggy prüft, was es kostet und was mit deinen Suchen passiert.')}{' '}
            {tRich('Noch eine Frage? Schreib uns über das {kontakt} im Impressum.', {
              kontakt: (
                <Link href="/impressum" inline className={styles.textLink}>
                  {t('Kontaktformular')}
                </Link>
              ),
            })}
          </>
        }
      />
      <LayoutCard className={styles.card}>
        <AccordionGroup>
          {questions(i18n).map(({ question, answer }) => (
            <Accordion key={question}>
              <Heading level={3}>{question}</Heading>
              <Content>
                <Text elementType="p" className={styles.answer}>
                  {answer}
                </Text>
              </Content>
            </Accordion>
          ))}
        </AccordionGroup>
      </LayoutCard>
    </section>
  );
}
