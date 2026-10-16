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

/**
 * Platzhalter in der Form der Karte, solange der Text lädt.
 *
 * Mindestens bildschirmhoch: der Text ist es sowieso, und so liegt der Footer
 * schon vorher unter dem Rand. Mit einer Karte von vier Zeilen sprang er beim
 * Eintreffen des Texts aus dem Bild — gemessen auf „Fast 3G“, 390 px: CLS
 * 0,26 beim direkten Aufruf, 0,36 beim Wechsel aus dem Footer (vorher, ohne
 * eigenen Chunk: 0 bzw. 0,01).
 */
function TextSkeleton() {
  return (
    <div className="card min-h-screen space-y-3" aria-hidden>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
