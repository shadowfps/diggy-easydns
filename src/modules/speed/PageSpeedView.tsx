import { useEffect, useState } from 'react';
import type { PageSpeedReport, PageSpeedStrategy } from '@/types/dns';
import { cn } from '@/lib/cn';
import {
  Activity,
  CheckCircle2,
  Gauge,
  ImageOff,
  Loader2,
  Monitor,
  MousePointerClick,
  Play,
  Server,
  Smartphone,
  Sparkles,
  Timer,
  Waypoints,
} from 'lucide-react';

interface PageSpeedViewProps {
  data: PageSpeedReport | null;
  loading: boolean;
  error: string | null;
  strategy: PageSpeedStrategy;
  onStrategyChange: (strategy: PageSpeedStrategy) => void;
  onRun: () => void;
}

export function PageSpeedView({
  data,
  loading,
  error,
  strategy,
  onStrategyChange,
  onRun,
}: PageSpeedViewProps) {
  return (
    <div className="surface relative overflow-hidden rounded-2xl p-6 md:p-8">
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-ink-900/20 to-transparent dark:via-white/20" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-28 w-72 -translate-x-1/2 rounded-full bg-ink-900/[0.035] blur-3xl dark:bg-white/[0.05]" />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-900/60 dark:border-ink-800 dark:bg-ink-950 dark:text-ink-50/60">
          <Activity className="h-3.5 w-3.5" />
          Speed
        </div>
        <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">PageSpeed Scan</h3>

        <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row">
          <div className="flex rounded-full border border-ink-200 bg-ink-100/80 p-1 dark:border-ink-800 dark:bg-ink-950/80">
            <StrategyButton
              active={strategy === 'mobile'}
              icon={<Smartphone className="h-3.5 w-3.5" />}
              label="Mobile"
              onClick={() => onStrategyChange('mobile')}
            />
            <StrategyButton
              active={strategy === 'desktop'}
              icon={<Monitor className="h-3.5 w-3.5" />}
              label="Desktop"
              onClick={() => onStrategyChange('desktop')}
            />
          </div>

          <button
            onClick={onRun}
            disabled={loading}
            className="group inline-flex h-12 min-w-40 items-center justify-center gap-2 rounded-full bg-ink-950 px-5 text-sm font-semibold text-white shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5 hover:bg-ink-800 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-ink-50 dark:text-ink-950 dark:shadow-white/5 dark:hover:bg-ink-200"
          >
            <Play className="h-4 w-4 fill-current transition-transform group-hover:translate-x-0.5" />
            <span>{loading ? 'Scanning' : 'Run Scan'}</span>
          </button>
        </div>
      </div>

      {!data && !loading && !error && <IdleSpeedPanel />}

      {loading && <PageSpeedLoader />}

      {error && (
        <div className="mx-auto mt-8 max-w-2xl rounded-xl bg-red-500/10 p-4 text-center text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {data && (
        <div className="relative mx-auto mt-8 max-w-4xl space-y-4">
          <div className="flex items-center justify-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">Scan abgeschlossen</span>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard
              icon={<Gauge className="h-4 w-4" />}
              label="Performance Score"
              value={`${data.performanceScore}`}
              tone={scoreTone(data.performanceScore)}
            />
            <MetricCard
              icon={<Waypoints className="h-4 w-4" />}
              label="LCP"
              value={formatMs(data.metrics.lcpMs)}
              tone={lcpTone(data.metrics.lcpMs)}
            />
            <MetricCard
              icon={<MousePointerClick className="h-4 w-4" />}
              label="INP"
              value={formatMs(data.metrics.inpMs)}
              tone={inpTone(data.metrics.inpMs)}
            />
            <MetricCard
              icon={<Timer className="h-4 w-4" />}
              label="FCP"
              value={formatMs(data.metrics.fcpMs)}
              tone={fcpTone(data.metrics.fcpMs)}
            />
            <MetricCard
              icon={<Server className="h-4 w-4" />}
              label="TTFB"
              value={formatMs(data.metrics.ttfbMs)}
              tone={ttfbTone(data.metrics.ttfbMs)}
            />
            <MetricCard
              icon={<ImageOff className="h-4 w-4" />}
              label="CLS"
              value={formatCls(data.metrics.cls)}
              tone={clsTone(data.metrics.cls)}
            />
          </div>

          <div className="rounded-xl border border-ink-100 bg-white/60 p-4 dark:border-ink-900/80 dark:bg-ink-950/30">
            <p className="mb-3 text-center text-xs uppercase tracking-[0.16em] text-ink-900/45 dark:text-ink-50/45">
              Top Optimierungspotenziale
            </p>
            {data.opportunities.length === 0 ? (
              <p className="text-center text-sm text-ink-900/65 dark:text-ink-50/65">
                Keine kritischen Opportunities gefunden.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.opportunities.map((item) => (
                  <li key={item.id} className="rounded-lg bg-ink-100/70 px-3 py-2 text-sm dark:bg-ink-900/70">
                    <span className="font-medium">{item.title}</span>
                    {item.displayValue ? (
                      <span className="text-ink-900/55 dark:text-ink-50/55"> - {item.displayValue}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StrategyButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors',
        active
          ? 'bg-ink-950 text-white shadow-sm dark:bg-ink-50 dark:text-ink-950'
          : 'text-ink-900/70 hover:bg-white/70 dark:text-ink-50/70 dark:hover:bg-ink-800/70'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

const LOADING_STAGES = [
  'Verbinde mit PageSpeed Insights...',
  'Starte Lighthouse Runner...',
  'Messe Core Web Vitals...',
  'Analysiere Render-Pfad...',
  'Bereite Ergebnisse auf...',
];

function IdleSpeedPanel() {
  return (
    <div className="relative mx-auto mt-8 flex min-h-64 max-w-2xl items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white/45 p-8 dark:border-ink-800 dark:bg-ink-950/25">
      <div className="absolute inset-x-8 top-8 h-px bg-gradient-to-r from-transparent via-ink-900/15 to-transparent dark:via-white/15" />
      <div className="grid w-full max-w-md grid-cols-3 gap-3">
        <SignalTile icon={<Gauge className="h-4 w-4" />} label="Score" />
        <SignalTile icon={<Waypoints className="h-4 w-4" />} label="Vitals" />
        <SignalTile icon={<Sparkles className="h-4 w-4" />} label="Audits" />
      </div>
    </div>
  );
}

function SignalTile({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-ink-100 bg-white text-xs font-medium text-ink-900/60 shadow-sm dark:border-ink-800 dark:bg-ink-900 dark:text-ink-50/60">
      <span className="text-ink-900 dark:text-ink-50">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function PageSpeedLoader() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStage((s) => (s + 1) % LOADING_STAGES.length);
    }, 2500);
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
            Analyse laeuft
          </div>
          <div
            key={stage}
            className="text-sm font-medium text-ink-900 dark:text-ink-50"
            style={{ animation: 'fadeInUp 0.4s ease-out' }}
          >
            {LOADING_STAGES[stage]}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <span
              key={index}
              className="h-1.5 rounded-full bg-ink-200 dark:bg-ink-800 [animation:scanBar_1.2s_ease-in-out_infinite]"
              style={{ animationDelay: `${index * 140}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white/70 p-4 text-center shadow-sm dark:border-ink-900/80 dark:bg-ink-950/35">
      <div className="mb-2 flex items-center justify-center gap-2 text-xs text-ink-900/55 dark:text-ink-50/55">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'warn' && 'text-red-600 dark:text-red-400',
          tone === 'bad' && 'text-red-600 dark:text-red-400',
          tone === 'neutral' && 'text-ink-900 dark:text-ink-50'
        )}
      >
        {value}
      </div>
    </div>
  );
}

function formatMs(value?: number): string {
  if (value === undefined) return '-';
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value}ms`;
}

function formatCls(value?: number): string {
  if (value === undefined) return '-';
  return value.toFixed(3);
}

function scoreTone(score: number): 'good' | 'warn' | 'bad' | 'neutral' {
  if (score >= 90) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}

function lcpTone(value?: number): 'good' | 'warn' | 'bad' | 'neutral' {
  if (value === undefined) return 'neutral';
  if (value <= 2500) return 'good';
  if (value <= 4000) return 'warn';
  return 'bad';
}

function inpTone(value?: number): 'good' | 'warn' | 'bad' | 'neutral' {
  if (value === undefined) return 'neutral';
  if (value <= 200) return 'good';
  if (value <= 500) return 'warn';
  return 'bad';
}

function fcpTone(value?: number): 'good' | 'warn' | 'bad' | 'neutral' {
  if (value === undefined) return 'neutral';
  if (value <= 1800) return 'good';
  if (value <= 3000) return 'warn';
  return 'bad';
}

function ttfbTone(value?: number): 'good' | 'warn' | 'bad' | 'neutral' {
  if (value === undefined) return 'neutral';
  if (value <= 800) return 'good';
  if (value <= 1800) return 'warn';
  return 'bad';
}

function clsTone(value?: number): 'good' | 'warn' | 'bad' | 'neutral' {
  if (value === undefined) return 'neutral';
  if (value <= 0.1) return 'good';
  if (value <= 0.25) return 'warn';
  return 'bad';
}
