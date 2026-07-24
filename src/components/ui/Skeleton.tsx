import { cn } from '@/lib/cn';

/**
 * Skeleton-Loader für die progressiv nachgeladenen Report-Sektionen.
 * Die Presets bilden den Footprint der echten Komponenten grob nach,
 * damit beim Einblenden der Daten kein Layout-Sprung entsteht.
 */

/** Basis-Baustein — ein pulsierender Balken. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-ink-100 dark:bg-ink-900/70', className)}
      aria-hidden
    />
  );
}

/** Platzhalter für den Health-Score (Aggregat — braucht alle Sektionen). */
export function ScoreCardSkeleton() {
  return (
    <div className="surface rounded-2xl p-6">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="mb-4 h-12 w-28" />
      <Skeleton className="h-1.5 w-full rounded-full" />
      <div className="mt-4 flex items-center gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-3 w-12" />
        ))}
      </div>
    </div>
  );
}

/** N Karten im 2-Spalten-Grid — für Security (2) und Mail (4). */
export function SectionCardsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface rounded-xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Resolver-Zeilen für die Propagation-Ansicht. */
export function PropagationSkeleton() {
  return (
    <div className="surface rounded-xl p-5">
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** WHOIS/RDAP — eine breite Karte plus zwei schmale. */
export function WhoisSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="surface rounded-xl p-5 md:col-span-2">
        <div className="mb-4 flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-3 w-3/4" />
          ))}
        </div>
      </div>
      {[0, 1].map((card) => (
        <div key={card} className="surface rounded-xl p-5">
          <Skeleton className="mb-4 h-4 w-32" />
          <div className="flex flex-wrap gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-5 w-20 rounded-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Gestapelte Zeilen — für die (aggregierte) Findings-Liste. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="surface flex items-start gap-3 rounded-xl p-4">
          <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
