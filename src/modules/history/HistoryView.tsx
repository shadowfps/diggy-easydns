import { motion } from 'motion/react';
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
import { EmptyState } from '@/components/ui/EmptyState';

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
      className="mx-auto w-full max-w-3xl"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <History className="size-3.5" />
            History
          </p>
          <h1 className="page-title mt-2">Letzte Suchanfragen</h1>
        </div>

        <button
          type="button"
          onClick={onClear}
          disabled={entries.length === 0}
          className="btn btn-secondary btn-sm self-start sm:self-auto"
        >
          <Trash2 className="size-3.5" />
          History löschen
        </button>
      </div>

      <div className="mt-8 space-y-4">
        {entries.length === 0 ? (
          <EmptyState icon={<History className="size-5" />} title="Noch keine History">
            Erfolgreiche Domain-Lookups erscheinen hier automatisch.
          </EmptyState>
        ) : (
          // Eine Liste statt je Lookup eine Karte: die Einträge lesen sich als
          // Verlauf, nicht als zehn lose Kästen.
          <div className="card-flush divide-y divide-line-subtle">
            {entries.map((entry, index) => (
              <HistoryRow
                key={`${entry.domain}-${entry.lookedUpAt}`}
                entry={entry}
                delay={index * 0.04}
                onRun={() => onRun(entry.domain)}
                onUseDomain={onUseDomain}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function HistoryRow({
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
      className="px-5 py-4 sm:px-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onRun}
            className="block max-w-full truncate rounded-full text-left font-mono text-sm font-semibold text-fg underline-offset-4 hover:underline"
          >
            {entry.domain}
          </button>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-subtle">
            <CalendarClock className="size-3.5" />
            {formatRelativeTime(entry.lookedUpAt)}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <div className={cn('text-2xl font-semibold tabular-nums tracking-tight', scoreClass(entry.score))}>
            {entry.score}
          </div>
          <div className="max-w-28 truncate text-xs text-fg-subtle">{entry.verdict}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CoreBlock icon={<Network className="size-3.5" />} label="IP" values={entry.ips} />
        <CoreBlock icon={<Mail className="size-3.5" />} label="MX" values={entry.mx} />
        <CoreBlock
          icon={<Server className="size-3.5" />}
          label="NS"
          values={entry.nameservers}
          onUseValue={onUseDomain}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <StatusPill ok={entry.sslValid} label={entry.sslValid ? sslLabel(entry) : 'SSL fehlt'} />
          <StatusPill ok={entry.dnssecValid} label={entry.dnssecValid ? 'DNSSEC aktiv' : 'DNSSEC inaktiv'} />
          <StatusPill ok={entry.dmarcPresent} label={entry.dmarcPresent ? 'DMARC gesetzt' : 'DMARC fehlt'} />
        </div>

        <button type="button" onClick={onRun} className="btn btn-ghost btn-sm">
          <RotateCcw className="size-3.5" />
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
    <div className="panel min-w-0 p-3">
      <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
        {icon}
        {label}
      </div>
      {values.length > 0 ? (
        <div className="mt-1.5 space-y-1">
          {values.slice(0, 3).map((value) => (
            onUseValue ? (
              <button
                key={value}
                type="button"
                onClick={() => onUseValue(value)}
                className="block max-w-full truncate rounded-full text-left font-mono text-[13px] text-fg underline-offset-4 hover:underline"
                title={`${value} in die Suche übernehmen`}
              >
                {value}
              </button>
            ) : (
              <div
                key={value}
                className="truncate font-mono text-[13px] text-fg"
                title={value}
              >
                {value}
              </div>
            )
          ))}
          {values.length > 3 && (
            <div className="text-xs text-fg-subtle">
              +{values.length - 3} weitere
            </div>
          )}
        </div>
      ) : (
        <div className="mt-1.5 text-xs italic text-fg-subtle">keine Daten</div>
      )}
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('badge', ok ? 'badge-success' : 'badge-danger')}>
      {ok ? <CheckCircle2 className="size-3" /> : <ShieldX className="size-3" />}
      {label}
    </span>
  );
}

/** Dieselben Schwellen und Töne wie die ScoreCard: gut, Warnung, kritisch. */
function scoreClass(score: number): string {
  if (score >= 65) return 'text-success';
  if (score >= 40) return 'text-warning';
  return 'text-danger';
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
