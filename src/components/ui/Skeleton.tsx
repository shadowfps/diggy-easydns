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
      className={cn('animate-pulse rounded-full bg-surface-muted', className)}
      aria-hidden
    />
  );
}

/** Platzhalter für den Health-Score (Aggregat — braucht alle Sektionen). */
export function ScoreCardSkeleton() {
  return (
    <div className="card flex flex-col">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="mt-4 h-14 w-28 rounded-panel" />
      <Skeleton className="mt-5 h-2 w-full" />
      <div className="mt-4 flex items-center gap-5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-3 w-14" />
        ))}
      </div>
      <div className="mt-auto pt-5">
        <div className="flex items-center gap-3 border-t border-line-subtle pt-4">
          <Skeleton className="size-8 rounded-panel" />
          <Skeleton className="h-3.5 w-40" />
        </div>
      </div>
    </div>
  );
}

/** N Karten im 2-Spalten-Grid — für Security (2) und Mail (4). */
export function SectionCardsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card">
          <div className="mb-4 flex items-center gap-3">
            <Skeleton className="size-9 rounded-panel" />
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
    <div className="card">
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4" />
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="card md:col-span-2">
        <div className="mb-4 flex items-center gap-3">
          <Skeleton className="size-9 rounded-panel" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-3 w-3/4" />
          ))}
        </div>
      </div>
      {[0, 1].map((card) => (
        <div key={card} className="card">
          <Skeleton className="mb-4 h-4 w-32" />
          <div className="flex flex-wrap gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-6 w-20" />
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
    <div className="card-flush divide-y divide-line-subtle">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-4 px-5 py-4 sm:px-6">
          <Skeleton className="size-9 shrink-0 rounded-panel" />
          <div className="flex-1 space-y-2.5 pt-1">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
