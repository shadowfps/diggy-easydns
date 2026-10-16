import { motion } from 'motion/react';
import { Globe, Landmark, ListTree, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useI18n, type I18n } from '@/i18n';

/**
 * „Was diggy prüft“ auf der Startseite: die sechs Bereiche, die jeder Report
 * bewertet. Wer zum ersten Mal kommt, sieht vor der ersten Suche, was ihn
 * erwartet — vorher stand unter dem Suchfeld nur der Converter-Hinweis.
 *
 * Eine Funktion statt einer Konstante, damit die Texte beim Rendern in der
 * aktiven Sprache entstehen. Die Bereichsnamen sind Fachbegriffe und heißen
 * in beiden Sprachen gleich — bis auf den Mail-Schutz.
 */
function checks({ t }: I18n) {
  return [
    {
      icon: ListTree,
      title: 'Records',
      text: t('A, AAAA, MX, NS, TXT, CAA, SOA und CNAME — mit dem Netzbetreiber hinter jeder IP.'),
    },
    {
      icon: Mail,
      title: t('Mail-Schutz'),
      text: t('SPF, DKIM, DMARC und MTA-STS: Kann jemand in deinem Namen Mails fälschen?'),
    },
    {
      icon: Lock,
      title: 'SSL / TLS',
      text: t('Zertifikat, Aussteller und Ablaufdatum — bevor Besucher eine Warnung sehen.'),
    },
    {
      icon: ShieldCheck,
      title: 'DNSSEC',
      text: t('Sind die Antworten signiert, und hält die Vertrauenskette?'),
    },
    {
      icon: Globe,
      title: 'Propagation',
      text: t('Fünf öffentliche Resolver im Vergleich: Ist eine Änderung überall angekommen?'),
    },
    {
      icon: Landmark,
      title: 'WHOIS / RDAP',
      text: t('Registrar, Laufzeit und Status — bevor eine Domain unbemerkt ausläuft.'),
    },
  ];
}

export function CheckOverview() {
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
      transition={{ duration: 0.5, delay: 0.25, ease: 'easeOut' }}
      aria-labelledby="check-overview-title"
      className="mx-auto mt-16 max-w-5xl md:mt-24"
    >
      <div className="text-center">
        <p className="eyebrow">{t('Was diggy prüft')}</p>
        <h2 id="check-overview-title" className="mt-2 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
          {t('Sechs Bereiche, ein Befund')}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-fg-muted">
          {t('Jeder Bereich fließt in den Health Score ein. PageSpeed und VirusTotal gibt es auf Klick dazu.')}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {checks(i18n).map(({ icon: Icon, title, text }) => (
          <div key={title} className="card">
            <span className="icon-tile">
              <Icon className="size-4" />
            </span>
            <h3 className="mt-4 text-sm font-semibold text-fg">{title}</h3>
            <p className="mt-1 text-sm text-fg-muted">{text}</p>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
