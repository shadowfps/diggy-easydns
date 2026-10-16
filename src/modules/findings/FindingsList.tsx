import { motion } from 'motion/react';
import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, Check, Copy } from 'lucide-react';
import type { Finding, Severity } from '@/types/dns';
import { cn } from '@/lib/cn';
import { staggerDelay, useReducedMotion } from '@/hooks/useReducedMotion';

interface FindingsListProps {
  findings: Finding[];
}

const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; icon: typeof AlertCircle; badge: string; tile: string }
> = {
  critical: { label: 'Kritisch', icon: AlertCircle, badge: 'badge-danger', tile: 'icon-tile-danger' },
  warning: { label: 'Warnung', icon: AlertTriangle, badge: 'badge-warning', tile: 'icon-tile-warning' },
  info: { label: 'Hinweis', icon: Info, badge: '', tile: '' },
  success: { label: 'OK', icon: Check, badge: 'badge-success', tile: 'icon-tile-success' },
};

const CATEGORY_LABEL: Record<string, string> = {
  dns: 'DNS',
  dnssec: 'DNSSEC',
  mail: 'Mail',
  security: 'Security',
  ssl: 'SSL',
  performance: 'Performance',
};

const SEVERITY_ORDER: Severity[] = ['critical', 'warning', 'info', 'success'];

export function FindingsList({ findings }: FindingsListProps) {
  const reduced = useReducedMotion();
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  // Eine Karte mit Trennlinien statt einer Karte je Finding: die Liste liest
  // sich als ein Befund, nicht als acht lose Kästen.
  return (
    <div className="card-flush divide-y divide-line-subtle">
      {sorted.map((finding, i) => (
        <FindingRow key={finding.id} finding={finding} delay={staggerDelay(i, 0.04, reduced)} />
      ))}
    </div>
  );
}

function FindingRow({ finding, delay }: { finding: Finding; delay: number }) {
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
      transition={{ duration: 0.3, delay }}
      className="flex items-start gap-4 px-5 py-4 sm:px-6"
    >
      <span className={cn('icon-tile', cfg.tile)}>
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <h3 className="mr-1 text-sm font-semibold text-fg">{finding.title}</h3>
          <span className={cn('badge', cfg.badge)}>{cfg.label}</span>
          <span className="text-xs text-fg-subtle">
            {CATEGORY_LABEL[finding.category] ?? finding.category}
            {/* Ein „Hinweis“ kostet sonst Punkte — hier sieht man, warum der
                Score trotzdem bleibt. In derselben Zeile wie die Kategorie,
                damit der Zusatz auf schmalen Schirmen nicht allein umbricht. */}
            {finding.advisory && ' · ohne Punktabzug'}
          </span>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-fg-muted">{finding.description}</p>

        {finding.fix && (
          <div className="mt-3 space-y-2">
            {finding.fix.explanation && (
              <p className="text-sm text-fg-muted">{finding.fix.explanation}</p>
            )}
            {finding.fix.snippet && (
              <div className="panel flex items-start gap-3 py-3 pr-2">
                <pre className="min-w-0 flex-1 overflow-x-auto py-1 font-mono text-xs text-fg">
                  {finding.fix.snippet}
                </pre>
                {/* Immer sichtbar — vorher erst beim Hover, also weder per
                    Touch noch per Tastatur auffindbar. */}
                <button
                  type="button"
                  onClick={copySnippet}
                  className="btn btn-secondary btn-sm btn-icon"
                  aria-label={copied ? 'Snippet kopiert' : 'Snippet kopieren'}
                >
                  {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
