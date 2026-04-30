import { useEffect, useState } from 'react';
import type { PageSpeedReport, PageSpeedStrategy } from '@/types/dns';
import { cn } from '@/lib/cn';
import {
  Gauge,
  Timer,
  Waypoints,
  MousePointerClick,
  ImageOff,
  Server,
  Loader2,
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
    <div className="surface rounded-xl p-5">
      <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-medium">PageSpeed (Google PSI)</h3>
          <p className="text-xs text-ink-900/50 dark:text-ink-50/50">
            On-demand Analyse, damit der DNS-Lookup schnell bleibt.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex p-1 rounded-lg bg-ink-100/80 dark:bg-ink-900/70">
            <StrategyButton
              active={strategy === 'mobile'}
              onClick={() => onStrategyChange('mobile')}
              label="Mobile"
            />
            <StrategyButton
              active={strategy === 'desktop'}
              onClick={() => onStrategyChange('desktop')}
              label="Desktop"
            />
          </div>

          <button
            onClick={onRun}
            disabled={loading}
            className="px-3 py-2 rounded-lg bg-diggy-500 text-white text-xs font-medium hover:bg-diggy-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Teste…' : 'Speed testen'}
          </button>
        </div>
      </div>

      {!data && !loading && !error && (
        <div className="rounded-xl border border-dashed border-ink-200 dark:border-ink-900 p-10 text-center text-sm text-ink-900/55 dark:text-ink-50/55">
          Noch kein Test gelaufen. Klicke auf <span className="font-medium">Speed testen</span>.
        </div>
      )}

      {loading && <PageSpeedSkeleton />}

      {error && (
        <div className="rounded-xl bg-red-500/10 text-red-700 dark:text-red-300 p-3 text-sm mb-4">
          {error}
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <MetricCard
              icon={<Gauge className="w-4 h-4" />}
              label="Performance Score"
              value={`${data.performanceScore}`}
              tone={scoreTone(data.performanceScore)}
            />
            <MetricCard
              icon={<Waypoints className="w-4 h-4" />}
              label="LCP"
              value={formatMs(data.metrics.lcpMs)}
              tone={lcpTone(data.metrics.lcpMs)}
            />
            <MetricCard
              icon={<MousePointerClick className="w-4 h-4" />}
              label="INP"
              value={formatMs(data.metrics.inpMs)}
              tone={inpTone(data.metrics.inpMs)}
            />
            <MetricCard
              icon={<Timer className="w-4 h-4" />}
              label="FCP"
              value={formatMs(data.metrics.fcpMs)}
              tone={fcpTone(data.metrics.fcpMs)}
            />
            <MetricCard
              icon={<Server className="w-4 h-4" />}
              label="TTFB"
              value={formatMs(data.metrics.ttfbMs)}
              tone={ttfbTone(data.metrics.ttfbMs)}
            />
            <MetricCard
              icon={<ImageOff className="w-4 h-4" />}
              label="CLS"
              value={formatCls(data.metrics.cls)}
              tone={clsTone(data.metrics.cls)}
            />
          </div>

          <div className="rounded-xl border border-ink-100 dark:border-ink-900/80 p-4">
            <p className="text-xs mb-2 text-ink-900/55 dark:text-ink-50/55">
              Top Optimierungspotenziale
            </p>
            {data.opportunities.length === 0 ? (
              <p className="text-sm text-ink-900/65 dark:text-ink-50/65">
                Keine kritischen Opportunities gefunden.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.opportunities.map((item) => (
                  <li key={item.id} className="text-sm">
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
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'text-xs px-2.5 py-1.5 rounded-md transition-colors font-medium',
        active
          ? 'bg-diggy-500 text-white shadow-sm'
          : 'text-ink-900/70 dark:text-ink-50/70 hover:bg-white/70 dark:hover:bg-ink-800/70'
      )}
    >
      {label}
    </button>
  );
}

const LOADING_STAGES = [
  'Verbinde mit Google PageSpeed Insights…',
  'Lade Seite mit Headless Chrome…',
  'Messe Core Web Vitals (LCP, INP, CLS)…',
  'Sammle Performance-Audits…',
  'Werte Optimierungspotenziale aus…',
];

const SKELETON_METRICS: { label: string; icon: React.ReactNode; hint: string }[] = [
  { label: 'Performance Score', icon: <Gauge className="w-4 h-4" />, hint: 'berechnet…' },
  { label: 'LCP', icon: <Waypoints className="w-4 h-4" />, hint: 'misst…' },
  { label: 'INP', icon: <MousePointerClick className="w-4 h-4" />, hint: 'misst…' },
  { label: 'FCP', icon: <Timer className="w-4 h-4" />, hint: 'misst…' },
  { label: 'TTFB', icon: <Server className="w-4 h-4" />, hint: 'misst…' },
  { label: 'CLS', icon: <ImageOff className="w-4 h-4" />, hint: 'beobachtet…' },
];

const SKELETON_OPPORTUNITIES = [
  'Render-blockierende Ressourcen werden geprüft…',
  'Bildgrößen werden analysiert…',
  'JavaScript-Bundle wird untersucht…',
];

function PageSpeedSkeleton() {
  // PSI braucht real ~10–30s. Wir rotieren Status-Texte alle 2.5s,
  // damit der User sieht: hier passiert noch was.
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setStage((s) => (s + 1) % LOADING_STAGES.length);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3 rounded-xl border border-diggy-500/30 bg-diggy-500/5 px-4 py-3">
        <Loader2 className="w-4 h-4 text-diggy-500 animate-spin shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-diggy-500 font-semibold mb-0.5">
            Analyse läuft
          </div>
          <div
            key={stage}
            className="text-sm text-ink-900/85 dark:text-ink-50/85 truncate"
            style={{ animation: 'fadeInUp 0.4s ease-out' }}
          >
            {LOADING_STAGES[stage]}
          </div>
        </div>
        <span className="hidden sm:inline-flex">
          <span className="dig-dots">
            <span /> <span /> <span />
          </span>
        </span>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {SKELETON_METRICS.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-ink-100 dark:border-ink-900/80 p-3"
          >
            <div className="flex items-center gap-2 text-xs text-ink-900/55 dark:text-ink-50/55 mb-2">
              {metric.icon}
              {metric.label}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-20 rounded bg-ink-200/70 dark:bg-ink-800/80 animate-pulse" />
              <span className="text-[11px] text-ink-900/40 dark:text-ink-50/40">{metric.hint}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-ink-100 dark:border-ink-900/80 p-4">
        <p className="text-xs mb-3 text-ink-900/55 dark:text-ink-50/55">
          Top Optimierungspotenziale
        </p>
        <ul className="space-y-2.5">
          {SKELETON_OPPORTUNITIES.map((placeholder) => (
            <li
              key={placeholder}
              className="flex items-center gap-3 text-sm text-ink-900/55 dark:text-ink-50/55"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-diggy-500/50 animate-pulse shrink-0" />
              <span className="truncate">{placeholder}</span>
            </li>
          ))}
        </ul>
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
    <div className="rounded-xl border border-ink-100 dark:border-ink-900/80 p-3">
      <div className="flex items-center gap-2 text-xs text-ink-900/55 dark:text-ink-50/55 mb-2">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          'text-lg font-semibold',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'warn' && 'text-orange-600 dark:text-orange-400',
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
  if (value === undefined) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value}ms`;
}

function formatCls(value?: number): string {
  if (value === undefined) return '—';
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
