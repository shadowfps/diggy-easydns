import { motion } from 'framer-motion';
import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, Check, Copy } from 'lucide-react';
import type { Finding, Severity } from '@/types/dns';
import { cn } from '@/lib/cn';

interface FindingsListProps {
  findings: Finding[];
}

const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; icon: typeof AlertCircle; classes: string; iconClasses: string }
> = {
  critical: {
    label: 'KRITISCH',
    icon: AlertCircle,
    classes: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30',
    iconClasses: 'text-red-500',
  },
  warning: {
    label: 'WARNUNG',
    icon: AlertTriangle,
    classes: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30',
    iconClasses: 'text-orange-500',
  },
  info: {
    label: 'INFO',
    icon: Info,
    classes: 'bg-accent-500/10 text-accent-700 dark:text-accent-300 border-accent-500/30',
    iconClasses: 'text-accent-500',
  },
  success: {
    label: 'OK',
    icon: Check,
    classes: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    iconClasses: 'text-emerald-500',
  },
};

const SEVERITY_ORDER: Severity[] = ['critical', 'warning', 'info', 'success'];

export function FindingsList({ findings }: FindingsListProps) {
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  return (
    <div className="space-y-2.5">
      {sorted.map((finding, i) => (
        <FindingCard key={finding.id} finding={finding} delay={i * 0.06} />
      ))}
    </div>
  );
}

function FindingCard({ finding, delay }: { finding: Finding; delay: number }) {
  const cfg = SEVERITY_CONFIG[finding.severity];
  const Icon = cfg.icon;
  const [copied, setCopied] = useState(false);

  const copySnippet = () => {
    if (!finding.fix?.snippet) return;
    navigator.clipboard.writeText(finding.fix.snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="surface rounded-xl p-5"
    >
      <div className="flex items-start gap-3">
        <div className={cn('shrink-0 mt-0.5', cfg.iconClasses)}>
          <Icon className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded border',
                cfg.classes
              )}
            >
              {cfg.label}
            </span>
            <span className="text-xs text-ink-900/40 dark:text-ink-50/40 uppercase tracking-wider">
              {finding.category}
            </span>
          </div>

          <h3 className="text-sm font-medium mb-1">{finding.title}</h3>
          <p className="text-sm text-ink-900/70 dark:text-ink-50/70 leading-relaxed">
            {finding.description}
          </p>

          {finding.fix?.snippet && (
            <div className="mt-3 relative group">
              <pre className="text-[11px] font-mono bg-ink-100 dark:bg-ink-950 border border-ink-100 dark:border-ink-900/80 rounded-lg p-3 overflow-x-auto text-ink-900/80 dark:text-ink-50/80">
                {finding.fix.snippet}
              </pre>
              <button
                onClick={copySnippet}
                className="absolute top-2 right-2 p-1.5 rounded-md bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-900/80 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Snippet kopieren"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
