import { motion } from 'framer-motion';
import { Scale } from 'lucide-react';
import { ContactForm } from '@/modules/impressum/ContactForm';

export function ImpressumView() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto w-full max-w-3xl"
    >
      <div className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-900/60 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-50/60">
          <Scale className="h-3.5 w-3.5" />
          Rechtliches
        </div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Impressum</h1>
      </div>

      <div className="surface space-y-8 rounded-2xl p-6 md:p-8">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-900/50 dark:text-ink-50/50">
            Angaben gemäß § 5 DDG
          </h2>
          <address className="not-italic text-sm leading-relaxed text-ink-900/80 dark:text-ink-50/80">
            Ruben Yannik Riesen
            <br />
            An Wehes Hof 1
            <br />
            32369 Rahden
            <br />
            Deutschland
          </address>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-900/50 dark:text-ink-50/50">
            Kontakt
          </h2>
          <dl className="space-y-2 text-sm text-ink-900/80 dark:text-ink-50/80">
            <div>
              <dt className="inline font-medium">Telefon:</dt>{' '}
              <dd className="inline">Wird nachgereicht</dd>
            </div>
            <div>
              <dt className="inline font-medium">E-Mail:</dt>{' '}
              <dd className="inline">
                <a
                  href="mailto:hallo@cavara.dev"
                  className="underline-offset-2 transition-colors hover:underline"
                >
                  hallo@cavara.dev
                </a>
              </dd>
            </div>
          </dl>
        </section>

        <ContactForm />

        <section className="border-t border-ink-100 pt-6 dark:border-ink-900/80">
          <p className="text-sm leading-relaxed text-ink-900/65 dark:text-ink-50/65">
            diggydns ist ein privates, kostenloses Open-Source-Projekt und wird nicht im Rahmen
            einer gewerblichen Tätigkeit angeboten.
          </p>
        </section>
      </div>
    </motion.div>
  );
}
