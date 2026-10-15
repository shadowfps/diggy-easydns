import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowRight, Check, Info } from 'lucide-react';
import type { Finding, HealthScore } from '@/types/dns';
import { cn } from '@/lib/cn';

interface ScoreCardProps {
  score: HealthScore;
  findings: Finding[];
  onShowFindings: () => void;
}

const PRIORITY: Finding['severity'][] = ['critical', 'warning', 'info'];

const TOP_TONE = {
  critical: { icon: AlertCircle, tile: 'icon-tile-danger' },
  warning: { icon: AlertTriangle, tile: 'icon-tile-warning' },
  info: { icon: Info, tile: '' },
} as const;

/** Gut, Warnung, kritisch — dieselben Töne wie die Findings. */
function scoreTone(s: number) {
  if (s >= 65) return { bar: 'bg-success', text: 'text-success', badge: 'badge-success' };
  if (s >= 40) return { bar: 'bg-warning', text: 'text-warning', badge: 'badge-warning' };
  return { bar: 'bg-danger', text: 'text-danger', badge: 'badge-danger' };
}

export function ScoreCard({ score, findings, onShowFindings }: ScoreCardProps) {
  const tone = scoreTone(score.score);
  const top = PRIORITY.map((severity) => findings.find((f) => f.severity === severity)).find(Boolean);
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const controls = animate(count, score.score, { duration: 1.2, ease: 'easeOut' });
    const unsub = rounded.on('change', (v) => setDisplayValue(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [score.score, count, rounded]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="card flex flex-col"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="card-title">Health Score</h2>
        <span className={cn('badge', tone.badge)}>{score.verdict}</span>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline gap-1.5">
          <span className={cn('text-6xl font-semibold tabular-nums tracking-tight', tone.text)}>
            {displayValue}
          </span>
          <span className="text-base text-fg-subtle">/ 100</span>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-muted">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${score.score}%` }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className={cn('h-full rounded-full', tone.bar)}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <Stat label="ok" count={score.counts.success} dot="bg-success" />
          <Stat label="info" count={score.counts.info} dot="bg-fg-subtle" />
          <Stat label="Warnung" count={score.counts.warning} dot="bg-warning" />
          <Stat label="kritisch" count={score.counts.critical} dot="bg-danger" />
        </div>
      </div>

      {/* Der nächste Schritt: der schwerste offene Punkt, ein Klick zu allen.
          Füllt zugleich die Höhe, die die Schnellübersicht daneben vorgibt. */}
      <div className="mt-auto pt-5">
        <div className="flex items-center gap-3 border-t border-line-subtle pt-4">
          <TopFinding finding={top} />
          <button type="button" onClick={onShowFindings} className="btn btn-ghost btn-sm -mr-2 group">
            Alle Findings
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function TopFinding({ finding }: { finding?: Finding }) {
  if (!finding) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="icon-tile icon-tile-success size-8">
          <Check className="size-4" />
        </span>
        <p className="text-sm font-medium text-fg">Keine offenen Punkte</p>
      </div>
    );
  }
  const cfg = TOP_TONE[finding.severity as keyof typeof TOP_TONE];
  const Icon = cfg.icon;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className={cn('icon-tile size-8', cfg.tile)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-fg-subtle">Wichtigster Punkt</p>
        <p className="truncate text-sm font-medium text-fg">{finding.title}</p>
      </div>
    </div>
  );
}

function Stat({ label, count, dot }: { label: string; count: number; dot: string }) {
  return (
    <span className="flex items-center gap-1.5 text-fg-muted">
      <span className={cn('size-2 rounded-full', dot)} />
      <span className="font-semibold tabular-nums text-fg">{count}</span>
      {label}
    </span>
  );
}
