import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { AlertTriangle, AlertCircle, Check } from 'lucide-react';
import type { RecordType, ResolverResult } from '@/types/dns';
import { cn } from '@/lib/cn';
import { IpAddressLink } from '@/components/ip/IpAddressLink';
import { useI18n } from '@/i18n';

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
  const { t } = useI18n();

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
              type="button"
              aria-pressed={activeType === t}
              onClick={() => setActiveType(t)}
              className="chip"
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="card">
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
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

        {/* Hinweis in einem Panel statt hinter einer Trennlinie. Der Ton folgt
            dem Befund: Abweichung ist eine Warnung (gelb), Konsens ein OK. */}
        {mismatchCount > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="panel mt-5 flex items-start gap-2.5 py-3 text-sm text-fg-muted"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              {t(
                '{count} von {total} Resolvern weichen ab — möglicherweise noch nicht propagiert, oder absichtlich GeoDNS / Anycast.',
                { count: mismatchCount, total: perResolver.length }
              )}
            </span>
          </motion.div>
        )}

        {mismatchCount === 0 && consensusKey && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="panel mt-5 flex items-start gap-2.5 py-3 text-sm text-fg-muted"
          >
            <Check className="mt-0.5 size-4 shrink-0 text-success" />
            <span>{t('Alle Resolver liefern dasselbe Ergebnis — DNS sauber propagiert.')}</span>
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
  const { t } = useI18n();
  const display = result.error
    ? result.error
    : values.length === 0
    ? t('— kein Eintrag')
    : values.join(', ');

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
      className="flex items-center justify-between gap-4 text-sm"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-base">{result.resolver.flag}</span>
        <span className="truncate text-fg-muted">
          {result.resolver.name}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-fg-subtle">
          {result.responseTimeMs}ms
        </span>
      </div>
      {/* Status nie nur über Farbe: Fehler (Kreis) und Abweichung (Dreieck)
          tragen ein Icon. Werte im Konsens bleiben neutral — dass sie
          übereinstimmen, sagt der Hinweis unter der Liste. */}
      <span
        className={cn(
          'flex min-w-0 max-w-[60%] items-center justify-end gap-1.5 text-right font-mono text-[13px]',
          result.error
            ? 'font-medium text-danger'
            : values.length === 0
            ? 'text-fg-subtle'
            : isMismatch
            ? 'font-medium text-warning'
            : 'text-fg'
        )}
      >
        {result.error && <AlertCircle className="size-3.5 shrink-0" />}
        {!result.error && isMismatch && <AlertTriangle className="size-3.5 shrink-0" />}
        {result.error || values.length === 0 ? (
          <span className="truncate">{display}</span>
        ) : (
          <span className="flex min-w-0 flex-wrap justify-end gap-x-2 gap-y-1">
            {values.map((value) => (
              <IpAddressLink key={value} ip={value} className="text-[13px] text-inherit" />
            ))}
          </span>
        )}
      </span>
    </motion.div>
  );
}
