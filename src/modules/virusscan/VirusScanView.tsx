import { useEffect, useState } from 'react';
import type { VirusScanReport } from '@/types/dns';
import { cn } from '@/lib/cn';
import { CardHeader } from '@/components/ui/CardHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, t, tRich, useI18n } from '@/i18n';
import type { DeKey } from '@/i18n/de';
import { LoadingAnnouncement } from '@/components/ui/LoadingAnnouncement';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Play,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Tag,
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
  useI18n();
  return (
    <div className="flex flex-col gap-4">
      {/* Scan-Block: Titel, Start — darunter Leerlauf, Ladeanzeige oder das
          Urteil mit den Kennzahlen. Details (Engines, Kategorien) folgen als
          eigene Karten. */}
      <div className="card py-10 sm:py-12">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="eyebrow">Security Scan</p>
          <h3 className="mt-1.5 text-2xl font-semibold tracking-tight text-fg">VirusTotal Scan</h3>
          <p className="mt-1.5 max-w-md text-sm text-fg-muted">
            {t('Prüft die Domain gegen 80+ Sicherheits-Engines auf Malware, Phishing und Blacklists.')}
          </p>

          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            className="btn btn-primary btn-lg mt-6 min-w-40"
          >
            <Play className="size-4 fill-current" />
            <span>{loading ? 'Scanning…' : t('Scan starten')}</span>
          </button>

          {data && (
            <span className="badge mt-5">
              <CheckCircle2 className="size-3" />
              {t('Scan abgeschlossen')}
            </span>
          )}
        </div>

        {!data && !loading && !error && <IdlePanel />}

        {loading && <ScanLoader />}

        {data && <ScanSummary data={data} />}
      </div>

      {error && (
        <EmptyState tone="danger" icon={<AlertTriangle className="size-5" />}>
          {error}
        </EmptyState>
      )}

      {data && <ScanDetails data={data} />}
    </div>
  );
}

/** Urteil und Kennzahlen — steht im Scan-Block direkt unter dem Start. */
function ScanSummary({ data }: { data: VirusScanReport }) {
  const total = data.stats.malicious + data.stats.suspicious + data.stats.harmless + data.stats.undetected;
  const flagged = data.stats.malicious + data.stats.suspicious;

  return (
    <div className="mx-auto mt-8 max-w-4xl">
      <Verdict data={data} total={total} flagged={flagged} />

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatPanel label="Malicious" value={data.stats.malicious} tone="bad" />
        <StatPanel label="Suspicious" value={data.stats.suspicious} tone="warn" />
        <StatPanel label="Harmless" value={data.stats.harmless} tone="good" />
        <StatPanel label="Undetected" value={data.stats.undetected} tone="neutral" />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="panel">
          <p className="text-xs text-fg-subtle">Reputation Score</p>
          <p
            className={cn(
              'mt-1 text-2xl font-semibold tabular-nums tracking-tight',
              data.reputation < 0 ? 'text-danger' : data.reputation > 0 ? 'text-success' : 'text-fg'
            )}
          >
            {data.reputation > 0 ? `+${data.reputation}` : data.reputation}
          </p>
          <p className="mt-1 text-xs text-fg-subtle">{t('Community-Bewertung (negativ = schlechter Ruf)')}</p>
        </div>

        <div className="panel">
          <p className="text-xs text-fg-subtle">Community Votes</p>
          <div className="mt-1 flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              <ThumbsUp className="size-4 text-success" />
              <span className="text-2xl font-semibold tabular-nums tracking-tight text-fg">
                {data.totalVotes.harmless}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <ThumbsDown className="size-4 text-danger" />
              <span className="text-2xl font-semibold tabular-nums tracking-tight text-fg">
                {data.totalVotes.malicious}
              </span>
            </div>
          </div>
          <p className="mt-1 text-xs text-fg-subtle">
            {t('Letzte Analyse: {date}', { date: formatDate(data.lastAnalysisDate) })}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Angeschlagene Engines, Kategorien, Entwarnung — je eine eigene Karte. */
function ScanDetails({ data }: { data: VirusScanReport }) {
  const flaggedVendors = data.vendors.filter(
    (v) => v.category === 'malicious' || v.category === 'suspicious'
  );
  const harmlessVendors = data.vendors.filter((v) => v.category === 'harmless');
  // Rot nur, wenn wirklich eine Engine „malicious“ meldet — reine
  // Verdachtsfälle sind eine Warnung.
  const anyMalicious = flaggedVendors.some((v) => v.category === 'malicious');

  return (
    <>
      {flaggedVendors.length > 0 && (
        <div className="card-flush divide-y divide-line-subtle">
          <CardHeader
            className="px-5 py-4 sm:px-6"
            tone={anyMalicious ? 'danger' : 'warning'}
            icon={anyMalicious ? <AlertCircle className="size-4" /> : <AlertTriangle className="size-4" />}
            title={t('{count} Engines haben angeschlagen', { count: flaggedVendors.length })}
          />
          <ul className="divide-y divide-line-subtle">
            {flaggedVendors.map((v) => (
              <li key={v.name} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
                <span className="min-w-0 truncate text-sm text-fg">{v.name}</span>
                <span className={cn('badge', v.category === 'malicious' ? 'badge-danger' : 'badge-warning')}>
                  {v.result}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Object.keys(data.categories).length > 0 && (
        <div className="card">
          <CardHeader
            icon={<Tag className="size-4" />}
            title={t('Kategorisierung durch Sicherheits-Engines')}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {[...new Set(Object.values(data.categories))].map((cat) => (
              <span key={cat} className="badge">
                {cat}
              </span>
            ))}
          </div>
        </div>
      )}

      {flaggedVendors.length === 0 && harmlessVendors.length > 0 && (
        <div className="card flex items-center gap-3">
          <span className="icon-tile icon-tile-success">
            <ShieldCheck className="size-4" />
          </span>
          <p className="text-sm text-fg">
            {t('{count} Engines haben die Domain als unbedenklich eingestuft.', {
              count: harmlessVendors.length,
            })}
          </p>
        </div>
      )}
    </>
  );
}

const VERDICT = {
  clean: {
    icon: ShieldCheck,
    label: 'Sauber',
    sub: 'Keine Bedrohungen erkannt',
    tile: 'icon-tile-success',
    text: 'text-success',
  },
  suspicious: {
    icon: ShieldAlert,
    label: 'Verdächtig',
    sub: 'Einige Engines haben Bedenken',
    tile: 'icon-tile-warning',
    text: 'text-warning',
  },
  malicious: {
    icon: ShieldX,
    label: 'Schädlich',
    sub: 'Domain als Bedrohung eingestuft',
    tile: 'icon-tile-danger',
    text: 'text-danger',
  },
} as const satisfies Record<string, { label: DeKey; sub: DeKey } & Record<string, unknown>>;

function Verdict({
  data,
  total,
  flagged,
}: {
  data: VirusScanReport;
  total: number;
  flagged: number;
}) {
  const config = VERDICT[data.verdict];
  const Icon = config.icon;

  // Das Urteil trägt seinen Status dreifach: Wort, Schild-Form, Farbe.
  return (
    <div className="flex flex-col items-center text-center">
      <span className={cn('icon-tile size-12', config.tile)}>
        <Icon className="size-6" />
      </span>
      <p className={cn('mt-3 text-2xl font-semibold tracking-tight', config.text)}>{t(config.label)}</p>
      <p className="mt-1 text-sm text-fg-muted">{t(config.sub)}</p>
      <p className="mt-3 text-sm text-fg-muted">
        {tRich('{flagged} von {total} Engines haben angeschlagen', {
          flagged: <span className="font-semibold text-fg">{flagged}</span>,
          total: <span className="font-semibold text-fg">{total}</span>,
        })}
      </p>
    </div>
  );
}

const STAT_TONE = {
  good: 'text-success',
  warn: 'text-warning',
  bad: 'text-danger',
  neutral: 'text-fg',
} as const;

function StatPanel({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof STAT_TONE;
}) {
  return (
    <div className="panel">
      <p className="text-xs text-fg-subtle">{label}</p>
      {/* Farbe nur, wenn es etwas zu melden gibt — eine rote Null hieße
          „Gefahr“, wo keine ist. Die Kategorie steht im Label. */}
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums tracking-tight',
          value > 0 ? STAT_TONE[tone] : 'text-fg'
        )}
      >
        {value}
      </p>
    </div>
  );
}

const SCAN_STAGES: DeKey[] = [
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

  // Einmalige Ansage statt aria-busy, Anzeige aria-hidden — Begründung beim
  // PageSpeedLoader.
  return (
    <div className="mx-auto mt-8 max-w-md">
      <LoadingAnnouncement>{t('VirusTotal-Scan läuft…')}</LoadingAnnouncement>
      <div className="panel px-6 py-6 text-center" aria-hidden="true">
        <Loader2 className="mx-auto size-5 animate-spin text-fg" />
        <div className="eyebrow mt-4">{t('Scan läuft')}</div>
        <div key={stage} className="mt-1.5 animate-fade-in-up text-sm text-fg">
          {t(SCAN_STAGES[stage])}
        </div>
        <div className="mt-5 grid grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="h-1.5 animate-scan-bar rounded-full bg-fg/20"
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
    <div className="mx-auto mt-8 grid max-w-sm grid-cols-3 gap-3">
      <IdleTile icon={<ShieldCheck className="size-4" />} label="Malware" />
      <IdleTile icon={<Shield className="size-4" />} label="Phishing" />
      <IdleTile icon={<ShieldAlert className="size-4" />} label="Blacklist" />
    </div>
  );
}

function IdleTile({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="panel flex flex-col items-center gap-2 py-5 text-xs text-fg-muted">
      <span className="text-fg-subtle">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
