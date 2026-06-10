import { motion } from 'framer-motion';
import {
  CalendarClock,
  CheckCircle2,
  History,
  Mail,
  Network,
  RotateCcw,
  Server,
  ShieldX,
  Trash2,
} from 'lucide-react';
import type { LookupHistoryEntry } from '@/lib/lookupHistory';
import { cn } from '@/lib/cn';

interface HistoryViewProps {
  entries: LookupHistoryEntry[];
  onRun: (domain: string) => void;
  onUseDomain?: (domain: string) => void;
  onClear: () => void;
}

export function HistoryView({ entries, onRun, onUseDomain, onClear }: HistoryViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto max-w-6xl"
    >
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-900/60 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-50/60">
            <History className="h-3.5 w-3.5" />
            History
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Letzte Suchanfragen</h1>
        </div>

        <button
          type="button"
          onClick={onClear}
          disabled={entries.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-xs font-medium text-ink-900/70 transition-colors hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-50/70 dark:hover:bg-ink-800"
        >
          <Trash2 className="h-3.5 w-3.5" />
          History löschen
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="surface rounded-2xl p-12 text-center">
          <History className="mx-auto mb-3 h-6 w-6 text-ink-900/35 dark:text-ink-50/35" />
          <h2 className="mb-1 text-base font-medium">Noch keine History</h2>
          <p className="text-sm text-ink-900/50 dark:text-ink-50/50">
            Erfolgreiche Domain-Lookups erscheinen hier automatisch.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {entries.map((entry, index) => (
            <HistoryCard
              key={`${entry.domain}-${entry.lookedUpAt}`}
              entry={entry}
              delay={index * 0.04}
              onRun={() => onRun(entry.domain)}
              onUseDomain={onUseDomain}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function HistoryCard({
  entry,
  delay,
  onRun,
  onUseDomain,
}: {
  entry: LookupHistoryEntry;
  delay: number;
  onRun: () => void;
  onUseDomain?: (domain: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      className="surface rounded-2xl p-5"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onRun}
            className="block max-w-full truncate text-left font-mono text-base font-semibold text-ink-950 transition-opacity hover:opacity-70 dark:text-ink-50"
          >
            {entry.domain}
          </button>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-900/45 dark:text-ink-50/45">
            <CalendarClock className="h-3.5 w-3.5" />
            {formatRelativeTime(entry.lookedUpAt)}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className={cn('text-2xl font-semibold tabular-nums', scoreClass(entry.score))}>
            {entry.score}
          </div>
          <div className="max-w-28 truncate text-[10px] uppercase tracking-[0.14em] text-ink-900/40 dark:text-ink-50/40">
            {entry.verdict}
          </div>
        </div>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <CoreBlock icon={<Network className="h-4 w-4" />} label="IP" values={entry.ips} />
        <CoreBlock icon={<Mail className="h-4 w-4" />} label="MX" values={entry.mx} />
        <CoreBlock
          icon={<Server className="h-4 w-4" />}
          label="NS"
          values={entry.nameservers}
          onUseValue={onUseDomain}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4 dark:border-ink-900/80">
        <div className="flex flex-wrap gap-2">
          <StatusPill ok={entry.sslValid} label={entry.sslValid ? sslLabel(entry) : 'SSL fehlt'} />
          <StatusPill ok={entry.dnssecValid} label={entry.dnssecValid ? 'DNSSEC aktiv' : 'DNSSEC inaktiv'} />
          <StatusPill ok={entry.dmarcPresent} label={entry.dmarcPresent ? 'DMARC gesetzt' : 'DMARC fehlt'} />
        </div>

        <button
          type="button"
          onClick={onRun}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-950 dark:hover:bg-ink-200"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Scan erneut
        </button>
      </div>
    </motion.div>
  );
}

function CoreBlock({
  icon,
  label,
  values,
  onUseValue,
}: {
  icon: React.ReactNode;
  label: string;
  values: string[];
  onUseValue?: (value: string) => void;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-ink-100/70 p-3 dark:bg-ink-950/50">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-ink-900/45 dark:text-ink-50/45">
        {icon}
        {label}
      </div>
      {values.length > 0 ? (
        <div className="space-y-1">
          {values.slice(0, 3).map((value) => (
            onUseValue ? (
              <button
                key={value}
                type="button"
                onClick={() => onUseValue(value)}
                className="block max-w-full truncate rounded-md text-left font-mono text-xs text-ink-900/80 transition-colors hover:text-ink-950 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 dark:text-ink-50/80 dark:hover:text-white dark:focus-visible:outline-ink-50"
                title={`${value} in die Suche übernehmen`}
              >
                {value}
              </button>
            ) : (
              <div
                key={value}
                className="truncate font-mono text-xs text-ink-900/80 dark:text-ink-50/80"
                title={value}
              >
                {value}
              </div>
            )
          ))}
          {values.length > 3 && (
            <div className="text-[11px] text-ink-900/40 dark:text-ink-50/40">
              +{values.length - 3} weitere
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs italic text-ink-900/35 dark:text-ink-50/35">keine Daten</div>
      )}
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium',
        ok
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'bg-red-500/10 text-red-700 dark:text-red-300'
      )}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <ShieldX className="h-3 w-3" />}
      {label}
    </span>
  );
}

function scoreClass(score: number): string {
  if (score >= 65) return 'text-emerald-600 dark:text-emerald-400';
  return 'text-red-600 dark:text-red-400';
}

function sslLabel(entry: LookupHistoryEntry): string {
  if (entry.sslDaysUntilExpiry === undefined) return 'SSL gültig';
  return `SSL ${entry.sslDaysUntilExpiry} Tage`;
}

function formatRelativeTime(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return 'unbekannt';
  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));

  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} h`;

  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
