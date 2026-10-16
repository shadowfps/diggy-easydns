import { motion } from 'motion/react';
import { Scale } from 'lucide-react';
import { ContactForm } from '@/modules/impressum/ContactForm';
import { GermanOnlyNotice } from '@/components/ui/GermanOnlyNotice';
import { useI18n } from '@/i18n';

interface ImpressumViewProps {
  onOpenDatenschutz?: () => void;
}

/** Abschnitte in der Karte: Abstand plus feine Linie, der erste ohne. */
const SECTION = 'mt-6 border-t border-line-subtle pt-6';

/**
 * Die Pflichtangaben bleiben deutsch (#86) und tragen `lang="de"` — für
 * Screenreader und für das Prüfskript, das deutsche Texte außerhalb von
 * `t()` sucht. Übersetzt sind Rahmen und Kontaktformular.
 */
export function ImpressumView({ onOpenDatenschutz }: ImpressumViewProps) {
  const { t } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto w-full max-w-3xl"
    >
      <p className="eyebrow flex items-center gap-1.5">
        <Scale className="size-3.5" />
        {t('Rechtliches')}
      </p>
      <h1 className="page-title mt-2">{t('Impressum')}</h1>
      <GermanOnlyNotice />

      <div className="mt-8 space-y-4">
        <div className="card">
          <section lang="de">
            <h2 className="text-sm font-semibold text-fg">Angaben gemäß § 5 DDG</h2>
            <address className="mt-2 not-italic text-sm leading-relaxed text-fg-muted">
              Ruben Yannik Riesen
              <br />
              An Wehes Hof 1
              <br />
              32369 Rahden
              <br />
              Deutschland
            </address>
          </section>

          <section lang="de" className={SECTION}>
            <h2 className="text-sm font-semibold text-fg">Kontakt</h2>
            <dl className="mt-2 space-y-1.5 text-sm leading-relaxed text-fg-muted">
              <div>
                <dt className="inline">Telefon:</dt>{' '}
                <dd className="inline text-fg">Wird nachgereicht</dd>
              </div>
              <div>
                <dt className="inline">E-Mail:</dt>{' '}
                <dd className="inline">
                  <a href="mailto:hallo@cavara.dev" className="link">
                    hallo@cavara.dev
                  </a>
                </dd>
              </div>
            </dl>
          </section>

          <div className={SECTION}>
            <ContactForm onOpenDatenschutz={onOpenDatenschutz} />
          </div>

          <section lang="de" className={SECTION}>
            <p className="text-sm leading-relaxed text-fg-muted">
              diggydns ist ein privates, kostenloses Open-Source-Projekt und wird nicht im Rahmen
              einer gewerblichen Tätigkeit angeboten.
            </p>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
