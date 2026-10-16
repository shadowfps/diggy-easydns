import { motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';
import { GermanOnlyNotice } from '@/components/ui/GermanOnlyNotice';
import { useI18n } from '@/i18n';
import DatenschutzText from './DatenschutzText';

/**
 * Datenschutzhinweise — Rahmen der Seite. Der Text selbst steht in
 * DatenschutzText.tsx (Begründung dort). Nachgeladen wird die Seite als
 * Ganzes, mit Platzhalter (App.tsx).
 */

interface DatenschutzViewProps {
  onOpenImpressum?: () => void;
}

export function DatenschutzView({ onOpenImpressum }: DatenschutzViewProps) {
  const { t } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto w-full max-w-3xl"
    >
      <p className="eyebrow flex items-center gap-1.5">
        <ShieldCheck className="size-3.5" />
        {t('Rechtliches')}
      </p>
      <h1 className="page-title mt-2">{t('Datenschutz')}</h1>
      <GermanOnlyNotice />
      <p lang="de" className="mt-3 text-base text-fg-muted">
        Was diggy verarbeitet, auf welcher Rechtsgrundlage, wie lange und was dabei an
        Dritte geht.
      </p>

      <div className="mt-8 space-y-4">
        <DatenschutzText onOpenImpressum={onOpenImpressum} />
      </div>
    </motion.div>
  );
}
