import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { SearchBar } from '@/modules/search/SearchBar';
import { ScoreCard } from '@/modules/score/ScoreCard';
import { QuickFacts } from '@/modules/score/QuickFacts';
import { RecordsList } from '@/modules/records/RecordsList';
import { PropagationView } from '@/modules/propagation/PropagationView';
import { FindingsList } from '@/modules/findings/FindingsList';
import { SecurityView } from '@/modules/security/SecurityView';
import { MailView } from '@/modules/mail/MailView';
import { WhoisView } from '@/modules/whois/WhoisView';
import { PageSpeedView } from '@/modules/speed/PageSpeedView';
import { VirusScanView } from '@/modules/virusscan/VirusScanView';
import { HistoryView } from '@/modules/history/HistoryView';
import { AboutView } from '@/modules/about/AboutView';
import { ImpressumView } from '@/modules/impressum/ImpressumView';
import { AvailabilityView } from '@/modules/availability/AvailabilityView';
import { Tabs, type TabId } from '@/components/ui/Tabs';
import { Loader2 } from 'lucide-react';
import SplitText from '@/components/ui/SplitText';
import TextType from '@/components/ui/TextType';
import ShinyText from '@/components/ui/ShinyText';
import { lookupDomain, lookupPageSpeed, lookupVirusScan } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  clearLookupHistory,
  readLookupHistory,
  saveLookupToHistory,
  type LookupHistoryEntry,
} from '@/lib/lookupHistory';
import type { LookupReport, PageSpeedReport, PageSpeedStrategy, VirusScanReport } from '@/types/dns';

type AppView = 'lookup' | 'history' | 'availability' | 'about' | 'impressum';

export default function App() {
  const [view, setView] = useState<AppView>('lookup');
  const [report, setReport] = useState<LookupReport | null>(null);
  const [historyEntries, setHistoryEntries] = useState<LookupHistoryEntry[]>(() =>
    readLookupHistory()
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageSpeed, setPageSpeed] = useState<PageSpeedReport | null>(null);
  const [pageSpeedLoading, setPageSpeedLoading] = useState(false);
  const [pageSpeedError, setPageSpeedError] = useState<string | null>(null);
  const [pageSpeedStrategy, setPageSpeedStrategy] = useState<PageSpeedStrategy>('mobile');
  const [virusScan, setVirusScan] = useState<VirusScanReport | null>(null);
  const [virusScanLoading, setVirusScanLoading] = useState(false);
  const [virusScanError, setVirusScanError] = useState<string | null>(null);
  const [permalinkCopied, setPermalinkCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('records');
  const [searchValue, setSearchValue] = useState('');
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const initialPathHandledRef = useRef(false);
  // Sequenz-Counter: nur das Ergebnis des zuletzt gestarteten Lookups
  // darf den State updaten — sonst überschreibt eine späte Antwort eine
  // frischere und der UI bleibt im falschen Zustand stehen.
  const lookupSeqRef = useRef(0);

  const handleSearch = async (domain: string) => {
    const normalizedDomain = domain.trim().toLowerCase();
    if (!normalizedDomain) return;
    const seq = ++lookupSeqRef.current;
    window.scrollTo({ top: 0, behavior: report ? 'smooth' : 'auto' });
    setView('lookup');
    setSearchValue(normalizedDomain);
    // Vorherigen Report sofort wegräumen, damit es nie zwei Reports
    // gleichzeitig im DOM gibt (alte Antwort + neue Antwort untereinander).
    setReport(null);
    setError(null);
    setPageSpeed(null);
    setPageSpeedError(null);
    setPageSpeedLoading(false);
    setPageSpeedStrategy('mobile');
    setVirusScan(null);
    setVirusScanError(null);
    setVirusScanLoading(false);
    setLoading(true);
    try {
      const result = await lookupDomain(normalizedDomain);
      // Verzichte auf den State-Update, falls inzwischen ein neuer Lookup
      // gestartet wurde — wir wollen kein Flackern oder falsche Anzeige.
      if (seq !== lookupSeqRef.current) return;
      setReport(result);
      setHistoryEntries(saveLookupToHistory(result));
      setActiveTab('records');
      replaceLookupPath(result.domain);
    } catch (e) {
      if (seq !== lookupSeqRef.current) return;
      setError(e instanceof Error ? e.message : 'Lookup fehlgeschlagen');
    } finally {
      if (seq === lookupSeqRef.current) setLoading(false);
    }
  };

  const handleRunVirusScan = async () => {
    if (!report?.domain || virusScanLoading) return;
    setVirusScanError(null);
    setVirusScanLoading(true);
    try {
      const result = await lookupVirusScan(report.domain);
      setVirusScan(result);
    } catch (e) {
      setVirusScanError(e instanceof Error ? e.message : 'VirusTotal-Scan fehlgeschlagen');
    } finally {
      setVirusScanLoading(false);
    }
  };

  const handleRunPageSpeed = async () => {
    if (!report?.domain || pageSpeedLoading) return;
    setPageSpeedError(null);
    setPageSpeedLoading(true);
    try {
      const result = await lookupPageSpeed(report.domain, pageSpeedStrategy);
      setPageSpeed(result);
    } catch (e) {
      setPageSpeedError(e instanceof Error ? e.message : 'PageSpeed fehlgeschlagen');
    } finally {
      setPageSpeedLoading(false);
    }
  };

  const handleHome = () => {
    lookupSeqRef.current += 1;
    setView('lookup');
    setReport(null);
    setLoading(false);
    setError(null);
    setPageSpeed(null);
    setPageSpeedLoading(false);
    setPageSpeedError(null);
    setPageSpeedStrategy('mobile');
    setVirusScan(null);
    setVirusScanLoading(false);
    setVirusScanError(null);
    setPermalinkCopied(false);
    setActiveTab('records');
    setSearchValue('');
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleHistory = () => {
    lookupSeqRef.current += 1;
    setView('history');
    setReport(null);
    setLoading(false);
    setError(null);
    setPageSpeed(null);
    setPageSpeedLoading(false);
    setPageSpeedError(null);
    setVirusScan(null);
    setVirusScanLoading(false);
    setVirusScanError(null);
    setHistoryEntries(readLookupHistory());
    if (window.location.pathname !== '/history') {
      window.history.pushState(null, '', '/history');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAbout = () => {
    lookupSeqRef.current += 1;
    setView('about');
    setReport(null);
    setLoading(false);
    setError(null);
    setPageSpeed(null);
    setPageSpeedLoading(false);
    setPageSpeedError(null);
    setVirusScan(null);
    setVirusScanLoading(false);
    setVirusScanError(null);
    if (window.location.pathname !== '/about') {
      window.history.pushState(null, '', '/about');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAvailability = () => {
    lookupSeqRef.current += 1;
    setView('availability');
    setReport(null);
    setLoading(false);
    setError(null);
    setPageSpeed(null);
    setPageSpeedLoading(false);
    setPageSpeedError(null);
    setVirusScan(null);
    setVirusScanLoading(false);
    setVirusScanError(null);
    if (window.location.pathname !== '/availability') {
      window.history.pushState(null, '', '/availability');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImpressum = () => {
    lookupSeqRef.current += 1;
    setView('impressum');
    setReport(null);
    setLoading(false);
    setError(null);
    setPageSpeed(null);
    setPageSpeedLoading(false);
    setPageSpeedError(null);
    setVirusScan(null);
    setVirusScanLoading(false);
    setVirusScanError(null);
    if (window.location.pathname !== '/impressum') {
      window.history.pushState(null, '', '/impressum');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearHistory = () => {
    setHistoryEntries(clearLookupHistory());
  };

  const handleUseDomainInSearch = (domain: string) => {
    const nextValue = normalizeSearchDomain(domain);
    if (!nextValue) return;
    setView('lookup');
    setSearchValue(nextValue);
    setSearchFocusSignal((value) => value + 1);
    if (!report && window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (initialPathHandledRef.current) return;
    initialPathHandledRef.current = true;
    if (window.location.pathname === '/history') {
      setView('history');
      setHistoryEntries(readLookupHistory());
      return;
    }
    if (window.location.pathname === '/about') {
      setView('about');
      return;
    }
    if (window.location.pathname === '/availability') {
      setView('availability');
      return;
    }
    if (window.location.pathname === '/impressum') {
      setView('impressum');
      return;
    }
    const domainFromPath = getDomainFromLookupPath(window.location.pathname);
    if (!domainFromPath) return;
    void handleSearch(domainFromPath);
  }, []);

  const handleCopyPermalink = async () => {
    if (!report?.domain) return;
    const url = getLookupUrl(report.domain);
    try {
      await navigator.clipboard.writeText(url);
      setPermalinkCopied(true);
      window.setTimeout(() => setPermalinkCopied(false), 1400);
    } catch {
      // Fallback für Browser ohne Clipboard-API-Rechte.
      window.prompt('Permalink kopieren:', url);
    }
  };

  const handleExportJson = () => {
    if (!report) return;
    const filename = `diggy-${sanitizeFilename(report.domain)}-${formatExportTimestamp(report.timestamp)}.json`;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const lookupHasOutput = view === 'lookup' && Boolean(report || loading || error);

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      <Header
        onHome={handleHome}
        onHistory={handleHistory}
        onAvailability={handleAvailability}
        onAbout={handleAbout}
      />

      <main
        className={cn(
          'flex-1 min-w-0 px-4 sm:px-6 lg:px-8 [overflow-anchor:none]',
          view !== 'lookup' || lookupHasOutput ? 'py-6 md:py-8' : 'py-12 md:py-20'
        )}
      >
        {view === 'history' && (
          <HistoryView
            entries={historyEntries}
            onRun={handleSearch}
            onUseDomain={handleUseDomainInSearch}
            onClear={handleClearHistory}
          />
        )}

        {view === 'about' && <AboutView />}

        {view === 'availability' && <AvailabilityView />}

        {view === 'impressum' && <ImpressumView />}

        {/* Hero / Search */}
        {/* Kein mode="wait" — sonst kann ein hängender Exit den nächsten
            Render blockieren. Da ein Loading-Zwischenstate sowieso die
            Lücke füllt, gibt es kein Overlap-Risiko. */}
        <AnimatePresence>
          {view === 'lookup' && !report && !loading && (
            <motion.div
              key="hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20, pointerEvents: 'none' }}
              className="mx-auto mb-10 max-w-5xl text-center"
            >
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-5"
              >
                <ShinyText
                  text="diggy"
                  className="font-brand font-bold text-5xl md:text-7xl tracking-tight lowercase dark:invert"
                  color="#111111"
                  shineColor="#737373"
                  speed={2.5}
                  spread={120}
                  direction="left"
                />
              </motion.div>
              <div className="mb-3">
                <SplitText
                  text="Was steckt hinter deiner Domain?"
                  tag="h1"
                  className="text-4xl md:text-5xl font-medium tracking-tight"
                  delay={40}
                  duration={0.9}
                  ease="power3.out"
                  splitType="chars"
                  from={{ opacity: 0, y: 30 }}
                  to={{ opacity: 1, y: 0 }}
                  threshold={0.1}
                  rootMargin="-50px"
                  textAlign="center"
                />
              </div>
              <div className="mb-10 max-w-md mx-auto">
                <TextType
                  as="p"
                  className="text-base text-ink-900/60 dark:text-ink-50/60"
                  text={[
                    'DNS, SSL, Mail-Security und Propagation auf einen Blick.',
                    'Ohne Fachchinesisch, mit Empfehlungen.',
                    'Alles, was du wissen musst — in einem Tool.',
                  ]}
                  typingSpeed={45}
                  pauseDuration={2200}
                  deletingSpeed={25}
                  cursorCharacter="▍"
                  cursorClassName="text-ink-900 dark:text-ink-50"
                  cursorBlinkDuration={0.6}
                  initialDelay={500}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {view === 'lookup' && (
          <SearchBar
            value={searchValue}
            onValueChange={setSearchValue}
            focusSignal={searchFocusSignal}
            onSearch={handleSearch}
            loading={loading}
          />
        )}

        {/* Loading State */}
        <AnimatePresence>
          {view === 'lookup' && loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mx-auto mt-10 max-w-2xl text-center"
            >
              <Loader2 className="w-6 h-6 mx-auto animate-spin text-ink-900 dark:text-ink-50" />
              <p className="mt-3 text-sm text-ink-900/60 dark:text-ink-50/60">
                Records werden geholt…
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {view === 'lookup' && error && (
          <div className="mx-auto mt-8 max-w-2xl rounded-xl bg-red-500/10 p-4 text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Report */}
        {/* Kein mode="wait" — der Loading-State zwischen zwei Reports sorgt
            für eine saubere Lücke. Verschachteltes AnimatePresence-mode-wait
            (Tabs innen) kann sonst die Exit-Promise nicht resolven und
            den ganzen Block hängen lassen. */}
        {view === 'lookup' && report && !loading && (
          <motion.div
            key={report.domain + report.timestamp}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
            className="mx-auto mt-6 w-full max-w-[110rem] md:mt-8"
          >
              <div className="text-center mb-5">
                <span className="font-mono text-base text-ink-900/60 dark:text-ink-50/60">
                  {report.domain}
                </span>
              </div>

              {/* Score + Quick Facts */}
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                <ScoreCard score={report.healthScore} />
                <QuickFacts report={report} onUseDomain={handleUseDomainInSearch} />
              </div>

              {/* Tabs */}
              <Tabs
                active={activeTab}
                onChange={setActiveTab}
                tabs={[
                  { id: 'records', label: 'Records', count: report.records.length },
                  {
                    id: 'propagation',
                    label: 'Propagation',
                    count: report.propagation.length || undefined,
                  },
                  { id: 'security', label: 'Security' },
                  {
                    id: 'mail',
                    label: 'Mail',
                    count:
                      (report.mail.spf.present ? 1 : 0) +
                      (report.mail.dmarc.present ? 1 : 0) +
                      report.mail.dkim.selectors.length +
                      (report.mail.mtaSts.present ? 1 : 0) || undefined,
                  },
                  { id: 'findings', label: 'Findings', count: report.findings.length },
                  { id: 'whois', label: 'WHOIS', count: report.whois ? 1 : undefined },
                  { id: 'speed', label: 'Speed', count: pageSpeed ? 1 : undefined },
                  { id: 'virusscan', label: 'Virus Scan', count: virusScan ? (virusScan.stats.malicious + virusScan.stats.suspicious) || undefined : undefined },
                ]}
              />

              <div className="mt-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    {activeTab === 'records' && (
                      <RecordsList
                        records={report.records}
                        onUseDomain={handleUseDomainInSearch}
                      />
                    )}
                    {activeTab === 'propagation' && (
                      report.propagation.length > 0
                        ? <PropagationView results={report.propagation} />
                        : <Placeholder title="Multi-Resolver-Propagation" subtitle="Keine Resolver-Antworten — Lookup eventuell fehlgeschlagen." />
                    )}
                    {activeTab === 'findings' && <FindingsList findings={report.findings} />}
                    {activeTab === 'security' && (
                      <SecurityView ssl={report.ssl} dnssec={report.dnssec} />
                    )}
                    {activeTab === 'mail' && <MailView mail={report.mail} />}
                    {activeTab === 'whois' && (
                      <WhoisView
                        whois={report.whois}
                        onUseDomain={handleUseDomainInSearch}
                      />
                    )}
                    {activeTab === 'speed' && (
                      <PageSpeedView
                        data={pageSpeed}
                        loading={pageSpeedLoading}
                        error={pageSpeedError}
                        strategy={pageSpeedStrategy}
                        onStrategyChange={setPageSpeedStrategy}
                        onRun={handleRunPageSpeed}
                      />
                    )}
                    {activeTab === 'virusscan' && (
                      <VirusScanView
                        data={virusScan}
                        loading={virusScanLoading}
                        error={virusScanError}
                        onRun={handleRunVirusScan}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer-Actions */}
              <div className="mt-12 flex justify-end gap-2">
                <ActionButton onClick={handleExportJson}>Export JSON</ActionButton>
                <ActionButton onClick={handleCopyPermalink}>
                  {permalinkCopied ? 'Link kopiert' : 'Permalink kopieren'}
                </ActionButton>
                <ActionButton>Watch 🔔</ActionButton>
              </div>
          </motion.div>
        )}
      </main>

      <footer className="border-t border-ink-100 px-6 py-8 dark:border-ink-900 md:px-8">
        <div className="flex flex-col gap-3 text-xs text-ink-900/40 dark:text-ink-50/40 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>diggy · DNS made friendly</span>
            <span className="hidden text-ink-900/20 dark:text-ink-50/20 sm:inline" aria-hidden>
              ·
            </span>
            <button
              type="button"
              onClick={handleImpressum}
              className="transition-colors hover:text-ink-900/70 dark:hover:text-ink-50/70"
            >
              Impressum
            </button>
          </div>
          <span>v0.1.0</span>
        </div>
      </footer>
    </div>
  );
}

function Placeholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="surface rounded-xl p-12 text-center">
      <h3 className="text-base font-medium mb-1">{title}</h3>
      <p className="text-sm text-ink-900/50 dark:text-ink-50/50">{subtitle}</p>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void | Promise<void>;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3.5 py-2 text-xs font-medium rounded-lg border border-ink-100 dark:border-ink-900/80 hover:bg-ink-100/60 dark:hover:bg-ink-900 transition-colors"
    >
      {children}
    </button>
  );
}

function getLookupUrl(domain: string): string {
  return `${window.location.origin}/lookup/${encodeURIComponent(domain)}`;
}

function replaceLookupPath(domain: string): void {
  const nextPath = `/lookup/${encodeURIComponent(domain)}`;
  if (window.location.pathname === nextPath) return;
  window.history.replaceState(null, '', nextPath);
}

function getDomainFromLookupPath(pathname: string): string | null {
  const match = pathname.match(/^\/lookup\/([^/]+)\/?$/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim().toLowerCase();
  } catch {
    return null;
  }
}

function normalizeSearchDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, '');
}

function sanitizeFilename(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '');
}

function formatExportTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'report';
  return date.toISOString().replace(/[:.]/g, '-');
}
