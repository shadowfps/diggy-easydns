import { useEffect, useState } from 'react';
import type { VirusScanReport } from '@/types/dns';
import { cn } from '@/lib/cn';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';

interface VirusScanViewProps {
  data: VirusScanReport | null;
  loading: boolean;
  error: string | null;
  onRun: () => void;
}

export function VirusScanView({ data, loading, error, onRun }: VirusScanViewProps) {
  return (
    <div className="surface relative overflow-hidden rounded-2xl p-6 md:p-8">
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-ink-900/20 to-transparent dark:via-white/20" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-28 w-72 -translate-x-1/2 rounded-full bg-ink-900/[0.035] blur-3xl dark:bg-white/[0.05]" />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-900/60 dark:border-ink-800 dark:bg-ink-950 dark:text-ink-50/60">
          <Shield className="h-3.5 w-3.5" />
          Security Scan
        </div>
        <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">VirusTotal Scan</h3>
        <p className="mt-2 max-w-md text-sm text-ink-900/55 dark:text-ink-50/55">
          Prüft die Domain gegen 80+ Sicherheits-Engines auf Malware, Phishing und Blacklists.
        </p>

        <button
          onClick={onRun}
          disabled={loading}
          className="mt-6 group inline-flex h-12 min-w-40 items-center justify-center gap-2 rounded-full bg-ink-950 px-5 text-sm font-semibold text-white shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5 hover:bg-ink-800 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-ink-50 dark:text-ink-950 dark:shadow-white/5 dark:hover:bg-ink-200"
        >
          <Play className="h-4 w-4 fill-current transition-transform group-hover:translate-x-0.5" />
          <span>{loading ? 'Scanning…' : 'Scan starten'}</span>
        </button>
      </div>

      {!data && !loading && !error && <IdlePanel />}

      {loading && <ScanLoader />}

      {error && (
        <div className="mx-auto mt-8 max-w-2xl rounded-xl bg-red-500/10 p-4 text-center text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {data && <ScanResult data={data} />}
    </div>
  );
}

function ScanResult({ data }: { data: VirusScanReport }) {
  const total = data.stats.malicious + data.stats.suspicious + data.stats.harmless + data.stats.undetected;
  const flagged = data.stats.malicious + data.stats.suspicious;
  const flaggedVendors = data.vendors.filter(
    (v) => v.category === 'malicious' || v.category === 'suspicious'
  );
  const harmlessVendors = data.vendors.filter((v) => v.category === 'harmless');

  return (
    <div className="relative mx-auto mt-8 max-w-4xl space-y-4">
      <div className="flex items-center justify-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" />
        <span className="font-medium">Scan abgeschlossen</span>
      </div>

      {/* Verdict Card */}
      <VerdictCard data={data} total={total} flagged={flagged} />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Malicious" value={data.stats.malicious} tone="bad" />
        <StatCard label="Suspicious" value={data.stats.suspicious} tone="warn" />
        <StatCard label="Harmless" value={data.stats.harmless} tone="good" />
        <StatCard label="Undetected" value={data.stats.undetected} tone="neutral" />
      </div>

      {/* Reputation + Votes */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-ink-100 bg-white/70 p-4 dark:border-ink-900/80 dark:bg-ink-950/35">
          <p className="mb-1 text-xs uppercase tracking-[0.14em] text-ink-900/45 dark:text-ink-50/45">
            Reputation Score
          </p>
          <p
            className={cn(
              'text-2xl font-semibold tabular-nums',
              data.reputation < 0
                ? 'text-red-600 dark:text-red-400'
                : data.reputation > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-ink-900 dark:text-ink-50'
            )}
          >
            {data.reputation > 0 ? `+${data.reputation}` : data.reputation}
          </p>
          <p className="mt-0.5 text-xs text-ink-900/40 dark:text-ink-50/40">
            Community-Bewertung (negativ = schlechter Ruf)
          </p>
        </div>

        <div className="rounded-xl border border-ink-100 bg-white/70 p-4 dark:border-ink-900/80 dark:bg-ink-950/35">
          <p className="mb-2 text-xs uppercase tracking-[0.14em] text-ink-900/45 dark:text-ink-50/45">
            Community Votes
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <ThumbsUp className="h-4 w-4" />
              <span className="text-lg font-semibold tabular-nums">{data.totalVotes.harmless}</span>
            </div>
            <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
              <ThumbsDown className="h-4 w-4" />
              <span className="text-lg font-semibold tabular-nums">{data.totalVotes.malicious}</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-900/40 dark:text-ink-50/40">
            Letzte Analyse: {new Date(data.lastAnalysisDate).toLocaleDateString('de-DE')}
          </p>
        </div>
      </div>

      {/* Flagged Vendors */}
      {flaggedVendors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900/40 dark:bg-red-950/20">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              {flaggedVendors.length} Engine{flaggedVendors.length !== 1 ? 's' : ''} haben angeschlagen
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {flaggedVendors.map((v) => (
              <div
                key={v.name}
                className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2 dark:bg-ink-950/50"
              >
                <span className="text-xs font-medium text-ink-900 dark:text-ink-50">{v.name}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    v.category === 'malicious'
                      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  )}
                >
                  {v.result}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Categories */}
      {Object.keys(data.categories).length > 0 && (
        <div className="rounded-xl border border-ink-100 bg-white/60 p-4 dark:border-ink-900/80 dark:bg-ink-950/30">
          <p className="mb-3 text-xs uppercase tracking-[0.14em] text-ink-900/45 dark:text-ink-50/45">
            Kategorisierung durch Sicherheits-Engines
          </p>
          <div className="flex flex-wrap gap-2">
            {[...new Set(Object.values(data.categories))].map((cat) => (
              <span
                key={cat}
                className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Clean vendors summary */}
      {flaggedVendors.length === 0 && harmlessVendors.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {harmlessVendors.length} Engines haben die Domain als unbedenklich eingestuft.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function VerdictCard({
  data,
  total,
  flagged,
}: {
  data: VirusScanReport;
  total: number;
  flagged: number;
}) {
  const config = {
    clean: {
      icon: <ShieldCheck className="h-8 w-8" />,
      label: 'Sauber',
      sub: 'Keine Bedrohungen erkannt',
      bg: 'bg-emerald-50/80 dark:bg-emerald-950/30',
      border: 'border-emerald-200 dark:border-emerald-900/50',
      text: 'text-emerald-700 dark:text-emerald-300',
    },
    suspicious: {
      icon: <ShieldAlert className="h-8 w-8" />,
      label: 'Verdächtig',
      sub: 'Einige Engines haben Bedenken',
      bg: 'bg-amber-50/80 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-900/50',
      text: 'text-amber-700 dark:text-amber-300',
    },
    malicious: {
      icon: <ShieldX className="h-8 w-8" />,
      label: 'Schädlich',
      sub: 'Domain als Bedrohung eingestuft',
      bg: 'bg-red-50/80 dark:bg-red-950/30',
      border: 'border-red-200 dark:border-red-900/50',
      text: 'text-red-700 dark:text-red-300',
    },
  }[data.verdict];

  return (
    <div className={cn('rounded-2xl border p-6 text-center', config.bg, config.border)}>
      <div className={cn('mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border', config.border, 'bg-white/70 dark:bg-black/20', config.text)}>
        {config.icon}
      </div>
      <p className={cn('text-2xl font-bold', config.text)}>{config.label}</p>
      <p className="mt-1 text-sm text-ink-900/60 dark:text-ink-50/60">{config.sub}</p>
      <p className="mt-3 text-sm font-medium text-ink-900/80 dark:text-ink-50/80">
        <span className={cn('font-bold', config.text)}>{flagged}</span>
        {' '}von{' '}
        <span className="font-bold">{total}</span>
        {' '}Engines haben angeschlagen
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white/70 p-4 text-center shadow-sm dark:border-ink-900/80 dark:bg-ink-950/35">
      <p className="mb-1 text-xs text-ink-900/50 dark:text-ink-50/50">{label}</p>
      <p
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400',
          tone === 'bad' && 'text-red-600 dark:text-red-400',
          tone === 'neutral' && 'text-ink-900/70 dark:text-ink-50/70'
        )}
      >
        {value}
      </p>
    </div>
  );
}

const SCAN_STAGES = [
  'Verbinde mit VirusTotal…',
  'Prüfe 80+ Security-Engines…',
  'Analysiere Blacklists…',
  'Werte Reputation aus…',
  'Bereite Ergebnisse auf…',
];

function ScanLoader() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStage((s) => (s + 1) % SCAN_STAGES.length);
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="mx-auto mt-8 max-w-xl" aria-busy="true" aria-live="polite">
      <div className="rounded-2xl border border-ink-200 bg-white/70 p-6 text-center shadow-sm dark:border-ink-800 dark:bg-ink-950/35">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
          <Loader2 className="h-5 w-5 animate-spin text-ink-900 dark:text-ink-50" />
        </div>
        <div className="mb-5">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-900/45 dark:text-ink-50/45">
            Scan läuft
          </div>
          <div
            key={stage}
            className="text-sm font-medium text-ink-900 dark:text-ink-50"
            style={{ animation: 'fadeInUp 0.4s ease-out' }}
          >
            {SCAN_STAGES[stage]}
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="h-1.5 rounded-full bg-ink-200 dark:bg-ink-800 [animation:scanBar_1.2s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 140}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function IdlePanel() {
  return (
    <div className="relative mx-auto mt-8 flex min-h-52 max-w-2xl items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white/45 p-8 dark:border-ink-800 dark:bg-ink-950/25">
      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        <IdleTile icon={<ShieldCheck className="h-4 w-4" />} label="Malware" />
        <IdleTile icon={<Shield className="h-4 w-4" />} label="Phishing" />
        <IdleTile icon={<ShieldAlert className="h-4 w-4" />} label="Blacklist" />
      </div>
    </div>
  );
}

function IdleTile({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-ink-100 bg-white text-xs font-medium text-ink-900/60 shadow-sm dark:border-ink-800 dark:bg-ink-900 dark:text-ink-50/60">
      <span className="text-ink-900 dark:text-ink-50">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
