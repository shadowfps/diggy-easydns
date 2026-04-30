import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import type { ResolverResult } from '@/types/dns';
import { cn } from '@/lib/cn';

interface PropagationViewProps {
  results: ResolverResult[];
}

export function PropagationView({ results }: PropagationViewProps) {
  // Erkenne den "Konsens-Wert" (häufigster Wert)
  const valueCounts = new Map<string, number>();
  results.forEach((r) => {
    const val = r.records[0]?.value ?? '';
    valueCounts.set(val, (valueCounts.get(val) ?? 0) + 1);
  });
  const consensusValue = Array.from(valueCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  const mismatches = results.filter((r) => (r.records[0]?.value ?? '') !== consensusValue);

  return (
    <div>
      <div className="surface rounded-xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          {results.map((result, i) => {
            const value = result.records[0]?.value ?? '—';
            const isMismatch = value !== consensusValue;
            return (
              <motion.div
                key={result.resolver.id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
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
                    'font-mono text-xs truncate',
                    isMismatch
                      ? 'text-orange-500'
                      : 'text-emerald-600 dark:text-emerald-400'
                  )}
                >
                  {value}
                </span>
              </motion.div>
            );
          })}
        </div>

        {mismatches.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-4 pt-4 border-t border-ink-100 dark:border-ink-900/80 flex items-start gap-2 text-xs text-orange-600 dark:text-orange-400"
          >
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              {mismatches.length} von {results.length} Resolvern abweichend — möglicherweise noch im
              Propagationsprozess oder gecached.
            </span>
          </motion.div>
        )}
      </div>
    </div>
  );
}
