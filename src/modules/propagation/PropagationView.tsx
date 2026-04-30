import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { AlertTriangle, AlertCircle, Check } from 'lucide-react';
import type { RecordType, ResolverResult } from '@/types/dns';
import { cn } from '@/lib/cn';

interface PropagationViewProps {
  results: ResolverResult[];
}

/**
 * Welche Record-Typen wir im Propagation-Vergleich anbieten.
 * Backend liefert aktuell A + AAAA. Mehr kann später dazukommen.
 */
const SUPPORTED_TYPES: RecordType[] = ['A', 'AAAA'];

export function PropagationView({ results }: PropagationViewProps) {
  // Verfügbare Typen aus den Daten extrahieren — nicht alles raten.
  const availableTypes = useMemo(() => {
    const set = new Set<RecordType>();
    for (const r of results) for (const rec of r.records) set.add(rec.type);
    return SUPPORTED_TYPES.filter((t) => set.has(t));
  }, [results]);

  const [activeType, setActiveType] = useState<RecordType>(availableTypes[0] ?? 'A');

  // Pro Resolver: alle Werte des aktiven Typs als sortiertes Array.
  // Sortiert, damit "1.2.3.4 + 5.6.7.8" und "5.6.7.8 + 1.2.3.4" als gleich gelten.
  const perResolver = useMemo(() => {
    return results.map((r) => ({
      result: r,
      values: r.records
        .filter((rec) => rec.type === activeType)
        .map((rec) => rec.value)
        .sort(),
    }));
  }, [results, activeType]);

  // Konsens = häufigster Wert-Set
  const consensusKey = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of perResolver) {
      if (p.values.length === 0) continue;
      const key = p.values.join(',');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [perResolver]);

  const mismatchCount = perResolver.filter(
    (p) => p.values.length > 0 && p.values.join(',') !== consensusKey
  ).length;

  return (
    <div className="space-y-4">
      {availableTypes.length > 1 && (
        <div className="flex items-center gap-1.5">
          {availableTypes.map((t) => (
            <button
              key={t}
              onClick={() => setActiveType(t)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-all',
                activeType === t
                  ? 'bg-accent-500 text-white'
                  : 'bg-ink-100 dark:bg-ink-900 text-ink-900/70 dark:text-ink-50/70 hover:bg-ink-100/80 dark:hover:bg-ink-900/80'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="surface rounded-xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          {perResolver.map((p, i) => (
            <ResolverRow
              key={p.result.resolver.id}
              result={p.result}
              values={p.values}
              isMismatch={
                !p.result.error &&
                p.values.length > 0 &&
                p.values.join(',') !== consensusKey
              }
              delay={i * 0.04}
            />
          ))}
        </div>

        {mismatchCount > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-4 pt-4 border-t border-ink-100 dark:border-ink-900/80 flex items-start gap-2 text-xs text-orange-600 dark:text-orange-400"
          >
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              {mismatchCount} von {perResolver.length} Resolvern weichen ab — möglicherweise noch
              nicht propagiert, oder absichtlich GeoDNS / Anycast.
            </span>
          </motion.div>
        )}

        {mismatchCount === 0 && consensusKey && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-4 pt-4 border-t border-ink-100 dark:border-ink-900/80 flex items-start gap-2 text-xs text-emerald-600 dark:text-emerald-400"
          >
            <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Alle Resolver liefern dasselbe Ergebnis — DNS sauber propagiert.</span>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function ResolverRow({
  result,
  values,
  isMismatch,
  delay,
}: {
  result: ResolverResult;
  values: string[];
  isMismatch: boolean;
  delay: number;
}) {
  const display = result.error
    ? result.error
    : values.length === 0
    ? '— kein Eintrag'
    : values.join(', ');

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
      className="flex items-center justify-between gap-4 text-sm"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base shrink-0">{result.resolver.flag}</span>
        <span className="text-ink-900/70 dark:text-ink-50/70 truncate">
          {result.resolver.name}
        </span>
        <span className="text-[11px] text-ink-900/30 dark:text-ink-50/30 font-mono shrink-0">
          {result.responseTimeMs}ms
        </span>
      </div>
      <span
        className={cn(
          'font-mono text-xs truncate flex items-center gap-1.5',
          result.error
            ? 'text-red-500'
            : values.length === 0
            ? 'text-ink-900/30 dark:text-ink-50/30'
            : isMismatch
            ? 'text-orange-500'
            : 'text-emerald-600 dark:text-emerald-400'
        )}
      >
        {result.error && <AlertCircle className="w-3 h-3 shrink-0" />}
        <span className="truncate">{display}</span>
      </span>
    </motion.div>
  );
}
