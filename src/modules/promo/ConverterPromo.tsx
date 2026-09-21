import { motion } from 'motion/react';
import { ArrowUpRight, Images } from 'lucide-react';

/**
 * Schlichter Werbe-Block für das Schwester-Tool converter.diggydns.cloud
 * (Bild-Konverter & Online-Editor). Sitzt weiter unten auf der Landing-Page,
 * nur im Idle-Zustand — verschwindet, sobald eine Domain gesucht wird.
 */

const CONVERTER_URL = 'https://converter.diggydns.cloud';

export function ConverterPromo() {
  return (
    <motion.aside
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
      transition={{ duration: 0.5, delay: 0.35, ease: 'easeOut' }}
      className="mx-auto mt-16 max-w-md text-center md:mt-24"
    >
      <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-ink-100 bg-white text-ink-900 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-50">
        <Images className="h-5 w-5" />
      </div>

      <h2 className="text-lg font-medium text-ink-900 dark:text-ink-50">
        Kennst du schon <span className="font-brand lowercase tracking-tight">converter</span> by
        diggy?
      </h2>

      <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-900/55 dark:text-ink-50/55">
        Bilder umwandeln, skalieren &amp; komprimieren — direkt im Browser.
      </p>

      <a
        href={CONVERTER_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group mt-4 inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 dark:bg-ink-50 dark:text-ink-950 dark:hover:bg-ink-200 dark:focus-visible:outline-ink-50"
      >
        Zu Converter
        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </a>
    </motion.aside>
  );
}
