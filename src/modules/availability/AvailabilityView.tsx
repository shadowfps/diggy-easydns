import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, Globe2, Loader2, Search, Sparkles, ArrowUpRight } from 'lucide-react';
import { checkDomainAvailability } from '@/lib/api';
import type { DomainAvailabilityResult, DomainCheckReport } from '@/types/dns';
import { cn } from '@/lib/cn';

const MITTWALD_HOSTING_URL = 'https://www.mittwald.de/webhosting';

export function AvailabilityView() {
  const [query, setQuery] = useState('');
  const [report, setReport] = useState<DomainCheckReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(err instanceof Error ? err.message : 'Verfügbarkeits-Check fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto w-full max-w-[110rem]"
    >
      <div className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-900/60 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-50/60">
          <Sparkles className="h-3.5 w-3.5" />
          Available Check
        </div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Domain Generator</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-900/55 dark:text-ink-50/55">
          Finde die passende Domain für dein Projekt — mit Alternativen zu gängigen TLDs.
        </p>
      </div>

      <div className="surface rounded-2xl p-6 md:p-8">
        <form onSubmit={handleSubmit} className="w-full">
          <label htmlFor="domain-check-input" className="mb-2 block text-sm font-medium text-ink-900/70 dark:text-ink-50/70">
            Domain
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="domain-check-input"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="meinprojekt oder meinprojekt.de"
              autoComplete="off"
              spellCheck={false}
              className="h-14 flex-1 rounded-xl border border-ink-200 bg-white px-4 font-mono text-base text-ink-900 placeholder:text-ink-900/35 focus:border-ink-900/40 focus:outline-none focus:ring-2 focus:ring-ink-900/10 dark:border-ink-800 dark:bg-ink-950 dark:text-ink-50 dark:placeholder:text-ink-50/35 dark:focus:border-ink-50/40 dark:focus:ring-ink-50/10"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="inline-flex h-14 shrink-0 items-center justify-center gap-2 rounded-xl bg-ink-950 px-6 text-sm font-medium text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-ink-50 dark:text-ink-950 dark:hover:bg-ink-200"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Prüfen
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-6 w-full rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {report && (
          <div className="mt-8 border-t border-ink-100 pt-6 dark:border-ink-900/80">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink-900/50 dark:text-ink-50/50">
                {report.results.length} Vorschläge für{' '}
                <span className="font-mono font-medium text-ink-900/75 dark:text-ink-50/75">{report.label}</span>
              </p>
            </div>

            <div className="grid gap-0 lg:grid-cols-2 lg:gap-x-10">
              {report.results.map((result, index) => (
                <AvailabilityRow
                  key={result.domain}
                  result={result}
                  delay={index * 0.04}
                  highlight={index === 0}
                />
              ))}
            </div>

            <MittwaldHostingHint />
          </div>
        )}
      </div>
    </motion.div>
  );
}

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.domain);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      window.prompt('Domain kopieren:', result.domain);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay }}
      className="flex items-center gap-4 border-b border-ink-100 py-4 dark:border-ink-900/80"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ink-200 bg-ink-50 text-ink-700 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300">
        <Globe2 className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={cn(
              'font-mono text-base font-semibold',
              highlight ? 'text-ink-950 dark:text-ink-50' : 'text-ink-900 dark:text-ink-100'
            )}
          >
            {result.domain}
          </span>
          <StatusBadge status={result.status} />
        </div>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded-lg p-2.5 text-ink-900/40 transition-colors hover:bg-ink-100 hover:text-ink-900 dark:text-ink-50/40 dark:hover:bg-ink-900 dark:hover:text-ink-50"
        aria-label={copied ? 'Domain kopiert' : 'Domain kopieren'}
        title={copied ? 'Domain kopiert' : 'Domain kopieren'}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </motion.div>
  );
}

function MittwaldHostingHint() {
  return (
    <div className="mt-8 rounded-xl border border-ink-200/80 bg-ink-50/80 px-5 py-4 dark:border-ink-800 dark:bg-ink-900/50">
      <p className="text-sm leading-relaxed text-ink-900/70 dark:text-ink-50/70">
        Du suchst qualitatives Hosting für dein neues Projekt? Dann schau doch mal bei{' '}
        <a
          href={MITTWALD_HOSTING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-ink-950 underline-offset-2 transition-colors hover:underline dark:text-ink-50"
        >
          Mittwald
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
        </a>{' '}
        vorbei — Managed Webhosting aus Deutschland, gemacht für Agenturen und Freelancer.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: DomainAvailabilityResult['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        status === 'available' && 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
        status === 'taken' && 'bg-ink-200/80 text-ink-700 dark:bg-ink-800 dark:text-ink-300',
        status === 'unknown' && 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200'
      )}
    >
      {status === 'available' ? 'Verfügbar' : status === 'taken' ? 'Vergeben' : 'Unklar'}
    </span>
  );
}
