import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CircleHelp,
  Copy,
  Globe2,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react';
import { checkDomainAvailability } from '@/lib/api';
import type { DomainAvailabilityResult, DomainCheckReport } from '@/types/dns';
import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/ui/EmptyState';
import { errorText, t, useI18n } from '@/i18n';
import type { DeKey } from '@/i18n/de';

const MITTWALD_HOSTING_URL = 'https://www.mittwald.de/webhosting';

export function AvailabilityView() {
  const [query, setQuery] = useState('');
  const [report, setReport] = useState<DomainCheckReport | null>(null);
  const [loading, setLoading] = useState(false);
  // Der Fehler selbst — übersetzt wird beim Rendern.
  const [error, setError] = useState<unknown>(null);
  const { tRich } = useI18n();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const result = await checkDomainAvailability(trimmed);
      setReport(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto w-full max-w-3xl"
    >
      <p className="eyebrow flex items-center gap-1.5">
        <Sparkles className="size-3.5" />
        {t('Available Check')}
      </p>
      <h1 className="page-title mt-2">Domain Generator</h1>
      <p className="mt-3 text-base text-fg-muted">
        {t('Finde die passende Domain für dein Projekt — mit Alternativen zu gängigen TLDs.')}
      </p>

      <div className="mt-8 space-y-4">
        {/* Dieselbe Form wie das Suchfeld auf der Startseite: gleiche Rolle,
            gleiche Pille mit Primär-Button rechts. */}
        <form onSubmit={handleSubmit} className="relative">
          <label htmlFor="domain-check-input" className="sr-only">
            Domain
          </label>
          <div className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-fg-subtle">
            <Search className="size-[18px]" />
          </div>
          <input
            id="domain-check-input"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('meinprojekt oder meinprojekt.de')}
            autoComplete="off"
            spellCheck={false}
            className="h-14 w-full rounded-full border border-line bg-surface pl-12 pr-16 font-mono text-base text-fg shadow-card transition-[border-color,box-shadow] placeholder:text-fg-subtle focus:border-fg/30 focus:outline-hidden focus:ring-4 focus:ring-fg/6"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="btn btn-primary btn-icon absolute right-2 top-2"
            aria-label={t('Prüfen')}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </button>
        </form>

        {error != null && (
          <EmptyState tone="danger" icon={<AlertTriangle className="size-5" />}>
            {errorText(error, 'Verfügbarkeits-Check fehlgeschlagen')}
          </EmptyState>
        )}

        {report && (
          <div className="card-flush">
            <p className="px-5 py-4 text-sm text-fg-muted sm:px-6">
              {tRich('{count} Vorschläge für {label}', {
                count: report.results.length,
                label: <span className="font-mono text-fg">{report.label}</span>,
              })}
            </p>

            <div className="divide-y divide-line-subtle border-t border-line-subtle">
              {report.results.map((result, index) => (
                <AvailabilityRow
                  key={result.domain}
                  result={result}
                  delay={index * 0.04}
                  highlight={index === 0}
                />
              ))}
            </div>

            <div className="px-5 pb-5 pt-1 sm:px-6 sm:pb-6">
              <MittwaldHostingHint />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Frei → success, vergeben → neutral, unklar → Warnung. Form des Icons trägt den Status mit. */
const STATUS_CONFIG: Record<
  DomainAvailabilityResult['status'],
  { label: DeKey; icon: typeof Check; tile: string; badge: string }
> = {
  available: { label: 'Verfügbar', icon: Check, tile: 'icon-tile-success', badge: 'badge-success' },
  taken: { label: 'Vergeben', icon: Globe2, tile: '', badge: '' },
  unknown: { label: 'Unklar', icon: CircleHelp, tile: 'icon-tile-warning', badge: 'badge-warning' },
};

function AvailabilityRow({
  result,
  delay,
  highlight,
}: {
  result: DomainAvailabilityResult;
  delay: number;
  highlight: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const status = STATUS_CONFIG[result.status];
  useI18n();
  const StatusIcon = status.icon;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.domain);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      window.prompt(t('Domain kopieren:'), result.domain);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay }}
      className="flex items-center gap-3 px-5 py-3 sm:px-6"
    >
      <span className={cn('icon-tile', status.tile)}>
        <StatusIcon className="size-4" />
      </span>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className={cn('break-all font-mono text-sm text-fg', highlight && 'font-semibold')}>
          {result.domain}
        </span>
        <span className={cn('badge', status.badge)}>{t(status.label)}</span>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className="btn btn-ghost btn-sm btn-icon"
        aria-label={copied ? t('Domain kopiert') : t('Domain kopieren')}
        title={copied ? t('Domain kopiert') : t('Domain kopieren')}
      >
        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      </button>
    </motion.div>
  );
}

function MittwaldHostingHint() {
  const { tRich } = useI18n();
  return (
    <div className="panel">
      <p className="text-sm leading-relaxed text-fg-muted">
        {tRich(
          'Du suchst qualitatives Hosting für dein neues Projekt? Dann schau doch mal bei {mittwald} vorbei — Managed Webhosting aus Deutschland, gemacht für Agenturen und Freelancer.',
          {
            mittwald: (
              <a
                href={MITTWALD_HOSTING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="link inline-flex items-center gap-1"
              >
                Mittwald
                <ArrowUpRight className="size-3.5 shrink-0" />
              </a>
            ),
          }
        )}
      </p>
    </div>
  );
}
