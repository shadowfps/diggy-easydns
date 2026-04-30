import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { HealthScore } from '@/types/dns';
import { cn } from '@/lib/cn';

interface ScoreCardProps {
  score: HealthScore;
}

function scoreColor(s: number) {
  if (s >= 85) return { bar: 'bg-emerald-500', text: 'text-emerald-500', badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
  if (s >= 65) return { bar: 'bg-diggy-500', text: 'text-diggy-500', badge: 'bg-diggy-500/10 text-diggy-600 dark:text-diggy-400' };
  if (s >= 40) return { bar: 'bg-orange-500', text: 'text-orange-500', badge: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' };
  return { bar: 'bg-red-500', text: 'text-red-500', badge: 'bg-red-500/10 text-red-600 dark:text-red-400' };
}

export function ScoreCard({ score }: ScoreCardProps) {
  const colors = scoreColor(score.score);
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
      className="surface rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-ink-900/60 dark:text-ink-50/60">Health Score</span>
        <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', colors.badge)}>
          {score.verdict}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5 mb-4">
        <span className={cn('text-5xl font-medium tabular-nums tracking-tight', colors.text)}>
          {displayValue}
        </span>
        <span className="text-base text-ink-900/40 dark:text-ink-50/40">/ 100</span>
      </div>

      <div className="h-1.5 bg-ink-100 dark:bg-ink-900 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score.score}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className={cn('h-full rounded-full', colors.bar)}
        />
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs">
        <Stat label="ok" count={score.counts.success} dot="bg-emerald-500" />
        <Stat label="info" count={score.counts.info} dot="bg-accent-500" />
        <Stat label="warn" count={score.counts.warning} dot="bg-orange-500" />
        <Stat label="krit" count={score.counts.critical} dot="bg-red-500" />
      </div>
    </motion.div>
  );
}

function Stat({ label, count, dot }: { label: string; count: number; dot: string }) {
  return (
    <span className="flex items-center gap-1.5 text-ink-900/60 dark:text-ink-50/60">
      <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
      <span className="font-medium text-ink-900 dark:text-ink-50 tabular-nums">{count}</span>
      <span>{label}</span>
    </span>
  );
}
