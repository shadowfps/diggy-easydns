import { motion } from 'motion/react';
import { ArrowUpRight, Images } from 'lucide-react';

/**
 * Schlichter Werbe-Block für das Schwester-Tool converter.diggydns.cloud
 * (Bild-Konverter & Online-Editor). Sitzt weiter unten auf der Landing-Page,
 * nur im Idle-Zustand — verschwindet, sobald eine Domain gesucht wird.
 *
 * Sekundärbutton: der einzige Primärbutton auf der Startseite ist die Suche.
 */

const CONVERTER_URL = 'https://converter.diggydns.cloud';

export function ConverterPromo() {
  return (
    <motion.aside
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
      transition={{ duration: 0.5, delay: 0.35, ease: 'easeOut' }}
      className="card mx-auto mt-16 flex max-w-xl flex-col items-center gap-4 text-center sm:flex-row sm:text-left md:mt-24"
    >
      <span className="icon-tile size-11">
        <Images className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-fg">
          Kennst du schon <span className="font-brand lowercase tracking-tight">converter</span> by
          diggy?
        </h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          Bilder umwandeln, skalieren &amp; komprimieren — direkt im Browser.
        </p>
      </div>

      <a href={CONVERTER_URL} target="_blank" rel="noopener noreferrer" className="btn btn-secondary group">
        Zu Converter
        <ArrowUpRight className="size-4 transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" />
      </a>
    </motion.aside>
  );
}
