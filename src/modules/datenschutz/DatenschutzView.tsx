import { lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';
import { GermanOnlyNotice } from '@/components/ui/GermanOnlyNotice';
import { Skeleton } from '@/components/ui/Skeleton';
import { useI18n } from '@/i18n';

/**
 * Datenschutzhinweise — Rahmen der Seite. Der Text selbst steht in
 * DatenschutzText.tsx und wird nachgeladen (Begründung dort).
 */
const DatenschutzText = lazy(() => import('./DatenschutzText'));

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
        <Suspense fallback={<TextSkeleton />}>
          <DatenschutzText onOpenImpressum={onOpenImpressum} />
        </Suspense>
      </div>
    </motion.div>
  );
}

/** Platzhalter in der Form der Karte, solange der Text lädt. */
function TextSkeleton() {
  return (
    <div className="card space-y-3" aria-hidden>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
