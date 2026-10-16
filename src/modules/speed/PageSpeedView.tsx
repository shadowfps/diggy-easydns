import { useEffect, useState } from 'react';
import type { PageSpeedReport, PageSpeedStrategy } from '@/types/dns';
import { cn } from '@/lib/cn';
import { CardHeader } from '@/components/ui/CardHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { t, useI18n } from '@/i18n';
import type { DeKey } from '@/i18n/de';
import { LoadingAnnouncement } from '@/components/ui/LoadingAnnouncement';
import {
  AlertCircle,
  AlertTriangle,
  Check,
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

type MetricTone = 'good' | 'warn' | 'bad' | 'neutral';

/**
 * Lighthouse-Bewertung als Farbe UND Form: Haken, Dreieck, Kreis — wie bei
 * den Findings. Vorher war „verbesserungswürdig“ genauso rot wie „schlecht“.
 */
const METRIC_TONE: Record<MetricTone, { text: string; icon?: typeof Check; label?: DeKey }> = {
  good: { text: 'text-success', icon: Check, label: 'gut' },
  warn: { text: 'text-warning', icon: AlertTriangle, label: 'verbesserungswürdig' },
  bad: { text: 'text-danger', icon: AlertCircle, label: 'schlecht' },
  neutral: { text: 'text-fg' },
};

export function PageSpeedView({
  data,
  loading,
  error,
  strategy,
  onStrategyChange,
  onRun,
}: PageSpeedViewProps) {
  useI18n();
  return (
    <div className="flex flex-col gap-4">
      {/* Scan-Block: Titel, Umschalter, Start — darunter Leerlauf, Ladeanzeige
          oder die Kennzahlen. Die Liste der Optimierungen steht als eigene
          Karte darunter. */}
      <div className="card py-10 sm:py-12">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="eyebrow">Speed</p>
          <h3 className="mt-1.5 text-2xl font-semibold tracking-tight text-fg">PageSpeed Scan</h3>

          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
            <div className="flex gap-1 rounded-full bg-surface-muted p-1">
              <StrategyButton
                active={strategy === 'mobile'}
                icon={<Smartphone className="size-3.5" />}
                label="Mobile"
                onClick={() => onStrategyChange('mobile')}
              />
              <StrategyButton
                active={strategy === 'desktop'}
                icon={<Monitor className="size-3.5" />}
                label="Desktop"
                onClick={() => onStrategyChange('desktop')}
              />
            </div>

            <button
              type="button"
              onClick={onRun}
              disabled={loading}
              className="btn btn-primary btn-lg min-w-40"
            >
              <Play className="size-4 fill-current" />
              <span>{loading ? 'Scanning' : 'Run Scan'}</span>
            </button>
          </div>

          {data && (
            <span className="badge mt-5">
              <CheckCircle2 className="size-3" />
              {t('Scan abgeschlossen')}
            </span>
          )}
        </div>

        {!data && !loading && !error && <IdleSpeedPanel />}

        {loading && <PageSpeedLoader />}

        {data && (
          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-2 gap-3 md:grid-cols-3">
            <MetricPanel
              icon={<Gauge className="size-3.5" />}
              label="Performance Score"
              value={`${data.performanceScore}`}
              tone={scoreTone(data.performanceScore)}
            />
            <MetricPanel
              icon={<Waypoints className="size-3.5" />}
              label="LCP"
              value={formatMs(data.metrics.lcpMs)}
              tone={lcpTone(data.metrics.lcpMs)}
            />
            <MetricPanel
              icon={<MousePointerClick className="size-3.5" />}
              label="INP"
              value={formatMs(data.metrics.inpMs)}
              tone={inpTone(data.metrics.inpMs)}
            />
            <MetricPanel
              icon={<Timer className="size-3.5" />}
              label="FCP"
              value={formatMs(data.metrics.fcpMs)}
              tone={fcpTone(data.metrics.fcpMs)}
            />
            <MetricPanel
              icon={<Server className="size-3.5" />}
              label="TTFB"
              value={formatMs(data.metrics.ttfbMs)}
              tone={ttfbTone(data.metrics.ttfbMs)}
            />
            <MetricPanel
              icon={<ImageOff className="size-3.5" />}
              label="CLS"
              value={formatCls(data.metrics.cls)}
              tone={clsTone(data.metrics.cls)}
            />
          </div>
        )}
      </div>

      {error && (
        <EmptyState tone="danger" icon={<AlertTriangle className="size-5" />}>
          {error}
        </EmptyState>
      )}

      {data && <Opportunities items={data.opportunities} />}
    </div>
  );
}

function Opportunities({ items }: { items: PageSpeedReport['opportunities'] }) {
  if (items.length === 0) {
    return (
      <EmptyState icon={<Sparkles className="size-5" />} title={t('Top Optimierungspotenziale')}>
        {t('Keine kritischen Opportunities gefunden.')}
      </EmptyState>
    );
  }

  return (
    <div className="card-flush divide-y divide-line-subtle">
      <CardHeader
        className="px-5 py-4 sm:px-6"
        icon={<Sparkles className="size-4" />}
        title={t('Top Optimierungspotenziale')}
      />
      <ul className="divide-y divide-line-subtle">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-0.5 px-5 py-3 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-6 sm:px-6"
          >
            <span className="min-w-0 text-fg">{item.title}</span>
            {item.displayValue ? (
              <span className="shrink-0 tabular-nums text-fg-muted">{item.displayValue}</span>
            ) : null}
          </li>
        ))}
      </ul>
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
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors',
        active ? 'bg-accent text-on-accent' : 'text-fg-muted hover:text-fg'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

const LOADING_STAGES: DeKey[] = [
  'Verbinde mit PageSpeed Insights…',
  'Starte Lighthouse Runner…',
  'Messe Core Web Vitals…',
  'Analysiere Render-Pfad…',
  'Bereite Ergebnisse auf…',
];

function IdleSpeedPanel() {
  return (
    <div className="mx-auto mt-8 grid max-w-sm grid-cols-3 gap-3">
      <SignalTile icon={<Gauge className="size-4" />} label="Score" />
      <SignalTile icon={<Waypoints className="size-4" />} label="Vitals" />
      <SignalTile icon={<Sparkles className="size-4" />} label="Audits" />
    </div>
  );
}

function SignalTile({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="panel flex flex-col items-center gap-2 py-5 text-xs text-fg-muted">
      <span className="text-fg-subtle">{icon}</span>
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

  // Der Ladezustand wird angesagt, nicht nur gezeigt: bei „Bewegung
  // reduzieren“ stehen Spinner und Balken still (globals.css). Angesagt wird
  // genau einmal über LoadingAnnouncement; die sichtbare Anzeige ist
  // aria-hidden, sonst käme jeder Stufenwechsel als neue Ansage. Kein
  // aria-busy: auf einer Live-Region heißt das „Ansagen zurückhalten, bis busy
  // wieder false ist“ — das wurde es nie, die Anzeige verschwand einfach.
  return (
    <div className="mx-auto mt-8 max-w-md">
      <LoadingAnnouncement>PageSpeed-Analyse läuft…</LoadingAnnouncement>
      <div className="panel px-6 py-6 text-center" aria-hidden="true">
        <Loader2 className="mx-auto size-5 animate-spin text-fg" />

        <div className="eyebrow mt-4">{t('Analyse läuft')}</div>
        <div key={stage} className="mt-1.5 animate-fade-in-up text-sm text-fg">
          {t(LOADING_STAGES[stage])}
        </div>

        <div className="mt-5 grid grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <span
              key={index}
              className="h-1.5 animate-scan-bar rounded-full bg-fg/20"
              style={{ animationDelay: `${index * 140}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricPanel({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: MetricTone;
}) {
  const cfg = METRIC_TONE[tone];
  const StatusIcon = cfg.icon;

  return (
    <div className="panel">
      <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          'mt-2 flex items-center gap-1.5 text-2xl font-semibold tabular-nums tracking-tight',
          cfg.text
        )}
      >
        {StatusIcon && <StatusIcon className="size-4 shrink-0" aria-hidden />}
        {value}
        {/* Für Screenreader das Urteil als Wort — Farbe und Icon sieht er nicht. */}
        {cfg.label && <span className="sr-only">({t(cfg.label)})</span>}
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

/** Lighthouse: ab 90 gut, 50–89 verbesserungswürdig, darunter schlecht. */
function scoreTone(score: number): MetricTone {
  if (score >= 90) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}

function lcpTone(value?: number): MetricTone {
  if (value === undefined) return 'neutral';
  if (value <= 2500) return 'good';
  if (value <= 4000) return 'warn';
  return 'bad';
}

function inpTone(value?: number): MetricTone {
  if (value === undefined) return 'neutral';
  if (value <= 200) return 'good';
  if (value <= 500) return 'warn';
  return 'bad';
}

function fcpTone(value?: number): MetricTone {
  if (value === undefined) return 'neutral';
  if (value <= 1800) return 'good';
  if (value <= 3000) return 'warn';
  return 'bad';
}

function ttfbTone(value?: number): MetricTone {
  if (value === undefined) return 'neutral';
  if (value <= 800) return 'good';
  if (value <= 1800) return 'warn';
  return 'bad';
}

function clsTone(value?: number): MetricTone {
  if (value === undefined) return 'neutral';
  if (value <= 0.1) return 'good';
  if (value <= 0.25) return 'warn';
  return 'bad';
}
